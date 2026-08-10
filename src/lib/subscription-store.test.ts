// P4-02: subscription lifecycle — unknown until authoritative success;
// failure never fabricates an active subscription; Payment gate is safe.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { state } from "./store/state.ts";
import { billing } from "./store/billing.ts";
import { saveSession } from "./session-storage.ts";

// Node test env has no window/localStorage — provide a minimal localStorage
// so sessionUserId() resolves and billing actually runs its fetch path.
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
};

function mockFetch(impl: (url: string) => Promise<Response>): void {
  globalThis.fetch = impl as typeof fetch;
}

// A token with a sub claim so sessionUserId() returns a uid.
const TOKEN =
  "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1LTEifQ.sig";

async function seedSession(): Promise<void> {
  store.clear();
  await saveSession({
    accessToken: TOKEN,
    refreshToken: "r",
    expiresAt: Date.now() + 60_000,
    email: "u@x.dev",
  });
}

test("initial subscription is unknown and never bypasses checkout", async () => {
  assert.equal(state.subscription.status, "unknown");
  // Payment gate contract: only literal "active" counts as subscribed.
  assert.notEqual(state.subscription.status, "active");
});

test("billing refresh failure keeps unknown (no fabricated subscription)", async () => {
  await seedSession();
  state.subscription = { plan: "", status: "unknown", renews: "", daysRemaining: null };
  mockFetch(async () => {
    throw new Error("billing down");
  });
  await billing.refreshStatus();
  assert.equal(state.subscription.status, "unknown");
  assert.notEqual(state.subscription.status, "active");
  assert.equal(state.subscription.daysRemaining, null);
});

test("successful billing refresh replaces state with authoritative data", async () => {
  await seedSession();
  state.subscription = { plan: "", status: "unknown", renews: "", daysRemaining: null };
  const end = Date.now() + 30 * 86400_000;
  mockFetch(async () =>
    new Response(
      JSON.stringify({ plan_id: "pro", status: "active", current_period_end: end }),
      { status: 200 },
    ),
  );
  await billing.refreshStatus();
  assert.equal(state.subscription.status, "active");
  assert.equal(state.subscription.plan, "Pro");
  assert.ok(state.subscription.daysRemaining !== null && state.subscription.daysRemaining > 0);
});

test("successful refresh with no plan reports none (never 'active')", async () => {
  await seedSession();
  state.subscription = { plan: "", status: "unknown", renews: "", daysRemaining: null };
  mockFetch(async () =>
    new Response(JSON.stringify({ plan_id: "free", status: "none", current_period_end: null }), {
      status: 200,
    }),
  );
  await billing.refreshStatus();
  assert.equal(state.subscription.status, "none");
  assert.notEqual(state.subscription.status, "active");
});

test("past_due status maps to expired UI presentation (B-12)", async () => {
  await seedSession();
  state.subscription = { plan: "", status: "unknown", renews: "", daysRemaining: null };
  const end = Date.now() + 10 * 86400_000;
  mockFetch(async () =>
    new Response(
      JSON.stringify({ plan_id: "pro", status: "past_due", current_period_end: end }),
      { status: 200 },
    ),
  );
  await billing.refreshStatus();
  assert.equal(state.subscription.status, "expired");
  assert.notEqual(state.subscription.status, "active");
});

test("canceled status maps to none UI presentation (B-12)", async () => {
  await seedSession();
  state.subscription = { plan: "", status: "unknown", renews: "", daysRemaining: null };
  mockFetch(async () =>
    new Response(
      JSON.stringify({ plan_id: "pro", status: "canceled", current_period_end: null }),
      { status: 200 },
    ),
  );
  await billing.refreshStatus();
  assert.equal(state.subscription.status, "none");
  assert.notEqual(state.subscription.status, "active");
});

test("active status with elapsed periodEnd maps to expired UI presentation (B-12)", async () => {
  await seedSession();
  state.subscription = { plan: "", status: "unknown", renews: "", daysRemaining: null };
  const elapsedEnd = Date.now() - 86400_000; // 1 day ago
  mockFetch(async () =>
    new Response(
      JSON.stringify({ plan_id: "pro", status: "active", current_period_end: elapsedEnd }),
      { status: 200 },
    ),
  );
  await billing.refreshStatus();
  assert.equal(state.subscription.status, "expired");
  assert.notEqual(state.subscription.status, "active");
});
