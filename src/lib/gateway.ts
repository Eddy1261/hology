// Gateway client — talks to the local gateway sidecar (apps/gateway, axum on
// 127.0.0.1:8788 by default; overridable with GATEWAY_ADDR at spawn time).
//
// Base URL resolution:
//   1. `VITE_GATEWAY_URL` env (dev override, e.g. when the gateway runs on a
//      custom port)
//   2. `resolveGatewayUrl()` (called once at startup, before any other
//      gateway call): the gateway falls back to an OS-assigned port when
//      8788 is already taken by something else, and reassigns `gatewayUrl`
//      here if that happened this run.
//   3. Default `http://127.0.0.1:8788` (matches gateway Config::from_env)
//
// Checkpoint B will add `POST /internal/session` here (token handoff after
// cloud login). Checkpoint C will add `/internal/connectors*`.

import { invoke } from "@tauri-apps/api/core";
import { inTauriRuntime } from "./tauri-sink.ts";

const DEFAULT_GATEWAY_URL = "http://127.0.0.1:8788";

/** Thrown by every call in this module on a rejected response. `status` is
 *  what lets a caller tell "the gateway answered and refused us" (401 — the
 *  session handoff has not landed yet) apart from a truly unreachable
 *  gateway, which surfaces as a TypeError from `fetch` instead. A bare
 *  `Error` collapses those two into one indistinguishable failure, and the
 *  UI then paints "Gateway unavailable" over what is only an auth handoff
 *  still in flight. */
export class GatewayHttpError extends Error {
  readonly status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Reject unless the response is acceptable. `ok` defaults to "any 2xx";
 *  pass explicit codes where the endpoint's contract is narrower.
 *
 *  Every non-2xx path in this module goes through here so the status is
 *  never lost, and so the gateway's own {"error": "..."} body (error.rs,
 *  `impl IntoResponse for GatewayError`) reaches the caller — a bare "403"
 *  cannot tell a missing activation lease from a missing entitlement, and
 *  that distinction is the whole diagnostic. */
async function assertOk(res: Response, label: string, ok?: number[]): Promise<void> {
  if (ok ? ok.includes(res.status) : res.ok) return;
  let detail = "";
  try {
    const j = (await res.json()) as { error?: unknown };
    if (j && typeof j.error === "string") detail = ` (${j.error})`;
  } catch {
    /* empty or non-JSON body — the status is all we have */
  }
  throw new GatewayHttpError(res.status, `gateway ${label} ${res.status}${detail}`);
}

// `let`, not `const`: reassigned in place by `resolveGatewayUrl()`. Every
// call site below reads it inline inside a function body (never captured
// into another const at module-eval time), so ES module live-binding
// semantics mean a later reassignment here is visible to all of them.
export let gatewayUrl: string =
  (import.meta.env
    ? (import.meta.env.VITE_GATEWAY_URL as string | undefined)
    : undefined) ?? DEFAULT_GATEWAY_URL;

/**
 * Learn the gateway's ACTUAL port when it fell back off 8788 (port already
 * taken by something else on the machine — see `bind_with_fallback` in the
 * gateway's own `main.rs`). Call once, at startup, before any other function
 * in this module runs — those all read the module-level `gatewayUrl`
 * inline, so this only needs to win the race against the FIRST such call.
 * A `VITE_GATEWAY_URL` dev override always wins and is never touched here.
 * No-op in browser dev mode (no Tauri backend to ask) or if nothing needed
 * to change.
 *
 * Bounded retry: the gateway writes its port file only once it has finished
 * binding, and this runs right after the Tauri shell spawned it — a `null`
 * result this early usually just means "not up yet," not "nothing to
 * resolve, default is correct." `probeGatewayWithRetry` (main.ts) retries
 * much longer for the general "gateway still booting" case; this only needs
 * to outlast typical startup, not match that whole budget.
 */
export async function resolveGatewayUrl(attempts = 5, delayMs = 200): Promise<void> {
  if (import.meta.env && (import.meta.env.VITE_GATEWAY_URL as string | undefined)) return;
  if (!inTauriRuntime()) return;
  for (let i = 0; i < attempts; i++) {
    try {
      const resolved = await invoke<string | null>("resolve_gateway_url");
      if (resolved) {
        gatewayUrl = resolved;
        return;
      }
    } catch {
      return; // command missing (older build) — keep default, don't retry
    }
    if (i < attempts - 1) await new Promise((r) => setTimeout(r, delayMs));
  }
}

export interface HealthResponse {
  status: string;
}

export async function gatewayHealth(): Promise<HealthResponse> {
  const res = await fetch(`${gatewayUrl}/health`);
  await assertOk(res, "/health");
  return res.json() as Promise<HealthResponse>;
}

/** Checkpoint B: hand the cloud access token to the gateway (bearer-less
 *  /mcp/* thereafter). Loopback-only endpoint. */
export async function gatewaySessionSet(accessToken: string): Promise<void> {
  const res = await fetch(`${gatewayUrl}/internal/session`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ access_token: accessToken }),
  });
  await assertOk(res, "/internal/session", [204]);
}

export async function gatewaySessionStatus(): Promise<boolean> {
  try {
    const res = await fetch(`${gatewayUrl}/internal/session`);
    if (!res.ok) return false;
    const j = (await res.json()) as { authenticated?: boolean };
    return j.authenticated === true;
  } catch {
    return false;
  }
}

export async function gatewaySessionClear(): Promise<void> {
  const res = await fetch(`${gatewayUrl}/internal/session`, { method: "DELETE" });
  await assertOk(res, "DELETE /internal/session", [204]);
}

// --- Checkpoint C: connector catalog + control ---

export interface ConnectorInfo {
  id: string;
  name: string;
  version: string;
  status: string;
  host_state: string | null;
  entitled: boolean;
  exposed: boolean;
  public_url: string | null;
}

export async function gatewayConnectors(): Promise<ConnectorInfo[]> {
  const res = await fetch(`${gatewayUrl}/internal/connectors`);
  await assertOk(res, "/internal/connectors");
  return res.json() as Promise<ConnectorInfo[]>;
}

/** CONN-011: converge the gateway Process Manager on the authoritative
 *  filesystem state after the desktop installs/updates/uninstalls a
 *  connector. Without this call the gateway only learns about on-disk
 *  changes at cold boot (i.e. app restart). Auth rides on the established
 *  desktop session (gatewaySessionSet at login) — no header needed.
 *
 *  REQUIRED after any install/update/uninstall. The gateway's connector
 *  inventory is an in-memory map: `GET /internal/connectors` serves
 *  `ProcessManager::snapshot()` and never touches the filesystem, and the
 *  only other place the map is built is boot (`load_installed`, main.rs).
 *  Without this call a freshly installed connector stays invisible until the
 *  gateway restarts, so `POST .../enable` fails its `manager.has(&id)` check
 *  with 404 — which is exactly what "download a connector, then start it"
 *  did on a first run.
 *
 *  Installs nothing itself: no download, no unpack, no write to any connector
 *  directory. The desktop owns installation; this only makes the gateway
 *  converge on the result. */
export interface ReconcileResult {
  new: string[];
  changed: string[];
  removed: string[];
}

export async function gatewayReconcileConnectors(): Promise<ReconcileResult> {
  const res = await fetch(`${gatewayUrl}/internal/process-manager/reconcile`, { method: "POST" });
  await assertOk(res, "/internal/process-manager/reconcile");
  return res.json() as Promise<ReconcileResult>;
}

export async function gatewayConnectorDelete(id: string): Promise<void> {
  const res = await fetch(`${gatewayUrl}/internal/connectors/${encodeURIComponent(id)}`, { method: "DELETE" });
  await assertOk(res, "DELETE /internal/connectors", [204]);
}

export interface ConnectorConfigField {
  key: string;
  label: string;
  kind: "host" | "credential";
  secret: boolean;
  required: boolean;
  default?: string | null;
  description: string;
}

export async function gatewayConnectorConfig(id: string): Promise<{ env: ConnectorConfigField[] }> {
  const res = await fetch(`${gatewayUrl}/internal/connectors/${encodeURIComponent(id)}/config`);
  await assertOk(res, "connector config");
  return res.json() as Promise<{ env: ConnectorConfigField[] }>;
}

export async function gatewayConnectorTutorial(id: string): Promise<{ content: string }> {
  const res = await fetch(`${gatewayUrl}/internal/connectors/${encodeURIComponent(id)}/tutorial`);
  await assertOk(res, "connector tutorial");
  return res.json() as Promise<{ content: string }>;
}

export async function gatewayCredentialsGet(id: string): Promise<{ has_credentials: boolean; keys: string[] }> {
  const res = await fetch(`${gatewayUrl}/internal/connectors/${encodeURIComponent(id)}/credentials`);
  await assertOk(res, "credentials GET");
  return res.json() as Promise<{ has_credentials: boolean; keys: string[] }>;
}

export async function gatewayCredentialsPut(id: string, key: string, value: string): Promise<void> {
  const res = await fetch(`${gatewayUrl}/internal/connectors/${encodeURIComponent(id)}/credentials`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ key, value }),
  });
  await assertOk(res, "credentials PATCH", [204]);
}

export async function gatewayCredentialDelete(id: string, key: string): Promise<void> {
  const res = await fetch(`${gatewayUrl}/internal/connectors/${encodeURIComponent(id)}/credentials/${encodeURIComponent(key)}`, { method: "DELETE" });
  await assertOk(res, "credential DELETE", [204]);
}

export async function gatewayCredentialsDelete(id: string): Promise<void> {
  const res = await fetch(`${gatewayUrl}/internal/connectors/${encodeURIComponent(id)}/credentials`, { method: "DELETE" });
  await assertOk(res, "credentials DELETE", [204]);
}

export interface TunnelInfo {
  active: boolean;
  public_url: string | null;
}

export async function gatewayTunnelStatus(): Promise<TunnelInfo> {
  const res = await fetch(`${gatewayUrl}/internal/tunnel`);
  await assertOk(res, "/internal/tunnel");
  return res.json() as Promise<TunnelInfo>;
}

export async function gatewayTunnelStart(): Promise<void> {
  const res = await fetch(`${gatewayUrl}/internal/tunnel`, { method: "POST" });
  await assertOk(res, "POST /internal/tunnel", [202, 204]);
}

export async function gatewayTunnelStop(): Promise<void> {
  const res = await fetch(`${gatewayUrl}/internal/tunnel`, { method: "DELETE" });
  await assertOk(res, "DELETE /internal/tunnel", [204, 404]);
}

export async function gatewayConnectorAction(
  id: string,
  action: "enable" | "disable" | "expose" | "unexpose",
  lease?: string,
): Promise<void> {
  const init: RequestInit = { method: "POST" };
  // Track B: activation requires a server-issued lease; the desktop acquires
  // it BEFORE calling enable and hands the signed blob to the gateway. The
  // gateway re-validates it locally (signature/expiry/user/connector/version).
  if (action === "enable" && lease) {
    init.headers = { "Content-Type": "application/json" };
    init.body = JSON.stringify({ lease });
  }
  const res = await fetch(`${gatewayUrl}/internal/connectors/${id}/${action}`, init);
  await assertOk(res, `/internal/connectors/${id}/${action}`, [202, 204]);
}

// --- Checkpoint E: sessions + skills (context store) ---

export interface SessionInfo {
  id: string;
  /** Backend Session.project_id — the project this session is bound to
   *  (FIXED at creation; workspace-scoped list). Never a second reference. */
  project_id: string | null;
  provider: string;
  started_at: number;
  last_active_at: number;
}

export interface SkillInfo {
  id: string;
  name: string;
  has_content: boolean;
  enabled: boolean;
  included: boolean;
  updated: number;
}

export async function gatewaySessions(base?: string): Promise<SessionInfo[]> {
  const res = await fetch(`${base ?? gatewayUrl}/internal/sessions`);
  await assertOk(res, "/internal/sessions");
  return res.json() as Promise<SessionInfo[]>;
}

/** Phase D: project Context list for the Workspace UI (loopback local-data
 *  endpoint — same shape as the offline bridge's OfflineContextEntity). */
export interface ContextEntity {
  id: string;
  type: string;
  label: string;
  summary: string;
  scope: string | null;
  pinned: boolean;
  updated: number;
}

export async function gatewayProjectContext(projectId: string): Promise<ContextEntity[]> {
  const res = await fetch(
    `${gatewayUrl}/internal/projects/${encodeURIComponent(projectId)}/context`,
  );
  await assertOk(res, "project context");
  return res.json() as Promise<ContextEntity[]>;
}

export async function gatewaySessionTouch(sessionId: string, provider: string): Promise<void> {
  const res = await fetch(`${gatewayUrl}/internal/sessions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ session_id: sessionId, provider }),
  });
  await assertOk(res, "POST /internal/sessions", [204]);
}

export async function gatewaySkills(base?: string): Promise<SkillInfo[]> {
  const res = await fetch(`${base ?? gatewayUrl}/internal/skills`);
  await assertOk(res, "/internal/skills");
  return res.json() as Promise<SkillInfo[]>;
}

export async function gatewaySkillContent(id: string, base?: string): Promise<string> {
  const res = await fetch(`${base ?? gatewayUrl}/internal/skills/${encodeURIComponent(id)}/content`);
  await assertOk(res, "skill content");
  const data = await res.json() as { content: string };
  return data.content;
}

export async function gatewaySkillUpsert(
  input: {
    id?: string;
    name: string;
    content: string;
    enabled: boolean;
  },
  base?: string,
): Promise<{ id: string }> {
  const res = await fetch(`${base ?? gatewayUrl}/internal/skills`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  await assertOk(res, "POST /internal/skills");
  return res.json() as Promise<{ id: string }>;
}

export async function gatewaySkillAction(
  id: string,
  action: "toggle" | "delete",
  base?: string,
): Promise<void> {
  const res = await fetch(`${base ?? gatewayUrl}/internal/skills/${id}/${action}`, {
    method: "POST",
  });
  await assertOk(res, `/internal/skills/${id}/${action}`, [200, 204]);
}

// --- F1.1: project registry + active project ---
// `base` override is for tests; default = configured gateway URL.

export interface ProjectInfo {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

export async function gatewayProjects(base?: string): Promise<ProjectInfo[]> {
  const res = await fetch(`${base ?? gatewayUrl}/internal/projects`);
  await assertOk(res, "/internal/projects");
  return res.json() as Promise<ProjectInfo[]>;
}

export async function gatewayActiveProject(base?: string): Promise<string | null> {
  const res = await fetch(`${base ?? gatewayUrl}/internal/session/project`);
  await assertOk(res, "/internal/session/project");
  const j = (await res.json()) as { project_id: string | null };
  return j.project_id;
}

export async function gatewaySetActiveProject(
  projectId: string,
  base?: string,
): Promise<void> {
  const res = await fetch(`${base ?? gatewayUrl}/internal/session/project`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId }),
  });
  await assertOk(res, "PUT /internal/session/project", [204]);
}

// --- project metadata: create + rename (display identity, id immutable) ---

export async function gatewayCreateProject(
  projectId: string,
  displayName?: string,
  base?: string,
): Promise<ProjectInfo> {
  const res = await fetch(`${base ?? gatewayUrl}/internal/projects`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ project_id: projectId, display_name: displayName }),
  });
  await assertOk(res, "POST /internal/projects", [201]);
  return res.json() as Promise<ProjectInfo>;
}

/** SKPR-004: the gateway now has a real DELETE that cascades (store file,
 *  semantic index, session bindings, metadata, active pointer). */
export async function gatewayDeleteProject(projectId: string, base?: string): Promise<void> {
  const res = await fetch(`${base ?? gatewayUrl}/internal/projects/${projectId}`, {
    method: "DELETE",
  });
  await assertOk(res, `DELETE /internal/projects/${projectId}`);
}

export async function gatewayRenameProject(
  projectId: string,
  displayName: string,
  base?: string,
): Promise<ProjectInfo> {
  const res = await fetch(`${base ?? gatewayUrl}/internal/projects/${projectId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ display_name: displayName }),
  });
  await assertOk(res, `PATCH /internal/projects/${projectId}`);
  return res.json() as Promise<ProjectInfo>;
}

/** Clear active project (routing state only — project data untouched). */
export async function gatewayClearActiveProject(base?: string): Promise<void> {
  const res = await fetch(`${base ?? gatewayUrl}/internal/session/project`, {
    method: "DELETE",
  });
  await assertOk(res, "DELETE /internal/session/project", [204]);
}
