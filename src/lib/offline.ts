// Phase 5R: offline local-data layer — Tauri commands (src-tauri/src/offline.rs).
// Used ONLY while the gateway is down (state.online === false). The commands
// operate the SAME redb files the gateway owns; redb's exclusive file lock
// makes them fail (DatabaseAlreadyOpen) if the gateway is actually running,
// so the frontend gate is the ownership gate.
//
// Security: this layer touches locally owned data only — no JWT, no
// entitlement, no connector/MCP/marketplace/artifact capability. Protected
// operations stay gateway-bound and remain unavailable offline.

import { invoke } from "@tauri-apps/api/core";

export interface OfflineProject {
  id: string;
  name: string;
  created_at: number;
  updated_at: number;
}

export interface OfflineSkill {
  id: string;
  name: string;
  content: string;
  enabled: boolean;
  updated: number;
}

/** R1: local-layer routing decision. `state.online` is the loopback gateway
 *  /health probe (gateway persistence availability), NOT internet status and
 *  NOT JWT status. Local CRUD uses the offline layer ONLY when the gateway
 *  cannot serve persistence; a healthy gateway always takes the HTTP path
 *  (application errors surface, they never switch the persistence owner). */
export function shouldUseOfflineLayer(online: boolean, inTauri: boolean): boolean {
  return !online && inTauri;
}

export const offline = {
  listProjects: () => invoke<OfflineProject[]>("offline_list_projects"),
  createProject: (projectId: string, displayName?: string) =>
    invoke<void>("offline_create_project", { projectId, displayName }),
  getProject: (projectId: string) =>
    invoke<OfflineProject>("offline_get_project", { projectId }),
  renameProject: (projectId: string, displayName: string) =>
    invoke<void>("offline_rename_project", { projectId, displayName }),
  deleteProject: (projectId: string) =>
    invoke<void>("offline_delete_project", { projectId }),
  getActiveProject: () =>
    invoke<string | null>("offline_get_active_project"),
  setActiveProject: (projectId: string) =>
    invoke<void>("offline_set_active_project", { projectId }),
  clearActiveProject: () => invoke<void>("offline_clear_active_project"),
  listSkills: () => invoke<OfflineSkill[]>("offline_list_skills"),
  upsertSkill: (id: string | undefined, name: string, content: string, enabled: boolean) =>
    invoke<string>("offline_upsert_skill", { id, name, content, enabled }),
  deleteSkill: (id: string) => invoke<void>("offline_delete_skill", { id }),
  /** Locally persisted sessions of a project (offline Project Detail). Same
   *  shape as gateway SessionInfo. */
  projectSessions: (projectId: string) =>
    invoke<OfflineSession[]>("offline_project_sessions", { projectId }),
  // Phase C: context bridge (offline). Validation errors surface as the
  // stable Phase B codes (PROJECT_NOT_FOUND, SECRET_LIKE_CONTENT_REJECTED,
  // INVALID_CONTEXT_TYPE, ...).
  contextList: (projectId: string) =>
    invoke<OfflineContextEntity[]>("offline_context_list", { projectId }),
  contextGet: (projectId: string, entityId: string) =>
    invoke<OfflineContextEntity>("offline_context_get", { projectId, entityId }),
  contextRecent: (projectId: string, limit?: number) =>
    invoke<OfflineContextEntity[]>("offline_context_recent", { projectId, limit }),
  contextRecall: (projectId: string, query: string, scope?: string, maxTokens?: number) =>
    invoke<OfflineContextEntity[]>("offline_context_recall", { projectId, query, scope, maxTokens }),
  contextRemember: (args: {
    projectId: string;
    type: string;
    label: string;
    summary: string;
    sourceProvider?: string;
    pin?: boolean;
    scope?: string;
    relations?: { to_id: string; relation_type: string }[];
  }) => invoke<string>("offline_context_remember", args),
  contextLink: (projectId: string, fromId: string, toId: string, relationType: string) =>
    invoke<void>("offline_context_link", { projectId, fromId, toId, relationType }),
};

export interface OfflineContextEntity {
  id: string;
  type: string;
  label: string;
  summary: string;
  scope: string | null;
  pinned: boolean;
  updated: number;
}

export interface OfflineSession {
  id: string;
  project_id: string | null;
  provider: string;
  started_at: number;
  last_active_at: number;
}
