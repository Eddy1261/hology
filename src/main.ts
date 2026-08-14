import { createApp } from "vue";
import App from "./App.vue";
import { router } from "./lib/router";
import { auth, billing, catalog, context, gateway, mcp, projects, sessions, skills, state, toast } from "./lib/store";
import { createGatewayRecovery } from "./lib/gateway-recovery.ts";
import { postAuthTarget, takePendingAuthRoute } from "./lib/auth-redirect";
import { gatewayUrl, resolveGatewayUrl } from "./lib/gateway.ts";
import "./index.css";

// P2-04: the desktop (Tauri) window is 398px wide — narrower than the
// 640px browser media query that gives the ac-panel its card border/radius.
// Flag the real shell so the card styling applies there too.
if (typeof window !== "undefined" && "__TAURI_INTERNALS__" in window) {
  document.body.classList.add("tauri-shell");
}

// Checkpoint A: probe the gateway sidecar at startup. P5R-01: BOUNDED
// retry (10 x 500ms) so a gateway that is still booting does not settle the
// app into offline state on the first failed probe. Fails soft —
// state.online=false, UI keeps working against the local/offline layer.
async function probeGatewayWithRetry(
  attempts = 10,
  delayMs = 500,
): Promise<boolean> {
  for (let i = 0; i < attempts; i++) {
    if (await gateway.checkHealth()) return true;
    await new Promise((r) => setTimeout(r, delayMs));
  }
  return false;
}

// FE-8 P1: late-gateway recovery — if the sidecar comes up after startup
// (or the user returns to a visible window), re-probe and rehydrate shared
// state instead of leaving pages on "Gateway unavailable".
//
// This is also the STARTUP hydration list (see `startup()` below), so the two
// paths cannot drift apart. Each call is caught individually: `mcp.refresh`
// already swallows its own failure (it owns state.online), but `skills` /
// `projects` / `sessions` propagate, and an uncaught rejection here is pure
// noise that buried the real "Failed to fetch" signal.
//
// Every /internal/* route 401s until the desktop hands the gateway its cloud
// access token (POST /internal/session, issued from inside auth.restore()).
// Hydration that runs before that lands gets a burst of 401s the UI cannot
// tell apart from an unreachable gateway.
//
// Awaiting `auth.restore()` at its own call site fixed only THAT call site.
// The recovery loop below arms at t=0 and fires its first tick at t~3s —
// ahead of probeGatewayWithRetry's own 5s budget — and the visibilitychange
// handler can fire at any moment. Both call rehydrate(). One promise gates
// all three, so the guard cannot drift out of sync with the trigger list.
let markSessionSettled: () => void = () => {};
const sessionReady: Promise<void> = new Promise<void>((resolve) => {
  markSessionSettled = resolve;
});

// Safety net. `auth.restore()` awaits the network (a token refresh, and the
// cloud calls inside establishSession) with no timeout of its own. A hung
// cloud service must DELAY hydration, never cancel it — the offline layer
// exists precisely for that case and has to get its turn.
const SESSION_READY_MAX_WAIT_MS = 15_000;
setTimeout(() => markSessionSettled(), SESSION_READY_MAX_WAIT_MS);

async function rehydrate(): Promise<void> {
  await sessionReady;
  const soft = (what: string) => (e: unknown) =>
    console.warn(`rehydrate: ${what} failed`, e);
  mcp.refresh().catch(soft("mcp.refresh"));
  sessions.refresh().catch(soft("sessions.refresh"));
  skills.refresh().catch(soft("skills.refresh"));
  projects.refresh().catch(soft("projects.refresh"));
  projects.loadActive().catch(soft("projects.loadActive"));
  context.load().catch(soft("context.load"));
}

// Startup hydration MUST NOT race the sidecar.
//
// `run()`'s Tauri `setup()` spawns the gateway milliseconds before this module
// executes, so firing the hydration calls at t=0 guaranteed a burst of
// "Failed to fetch" on every cold start. The damage is not the failed reads —
// it is that `mcp.refresh` and `auth.restore` both settle `state.online=false`
// from that race, and `shouldUseOfflineLayer` then routes the user's next
// WRITE to the offline Tauri layer, which collides with the exclusive redb
// lock the live gateway holds on `projects/desktop.db` (a skill create fails
// while a project create, which touches a fresh `<id>.db`, succeeds).
//
// So: settle the bounded probe first, then hydrate — and hydrate either way,
// because "gateway genuinely down" is a legitimate state the offline layer is
// there to serve.
async function startup(): Promise<void> {
  // Must resolve BEFORE the first gateway call: if 8788 was taken and the
  // gateway fell back to another port, every fetch in gateway.ts/gateway-
  // adjacent modules reads the module-level `gatewayUrl` live, so this only
  // needs to win the race against probeGatewayWithRetry() below.
  await resolveGatewayUrl();
  // Mirror the resolved base into reactive state for the components that
  // DISPLAY it (Gateway Endpoints / Agent Setup cards). `gatewayUrl` is a
  // module-level `let` — correct for the fetch call sites, which read it
  // inline, but invisible to Vue. The app mounts below before this function
  // returns, so those cards would otherwise render the pre-resolution default.
  state.gatewayBaseUrl = gatewayUrl;
  const ok = await probeGatewayWithRetry();
  console.log(ok ? "gateway: connected" : "gateway: unreachable (offline mode)");

  // Checkpoint B: restore a persisted session (keychain/file) and re-hand the
  // access token to the gateway so the user stays signed in across restarts.
  //
  // AWAITED — not fire-and-forget. rehydrate() below issues the first
  // GET /internal/connectors; if that races ahead of restore()'s
  // gatewaySessionSet(), the gateway still has no session and answers 401
  // ("no authenticated session"), which the UI cannot tell apart from a
  // truly unreachable gateway. Slower/cold boots lose this race far more
  // often than an already-warm dev machine, which is why it reproduced on
  // one install and not another with the identical build.
  try {
    const restored = await auth.restore();
    console.log(restored ? "auth: session restored" : "auth: no session");
    if (restored) {
      toast("Signed in as " + (state.user?.email ?? "your account"));
      // P5/P2-03: return the user to the protected route they originally
      // requested (captured by the guard) instead of always dumping them on
      // /app. Only navigate when the user is still on a public route (or
      // /login) — never override an in-progress navigation.
      const target = postAuthTarget(takePendingAuthRoute());
      const cur = router.currentRoute.value;
      if (cur.meta.public || cur.fullPath === "/login") router.push(target);
    }
  } catch (e) {
    console.warn("auth.restore failed", e);
  } finally {
    // Settled either way — "no session" is a legitimate outcome that must
    // still release hydration, or a signed-out app would never load anything.
    markSessionSettled();
  }

  // Checkpoints C/E + F1.1: connector list, sessions, skills, project registry
  // and active project — all gateway-owned reads. `rehydrate` awaits
  // `sessionReady` itself, so this and the two triggers below are all gated.
  void rehydrate();

  // MCP Collection refactor: remote catalog — cache-first load (never blocks
  // startup on S3); gateway state is refreshed by rehydrate() above.
  catalog.load().catch((e) => console.warn("catalog.load failed", e));

  // Checkpoint D: refresh subscription status (paywall gate, Settings card).
  billing.refreshStatus().catch((e) => console.warn("billing.refreshStatus failed", e));
}

void startup();

document.addEventListener("visibilitychange", () => {
  if (document.visibilityState !== "visible") return;
  // Runs even when we believe we are online: the gateway's copy of the access
  // token can have expired while the window was hidden (the refresh timer is a
  // throttled WebView timer), and nothing else notices until an external agent
  // starts getting 401s. See auth.resync().
  void auth.resync();
  if (state.online) return;
  gateway.checkHealth().then((ok) => {
    if (ok) void rehydrate();
  });
});

// G-2.1: bounded recovery while offline. Probes every 3s ONLY while the
// gateway is down; self-stops once online; never overlaps probes. Runs the
// same rehydration the visibility handler uses.
const recovery = createGatewayRecovery({
  isOnline: () => state.online,
  probe: () => gateway.checkHealth(),
  // A gateway that just came back has NO session — it is memory-only, so a
  // restart wipes it. Re-push the token BEFORE hydrating, or every read in
  // rehydrate() 401s and the recovery accomplishes nothing.
  onRecovered: () => void auth.resync().then(() => rehydrate()),
  intervalMs: 3000,
});
recovery.start();

// G-2.1: while ONLINE, keep a coarse watchdog so a gateway that dies mid-
// session flips state.online and re-starts the 3s recovery loop. 15s is
// cheap (one loopback GET) and avoids any duplicate polling while healthy.
setInterval(async () => {
  if (state.online && !(await gateway.checkHealth())) {
    recovery.start();
  }
}, 15_000);

createApp(App).use(router).mount("#root");
