// Projects + active project (F1.1) — gateway authoritative when online.
// Phase 5R / R1: STRICT ownership routing. state.online (loopback gateway
// /health probe = persistence availability, NOT internet/JWT) decides the
// layer BEFORE any call:
//   online  → gateway path ONLY (application errors surface, never fall back)
//   offline → Tauri local layer ONLY
// No silent fallback on arbitrary gateway errors — a live gateway holding
// redb must never be bypassed by a second writer.

import { state } from "./state.ts";
import {
  gatewayActiveProject,
  gatewayClearActiveProject,
  gatewayCreateProject,
  gatewayDeleteProject,
  gatewayProjects,
  gatewayRenameProject,
  gatewaySetActiveProject,
} from "../gateway.ts";
import { offline } from "../offline.ts";
import { shouldUseOfflineLayer } from "../offline-routing.ts";
import { createLatestGuard } from "./latest.ts";

const inTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const useLocal = () => shouldUseOfflineLayer(state.online, inTauri);

const refreshGuard = createLatestGuard();
const activeGuard = createLatestGuard();

export const projects = {
  /** Project registry metadata — gateway path when online, local layer when
   *  offline (never faked, never hidden). */
  async refresh(): Promise<void> {
    const slot = refreshGuard.begin();
    // Fetch first, apply only if still newest — see latest.ts. This also
    // covers the transport flip: `useLocal()` is re-evaluated per call, so a
    // refresh that started online and a refresh that started offline can be in
    // flight at once, and the offline one must not overwrite the newer online
    // list with a registry that lacks what was just created.
    let next = null;
    if (useLocal()) {
      next = await offline.listProjects();
    } else if (state.online) {
      next = await gatewayProjects();
    }
    /* gateway booting (pre-retry) — keep last known; the bounded retry or
       the FE-8 visibility re-probe will settle the layer */
    if (next && slot.isNewest()) state.projects = next;
  },
  /** Restore backend routing state on start; offline → active.json. */
  async loadActive(): Promise<void> {
    const slot = activeGuard.begin();
    let next: string | null | undefined;
    if (useLocal()) {
      next = await offline.getActiveProject();
    } else if (state.online) {
      next = await gatewayActiveProject();
    }
    if (next !== undefined && slot.isNewest()) state.activeProjectId = next;
  },
  /** Backend accepts BEFORE local state updates (no frontend/backend
   *  disagreement); offline → local active.json (same convention). */
  async activate(projectId: string): Promise<void> {
    if (useLocal()) {
      await offline.setActiveProject(projectId);
      state.activeProjectId = projectId;
      return;
    }
    await gatewaySetActiveProject(projectId);
    state.activeProjectId = projectId;
  },
  /** Clear routing state, never data. */
  async clear(): Promise<void> {
    if (useLocal()) {
      await offline.clearActiveProject();
      state.activeProjectId = null;
      return;
    }
    await gatewayClearActiveProject();
    state.activeProjectId = null;
  },
  /** Create a project (id immutable; display_name optional → derived). */
  async create(projectId: string, displayName?: string): Promise<void> {
    if (useLocal()) {
      await offline.createProject(projectId, displayName);
      await projects.refresh();
      return;
    }
    await gatewayCreateProject(projectId, displayName);
    await projects.refresh();
  },
  /** Rename display identity only — project_id and store untouched. */
  async rename(projectId: string, displayName: string): Promise<void> {
    if (useLocal()) {
      await offline.renameProject(projectId, displayName);
      await projects.refresh();
      return;
    }
    await gatewayRenameProject(projectId, displayName);
    await projects.refresh();
  },
  /** Delete a project. SKPR-004: the gateway now exposes a real DELETE that
   *  cascades (store file, semantic index, session bindings, metadata, active
   *  pointer), so deletion works online as well as offline. */
  async remove(projectId: string): Promise<void> {
    if (!useLocal()) {
      await gatewayDeleteProject(projectId);
      if (state.activeProjectId === projectId) state.activeProjectId = null;
      await projects.refresh();
      return;
    }
    await offline.deleteProject(projectId);
    if (state.activeProjectId === projectId) state.activeProjectId = null;
    await projects.refresh();
  },
};
