// CONN-030 client half: the stale-response guard behind every list refresh.
//
// The bug it exists for: `state.X = await fetch(...)` is last-SETTLING-wins,
// and several producers call each refresh concurrently (startup hydration, the
// 3s recovery loop, a page's focus handler, and the refresh every connector
// action issues). The slowest response won regardless of age.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { createLatestGuard } from "./store/latest.ts";

test("a response that lands after a newer one is dropped", () => {
  const g = createLatestGuard();
  const slow = g.begin(); // request A, issued first
  const fast = g.begin(); // request B, issued second

  assert.equal(fast.isNewest(), true, "B is the newest issued — it applies");
  assert.equal(
    slow.isNewest(),
    false,
    "A settled later but is OLDER than B; applying it would resurrect the pre-B snapshot",
  );
});

test("responses that land in issue order all apply", () => {
  const g = createLatestGuard();
  const a = g.begin();
  assert.equal(a.isNewest(), true);
  const b = g.begin();
  assert.equal(b.isNewest(), true);
  const c = g.begin();
  assert.equal(c.isNewest(), true);
});

test("a single in-flight request always applies", () => {
  const g = createLatestGuard();
  assert.equal(g.begin().isNewest(), true);
});

test("only the last-issued request may clear a shared loading flag", () => {
  const g = createLatestGuard();
  const first = g.begin();
  const second = g.begin();

  assert.equal(
    first.isLast(),
    false,
    "clearing the flag here would stop the spinner while `second` is still running",
  );
  assert.equal(second.isLast(), true);
});

test("isLast is true again once the newer request is the only one issued", () => {
  const g = createLatestGuard();
  const only = g.begin();
  assert.equal(only.isLast(), true);
  g.begin();
  assert.equal(only.isLast(), false, "a newer request was issued after this one");
});

test("applying out of order twice keeps the newest, not the last caller", () => {
  const g = createLatestGuard();
  const a = g.begin();
  const b = g.begin();
  const c = g.begin();

  assert.equal(c.isNewest(), true, "C applies");
  assert.equal(a.isNewest(), false, "A is stale");
  assert.equal(b.isNewest(), false, "B is stale too — C already won");
});
