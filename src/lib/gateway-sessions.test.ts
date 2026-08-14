// F2: session API client tests — SessionInfo must carry project_id from the
// backend session JSON (backend already serializes the full Session object).

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { gatewaySessions, type SessionInfo } from "./gateway.ts";

const BASE = "http://127.0.0.1:1";

function mockFetch(impl: (url: string) => Promise<Response>): void {
  globalThis.fetch = impl as typeof fetch;
}

test("gatewaySessions parses project_id from backend session JSON", async () => {
  let seen = "";
  mockFetch(async (url) => {
    seen = url;
    return new Response(
      JSON.stringify([
        {
          id: "claude-sess",
          project_id: "project-a",
          provider: "claude",
          started_at: 1000,
          last_active_at: 2000,
        },
      ]),
      { status: 200, headers: { "Content-Type": "application/json" } },
    );
  });
  const list: SessionInfo[] = await gatewaySessions(BASE);
  assert.equal(seen, `${BASE}/internal/sessions`);
  assert.equal(list.length, 1);
  assert.equal(list[0].project_id, "project-a");
  assert.equal(list[0].provider, "claude");
});

test("gatewaySessions tolerates null project_id", async () => {
  mockFetch(async () =>
    new Response(
      JSON.stringify([
        { id: "x", project_id: null, provider: "gpt", started_at: 1, last_active_at: 2 },
      ]),
      { status: 200 },
    ),
  );
  const list = await gatewaySessions(BASE);
  assert.equal(list[0].project_id, null);
});
