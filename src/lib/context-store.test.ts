// Phase D: Workspace Context store — active-project scoping, stale-response
// guard, error-vs-empty, contextLastUpdated semantics (online gateway path;
// the offline bridge path is invoke-gated and covered at the bridge level).

import { test } from "node:test";
import assert from "node:assert/strict";
import { state } from "./store/state.ts";
import { context } from "./store/context.ts";

function mockFetch(impl: (url: string) => Promise<Response>): void {
  globalThis.fetch = impl as typeof fetch;
}

const LIST = [
  {
    id: "e1",
    type: "decision",
    label: "Office façade",
    summary: "Use Type X curtain wall family.",
    scope: null,
    pinned: false,
    updated: 5,
  },
];

test("loads Context for the ACTIVE project via the gateway path", async () => {
  state.online = true;
  state.activeProjectId = "proj-a";
  state.context = null;
  state.contextError = null;
  state.contextLastUpdated = null;
  let url = "";
  mockFetch(async (u: string) => {
    url = u;
    return new Response(JSON.stringify(LIST), { status: 200 });
  });
  await context.load();
  assert.ok(url.includes("/internal/projects/proj-a/context"), url);
  assert.deepEqual(state.context, LIST);
  assert.equal(state.contextLoading, false);
  assert.equal(state.contextError, null);
  assert.ok(state.contextLastUpdated !== null, "lastUpdated set after success");
});

test("no active project → no query, state untouched", async () => {
  state.online = true;
  state.activeProjectId = null;
  state.context = null;
  let called = false;
  mockFetch(async () => {
    called = true;
    return new Response("[]", { status: 200 });
  });
  await context.load();
  assert.equal(called, false);
  assert.equal(state.context, null);
});

test("error state is separate from empty; lastUpdated unchanged on failure", async () => {
  state.online = true;
  state.activeProjectId = "proj-a";
  state.context = [];
  state.contextLastUpdated = 123;
  mockFetch(async () => {
    throw new Error("gateway down");
  });
  await context.load();
  assert.ok(state.contextError, "error surfaced");
  assert.equal(state.contextLoading, false);
  assert.equal(state.contextLastUpdated, 123, "lastUpdated only on success");
});

test("stale response cannot overwrite a newer project selection", async () => {
  state.online = true;
  let resolveA!: (v: unknown) => void;
  const gateA = new Promise((r) => {
    resolveA = r;
  });
  mockFetch(async (u: string) => {
    if (u.includes("proj-a")) {
      await gateA;
      return new Response(JSON.stringify([{ ...LIST[0], label: "A-OLD" }]), { status: 200 });
    }
    return new Response(JSON.stringify([{ ...LIST[0], label: "B-NEW" }]), { status: 200 });
  });

  state.activeProjectId = "proj-a";
  const loadA = context.load();
  state.activeProjectId = "proj-b";
  await context.load(); // B resolves immediately
  resolveA(undefined);
  await loadA; // A resolves late — must be discarded

  assert.equal(state.context?.[0]?.label, "B-NEW", "stale A must not overwrite B");
});

test("clear() deterministically removes the previous project's context", () => {
  state.context = LIST as never;
  state.contextError = "x";
  state.contextLoading = true;
  context.clear();
  assert.equal(state.context, null);
  assert.equal(state.contextError, null);
  assert.equal(state.contextLoading, false);
});
