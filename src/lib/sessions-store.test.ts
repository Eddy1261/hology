// P4-01/P4-03: session store lifecycle — raw canonical SessionInfo,
// loading flag, failure never fabricates sessions.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { state } from "./store/state.ts";
import { sessions, toSessionView } from "./store/sessions.ts";

function mockFetch(impl: (url: string) => Promise<Response>): void {
  globalThis.fetch = impl as typeof fetch;
}

const LIST = [
  { id: "s-1", project_id: "p-1", provider: "claude", started_at: 1000, last_active_at: 5000 },
  { id: "s-2", project_id: null, provider: "gpt", started_at: 2000, last_active_at: 2500 },
];

test("sessions.refresh stores RAW SessionInfo (timestamps/ordering preserved)", async () => {
  state.online = true; // R1: gateway path when online
  state.sessions = [];
  mockFetch(async () => new Response(JSON.stringify(LIST), { status: 200 }));
  await sessions.refresh();
  assert.equal(state.sessions.length, 2);
  assert.deepEqual(state.sessions[0], LIST[0]);
  assert.equal(state.sessions[0].started_at, 1000);
  assert.equal(state.sessions[0].last_active_at, 5000);
});

test("sessions.refresh failure does not fabricate sessions", async () => {
  state.online = true;
  state.sessions = [];
  mockFetch(async () => {
    throw new Error("gateway down");
  });
  await sessions.refresh();
  assert.equal(state.sessions.length, 0);
  assert.equal(state.sessionsLoading, false);
});

test("sessions.refresh failure keeps last-known list, never appends", async () => {
  state.online = true;
  state.sessions = [{ id: "real-1", project_id: null, provider: "claude", started_at: 1, last_active_at: 2 }];
  mockFetch(async () => {
    throw new Error("gateway down");
  });
  await sessions.refresh();
  assert.equal(state.sessions.length, 1);
  assert.equal(state.sessions[0].id, "real-1");
});

test("successful empty response is a real empty list (not loading)", async () => {
  state.online = true;
  state.sessions = [];
  mockFetch(async () => new Response("[]", { status: 200 }));
  await sessions.refresh();
  assert.equal(state.sessions.length, 0);
  assert.equal(state.sessionsLoading, false);
});

test("toSessionView derives the display shape without inventing events/tools", () => {
  const v = toSessionView(LIST[0]);
  assert.equal(v.id, "s-1");
  assert.equal(v.serverName, "claude");
  assert.equal(v.projectId, "p-1");
  assert.equal(v.toolsAvailable, 0);
  assert.deepEqual(v.events, []);
  assert.ok(v.duration.length > 0);
});
