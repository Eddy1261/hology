import { test } from "node:test";
import { strict as assert } from "node:assert";
import { paymentReturnPath } from "./payment-return.ts";

test("settings payment returns to settings", () => {
  assert.equal(paymentReturnPath("/app/settings"), "/app/settings");
});

test("signup payment returns to signup", () => {
  assert.equal(paymentReturnPath("/signup"), "/signup");
});

test("missing or unsafe return path falls back to app", () => {
  assert.equal(paymentReturnPath(undefined), "/app");
  assert.equal(paymentReturnPath("https://evil.example"), "/app");
  assert.equal(paymentReturnPath("/login"), "/app");
});
