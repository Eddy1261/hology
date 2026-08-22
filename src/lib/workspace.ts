// AI Workspace view model (W1): DERIVED state only — combines existing
// backend sources (gateway/context-store) without duplicating storage.
// Rules: never fabricate values; unsupported fields are null/"unavailable";
// provider/session/context telemetry comes from real sources or stays absent.

import type { ProjectInfo, SessionInfo } from "./gateway.ts";
import type { MCPCollectionItem } from "./collection.ts";
import type { Skill } from "./types.ts";

export interface WorkspaceProject {
  id: string | null;
  name: string | null;
}

export interface WorkspaceSession {
  id: string | null;
  provider: string | null;
  projectId: string | null;
}

export interface WorkspaceContext {
  /** Known only via real retrieval telemetry — no source today → []/null. */
  activeScopes: string[];
  retrievedCount: number | null;
  lastRetrievedAt: number | null;
}

export interface WorkspaceState {
  project: WorkspaceProject;
  session: WorkspaceSession;
  /** Active-project sessions, backend-scoped (F2 workspace semantics). */
  sessions: SessionInfo[];
  connectors: MCPCollectionItem[];
  /** ENABLED skills only — disabled skills are never presented as
   *  available-to-agent (F5 audit contract). */
  skills: Skill[];
  context: WorkspaceContext;
}

export type SessionConsistency =
  | "none" // no session selected
  | "consistent" // session.projectId == active project
  | "other-project"; // mismatch — never silently rewrite either value

export function sessionConsistency(
  session: WorkspaceSession,
  activeProjectId: string | null,
): SessionConsistency {
  if (!session.id) return "none";
  if (session.projectId === activeProjectId) return "consistent";
  return "other-project";
}

/** Resolve the project display pair. Unknown/stale id → name null (never
 *  guess). Null id → null name. */
export function workspaceProject(
  projects: ProjectInfo[],
  activeProjectId: string | null,
): WorkspaceProject {
  if (!activeProjectId) return { id: null, name: null };
  const p = projects.find((x) => x.id === activeProjectId);
  return p ? { id: p.id, name: p.name } : { id: activeProjectId, name: null };
}

/** Connector status → UI label (runtime truth only, W2 mapping). */
export function connectorStatusLabel(item: MCPCollectionItem): string {
  switch (item.status) {
    case "connected":
      return "Connected";
    case "connecting":
      return "Connecting";
    case "error":
      return "Error";
    case "disconnected":
      return "Disconnected";
    case "unlisted":
      return "Installed";
    default:
      return "Available";
  }
}

/** UX correction 1: "Using" must be semantically accurate — only runtime
 *  capabilities (connected/connecting/error) belong in Using; catalog/install
 *  state (available/disconnected/installed) belongs in Available. */
export type CapabilityBucket = "using" | "available";

export function capabilityBucket(item: MCPCollectionItem): CapabilityBucket {
  return item.status === "connected" ||
    item.status === "connecting" ||
    item.status === "error"
    ? "using"
    : "available";
}

export function usingCapabilities(items: MCPCollectionItem[]): MCPCollectionItem[] {
  return items.filter((i) => capabilityBucket(i) === "using");
}

export function availableCapabilities(items: MCPCollectionItem[]): MCPCollectionItem[] {
  return items.filter((i) => capabilityBucket(i) === "available");
}

/** FE-8 P1: active project id set but absent from the registry = deleted or
 *  removed. Never auto-switch — surface it instead. */
export function projectStale(
  projects: ProjectInfo[],
  activeProjectId: string | null,
): boolean {
  return activeProjectId !== null && !projects.some((p) => p.id === activeProjectId);
}

export function buildWorkspace(opts: {
  projects: ProjectInfo[];
  activeProjectId: string | null;
  sessions: SessionInfo[];
  activeSessionId: string | null;
  connectors: MCPCollectionItem[];
  skills: Skill[];
}): WorkspaceState {
  const active = opts.sessions.find((s) => s.id === opts.activeSessionId) ?? null;
  return {
    project: workspaceProject(opts.projects, opts.activeProjectId),
    session: active
      ? { id: active.id, provider: active.provider, projectId: active.project_id }
      : { id: null, provider: null, projectId: null },
    sessions: opts.sessions,
    connectors: opts.connectors,
    skills: opts.skills.filter((s) => s.enabled),
    // No retrieval telemetry source exists — never fabricate activity.
    context: { activeScopes: [], retrievedCount: null, lastRetrievedAt: null },
  };
}
