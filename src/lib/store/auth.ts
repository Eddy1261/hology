// Auth: real cloud flow (email-code + Google) + local gateway handoff.

import { state, toast } from "./state.ts";
import { mcp } from "./mcp.ts";
import { projects } from "./projects.ts";
import { billing } from "./billing.ts";
import { gatewaySessionClear, gatewaySessionSet } from "../gateway.ts";
import { authApi, type AuthPair } from "../auth-api.ts";
import { setTutorialPending, clearTutorialPending } from "../tutorial.ts";
import { clearAllLeases } from "../lease.ts";
import {
  clearSession,
  decodeIdTokenEmail,
  googleLoginIdToken,
  loadSession,
  saveSession,
} from "../session-storage.ts";

// AUTH-004: proactive refresh scheduling + single-flight guard. ACCESS_TTL
// is 30 minutes and nothing else in the app refreshes the token — without
// this, every /mcp/* call (gateway's copy of the token, handed off via
// gatewaySessionSet, goes stale), lease request, and marketplace download
// starts 401ing after ~30 minutes of uptime, recoverable only by restarting
// the app.
let refreshTimer: ReturnType<typeof setTimeout> | null = null;
let refreshInFlight: Promise<AuthPair> | null = null;

/** Bumped by logout. A refresh already in flight when the user signs out must
 *  not resurrect the session: without this it went on to `saveSession` a fresh
 *  pair back into the keychain, re-authenticate the gateway with
 *  `gatewaySessionSet` AFTER logout's `gatewaySessionClear()` had run, and
 *  re-arm the very timer logout had just cleared — leaving a signed-out app
 *  holding a live gateway session and refreshing tokens indefinitely.
 *  `refreshInFlight` cannot be aborted (it is a bare promise), so the refresh
 *  is allowed to finish and its side effects are suppressed instead. */
let sessionGeneration = 0;

/** Fire the proactive refresh this many ms before actual expiry — also the
 *  "close enough to expired, refresh before using" threshold for
 *  ensureFreshAccessToken. */
const REFRESH_BUFFER_MS = 60_000;

function clearRefreshTimer() {
  if (refreshTimer !== null) {
    clearTimeout(refreshTimer);
    refreshTimer = null;
  }
}

/** Schedule the next proactive refresh a fixed buffer before expiry (fires
 *  ~immediately if already within the buffer). Clears any previous timer
 *  first — never stacks timers. */
function scheduleRefresh(expiresAt: number) {
  clearRefreshTimer();
  const delay = Math.max(0, expiresAt - Date.now() - REFRESH_BUFFER_MS);
  refreshTimer = setTimeout(() => {
    doRefresh().catch(() => {
      /* refresh failed (revoked/offline) — the next 401 retry path or an
         app restart recovers; a timer callback must never throw */
    });
  }, delay);
}

/** Single-flight refresh: concurrent callers (the scheduler, a 401 retry
 *  from lease.ts, another from downloads.ts) share one in-flight request
 *  rather than each firing their own. Persists the new pair, re-hands the
 *  token to the gateway (keeps /mcp/* calls authorized), and reschedules. */
function doRefresh(): Promise<AuthPair> {
  if (refreshInFlight) return refreshInFlight;
  const gen = sessionGeneration;
  refreshInFlight = (async () => {
    const rec = await loadSession();
    if (!rec) throw new Error("no session to refresh");
    const pair = await authApi.refresh(rec.refreshToken);
    // Logout can land on any of these awaits. Check before the first side
    // effect so the common case costs nothing.
    if (gen !== sessionGeneration) throw new Error("signed out during refresh");
    const expiresAt = Date.now() + pair.expires_in * 1000;
    await saveSession({
      accessToken: pair.access_token,
      refreshToken: pair.refresh_token,
      expiresAt,
      email: rec.email,
    });
    try {
      await gatewaySessionSet(pair.access_token);
    } catch {
      /* gateway handoff fails soft, same posture as establishSession */
    }
    if (gen !== sessionGeneration) {
      // Signed out while the two writes above were in flight, so logout's own
      // teardown ran before them and they resurrected what it cleared. Undo
      // both rather than leave a signed-out app with a keychain record and an
      // authenticated gateway.
      await clearSession().catch(() => {});
      await gatewaySessionClear().catch(() => {});
      throw new Error("signed out during refresh");
    }
    scheduleRefresh(expiresAt);
    return pair;
  })();
  return refreshInFlight.finally(() => {
    refreshInFlight = null;
  });
}

/** Valid access token for direct-to-cloud calls the gateway doesn't mediate
 *  (lease acquisition, marketplace downloads) — refreshes first if the
 *  stored token is already expired or within the buffer. `null` when there
 *  is no session or the refresh itself fails (caller surfaces its own 401). */
export async function ensureFreshAccessToken(): Promise<string | null> {
  const rec = await loadSession();
  if (!rec) return null;
  if (Date.now() < rec.expiresAt - REFRESH_BUFFER_MS) return rec.accessToken;
  try {
    const pair = await doRefresh();
    return pair.access_token;
  } catch {
    return null;
  }
}

/** Persist the token pair and hand the access token to the gateway so
 *  bearer-less /mcp/* calls work. Gateway handoff fails soft: user stays
 *  logged in, connector calls stay gated until the gateway is reachable.
 *
 *  First-use onboarding: the BACKEND reports is_new_user on the auth pair
 *  (created-account truth). This single choke point covers email + Google +
 *  any entry page — existing accounts never get the flag, new accounts
 *  always do, regardless of which page they authenticated on. */
async function establishSession(email: string, pair: AuthPair, persist = true) {
  state.user = { email };
  const expiresAt = Date.now() + pair.expires_in * 1000;
  if (persist) {
    await saveSession({
      accessToken: pair.access_token,
      refreshToken: pair.refresh_token,
      expiresAt,
      email,
    });
  }
  // AUTH-004: (re)start the proactive refresh cycle every time a session is
  // established — login, Google login, and app-start restore alike.
  scheduleRefresh(expiresAt);
  if (pair.is_new_user) {
    setTutorialPending();
  }

  // B-12.4: Extract authoritative entitlements array for UI badges
  try {
    const payload = JSON.parse(atob(pair.access_token.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")));
    if (Array.isArray(payload.entitlements)) {
      state.entitlements = payload.entitlements;
    }
  } catch {
    /* non-fatal fallback */
  }

  // The LOCAL gateway handoff goes FIRST and is the only awaited step that
  // gates the rest. `billing.refreshStatus()` used to run above this: a
  // round-trip to the billing service, with no timeout, on what is now the
  // startup critical path (main.ts awaits auth.restore()). A slow or hanging
  // billing service therefore delayed the gateway handoff and every gateway
  // read the app makes.
  try {
    await gatewaySessionSet(pair.access_token);
    state.online = true;
  } catch {
    // Only the handoff itself is a reachability verdict. The reads below are
    // NOT: a transient 500 on /internal/projects used to land in this same
    // catch and mark the whole app offline, which routes the user's next WRITE
    // to the offline redb layer — against files the live gateway holds an
    // exclusive lock on.
    state.online = false;
  }

  // B-12.3: subscription status. Cloud, non-blocking, fails soft internally.
  void billing.refreshStatus();

  if (state.online) {
    // F1.2: refresh project state after login/session restore — the selector
    // must not show stale pre-auth project info. `allSettled`: one failing
    // read must not skip the others (loadActive being skipped is what left
    // state.activeProjectId null after a transient projects.refresh failure).
    await Promise.allSettled([
      mcp.refresh(),
      projects.refresh().then(() => projects.loadActive()),
    ]);
  }
}

export const auth = {
  /** Step 1 of email-code login. Always 202 (signup-or-login). */
  async requestCode(email: string) {
    await authApi.requestCode(email);
  },

  /** Step 2: verify the emailed code → session established. */
  async verifyCode(email: string, code: string): Promise<boolean> {
    const pair = await authApi.verify(email, code);
    await establishSession(email, pair);
    return pair.is_new_user ?? false;
  },

  /** "Continue with Google" — Tauri-only (system browser + PKCE). */
  async googleLogin(): Promise<boolean> {
    const idToken = await googleLoginIdToken();
    const email = decodeIdTokenEmail(idToken) ?? "unknown@google";
    const pair = await authApi.googleCallback(idToken);
    await establishSession(email, pair);
    return pair.is_new_user ?? false;
  },

  /** Logout = server-side refresh revoke + local drop (Checkpoint B #5). */
  async logout() {
    // AUTH-004: stop the proactive refresh cycle — it must not keep firing
    // (and re-handing tokens to the gateway) for a signed-out user. The timer
    // is only half of it: a refresh ALREADY in flight cannot be cancelled, so
    // bump the generation first and let `doRefresh` suppress its own writes.
    sessionGeneration++;
    clearRefreshTimer();
    const rec = await loadSession();
    if (rec) {
      try {
        await authApi.revoke(rec.refreshToken);
      } catch {
        /* server unreachable — local drop regardless */
      }
    }
    let gatewayClearOk = false;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        await gatewaySessionClear();
        gatewayClearOk = true;
        break;
      } catch {
        if (attempt < 2) {
          await new Promise((r) => setTimeout(r, 500));
        }
      }
    }
    if (!gatewayClearOk) {
      // toast() accepts only "ok" | "error"; there is no "warn" kind and adding
      // one would mean new styling, which this audit does not touch.
      toast("Signed out (gateway cleanup failed — connectors may still run)", "error");
    }
    await clearSession();
    clearAllLeases();
    clearTutorialPending();
    state.user = null;
    state.entitlements = [];
    state.localConnectors = [];
    state.servers = [];
    state.apps = [];
    state.subscription = {
      plan: "",
      status: "unknown",
      renews: "",
      daysRemaining: null,
    };
    toast("Signed out");
  },

  /** Re-hand a CURRENT access token to the gateway.
   *
   *  The gateway authorises `/mcp` against the copy of the access token the
   *  desktop pushed to it, with zero expiry grace, and it holds that copy in
   *  MEMORY with no refresh capability of its own. Two things break that copy:
   *
   *   - the only thing keeping it fresh is `doRefresh`'s `setTimeout`, a
   *     WebView timer that browsers throttle while the window is hidden and
   *     that does not fire across machine sleep. On wake the gateway's copy is
   *     already expired, and every /mcp call from an EXTERNAL agent (Claude
   *     Desktop over the tunnel) 401s until the timer catches up;
   *   - a gateway that restarted has NO session at all, because it is memory
   *     only. Before this, that state was unrecoverable without restarting the
   *     desktop app.
   *
   *  Cheap and idempotent: `ensureFreshAccessToken` is single-flight and only
   *  hits the network when the stored token is inside the expiry buffer. */
  async resync(): Promise<void> {
    if (!state.user) return;
    const token = await ensureFreshAccessToken();
    if (!token) return;
    try {
      await gatewaySessionSet(token);
    } catch {
      /* gateway not reachable yet — the recovery loop calls again */
    }
  },

  /** App start: restore persisted session; refresh if expired; re-handoff. */
  async restore(): Promise<boolean> {
    const rec = await loadSession();
    if (!rec) return false;
    try {
      let pair: AuthPair;
      if (Date.now() >= rec.expiresAt) {
        pair = await authApi.refresh(rec.refreshToken);
      } else {
        // Token still valid — use remaining lifetime, not 0
        const remaining = Math.max(0, Math.floor((rec.expiresAt - Date.now()) / 1000));
        pair = {
          access_token: rec.accessToken,
          refresh_token: rec.refreshToken,
          expires_in: remaining,
        };
      }
      await establishSession(rec.email, pair, true);
      return true;
    } catch {
      await clearSession();
      state.user = null;
      return false;
    }
  },
};
