// P4-04/P4-09: MCP store lifecycle — raw ConnectorInfo stays canonical;
// refresh failure never fabricates connectors; loading flag drives UI.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { state } from "./store/state.ts";
import { mcp } from "./store/mcp.ts";

function mockFetch(impl: (url: string) => Promise<Response>): void {
  globalThis.fetch = impl as typeof fetch;
}

const LIST = [
  {
    id: "revit-mcp",
    name: "Revit MCP",
    version: "1.2.0",
    status: "running",
    host_state: "connected",
    entitled: true,
    exposed: false,
    public_url: null,
  },
  {
    id: "qgis-mcp",
    name: "QGIS MCP",
    version: "0.9.0",
    status: "off",
    host_state: null,
    entitled: true,
    exposed: false,
    public_url: null,
  },
];

test("mcp.refresh stores RAW ConnectorInfo (status/entitled/host_state preserved)", async () => {
  state.localConnectors = [];
  state.mcpLoading = false;
  mockFetch(async () => new Response(JSON.stringify(LIST), { status: 200 }));
  await mcp.refresh();
  assert.equal(state.mcpLoading, false);
  assert.equal(state.localConnectors.length, 2);
  assert.equal(state.localConnectors[0].host_state, "connected");
  assert.equal(state.localConnectors[0].entitled, true);
  assert.equal(state.localConnectors[0].status, "running");
  assert.equal(state.online, true);
});

test("mcp.refresh failure does not fabricate connectors (raw stays canonical)", async () => {
  state.localConnectors = [];
  mockFetch(async () => {
    throw new Error("gateway down");
  });
  await mcp.refresh();
  assert.equal(state.localConnectors.length, 0);
  assert.equal(state.online, false);
  assert.equal(state.mcpLoading, false);
});

test("mcpLoading is true while a refresh is in flight (loading gate)", async () => {
  state.localConnectors = [];
  let resolveFetch: (r: Response) => void = () => {};
  mockFetch(
    () =>
      new Promise<Response>((resolve) => {
        resolveFetch = resolve;
      }),
  );
  const p = mcp.refresh();
  assert.equal(state.mcpLoading, true, "loading flag set synchronously");
  resolveFetch(new Response(JSON.stringify(LIST), { status: 200 }));
  await p;
  assert.equal(state.mcpLoading, false);
});

test("installed-vs-catalog distinction survives the store (local only)", async () => {
  state.localConnectors = LIST;
  // No catalog: collection treats installed items as unlisted, never lost.
  const { buildCollection } = await import("./collection.ts");
  const items = buildCollection(null, state.localConnectors);
  assert.equal(items.length, 2);
  assert.ok(items.every((it) => it.status === "unlisted"));
});

// --- CONN-030: 401 is not "offline", and a stale refresh must not win ---

test("a 401 leaves state.online alone (gateway is UP, it just has no session)", async () => {
  state.localConnectors = [];
  state.online = true;
  mockFetch(async () => new Response(JSON.stringify({ error: "no authenticated session" }), { status: 401 }));
  await mcp.refresh();
  assert.equal(
    state.online,
    true,
    "a 401 means the gateway answered and refused us — painting 'Gateway unavailable' over " +
      "an auth handoff still in flight is what routed writes to the offline layer",
  );
  assert.equal(state.localConnectors.length, 0, "no connectors fabricated");
  assert.equal(state.mcpLoading, false);
});

test("a non-401 HTTP failure still marks the gateway offline", async () => {
  state.localConnectors = [];
  state.online = true;
  mockFetch(async () => new Response("boom", { status: 500 }));
  await mcp.refresh();
  assert.equal(state.online, false, "500 is a real reachability/health problem, not an auth handoff");
});

test("a slow refresh cannot overwrite the result of a newer one", async () => {
  state.localConnectors = [];
  state.online = true;

  const responses: Array<(r: Response) => void> = [];
  mockFetch(
    () =>
      new Promise<Response>((resolve) => {
        responses.push(resolve);
      }),
  );

  // A starts first (it will return the stale, pre-enable snapshot).
  const a = mcp.refresh();
  // B starts second (it will return the current snapshot) and settles FIRST.
  const b = mcp.refresh();

  responses[1](new Response(JSON.stringify(LIST), { status: 200 }));
  await b;
  assert.equal(state.localConnectors.length, 2, "B applied");

  responses[0](new Response(JSON.stringify([]), { status: 200 }));
  await a;
  assert.equal(
    state.localConnectors.length,
    2,
    "A settled last but is older than B; letting it win is what showed a just-connected " +
      "connector as disconnected",
  );
});

test("the loading flag is cleared by the last request, not the first to finish", async () => {
  state.localConnectors = [];
  const responses: Array<(r: Response) => void> = [];
  mockFetch(
    () =>
      new Promise<Response>((resolve) => {
        responses.push(resolve);
      }),
  );

  const a = mcp.refresh();
  const b = mcp.refresh();
  assert.equal(state.mcpLoading, true);

  responses[0](new Response(JSON.stringify([]), { status: 200 }));
  await a;
  assert.equal(state.mcpLoading, true, "B is still in flight — the spinner must not lie");

  responses[1](new Response(JSON.stringify(LIST), { status: 200 }));
  await b;
  assert.equal(state.mcpLoading, false);
});
