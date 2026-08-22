// Activation lease offline-fallback logic (Track B). Pure, no network.

import { test } from "node:test";
import assert from "node:assert/strict";

import { reusableStoredLease, type LeaseRecord } from "./lease.ts";

function rec(partial: Partial<LeaseRecord> & { lease: string }): LeaseRecord {
  return {
    connector_id: "blender-mcp",
    version: "1.0.0",
    exp: 1_800_000_000,
    ...partial,
  };
}

const NOW = 1_799_000_000; // before exp

test("stored lease reusable: same connector+version, unexpired", () => {
  const l = rec({ lease: "signed-blob" });
  assert.equal(reusableStoredLease(l, "blender-mcp", "1.0.0", NOW), "signed-blob");
});

test("missing stored lease → no reuse", () => {
  assert.equal(reusableStoredLease(null, "blender-mcp", "1.0.0", NOW), null);
});

test("expired stored lease → never reusable (no offline extension)", () => {
  const l = rec({ lease: "signed-blob", exp: NOW - 1 });
  assert.equal(reusableStoredLease(l, "blender-mcp", "1.0.0", NOW), null);
});

test("version mismatch → no reuse", () => {
  const l = rec({ lease: "signed-blob" });
  assert.equal(reusableStoredLease(l, "blender-mcp", "2.0.0", NOW), null);
});

test("connector mismatch → no reuse", () => {
  const l = rec({ lease: "signed-blob" });
  assert.equal(reusableStoredLease(l, "arcgis-mcp", "1.0.0", NOW), null);
});

test("lease exp boundary: exp == now is expired", () => {
  const l = rec({ lease: "signed-blob", exp: NOW });
  assert.equal(reusableStoredLease(l, "blender-mcp", "1.0.0", NOW), null);
});
