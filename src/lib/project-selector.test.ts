// Project selector display logic tests (F1.2). No guessing, backend
// authoritative, name display-only, id the selection key.

import { test } from "node:test";
import { strict as assert } from "node:assert";
import { selectorLabel, selectorState, projectName } from "./project-selector.ts";
import type { ProjectInfo } from "./gateway.ts";

const A: ProjectInfo = { id: "project-a", name: "Project A", created_at: 1, updated_at: 1 };
const B: ProjectInfo = { id: "project-b", name: "Project B", created_at: 2, updated_at: 2 };
const projects = [A, B];

test("empty registry → No projects yet, never a guessed selection", () => {
  assert.deepEqual(selectorState([], "project-a"), { kind: "empty" });
  assert.equal(selectorLabel([], "project-a"), "No projects yet");
});

test("projects exist, backend null → Select a project (no guessing)", () => {
  assert.deepEqual(selectorState(projects, null), { kind: "none" });
  assert.equal(selectorLabel(projects, null), "Select a project");
});

test("active id resolves to project NAME (display), not id", () => {
  assert.deepEqual(selectorState(projects, "project-b"), { kind: "active", name: "Project B" });
  assert.equal(selectorLabel(projects, "project-b"), "Project B");
});

test("stale active id (project gone) → Select a project, no silent switch", () => {
  assert.deepEqual(selectorState(projects, "project-gone"), { kind: "none" });
  assert.equal(selectorLabel(projects, "project-gone"), "Select a project");
});

test("legacy desktop project is a normal selectable project", () => {
  const withDesktop = [...projects, { ...A, id: "desktop", name: "Desktop" }];
  assert.equal(selectorLabel(withDesktop, "desktop"), "Desktop");
  assert.equal(selectorLabel(withDesktop, null), "Select a project"); // never auto-selected
});

test("projectName resolves session project_id to a display name (F2 §10)", () => {
  assert.equal(projectName(projects, "project-a"), "Project A");
  assert.equal(projectName(projects, null), null);
  // stale/unknown id → raw id, never a guessed name
  assert.equal(projectName(projects, "project-gone"), "project-gone");
});
