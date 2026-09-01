// P4-01/P4-02: canonical state must NOT contain synthetic backend-looking
// seeds — no demo session, no fake active subscription.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { state } from "./store/state.ts";

test("initial sessions contain no synthetic session", () => {
  assert.equal(state.sessions.length, 0);
  assert.ok(!state.sessions.some((s) => s.id === "4821"));
  assert.ok(!JSON.stringify(state.sessions).includes("Revit"));
});

test("initial subscription is unknown, not active Pro", () => {
  assert.equal(state.subscription.status, "unknown");
  assert.notEqual(state.subscription.status, "active");
  assert.equal(state.subscription.plan, "");
  assert.equal(state.subscription.daysRemaining, null);
});
