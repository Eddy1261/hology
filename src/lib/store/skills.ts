// Skills (Checkpoint E / F4) — global registry via the gateway when online.
// Phase 5R / R1: STRICT ownership routing (same as projects.ts): online →
// gateway ONLY, errors surface; offline → Tauri local layer ONLY. No silent
// fallback. Local Skill presence NEVER grants MCP authorization (G-4 gate is
// a separate server-side check).

import { state } from "./state.ts";
import {
  gatewaySkillAction,
  gatewaySkills,
  gatewaySkillUpsert,
  type SkillInfo,
} from "../gateway.ts";
import { offline } from "../offline.ts";
import { shouldUseOfflineLayer } from "../offline-routing.ts";
import type { Skill } from "../types.ts";
import { createLatestGuard } from "./latest.ts";

const inTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

const useLocal = () => shouldUseOfflineLayer(state.online, inTauri);

function fmtUpdated(ms: number): string {
  const diff = Date.now() - ms;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ms).toLocaleDateString("en-US", { month: "short", day: "numeric" });
}

function toSkill(s: SkillInfo): Skill {
  const slug = s.name.toLowerCase().replace(/\s+/g, "-");
  return {
    id: s.id,
    name: s.name,
    file: `${slug}.md`,
    updated: fmtUpdated(s.updated),
    enabled: s.enabled,
    included: s.included,
    has_content: s.has_content,
    description: "Markdown skill.",
    content: "",
  };
}

const refreshGuard = createLatestGuard();

export const skills = {
  async refresh(): Promise<void> {
    const slot = refreshGuard.begin();
    state.skillsLoading = true;
    try {
      // Fetch first, then decide whether to apply — see latest.ts.
      let next: Skill[] | null = null;
      if (useLocal()) {
        next = (await offline.listSkills()).map(toSkill);
      } else if (state.online) {
        next = (await gatewaySkills()).map(toSkill);
      }
      /* gateway booting — keep last known */
      if (next && slot.isNewest()) state.skills = next;
    } finally {
      if (slot.isLast()) state.skillsLoading = false;
    }
  },
  async create(name: string, content: string): Promise<void> {
    if (useLocal()) {
      await offline.upsertSkill(undefined, name, content, true);
      await skills.refresh();
      return;
    }
    await gatewaySkillUpsert({ name, content, enabled: true });
    await skills.refresh();
  },
  async update(id: string, name: string, content: string, enabled: boolean): Promise<void> {
    if (useLocal()) {
      await offline.upsertSkill(id, name, content, enabled);
      await skills.refresh();
      return;
    }
    await gatewaySkillUpsert({ id, name, content, enabled });
    await skills.refresh();
  },
  async toggle(id: string): Promise<void> {
    if (useLocal()) {
      // No offline toggle command — supersede with the flipped flag
      // (same entity semantics as the gateway's toggle).
      const cur = state.skills.find((s) => s.id === id);
      if (!cur) throw new Error("This skill wasn't found.");
      await offline.upsertSkill(id, cur.name, cur.content, !cur.enabled);
      await skills.refresh();
      return;
    }
    await gatewaySkillAction(id, "toggle");
    await skills.refresh();
  },
  async remove(id: string): Promise<void> {
    if (useLocal()) {
      await offline.deleteSkill(id);
      await skills.refresh();
      return;
    }
    await gatewaySkillAction(id, "delete");
    await skills.refresh();
  },
};
