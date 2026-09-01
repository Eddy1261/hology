// FE-8 P0: data-page state classification tests.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { dataState } from "./ui-state.ts";

test("loading wins while a fetch is in flight", () => {
  assert.equal(dataState(true, true, false), "loading");
  assert.equal(dataState(true, false, true), "loading");
});

test("gateway down with no data = unavailable, never empty", () => {
  assert.equal(dataState(false, false, false), "unavailable");
});

test("gateway down but cached data present = ready (keep last known)", () => {
  assert.equal(dataState(false, false, true), "ready");
});

test("online with no data = empty", () => {
  assert.equal(dataState(false, true, false), "empty");
});

test("online with data = ready", () => {
  assert.equal(dataState(false, true, true), "ready");
});
