// Marketplace artifact download client (Track C-8).
//
// The Desktop is a CONSUMER of the server's authorization + integrity
// decisions — never the authority for either. This client talks ONLY to the
// marketplace API (Model A: API streams verified bytes). It never touches
// R2/LocalDirStorage/object keys directly, never receives storage
// credentials, and never bypasses 401/403/404/500 responses.
//
// Artifact identity is constructed from the server's published catalog
// vocabulary (C-5/C-6 canonical keys) — the client never invents storage
// identities; the server re-validates everything (catalog publication check,
// fresh entitlement, SHA-256) and a server 404 always wins over stale local
// catalog data.
//
// Local finalization is atomic: bytes are staged to a temp location and only
// renamed to the final artifact path after the COMPLETE verified response has
// been received. Interrupted/failed downloads leave no valid artifact.

import { marketplaceUrl } from "./config.ts";
import { catlogD, catlogErrD } from "./catdiag.ts";

/**
 * SHA-256 hex of the bytes, or `null` when the platform digest is
 * unavailable. DIAGNOSTIC USE ONLY — a locally computed digest is never an
 * "expected" value (that would make integrity self-referential). Returns
 * null rather than a placeholder string so a compute failure can never be
 * mistaken for a digest.
 */
export async function safeSha256(bytes: Uint8Array): Promise<string | null> {
  try {
    const d = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
    return [...new Uint8Array(d)].map((b) => b.toString(16).padStart(2, "0")).join("");
  } catch {
    return null;
  }
}

export interface ArtifactSink {
  /**
   * Stage verified bytes under a temp name; no final artifact yet.
   * `rel` is the LOCAL relative artifact path: `connectors/<file>` or
   * `skills/<file>` (kind-separated — a skill can never overwrite a
   * connector artifact). The sink must confine `rel` to its root.
   */
  stage(rel: string, bytes: Uint8Array): Promise<void>;
  /** Atomically promote the staged bytes to the final artifact path. */
  finalize(rel: string): Promise<void>;
  /** Discard staged bytes (failed/interrupted download). */
  abort(rel: string): Promise<void>;
}

/** Typed download failures — Desktop preserves the server's semantics. */
export class DownloadError extends Error {
  readonly kind:
    | "auth" // 401
    | "forbidden" // 403
    | "not-found" // 404
    | "server" // 500 / integrity / storage
    | "network" // transport failure / partial body
    | "sink"; // local persistence failure

  constructor(
    kind:
      | "auth"
      | "forbidden"
      | "not-found"
      | "server"
      | "network"
      | "sink",
    message: string,
  ) {
    super(message);
    this.kind = kind;
  }
}

/** Canonical connector artifact key (C-5: connectors/<id>/<version>/<os>-<arch>/<file>). */
export function connectorArtifactKey(
  connectorId: string,
  version: string,
  os: string,
  arch: string,
): string {
  const filename = `${connectorId}-${version}-${os}-${arch}.zip`;
  return `connectors/${connectorId}/${version}/${os}-${arch}/${filename}`;
}

/** Canonical skill artifact key (C-6: skills/<id>/<version>/<file>). */
export function skillArtifactKey(skillId: string, version: string): string {
  const filename = `skill-${skillId}-${version}.zip`;
  return `skills/${skillId}/${version}/${filename}`;
}

/**
 * C-9 local path safety: the artifact filename crosses the server/client
 * boundary and must never become a path-traversal primitive. A filename is
 * safe only if it is a plain basename — no separators, no traversal, no
 * drive/UNC forms, no leading dot, no NUL. Rejective, never reparative.
 */
export function safeArtifactFilename(filename: string): boolean {
  if (!filename || filename.length > 255) return false;
  if (filename === "." || filename === "..") return false;
  if (filename.startsWith(".")) return false;
  if (filename.includes("/") || filename.includes("\\")) return false;
  if (filename.includes(":")) return false;
  if (filename.includes("\0")) return false;
  return true;
}

/**
 * Local relative artifact path from the server artifact key: the first
 * segment (connectors|skills) becomes the kind directory, the filename is
 * validated as a safe basename. Anything else is rejected — the UI/client
 * can never select an arbitrary local path.
 */
export function localArtifactRel(artifactKey: string): string {
  const parts = artifactKey.split("/");
  const kind = parts[0];
  const filename = parts[parts.length - 1] ?? "";
  if (kind !== "connectors" && kind !== "skills") {
    throw new DownloadError("sink", "The artifact could not be saved locally.");
  }
  if (!safeArtifactFilename(filename)) {
    throw new DownloadError("sink", "The artifact could not be saved locally.");
  }
  return `${kind}/${filename}`;
}

export interface DownloadResult {
  rel: string;
  filename: string;
  bytes: Uint8Array;
}

/**
 * Download an artifact through the marketplace API with atomic local
 * finalization. `token` = the existing authenticated session access token
 * (Bearer). No retries on 401/403/404/500 (deterministic outcomes surface as
 * typed failures); transient network errors surface as `network`.
 */
export async function downloadArtifact(
  token: string,
  artifactKey: string,
  sink: ArtifactSink,
  base?: string,
): Promise<DownloadResult> {
  const filename = artifactKey.split("/").pop() ?? "artifact";
  const rel = localArtifactRel(artifactKey);
  const url = `${base ?? marketplaceUrl}/artifacts/${artifactKey}`;

  // Diagnostic-only trace (temporary).
  void catlogD(`[download] artifactKey=${artifactKey}`);
  void catlogD(`[download] catalogPackageUrl= (metadata; download uses marketplace /artifacts)`);
  void catlogD(`[download] resolvedUrl=${url}`);
  void catlogD(`[download] auth present=${token ? "YES" : "NO"}`);
  void catlogD(`[download] request started`);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch (err) {
    void catlogErrD(`[download] failed stage=marketplace-fetch`, err);
    throw new DownloadError("network", "The download could not be completed.");
  }

  void catlogD(`[download] response status=${res.status}`);
  void catlogD(`[download] response ok=${res.ok}`);
  void catlogD(`[download] content-type=${res.headers.get("content-type")}`);
  void catlogD(`[download] content-length=${res.headers.get("content-length")}`);
  if (res.status === 401) {
    void catlogD(`[download] failed stage=http-401 (auth)`);
    throw new DownloadError("auth", "Authentication required.");
  }
  if (res.status === 403) {
    void catlogD(`[download] failed stage=http-403 (forbidden)`);
    throw new DownloadError("forbidden", "You are not entitled to download this artifact.");
  }
  if (res.status === 404) {
    void catlogD(`[download] failed stage=http-404 (not-found)`);
    throw new DownloadError("not-found", "The requested artifact is unavailable.");
  }
  if (res.status !== 200) {
    const errorBody = await res.text().catch(() => "");
    void catlogD(`[download] failed stage=http-${res.status} (server): ${errorBody}`);
    throw new DownloadError("server", "The download could not be completed.");
  }
  void catlogD(`[download] response parsed (200)`);

  // Read the COMPLETE body before staging anything (an integrity failure is
  // a server-side 500 — the body is only staged on 200; a truncated body
  // fails the read below and never produces a final artifact).
  let buf: ArrayBuffer;
  try {
    buf = await res.arrayBuffer();
  } catch (err) {
    void catlogErrD(`[download] failed stage=body-read`, err);
    throw new DownloadError("network", "The download could not be completed.");
  }
  const bytes = new Uint8Array(buf);
  void catlogD(`[download] bytes received=${bytes.length}`);
  void catlogD(`[download] sha256=${(await safeSha256(bytes)) ?? "compute-failed"}`);

  try {
    await sink.stage(rel, bytes);
  } catch (err) {
    void catlogErrD(`[download] failed stage=filesystem-stage`, err);
    throw new DownloadError("sink", "The artifact could not be saved locally.");
  }
  void catlogD(`[download] filesystem write=staged rel=${rel}`);
  try {
    await sink.finalize(rel);
  } catch (e) {
    void catlogErrD(`[download] failed stage=filesystem-finalize`, e);
    await sink.abort(rel).catch(() => undefined);
    throw new DownloadError("sink", "The artifact could not be saved locally.");
  }
  void catlogD(`[download] filesystem write=success rel=${rel}`);
  void catlogD(`[download] verification result=pass (server-authorized 200 + complete body + atomic finalize)`);
  return { rel, filename, bytes };
}

/** CP21 signature envelope object key: `<artifact>.sig.json`. */
export function signatureEnvelopeKey(artifactKey: string): string {
  return `${artifactKey}.sig.json`;
}

/**
 * Fetch the CP21 signature envelope published alongside an artifact and
 * stage it next to the artifact (`<rel>.sig.json`) so the shell can verify
 * publisher trust before installing. Returns false when the catalog
 * publishes no envelope — this client never decides whether an unsigned
 * artifact may be installed; the shell's signature policy does.
 */
export async function downloadSignatureEnvelope(
  token: string,
  artifactKey: string,
  sink: ArtifactSink,
  base?: string,
): Promise<boolean> {
  const sigKey = signatureEnvelopeKey(artifactKey);
  let rel: string;
  try {
    rel = localArtifactRel(sigKey);
  } catch {
    return false;
  }
  const url = `${base ?? marketplaceUrl}/artifacts/${sigKey}`;
  let res: Response;
  try {
    res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  } catch (err) {
    void catlogErrD(`[signature] failed stage=marketplace-fetch`, err);
    return false;
  }
  if (res.status !== 200) {
    void catlogD(`[signature] no envelope published (status=${res.status}) key=${sigKey}`);
    return false;
  }
  let bytes: Uint8Array;
  try {
    bytes = new Uint8Array(await res.arrayBuffer());
  } catch (err) {
    void catlogErrD(`[signature] failed stage=body-read`, err);
    return false;
  }
  try {
    await sink.stage(rel, bytes);
    await sink.finalize(rel);
  } catch (err) {
    void catlogErrD(`[signature] failed stage=filesystem`, err);
    await sink.abort(rel).catch(() => undefined);
    return false;
  }
  void catlogD(`[signature] envelope staged rel=${rel} bytes=${bytes.length}`);
  return true;
}

/**
 * Node-style filesystem sink (tests + acceptance). Stages under
 * `<dir>/<rel>.tmp` (relative path confined to `dir`, kind-separated
 * connectors/|skills/) and renames to `<dir>/<rel>` on finalize —
 * interrupted downloads leave no valid artifact at the final path.
 */
export function createNodeArtifactSink(
  dir: string,
  fs: {
    mkdir: (p: string, o: { recursive: true }) => Promise<void>;
    writeFile: (p: string, d: Uint8Array) => Promise<void>;
    rename: (a: string, b: string) => Promise<void>;
    unlink: (p: string) => Promise<void>;
  },
): ArtifactSink {
  const resolveRel = (rel: string): string => {
    // defense in depth: the client contract already guarantees kind/file
    if (!/^(connectors|skills)\/[^/\\]+$/.test(rel)) throw new Error("unsafe artifact rel");
    return `${dir}/${rel}`;
  };
  return {
    async stage(rel, bytes) {
      const p = resolveRel(rel);
      const parent = p.substring(0, p.lastIndexOf("/"));
      await fs.mkdir(parent, { recursive: true });
      await fs.writeFile(`${p}.tmp`, bytes);
    },
    async finalize(rel) {
      const p = resolveRel(rel);
      await fs.rename(`${p}.tmp`, p);
    },
    async abort(rel) {
      const p = resolveRel(rel);
      await fs.unlink(`${p}.tmp`).catch(() => undefined);
    },
  };
}

/** In-memory sink (browser demo/tests): finalize records the artifact. */
export function createMemorySink(): ArtifactSink & { artifacts: Map<string, Uint8Array> } {
  const staged = new Map<string, Uint8Array>();
  const artifacts = new Map<string, Uint8Array>();
  return {
    artifacts,
    async stage(rel, bytes) {
      staged.set(rel, bytes);
    },
    async finalize(rel) {
      const b = staged.get(rel);
      if (!b) throw new Error("nothing staged");
      artifacts.set(rel, b);
      staged.delete(rel);
    },
    async abort(rel) {
      staged.delete(rel);
    },
  };
}
