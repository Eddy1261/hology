// W1: workspace view model tests — derived state, no fabrication.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import {
  buildWorkspace,
  capabilityBucket,
  connectorStatusLabel,
  projectStale,
  sessionConsistency,
  usingCapabilities,
  availableCapabilities,
  workspaceProject,
  type WorkspaceState,
} from "./workspace.ts";
import type { ProjectInfo, SessionInfo } from "./gateway.ts";
import type { MCPCollectionItem } from "./collection.ts";
import type { Skill } from "./types.ts";

const A: ProjectInfo = { id: "road-design-2026", name: "Road Design 2026", created_at: 1, updated_at: 1 };
const SESS: SessionInfo = { id: "s-1", project_id: "road-design-2026", provider: "deepseek", started_at: 1, last_active_at: 2 };
const SKILL: Skill = { id: "k1", name: "Engineering Progress Report", file: "x.md", updated: "1", enabled: true, description: "d", content: "# x" };
const DISABLED: Skill = { ...SKILL, id: "k2", name: "Drainage QA", enabled: false };
const CONN: MCPCollectionItem = {
  catalog: null,
  local: { id: "revit", name: "Revit", version: "1", status: "running", host_state: null, entitled: true, exposed: false, public_url: null },
  status: "connected",
  entitled: true,
  exposed: false,
  updateAvailable: false,
  hostState: null,
  publicUrl: null,
};
const OFFLINE: MCPCollectionItem = { ...CONN, status: "available", local: { ...CONN.local!, status: "off" } };

test("full workspace: project + session + connector + enabled skill", () => {
  const w: WorkspaceState = buildWorkspace({
    projects: [A], activeProjectId: "road-design-2026",
    sessions: [SESS], activeSessionId: "s-1",
    connectors: [CONN, OFFLINE], skills: [SKILL, DISABLED],
  });
  assert.deepEqual(w.project, { id: "road-design-2026", name: "Road Design 2026" });
  assert.deepEqual(w.session, { id: "s-1", provider: "deepseek", projectId: "road-design-2026" });
  assert.equal(w.connectors.length, 2);
  assert.deepEqual(w.skills.map((s) => s.name), ["Engineering Progress Report"]);
});

test("no active project → project null, never guessed", () => {
  const w = buildWorkspace({ projects: [A], activeProjectId: null, sessions: [], activeSessionId: null, connectors: [], skills: [] });
  assert.deepEqual(w.project, { id: null, name: null });
});

test("no session → session null, provider null", () => {
  const w = buildWorkspace({ projects: [A], activeProjectId: "road-design-2026", sessions: [SESS], activeSessionId: null, connectors: [], skills: [] });
  assert.deepEqual(w.session, { id: null, provider: null, projectId: null });
  assert.equal(sessionConsistency(w.session, "road-design-2026"), "none");
});

test("connector disconnected / error status mapping (runtime truth)", () => {
  assert.equal(connectorStatusLabel({ ...CONN, status: "connected" }), "Connected");
  assert.equal(connectorStatusLabel({ ...CONN, status: "connecting" }), "Connecting");
  assert.equal(connectorStatusLabel({ ...CONN, status: "error" }), "Error");
  assert.equal(connectorStatusLabel({ ...CONN, status: "disconnected" }), "Disconnected");
  assert.equal(connectorStatusLabel(OFFLINE), "Available");
  assert.equal(connectorStatusLabel({ ...CONN, status: "unlisted" }), "Installed");
});

test("skill disabled → excluded from workspace", () => {
  const w = buildWorkspace({ projects: [], activeProjectId: null, sessions: [], activeSessionId: null, connectors: [], skills: [DISABLED] });
  assert.deepEqual(w.skills, []);
});

test("context telemetry unavailable — never fabricated", () => {
  const w = buildWorkspace({ projects: [A], activeProjectId: "road-design-2026", sessions: [], activeSessionId: null, connectors: [], skills: [] });
  assert.deepEqual(w.context, { activeScopes: [], retrievedCount: null, lastRetrievedAt: null });
});

test("session consistency: same project consistent, other project flagged, never rewritten", () => {
  const same = { id: "s-1", provider: "x", projectId: "road-design-2026" };
  const other = { id: "s-2", provider: "x", projectId: "campus-gis" };
  assert.equal(sessionConsistency(same, "road-design-2026"), "consistent");
  assert.equal(sessionConsistency(other, "road-design-2026"), "other-project");
});

test("workspaceProject: stale active id → name null (no guess)", () => {
  assert.deepEqual(workspaceProject([A], "project-gone"), { id: "project-gone", name: null });
});

test("projectStale flags a deleted/removed active project, never auto-switches", () => {
  assert.equal(projectStale([A], "project-gone"), true);
  assert.equal(projectStale([A], "road-design-2026"), false);
  assert.equal(projectStale([], null), false, "no active → not stale");
  assert.equal(projectStale([A], null), false);
});

test("capability bucketing: Using = runtime only, Available = catalog/install state", () => {
  // connected/connecting/error → Using
  assert.equal(capabilityBucket({ ...CONN, status: "connected" }), "using");
  assert.equal(capabilityBucket({ ...CONN, status: "connecting" }), "using");
  assert.equal(capabilityBucket({ ...CONN, status: "error" }), "using");
  // available/disconnected/unlisted → Available (never "Using")
  assert.equal(capabilityBucket({ ...CONN, status: "available" }), "available");
  assert.equal(capabilityBucket({ ...CONN, status: "disconnected" }), "available");
  assert.equal(capabilityBucket({ ...CONN, status: "unlisted" }), "available");

  const items = [
    { ...CONN, status: "connected" as const },
    { ...CONN, status: "available" as const },
    { ...CONN, status: "unlisted" as const },
  ];
  assert.equal(usingCapabilities(items).length, 1);
  assert.equal(availableCapabilities(items).length, 2);
});

test("P4-07: buildWorkspace preserves real session timestamps (no zeroing)", () => {
  const ws = buildWorkspace({
    projects: [A],
    activeProjectId: "road-design-2026",
    sessions: [SESS],
    activeSessionId: "s-1",
    connectors: [CONN],
    skills: [SKILL],
  });
  assert.equal(ws.session.id, "s-1");
  assert.equal(ws.sessions[0].started_at, 1);
  assert.equal(ws.sessions[0].last_active_at, 2);
});
