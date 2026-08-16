// MCP runtime + gateway health service. UI never calls the gateway directly;
// it calls these and re-renders state.servers / state.apps (which mirror
// GET /internal/connectors).

import { state, toast } from "./state.ts";
import {
  gatewayConnectors,
  gatewayConnectorAction,
  gatewayHealth,
  gatewaySessionSet,
  gatewayUrl,
  GatewayHttpError,
  type ConnectorInfo,
} from "../gateway.ts";
import { ensureFreshAccessToken } from "./auth.ts";
import { createLatestGuard } from "./latest.ts";
import { acquireLease } from "../lease.ts";
import { catlogC, catlogErrC } from "../catdiag.ts";
import type { ConnStatus, MCPApp, MCPServer } from "../types.ts";

const UI_STATUS: Record<string, ConnStatus> = {
  off: "disconnected",
  starting: "connecting",
  running: "connected",
  crashed: "error",
};

/** Installed version for a connector (from the gateway catalog mirror). */
function installedVersion(id: string): string {
  const c = state.localConnectors.find((x) => x.id === id);
  if (c?.version) return c.version;
  const cat = state.mcpCatalog.find((x) => x.id === id);
  if (cat?.version) return cat.version;
  catlogC(`[connect:version] warning: connector ${id} not found in localConnectors, defaulting to 0.1.0`);
  return "0.1.0";
}

/**
 * Track B: acquire a server-issued activation lease, then enable. The
 * desktop never decides entitlement — the server does, at lease mint time.
 */
async function enableWithLease(id: string): Promise<void> {
  const ver = installedVersion(id);
  await catlogC(`[connect] acquiring activation lease for ${id} (version=${ver})...`);
  const lease = await acquireLease(id, ver);
  await catlogC(`[connect] lease acquired successfully, sending 'enable' to Gateway sidecar...`);

  // Make sure the gateway holds a CURRENT token before the enable. Reading
  // the stored record directly raced two things: the proactive refresh timer
  // could land a newer token between the read and the push, so this overwrote
  // the gateway with the OLDER one; and a logout completing in the same window
  // was undone by re-establishing a session for a signed-out user.
  // `ensureFreshAccessToken` is single-flight and refreshes when the stored
  // token is inside the expiry buffer, and returns null when there is no
  // session to push.
  const accessToken = await ensureFreshAccessToken();
  if (accessToken) {
    try {
      await gatewaySessionSet(accessToken);
      await catlogC(`[connect] Gateway session token synchronized`);
    } catch (e) {
      await catlogErrC(`[connect] Gateway session synchronization error`, e);
    }
  }

  await gatewayConnectorAction(id, "enable", lease);
  await catlogC(`[connect] Gateway acknowledged 'enable' for ${id}`);
}

function toServer(c: ConnectorInfo): MCPServer {
  return {
    id: c.id,
    name: c.name.replace(/ MCP$/i, ""),
    description: c.name,
    version: c.version,
    endpoint: c.public_url ?? `local:${c.id}`,
    status: UI_STATUS[c.status] ?? "disconnected",
    enabled: c.status === "running" || c.status === "starting",
    capabilities: c.name,
    uptime: "—",
    lastUsed: "—",
    icon: c.name[0]?.toUpperCase() ?? "?",
    color: "#3b82f6",
    exposed: c.exposed,
    publicUrl: c.public_url,
  };
}

function toApp(c: ConnectorInfo): MCPApp {
  return {
    id: c.id,
    name: c.name,
    description: c.name,
    category: "MCP",
    status: UI_STATUS[c.status] ?? "disconnected",
    icon: c.name[0]?.toUpperCase() ?? "?",
    color: "#3b82f6",
  };
}

const refreshGuard = createLatestGuard();

/** Connector ids with an action in flight.
 *
 *  connect / disconnect / toggle are reachable from several surfaces at once
 *  and only the Dashboard disabled its own button, so a double click fired two
 *  enables. The gateway now treats a duplicate enable as a no-op, but two
 *  actions still each issue a refresh and each toast, and a delete racing an
 *  enable is not a no-op at all. */
const inFlight = new Set<string>();

async function exclusive(id: string, run: () => Promise<void>): Promise<void> {
  if (inFlight.has(id)) return;
  inFlight.add(id);
  try {
    await run();
  } finally {
    inFlight.delete(id);
  }
}

/**
 * Poll until a connector leaves the "starting" state (or timeout). The
 * gateway answers `enable` before the subprocess is healthy, so the single
 * refresh right after enable almost always still shows "connecting". Poll
 * 1s × up to 20s; stop early on terminal states (running/crashed/off) or
 * when the connector disappears. Returns the last seen entry.
 */
async function pollUntilSettled(appId: string, timeoutMs = 20_000): Promise<ConnectorInfo | undefined> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const c = state.localConnectors.find((x) => x.id === appId);
    if (!c || c.status !== "starting" || Date.now() >= deadline) return c;
    await new Promise((r) => setTimeout(r, 1000));
    try {
      await mcp.refresh();
    } catch {
      return state.localConnectors.find((x) => x.id === appId);
    }
  }
}

function displayNameOf(c: ConnectorInfo | undefined, fallback: string): string {
  return c ? c.name.replace(" MCP", "") : fallback;
}

export const mcp = {
  /** Hydrate local connectors from the gateway. Drives localConnectors. */
  async refresh(): Promise<void> {
    const slot = refreshGuard.begin();
    state.mcpLoading = true;
    try {
      const list = await gatewayConnectors();
      // Drop a response that a newer refresh has already superseded.
      if (!slot.isNewest()) return;
      state.localConnectors = list;
      state.online = true;
      await catlogC(`[connect:refresh] local connectors list count=${list.length}`, list.map((l) => `${l.id}:${l.status}`).join(", "));
    } catch (e) {
      // A 401 means the gateway is UP and answered — it just has no (or a
      // stale) session yet. That is not the same failure as an unreachable
      // gateway, and must not paint "Gateway unavailable / make sure the
      // app is running" over what is actually an auth handoff that hasn't
      // landed (or is about to be corrected by the next establishSession()
      // call). Leave state.online as-is; any other failure is a genuine
      // reachability problem.
      if (e instanceof GatewayHttpError && e.status === 401) {
        await catlogC(`[connect:refresh] gatewayConnectors 401 (no session yet) — not marking offline`);
      } else {
        state.online = false;
        await catlogErrC(`[connect:refresh] gatewayConnectors failed`, e);
      }
    } finally {
      // Only the newest in-flight refresh may clear the shared flag; otherwise
      // whichever finishes first stops the spinner while others still run.
      if (slot.isLast()) state.mcpLoading = false;
    }
  },

  async connect(appId: string) {
    await exclusive(appId, async () => {
    await catlogC(`[connect:action] connect requested for ${appId}`);
    try {
      await enableWithLease(appId);
      await mcp.refresh();
      // The enable ACK races the subprocess boot — keep refreshing until
      // the connector settles so the UI leaves "connecting" on its own.
      const settled = await pollUntilSettled(appId);
      const name = displayNameOf(settled, appId);
      if (settled?.status === "running") {
        await catlogC(`[connect:action] ${name} successfully enabled`);
        toast(`${name} connected`);
      } else if (settled?.status === "crashed") {
        await catlogErrC(`[connect:action] ${name} crashed during start`, settled);
        toast(`${name} failed to start`, "error");
      } else {
        await catlogC(`[connect:action] ${name} still starting after poll timeout (status=${settled?.status ?? "unknown"})`);
        toast(`${name} is still starting…`);
      }
    } catch (e) {
      await catlogErrC(`[connect:action] failed to connect ${appId}`, e);
      toast(e instanceof Error ? e.message : "Connect failed", "error");
    }
    });
  },

  async disconnect(serverId: string) {
    await exclusive(serverId, async () => {
    await catlogC(`[disconnect:action] disconnect requested for ${serverId}`);
    try {
      await gatewayConnectorAction(serverId, "disable");
      await mcp.refresh();
      const c = state.localConnectors.find((x) => x.id === serverId);
      const name = c ? c.name : serverId;
      await catlogC(`[disconnect:action] ${name} disabled`);
      toast(`${name} disconnected`);
    } catch (e) {
      await catlogErrC(`[disconnect:action] failed to disconnect ${serverId}`, e);
      toast(e instanceof Error ? e.message : "Disconnect failed", "error");
    }
    });
  },

  /** Enable/disable a connected server (ServerCard toggle / Pause-Resume). */
  async toggle(serverId: string) {
    await exclusive(serverId, async () => {
    const c = state.localConnectors.find((x) => x.id === serverId);
    try {
      if (c?.status === "running" || c?.status === "starting") {
        await catlogC(`[toggle:action] disabling ${serverId}`);
        await gatewayConnectorAction(serverId, "disable");
        await mcp.refresh();
      } else {
        await catlogC(`[toggle:action] enabling ${serverId}`);
        await enableWithLease(serverId);
        await mcp.refresh();
        // Same boot race as connect() — refresh until settled.
        await pollUntilSettled(serverId);
      }
    } catch (e) {
      await catlogErrC(`[toggle:action] failed for ${serverId}`, e);
      toast(e instanceof Error ? e.message : "Toggle failed", "error");
    }
    });
  },

  /** Tunnel exposure toggle (Phase 4 relay, per-connector). */
  async toggleExpose(serverId: string) {
    await exclusive(serverId, async () => {
    const c = state.localConnectors.find((x) => x.id === serverId);
    const action = c?.exposed ? "unexpose" : "expose";
    try {
      await catlogC(`[expose:action] ${action} requested for ${serverId}`);
      await gatewayConnectorAction(serverId, action);
      await catlogC(`[expose:action] ${action} success for ${serverId}`);
      toast(c?.exposed ? "Shared access turned off" : "Turning on shared access…");
    } catch (e) {
      await catlogErrC(`[expose:action] ${action} failed for ${serverId}`, e);
      toast(e instanceof Error ? e.message : "Couldn't change shared access. Please try again.", "error");
      return;
    }
    await mcp.refresh();
    });
  },
};

export const gateway = {
  /** Probe the local gateway sidecar. Drives state.online; no throw. */
  async checkHealth(): Promise<boolean> {
    const url = `${gatewayUrl}/health`;
    const t0 = Date.now();
    try {
      const h = await gatewayHealth();
      const ok = h.status === "ok";
      // G-2.1 diagnostic: attempt + URL + result + transition.
      console.info(`[gw:health] ${new Date().toISOString()} GET ${url} ok=${ok} (${Date.now() - t0}ms)`);
      const was = state.online;
      state.online = ok;
      if (ok !== was) console.info(`[gw:state] online ${was} → ${ok}`);
      return ok;
    } catch (e) {
      // Error body distinguishes: startup race (refused/ECONNREFUSED early)
      // vs WebView2 block (Failed to fetch even after gateway is up).
      console.error(`[gw:health] ${new Date().toISOString()} GET ${url} FAIL (${Date.now() - t0}ms)`, e);
      const was = state.online;
      state.online = false;
      if (was) console.info(`[gw:state] online ${was} → false`);
      return false;
    }
  },
};
