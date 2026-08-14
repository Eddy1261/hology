// F4: skills client tests — list/actions + project/session independence at the
// client boundary. Skills are global (backend entity scope=None in the desktop
// store); the client must never attach project or provider context.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  gatewaySkills,
  gatewaySkillUpsert,
  gatewaySkillAction,
  type SkillInfo,
} from "./gateway.ts";

const BASE = "http://127.0.0.1:1";

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): void {
  globalThis.fetch = impl as typeof fetch;
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), { status: 200 });
}

function ok204(): Response {
  return new Response(null, { status: 204 });
}

const SKILL: SkillInfo = {
  id: "skill-1",
  name: "Engineering Progress Report",
  content: "# Engineering Progress Report\n\nGenerate a structured progress summary.",
  enabled: true,
  updated: 1000,
};

test("gatewaySkills parses the registry list", async () => {
  let seen = "";
  mockFetch(async (url) => {
    seen = url;
    return okJson([SKILL]);
  });
  const list = await gatewaySkills(BASE);
  assert.equal(seen, `${BASE}/internal/skills`);
  assert.equal(list.length, 1);
  assert.equal(list[0].name, "Engineering Progress Report");
  assert.equal(list[0].enabled, true);
});

test("gatewaySkillAction toggles and deletes with correct method/url", async () => {
  const calls: [string, string][] = [];
  mockFetch(async (url, init) => {
    calls.push([url, init?.method ?? ""]);
    return ok204();
  });
  await gatewaySkillAction("skill-1", "toggle", BASE);
  await gatewaySkillAction("skill-1", "delete", BASE);
  assert.deepEqual(calls, [
    [`${BASE}/internal/skills/skill-1/toggle`, "POST"],
    [`${BASE}/internal/skills/skill-1/delete`, "POST"],
  ]);
});

test("gatewaySkillUpsert POSTs name/content/enabled without project or provider", async () => {
  let body = "";
  mockFetch(async (url, init) => {
    body = init?.body as string;
    return okJson({ id: "skill-2" });
  });
  const r = await gatewaySkillUpsert(
    { name: "Quantity Takeoff", content: "# Quantity Takeoff", enabled: false },
    BASE,
  );
  assert.equal(r.id, "skill-2");
  const parsed = JSON.parse(body);
  assert.equal(parsed.name, "Quantity Takeoff");
  assert.equal(parsed.enabled, false);
  // F4 Rule 1/2: no project_id, no provider, no slash_command invented
  assert.equal("project_id" in parsed, false);
  assert.equal("provider" in parsed, false);
  assert.equal("slash_command" in parsed, false);
});

test("skills are project-independent at the client boundary", async () => {
  // The skills API takes NO project context — the same call serves every
  // project. Assert the URL carries no project parameter.
  let seen = "";
  mockFetch(async (url) => {
    seen = url;
    return okJson([SKILL]);
  });
  await gatewaySkills(BASE);
  assert.ok(!seen.includes("project"), `skills URL must not carry project context: ${seen}`);
});

test("skills are provider-neutral at the client boundary", async () => {
  // No provider header/param on any skill call.
  let seen = "";
  mockFetch(async (url, init) => {
    seen = `${url}|${init?.method ?? ""}`;
    return ok204();
  });
  await gatewaySkillAction("skill-1", "toggle", BASE);
  assert.ok(!seen.toLowerCase().includes("provider"), `no provider context: ${seen}`);
});
