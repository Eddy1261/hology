// Download UI state (Track C-9). The UI INITIATES downloads; the server
// authorizes + verifies them; the sink persists verified bytes. The UI never
// becomes an authorization or integrity authority — a "Downloaded" state is
// reached only after server 200 + complete body + local finalization.

import { reactive } from "vue";
import { invoke } from "@tauri-apps/api/core";

import { loadSession } from "../session-storage.ts";
import { ensureFreshAccessToken } from "./auth.ts";
import { refreshCatalog, type MCPCatalogItem } from "../catalog.ts";
import {
  DownloadError,
  connectorArtifactKey,
  downloadArtifact,
  downloadSignatureEnvelope,
  skillArtifactKey,
  type ArtifactSink,
} from "../marketplace.ts";
import { currentPlatform } from "../platform.ts";
import { createMemorySink } from "../marketplace.ts";
import { createTauriArtifactSink, inTauriRuntime } from "../tauri-sink.ts";
import { gatewayReconcileConnectors } from "../gateway.ts";
import { mcp } from "./mcp.ts";
import { catlogD, catlogErrD } from "../catdiag.ts";

export type DownloadStatus = "idle" | "downloading" | "success" | "installing" | "installed" | "error";

export interface DownloadState {
  status: DownloadStatus;
  /** Generic user-facing message (never backend/internal details). */
  message: string | null;
}

/** Keyed by artifact identity — the duplicate-download guard. */
export const downloads = reactive<Record<string, DownloadState>>({});

function stateFor(key: string): DownloadState {
  if (!downloads[key]) downloads[key] = { status: "idle", message: null };
  return downloads[key];
}

/** Map typed failures to generic user-facing messages (§35/§19). */
export function userMessage(e: unknown): string {
  if (e instanceof DownloadError) {
    switch (e.kind) {
      case "auth":
        return "Please sign in to download this connector.";
      case "forbidden":
        return "Upgrade your plan to download this connector.";
      case "not-found":
        return "This connector isn't available right now. Try again later.";
      case "server":
        return "We couldn't verify this connector. Please try again.";
      case "network":
        return "Download failed. Check your internet connection and try again.";
      case "sink":
        return "We couldn't save the connector on your device. Check your disk space and try again.";
    }
  }
  return "Download failed. Check your internet connection and try again.";
}

/** Pick the persistence sink: Tauri runtime → real fs; browser dev → memory. */
export function pickSink(): ArtifactSink {
  return inTauriRuntime() ? createTauriArtifactSink() : createMemorySink();
}

/** AUTH-004: a "auth" (401) DownloadError almost always means the access
 *  token expired mid-session — refresh once (single-flight) and retry
 *  before surfacing the failure to the user. */
async function downloadArtifactFresh(
  token: string,
  artifactKey: string,
  sink: ArtifactSink,
): Promise<{ result: Awaited<ReturnType<typeof downloadArtifact>>; activeToken: string }> {
  try {
    const result = await downloadArtifact(token, artifactKey, sink);
    return { result, activeToken: token };
  } catch (e) {
    if (e instanceof DownloadError && e.kind === "auth") {
      const fresh = await ensureFreshAccessToken();
      if (fresh) {
        const result = await downloadArtifact(fresh, artifactKey, sink);
        return { result, activeToken: fresh };
      }
    }
    throw e;
  }
}

export interface ExpectedArtifact {
  connector_id?: string;
  version?: string;
  os?: string;
  arch?: string;
  sha256?: string;
  size_bytes?: number;
}

/**
 * Prefer the LIVE catalog's sha256/size_bytes for this exact connector+version
 * over whatever `expected` was built from (a page's in-memory catalog snapshot,
 * itself possibly sourced from a `localStorage` cache up to `catalogTtlHours`
 * old). Everything else about `expected` — os/arch, which are already sourced
 * from `currentPlatform()` and only ever overridden by the catalog — passes
 * through unchanged: only the two fields CP20 actually verifies bytes against
 * need to be live.
 *
 * No match in `liveCatalog` (id+version no longer published, or the live
 * fetch itself failed and returned the fallback cached list) → `expected`'s
 * own values pass through untouched. Pure and testable (see shouldStartDownload
 * above for the same convention) without mocking the network/Tauri layer.
 */
export function mergeLiveIntegrity(
  expected: ExpectedArtifact,
  liveCatalog: readonly MCPCatalogItem[],
): ExpectedArtifact {
  const live = liveCatalog.find(
    (c) => c.id === expected.connector_id && c.version === expected.version,
  );
  return {
    ...expected,
    sha256: live?.sha256 ?? expected.sha256,
    size_bytes: live?.package_size_bytes ?? expected.size_bytes,
  };
}

/** Display-refresh timers keyed by download key. While a download/install
 *  is in flight the gateway-side state can change (install lands on disk,
 *  connector starts) without the UI knowing — poll `mcp.refresh()` every
 *  15s so the display converges without an app restart. Each timer
 *  self-clears on terminal states (installed/error/success). */
const displayTimers = new Map<string, ReturnType<typeof setInterval>>();

function startDisplayRefresh(key: string): void {
  stopDisplayRefresh(key);
  displayTimers.set(
    key,
    setInterval(() => {
      const cur = downloads[key];
      if (!cur || cur.status === "installed" || cur.status === "error" || cur.status === "success") {
        stopDisplayRefresh(key);
        return;
      }
      void mcp.refresh().catch(() => {});
    }, 15_000),
  );
}

function stopDisplayRefresh(key: string): void {
  const t = displayTimers.get(key);
  if (t !== undefined) {
    clearInterval(t);
    displayTimers.delete(key);
  }
}

async function runDownload(
  key: string,
  artifactKey: string,
  expected?: ExpectedArtifact,
): Promise<void> {
  const st = stateFor(key);
  // duplicate-click protection: one in-flight download per artifact
  if (st.status === "downloading" || st.status === "installing") return;
  st.status = "downloading";
  st.message = null;
  startDisplayRefresh(key);
  try {
    void catlogD(`[download] artifactKey=${artifactKey}`);
    const freshToken = await ensureFreshAccessToken();
    const token = freshToken ?? (await loadSession())?.accessToken;
    void catlogD(`[download] auth present=${token ? "YES" : "NO"}`);
    if (!token) throw new DownloadError("auth", "Authentication required.");
    const sink = pickSink();
    const { result, activeToken } = await downloadArtifactFresh(token, artifactKey, sink);
    void catlogD(`[download] completed (download-store status=success)`);
    // CP21: stage the publisher signature envelope next to the artifact. Its
    // absence is not decided here — the shell's signature policy decides
    // whether an unsigned artifact may be installed.
    const signed = await downloadSignatureEnvelope(activeToken, artifactKey, sink);
    void catlogD(`[download] signature envelope=${signed ? "staged" : "absent"}`);

    // CP20: install the downloaded artifact
    if (expected && inTauriRuntime()) {
      st.status = "installing";
      void catlogD(`[install] starting CP20 installation for ${expected.connector_id}`);
      // Refresh live here, right before sha256/size_bytes matter — see
      // mergeLiveIntegrity's doc comment for why the cached `expected` isn't
      // trusted for this. Everything else about the catalog stays cache-first.
      const { index: liveCatalog } = await refreshCatalog();
      const liveExpected = mergeLiveIntegrity(expected, liveCatalog);
      if (liveExpected.sha256 !== expected.sha256 || liveExpected.size_bytes !== expected.size_bytes) {
        void catlogD(`[install] catalog metadata was stale, refreshed live before installing`);
      }
      // Integrity is the CATALOG's claim ABOUT the bytes, never the bytes'
      // claim about themselves. A missing/empty expected sha256 or size is a
      // hard failure — substituting a locally computed digest would make
      // install_tx compare the bytes to their own hash (always passes).
      if (!liveExpected.sha256 || !liveExpected.size_bytes) {
        void catlogD(`[install] refused: catalog metadata missing sha256/size_bytes`);
        throw new DownloadError("server", "The artifact could not be verified.");
      }
      void catlogD(`[install] handoff artifactRel=${result.rel} download_bytes=${result.bytes.length}`);
      void catlogD(`[install] handoff expected: sha256="${liveExpected.sha256}" size_bytes=${liveExpected.size_bytes} v=${liveExpected.version}`);
      try {
        await invoke("install_connector", {
          artifactRel: result.rel,
          expected: {
            connector_id: liveExpected.connector_id,
            version: liveExpected.version,
            os: liveExpected.os,
            arch: liveExpected.arch,
            sha256: liveExpected.sha256,
            size_bytes: liveExpected.size_bytes,
          },
        });
        st.status = "installed";
        void catlogD(`[install] CP20 installation complete for ${expected.connector_id}`);
        // CONN-011: the gateway only scans disk at cold boot — tell it to
        // converge on the just-installed files NOW so no restart is needed.
        // Best-effort: a reconcile failure must not fail the install itself
        // (the call-site refresh + 15s display timer still converge later).
        try {
          const rec = await gatewayReconcileConnectors();
          void catlogD(`[install] gateway reconcile ok new=${rec.new.length} changed=${rec.changed.length} removed=${rec.removed.length}`);
        } catch (e) {
          void catlogErrD(`[install] gateway reconcile failed (non-fatal)`, e);
        }
        await mcp.refresh();
        stopDisplayRefresh(key);
      } catch (e) {
        void catlogErrD(`[install] CP20 installation failed`, e);
        // Download succeeded but install failed — report as error
        st.status = "error";
        st.message = "Downloaded but couldn't install. Please try again.";
        stopDisplayRefresh(key);
        return;
      }
    } else {
      // Browser dev mode or non-connector artifact: download only
      st.status = "success";
      stopDisplayRefresh(key);
    }
  } catch (e) {
    st.status = "error";
    st.message = userMessage(e);
    void catlogErrD(`[download] failed stage=download-store`, e);
    stopDisplayRefresh(key);
  }
}

/** Connector download: canonical identity from catalog data (C-8 client). */
export function downloadConnector(
  connectorId: string,
  version: string,
  catalogMeta?: { sha256?: string; size_bytes?: number; os?: string; arch?: string },
): Promise<void> {
  const plat = currentPlatform();
  const key = `connector:${connectorId}`;
  void catlogD(`[download] started connector=${connectorId} version=${version}`);
  void catlogD(`[download] platform=${plat.os} arch=${plat.arch}`);
  const artifactKey = connectorArtifactKey(connectorId, version, plat.os, plat.arch);
  void catlogD(`[download] artifactKey=${artifactKey}`);
  const expected = {
    connector_id: connectorId,
    version,
    os: catalogMeta?.os ?? plat.os,
    arch: catalogMeta?.arch ?? plat.arch,
    sha256: catalogMeta?.sha256 ?? "",
    size_bytes: catalogMeta?.size_bytes ?? 0,
  };
  return runDownload(key, artifactKey, expected);
}

/** Skill download (marketplace skill catalog identity). */
export function downloadSkill(skillId: string, version: string): Promise<void> {
  const key = `skill:${skillId}`;
  return runDownload(key, skillArtifactKey(skillId, version));
}

/** Testable duplicate-guard decision (pure). */
export function shouldStartDownload(state: DownloadState | undefined): boolean {
  return state === undefined || state.status !== "downloading";
}
