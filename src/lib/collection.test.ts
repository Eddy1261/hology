// Merge view-model tests (spec §11/§12/§23) — pure logic, no browser.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { buildCollection, compareSemver } from "./collection.ts";
import type { ConnectorInfo } from "./gateway.ts";
import type { MCPCatalogItem } from "./catalog.ts";

function cat(id: string, version = "1.0.0"): MCPCatalogItem {
  return {
    id,
    name: id,
    version,
    description: `${id} connector`,
    package_url: `https://bucket/${id}.zip`,
  };
}

function local(id: string, status: ConnectorInfo["status"], entitled = true): ConnectorInfo {
  return {
    id,
    name: id,
    version: "1.0.0",
    status,
    host_state: null,
    entitled,
    exposed: false,
    public_url: null,
  };
}

test("catalog item not installed → available, no local", () => {
  const items = buildCollection([cat("qgis")], []);
  assert.equal(items.length, 1);
  assert.equal(items[0].status, "available");
  assert.equal(items[0].local, null);
  assert.equal(items[0].entitled, false);
  assert.equal(items[0].updateAvailable, false);
});

test("installed + off → disconnected", () => {
  const items = buildCollection([cat("qgis")], [local("qgis", "off")]);
  assert.equal(items[0].status, "disconnected");
});

test("installed + running → connected, entitled passthrough", () => {
  const items = buildCollection([cat("qgis")], [local("qgis", "running")]);
  assert.equal(items[0].status, "connected");
  assert.equal(items[0].entitled, true);
});

test("starting → connecting; crashed → error", () => {
  const starting = buildCollection([cat("qgis")], [local("qgis", "starting")]);
  assert.equal(starting[0].status, "connecting");
  const crashed = buildCollection([cat("qgis")], [local("qgis", "crashed")]);
  assert.equal(crashed[0].status, "error");
});

test("entitlement false is surfaced but stays gateway-derived", () => {
  const items = buildCollection([cat("qgis")], [local("qgis", "off", false)]);
  assert.equal(items[0].entitled, false);
});

test("installed connector missing from catalog → unlisted, still visible", () => {
  const items = buildCollection([cat("qgis")], [local("revit", "running")]);
  assert.equal(items.length, 2);
  const unlisted = items.find((i) => i.local?.id === "revit");
  assert.ok(unlisted);
  assert.equal(unlisted.status, "unlisted");
  assert.equal(unlisted.catalog, null);
});

test("catalog version newer than installed → updateAvailable", () => {
  const items = buildCollection([cat("qgis", "1.2.0")], [local("qgis", "running", true)]);
  assert.equal(items[0].updateAvailable, true);
});

test("installed version newer than catalog → NO update flag, no error", () => {
  // catalog 1.2.0 vs installed 1.3.0
  const newer = buildCollection([cat("qgis", "1.2.0")], [
    { ...local("qgis", "running"), version: "1.3.0" },
  ]);
  assert.equal(newer[0].updateAvailable, false);
  assert.equal(newer[0].status, "connected");
});

test("equal versions → no update flag", () => {
  const items = buildCollection([cat("qgis", "1.0.0")], [local("qgis", "running")]);
  assert.equal(items[0].updateAvailable, false);
});

test("compareSemver basics", () => {
  assert.equal(compareSemver("1.0.0", "1.0.0"), 0);
  assert.equal(compareSemver("1.2.0", "1.10.0"), -1);
  assert.equal(compareSemver("2.0.0", "1.9.9"), 1);
  assert.equal(compareSemver("1.0", "1.0.0"), 0);
  assert.equal(compareSemver("garbage", "1.0.0"), -1); // non-numeric → 0 vs 1.0.0
});

test("merge keeps catalog ordering then appends unlisted", () => {
  const items = buildCollection([cat("a"), cat("b")], [local("b", "running"), local("z", "off")]);
  assert.deepEqual(
    items.map((i) => i.catalog?.id ?? i.local?.id),
    ["a", "b", "z"],
  );
  assert.equal(items[1].status, "connected");
  assert.equal(items[2].status, "unlisted");
});
