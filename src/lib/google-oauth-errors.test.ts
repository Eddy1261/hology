// B4: Google OAuth error classifier tests.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { classifyGoogleError } from "./google-oauth-errors.ts";

test("OAuth-local failures pass through with a readable message", () => {
  assert.equal(
    classifyGoogleError(new Error("loopback listener 48721: address in use")),
    "loopback listener 48721: address in use",
  );
  assert.equal(
    classifyGoogleError(new Error("oauth state mismatch (possible CSRF)")),
    "oauth state mismatch (possible CSRF)",
  );
  assert.equal(
    classifyGoogleError(new Error("token exchange failed: 400 Bad Request")),
    "token exchange failed: 400 Bad Request",
  );
});

test("backend rejections map to a stable label", () => {
  assert.equal(classifyGoogleError(new Error("invalid id_token")), "Google login failed.");
  assert.equal(classifyGoogleError(new Error("missing id_token")), "Google login failed.");
  assert.equal(
    classifyGoogleError(new Error("auth /auth/google/callback 401")),
    "Google login failed.",
  );
});

test("network failures map to a stable label", () => {
  assert.equal(
    classifyGoogleError(new TypeError("fetch failed")),
    "Network error — check your connection and try again.",
  );
});

test("unknown/empty errors never fabricate details", () => {
  assert.equal(classifyGoogleError(new Error("")), "Google sign-in failed.");
  assert.equal(classifyGoogleError(null), "Google sign-in failed.");
  assert.equal(classifyGoogleError(new Error("something odd")), "something odd");
});
