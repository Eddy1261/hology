// First-use tutorial pure logic tests.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import {
  TUTORIAL_SLIDES,
  buttonLabel,
  isLastSlide,
  nextSlide,
  setTutorialPending,
  takeTutorialPending,
} from "./tutorial.ts";

// localStorage polyfill (node has none)
const store = new Map<string, string>();
(globalThis as Record<string, unknown>).localStorage = {
  getItem: (k: string) => store.get(k) ?? null,
  setItem: (k: string, v: string) => void store.set(k, v),
  removeItem: (k: string) => void store.delete(k),
  clear: () => store.clear(),
};

test("exactly five slides", () => {
  assert.equal(TUTORIAL_SLIDES.length, 5);
});

test("slide labels: NEXT, NEXT, NEXT, NEXT, START", () => {
  assert.equal(buttonLabel(0), "NEXT");
  assert.equal(buttonLabel(1), "NEXT");
  assert.equal(buttonLabel(2), "NEXT");
  assert.equal(buttonLabel(3), "NEXT");
  assert.equal(buttonLabel(4), "START");
  assert.equal(isLastSlide(4), true);
  assert.equal(isLastSlide(3), false);
});

test("NEXT advances 0→1→2→3→4 and clamps", () => {
  assert.equal(nextSlide(0), 1);
  assert.equal(nextSlide(1), 2);
  assert.equal(nextSlide(2), 3);
  assert.equal(nextSlide(3), 4);
  assert.equal(nextSlide(4), 4); // START closes, never advances past last
});

test("pending flag is one-shot (auto-open exactly once)", () => {
  store.clear();
  assert.equal(takeTutorialPending(), false, "no pending → no auto-open");
  setTutorialPending();
  assert.equal(takeTutorialPending(), true);
  assert.equal(takeTutorialPending(), false, "second take is empty");
});

test("free and pro: no plan gating in tutorial logic", () => {
  // No plan reference anywhere in the helper — assert the module surface.
  const src = readFileSync(new URL("./tutorial.ts", import.meta.url), "utf8");
  assert.ok(!src.includes("subscription"), "tutorial must not depend on plan state");
});

test("regression: onboarding flag driven by backend is_new_user, single choke point", () => {
  const authStore = readFileSync(new URL("./store/auth.ts", import.meta.url), "utf8");
  const signup = readFileSync(new URL("../pages/Signup.vue", import.meta.url), "utf8");
  const login = readFileSync(new URL("../pages/Login.vue", import.meta.url), "utf8");
  // establishSession is the ONLY place that sets pending, gated on the
  // backend-created flag (covers email + google + any entry page).
  assert.ok(
    /if \(pair\.is_new_user\)[\s\S]*?setTutorialPending\(\)/.test(authStore),
    "establishSession must set pending only when backend says new account",
  );
  // no page-level flag setting anywhere (email or google) — existing accounts
  // via the signup page must NOT trigger the tutorial.
  assert.ok(
    !signup.includes("setTutorialPending"),
    "signup page must not set tutorial pending directly",
  );
  assert.ok(
    !login.includes("setTutorialPending"),
    "login must not set tutorial pending",
  );
});
