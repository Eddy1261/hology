// P5R: theme tests — Dark/Light single source, persistence, no connectivity
// coupling. localStorage is stubbed; document body class is observed.

import { test } from "node:test";
import { strict as assert } from "node:assert";

const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
  key: () => null,
  length: 0,
};
let bodyClass = "";
(globalThis as Record<string, unknown>).document = {
  body: {
    classList: {
      toggle: (_c: string, on: boolean) => {
        bodyClass = on ? "light" : "";
      },
    },
  },
  // vue runtime-dom touches document at import time — minimal stub.
  createElement: () => ({ style: {}, dataset: {} }),
};

const mod = await import("./theme.ts");
const { theme, toggleTheme, setTheme } = mod;

test("defaults to dark and applies no light class", () => {
  assert.equal(theme.mode, "dark");
  assert.equal(bodyClass, "");
});

test("toggle flips dark → light and persists", () => {
  toggleTheme();
  assert.equal(theme.mode, "light");
  assert.equal(bodyClass, "light");
  assert.equal(store.get("aiconnect.theme"), "light");
});

test("setTheme is idempotent and persists", () => {
  setTheme("dark");
  assert.equal(theme.mode, "dark");
  assert.equal(store.get("aiconnect.theme"), "dark");
  setTheme("dark");
  assert.equal(store.get("aiconnect.theme"), "dark");
});

test("theme state is independent of connectivity", () => {
  // The theme module must not reference or mutate any online/connectivity
  // state — assert the module surface only exposes theme operations.
  const surface = Object.keys(mod).sort();
  assert.deepEqual(surface, ["applyTheme", "setTheme", "theme", "toggleTheme"]);
});
