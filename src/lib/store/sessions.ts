// Sessions + session selection (Checkpoint E / F2 / W3) — gateway/context
// store authoritative; selection is frontend-only UI state.

import { state, toast } from "./state.ts";
import { gatewaySessions, gatewaySessionTouch, type SessionInfo } from "../gateway.ts";
import { offline } from "../offline.ts";
import { shouldUseOfflineLayer } from "../offline-routing.ts";
import type { Session } from "../types.ts";
import { createLatestGuard } from "./latest.ts";

const inTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

function fmtDur(totalSec: number): string {
  if (totalSec < 60) return `${Math.max(1, Math.round(totalSec))}s`;
  if (totalSec < 3600) return `${Math.floor(totalSec / 60)}m ${Math.round(totalSec % 60)}s`;
  return `${Math.floor(totalSec / 3600)}h ${Math.floor((totalSec % 3600) / 60)}m`;
}

/** View model: raw SessionInfo → legacy display Session. PURE — pages map
 *  canonical state to presentation; the store keeps the raw list. */
export function toSessionView(s: SessionInfo): Session {
  return {
    id: s.id,
    serverName: s.provider,
    status: "connected",
    toolsAvailable: 0,
    duration: fmtDur((s.last_active_at - s.started_at) / 1000),
    projectId: s.project_id ?? null,
    // Tool-call events are not in the context store (session = lifecycle
    // metadata); SessionDetail shows the empty state until a live feed lands.
    events: [],
  };
}

const refreshGuard = createLatestGuard();

export const sessions = {
  /** Canonical refresh: gateway path when online; offline → locally
   *  persisted sessions of the active project (P5R §5 — Project Detail /
   *  session data stays readable without the gateway). Never fabricates
   *  sessions; failure keeps the last-known list. */
  async refresh(): Promise<void> {
    const slot = refreshGuard.begin();
    state.sessionsLoading = true;
    try {
      let next = null;
      if (shouldUseOfflineLayer(state.online, inTauri) && state.activeProjectId) {
        next = await offline.projectSessions(state.activeProjectId);
      } else if (state.online) {
        next = await gatewaySessions();
      }
      /* gateway booting — keep last known */
      if (next && slot.isNewest()) state.sessions = next;
    } catch {
      /* keep last known */
    } finally {
      if (slot.isLast()) state.sessionsLoading = false;
    }
  },
  async touch(sessionId: string, provider: string): Promise<void> {
    try {
      await gatewaySessionTouch(sessionId, provider);
      await sessions.refresh();
    } catch {
      /* best-effort */
    }
  },
  /** W3: select a session for the AI workspace (UI state only). */
  select(sessionId: string | null): void {
    state.activeSessionId = sessionId;
  },
};

export function endSession(id: string) {
  const i = state.sessions.findIndex((s) => s.id === id);
  if (i >= 0) {
    state.sessions.splice(i, 1);
    toast("Session ended");
  }
}
