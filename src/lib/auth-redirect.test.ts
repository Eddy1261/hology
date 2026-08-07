// P5/P2-03: auth deep-link preservation — guard capture + post-auth target.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  postAuthTarget,
  setPendingAuthRoute,
  takePendingAuthRoute,
} from "./auth-redirect.ts";

test("protected deep link + valid restore → original route", () => {
  setPendingAuthRoute("/app/sessions/s-9?tab=detail");
  const target = postAuthTarget(takePendingAuthRoute());
  assert.equal(target, "/app/sessions/s-9?tab=detail");
  assert.equal(takePendingAuthRoute(), null, "pending consumed once");
});

test("protected deep link + failed restore → /login (no target, no redirect loop)", () => {
  setPendingAuthRoute("/app/mcp");
  // restore failed: pending is never consumed; user stays on /login.
  assert.equal(takePendingAuthRoute(), "/app/mcp");
  // A subsequent successful login without a captured route lands on /app.
  assert.equal(postAuthTarget(takePendingAuthRoute()), "/app");
});

test("direct /app (no deep link) + valid restore → /app", () => {
  setPendingAuthRoute(null);
  assert.equal(postAuthTarget(takePendingAuthRoute()), "/app");
});

test("public route + valid restore → /app (nothing captured)", () => {
  setPendingAuthRoute(null);
  assert.equal(postAuthTarget(takePendingAuthRoute()), "/app");
});
