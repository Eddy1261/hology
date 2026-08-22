// Project selector display logic (pure, unit-tested without a Vue framework).
// F1.2 rules: never guess a project; backend is authoritative; name is
// display-only, id is the selection key.

import type { ProjectInfo } from "./gateway.ts";

export type SelectorState =
  | { kind: "empty" } // no projects in registry
  | { kind: "none" } // projects exist but nothing selected (or stale active)
  | { kind: "active"; name: string };

export function selectorState(
  projects: ProjectInfo[],
  activeId: string | null,
): SelectorState {
  if (projects.length === 0) return { kind: "empty" };
  if (!activeId) return { kind: "none" };
  const p = projects.find((x) => x.id === activeId);
  if (!p) return { kind: "none" }; // stale active id — never guess a replacement
  return { kind: "active", name: p.name };
}

export function selectorLabel(
  projects: ProjectInfo[],
  activeId: string | null,
): string {
  const s = selectorState(projects, activeId);
  return s.kind === "active"
    ? s.name
    : s.kind === "empty"
      ? "No projects yet"
      : "Select a project";
}

/** Display-only project name for a session row (F2 §10): resolve the session's
 *  project_id against the registry. Unknown/stale id → null (show raw id). */
export function projectName(
  projects: ProjectInfo[],
  projectId: string | null,
): string | null {
  if (!projectId) return null;
  return projects.find((p) => p.id === projectId)?.name ?? projectId;
}
