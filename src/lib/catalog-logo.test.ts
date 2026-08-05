// Logo fallback logic (audit fix): broken logo_url must fall back to the
// IconTile reactively. Pure decision extracted from CatalogLogo.vue — tested
// without a Vue component framework (spec §8: no large test framework).

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { logoVisible } from "./catalog-logo.ts";

test("no logo_url → IconTile (image not visible)", () => {
  assert.equal(logoVisible(undefined, false), false);
});

test("logo_url present + no error → image visible", () => {
  assert.equal(logoVisible("https://bucket/logo.png", false), true);
});

test("logo_url present + load error → fallback (image not visible)", () => {
  assert.equal(logoVisible("https://bucket/logo.png", true), false);
});

test("error state resets when the url changes (corrected logo retries)", () => {
  // the reset itself is the watch() in the component; the pure contract is
  // that a fresh src + fresh failed=false shows the image
  assert.equal(logoVisible("https://bucket/new.png", false), true);
});
