// P5R: MCP sync feedback tests.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { syncFeedback } from "./mcp-sync.ts";

const BASE = { online: true, catalogConfigured: true, catalogFailed: false, installed: 0 };

test("online + catalog ok → up to date (honest, no fabrication)", () => {
  assert.equal(syncFeedback({ ...BASE, installed: 2 }).kind, "ok");
  assert.match(syncFeedback({ ...BASE, installed: 2 }).text, /2 installed/);
  assert.match(syncFeedback(BASE).text, /nothing installed/);
});

test("offline → offline feedback, never 'up to date'", () => {
  const f = syncFeedback({ ...BASE, online: false, installed: 5 });
  assert.equal(f.kind, "offline");
  assert.match(f.text, /offline/i);
});

test("catalog missing/failed → catalog feedback with local state, no fake success", () => {
  const f = syncFeedback({ ...BASE, catalogConfigured: false });
  assert.equal(f.kind, "catalog");
  assert.match(f.text, /catalog unavailable/i);
  const g = syncFeedback({ ...BASE, catalogFailed: true });
  assert.equal(g.kind, "catalog");
});
