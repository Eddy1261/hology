import { test } from "node:test";
import assert from "node:assert/strict";
import { groupContextByType } from "./context-view.ts";
import type { ContextEntity } from "./gateway.ts";

function ent(type: string, label: string): ContextEntity {
  return { id: label, type, label, summary: "s", scope: null, pinned: false, updated: 1 };
}

test("groups canonical types under their own headings", () => {
  const groups = groupContextByType([
    ent("decision", "d1"),
    ent("constraint", "c1"),
    ent("fact", "f1"),
    ent("note", "n1"),
    ent("outcome", "o1"),
    ent("reference", "r1"),
  ]);
  assert.deepEqual(groups.map((g) => g.group), [
    "decision",
    "constraint",
    "fact",
    "note",
    "outcome",
    "reference",
  ]);
  assert.equal(groups[0].entries[0].label, "d1");
});

test("legacy progress entity does not crash and renders under Other", () => {
  const groups = groupContextByType([ent("progress", "p1"), ent("decision", "d1")]);
  assert.deepEqual(groups.map((g) => g.group), ["decision", "Other"]);
  assert.equal(groups[1].entries[0].label, "p1");
});

test("unknown types never silently discarded", () => {
  const groups = groupContextByType([ent("random_memory", "x1")]);
  assert.deepEqual(groups.map((g) => g.group), ["Other"]);
  assert.equal(groups[0].entries.length, 1);
});

test("empty input → empty groups", () => {
  assert.deepEqual(groupContextByType([]), []);
});

test("group order is deterministic regardless of input order", () => {
  const a = groupContextByType([ent("fact", "f"), ent("decision", "d"), ent("note", "n")]);
  const b = groupContextByType([ent("note", "n"), ent("decision", "d"), ent("fact", "f")]);
  assert.deepEqual(a.map((g) => g.group), b.map((g) => g.group));
});
