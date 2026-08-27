import { test } from "node:test";
import assert from "node:assert/strict";
import { shouldUseOfflineLayer } from "./offline-routing.ts";

test("R1: gateway online + success → gateway path (never local, Tauri or not)", () => {
  assert.equal(shouldUseOfflineLayer(true, true), false);
  assert.equal(shouldUseOfflineLayer(true, false), false);
});

test("R1: gateway offline + desktop app → local layer", () => {
  assert.equal(shouldUseOfflineLayer(false, true), true);
});

test("R1: gateway offline + plain browser → neither layer (no fake local data)", () => {
  assert.equal(shouldUseOfflineLayer(false, false), false);
});

test("R1: internet-down while gateway healthy stays on the gateway path", () => {
  // state.online reflects the LOOPBACK gateway probe — a healthy local
  // gateway keeps online=true regardless of internet availability.
  assert.equal(shouldUseOfflineLayer(true, true), false);
});
