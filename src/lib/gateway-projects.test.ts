// F1.1 project API client tests — mocked fetch, no live gateway.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  gatewayProjects,
  gatewayActiveProject,
  gatewaySetActiveProject,
  gatewayClearActiveProject,
  gatewayCreateProject,
  gatewayRenameProject,
} from "./gateway.ts";

const BASE = "http://127.0.0.1:1";

function mockFetch(impl: (url: string, init?: RequestInit) => Promise<Response>): void {
  globalThis.fetch = impl as typeof fetch;
}

function okJson(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

function noContent(): Response {
  return new Response(null, { status: 204 });
}

test("gatewayProjects parses registry metadata", async () => {
  let seen = "";
  mockFetch(async (url) => {
    seen = url;
    return okJson([
      { id: "project-a", name: "Project A", created_at: 1, updated_at: 2 },
      { id: "project-b", name: "Project B", created_at: 3, updated_at: 4 },
    ]);
  });
  const list = await gatewayProjects(BASE);
  assert.equal(seen, `${BASE}/internal/projects`);
  assert.equal(list.length, 2);
  assert.equal(list[0].id, "project-a");
  assert.equal(list[0].name, "Project A");
});

test("gatewayActiveProject returns id or null", async () => {
  mockFetch(async () => okJson({ project_id: "project-a" }));
  assert.equal(await gatewayActiveProject(BASE), "project-a");
  mockFetch(async () => okJson({ project_id: null }));
  assert.equal(await gatewayActiveProject(BASE), null);
});

test("gatewaySetActiveProject PUTs correct payload and accepts 204", async () => {
  let method = "";
  let body = "";
  mockFetch(async (url, init) => {
    method = init?.method ?? "";
    body = init?.body as string;
    return noContent();
  });
  await gatewaySetActiveProject("project-a", BASE);
  assert.equal(method, "PUT");
  assert.equal(JSON.parse(body).project_id, "project-a");
});

test("gatewaySetActiveProject rejects unknown project (404 → throws)", async () => {
  mockFetch(async () => new Response("nope", { status: 404 }));
  await assert.rejects(gatewaySetActiveProject("project-x", BASE), /404/);
});

test("gatewayClearActiveProject DELETEs and accepts 204", async () => {
  let method = "";
  mockFetch(async (url, init) => {
    method = init?.method ?? "";
    return noContent();
  });
  await gatewayClearActiveProject(BASE);
  assert.equal(method, "DELETE");
});

test("gatewayClearActiveProject rejects non-204", async () => {
  mockFetch(async () => new Response("err", { status: 500 }));
  await assert.rejects(gatewayClearActiveProject(BASE), /500/);
});

test("gatewayProjects throws on non-OK", async () => {
  mockFetch(async () => new Response("err", { status: 503 }));
  await assert.rejects(gatewayProjects(BASE), /503/);
});

test("gatewayClearActiveProject DELETEs and accepts 204", async () => {
  let method = "";
  mockFetch(async (url, init) => {
    method = init?.method ?? "";
    return noContent();
  });
  await gatewayClearActiveProject(BASE);
  assert.equal(method, "DELETE");
});

test("selection is isolated: activate only ever touches /internal/session/project", async () => {
  const urls: string[] = [];
  mockFetch(async (url, init) => {
    urls.push(url);
    return init?.method === "PUT" ? noContent() : new Response("err", { status: 500 });
  });
  await gatewaySetActiveProject("project-b", BASE);
  assert.deepEqual(urls, [`${BASE}/internal/session/project`]); // no connector/skill calls
});

test("gatewayCreateProject POSTs id + display name, expects 201", async () => {
  let method = "";
  let body = "";
  mockFetch(async (url, init) => {
    method = init?.method ?? "";
    body = init?.body as string;
    return new Response(
      JSON.stringify({ id: "road-design-2026", name: "Road Design 2026", created_at: 1, updated_at: 1 }),
      { status: 201 },
    );
  });
  const p = await gatewayCreateProject("road-design-2026", "Road Design 2026", BASE);
  assert.equal(method, "POST");
  assert.equal(JSON.parse(body).project_id, "road-design-2026");
  assert.equal(JSON.parse(body).display_name, "Road Design 2026");
  assert.equal(p.name, "Road Design 2026");
  // display name optional → omitted field
  mockFetch(async (url, init) => {
    body = init?.body as string;
    return new Response(JSON.stringify({ id: "x", name: "X", created_at: 1, updated_at: 1 }), { status: 201 });
  });
  await gatewayCreateProject("x", undefined, BASE);
  assert.equal("display_name" in JSON.parse(body), false);
});

test("gatewayRenameProject PATCHes display name (id immutable in payload)", async () => {
  let method = "";
  let body = "";
  mockFetch(async (url, init) => {
    method = init?.method ?? "";
    body = init?.body as string;
    return new Response(JSON.stringify({ id: "road-design-2026", name: "Jogja Road Design", created_at: 1, updated_at: 2 }), { status: 200 });
  });
  const p = await gatewayRenameProject("road-design-2026", "Jogja Road Design", BASE);
  assert.equal(method, "PATCH");
  const parsed = JSON.parse(body);
  assert.equal(parsed.display_name, "Jogja Road Design");
  assert.equal("project_id" in parsed, false, "rename must not carry an id");
  assert.equal(p.name, "Jogja Road Design");
});
