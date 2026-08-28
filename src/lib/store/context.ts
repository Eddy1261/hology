// Phase D: Workspace Context view/cache store.
//
// The Context Store remains authoritative; this state is a presentation
// cache ONLY. Transport is decided by the existing R1 rule (state.online →
// gateway /internal endpoint; offline → Phase C Tauri bridge). Project
// isolation is enforced below the UI; the store NEVER queries without an
// active project and never lets a stale response overwrite a newer
// selection.

import { state } from "./state.ts";
import { gatewayProjectContext, type ContextEntity } from "../gateway.ts";
import { offline } from "../offline.ts";
import { shouldUseOfflineLayer } from "../offline-routing.ts";

const inTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export const context = {
  /** Load Context for the CURRENT active project. No active project → no
   *  query (state stays untouched). A response for a project that is no
   *  longer active is discarded (stale-response guard). */
  async load(): Promise<void> {
    const projectId = state.activeProjectId;
    if (!projectId) return;

    state.contextLoading = true;
    state.contextError = null;
    try {
      const entities: ContextEntity[] = shouldUseOfflineLayer(state.online, inTauri)
        ? await offline.contextList(projectId)
        : state.online
          ? await gatewayProjectContext(projectId)
          : (state.context ?? []); // gateway booting — keep last known
      // stale-response guard: only apply if the selection did not change
      if (state.activeProjectId !== projectId) return;
      state.context = entities;
      state.contextLastUpdated = Date.now();
    } catch (e) {
      if (state.activeProjectId !== projectId) return;
      state.contextError = e instanceof Error ? e.message : "Context load failed";
    } finally {
      if (state.activeProjectId === projectId) {
        state.contextLoading = false;
      }
    }
  },

  /** Clear the Context cache deterministically on project switch (stale
   *  Context from the previous project must never render as current). */
  clear(): void {
    state.context = null;
    state.contextError = null;
    state.contextLoading = false;
    // contextLastUpdated intentionally NOT reset: it records the last
    // successful refresh, not the selection.
  },
};
