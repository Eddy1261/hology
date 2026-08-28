// Phase D: pure Context view-model helpers (testable without Tauri/API).
// Groups entities by semantic type; legacy/unknown types (e.g. the retained
// `progress`) render under "Other" — never crashed, never silently dropped.

import type { ContextEntity } from "./gateway.ts";

export const CONTEXT_GROUPS = [
  "decision",
  "constraint",
  "fact",
  "note",
  "outcome",
  "reference",
  "Other",
] as const;

export type ContextGroup = (typeof CONTEXT_GROUPS)[number];

export interface ContextGroupView {
  group: ContextGroup;
  entries: ContextEntity[];
}

/** Deterministic grouping: canonical types keep their heading; anything
 *  else (legacy progress, unknown) → "Other". Order: canonical groups then
 *  Other. */
export function groupContextByType(entities: ContextEntity[]): ContextGroupView[] {
  const buckets = new Map<string, ContextEntity[]>();
  for (const e of entities) {
    const key = (CONTEXT_GROUPS as readonly string[]).includes(e.type) ? e.type : "Other";
    const list = buckets.get(key) ?? [];
    list.push(e);
    buckets.set(key, list);
  }
  const out: ContextGroupView[] = [];
  for (const group of CONTEXT_GROUPS) {
    const entries = buckets.get(group);
    if (entries && entries.length) {
      out.push({ group, entries });
    }
  }
  return out;
}
