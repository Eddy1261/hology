<script setup lang="ts">
import { ref, computed, watch } from "vue";
import { useRouter } from "vue-router";
import { state, context, toast } from "../lib/store";
import {
  buildWorkspace,
  connectorStatusLabel,
  projectStale,
  usingCapabilities,
  availableCapabilities,
} from "../lib/workspace.ts";
import { buildCollection } from "../lib/collection.ts";
import ProjectSelector from "../components/ProjectSelector.vue";
import StatusDot from "../components/ui/StatusDot.vue";
import IconTile from "../components/ui/IconTile.vue";
import ACButton from "../components/ui/ACButton.vue";
import Icon from "../components/ui/Icon.vue";
import type { ContextEntity } from "../lib/gateway.ts";

const router = useRouter();

const LS_PROJECT_MD_PREFIX = "aiconnect.project.md.";

// State for Project Context Markdown editor
const isEditingProjectMd = ref(false);
const projectMdContent = ref("");

// State for Tool Context editing
const selectedToolContext = ref<ContextEntity | null>(null);
const isEditingToolContext = ref(false);
const editToolLabel = ref("");
const editToolType = ref("outcome");
const editToolSummary = ref("");

function openToolModal(e: ContextEntity) {
  selectedToolContext.value = e;
  editToolLabel.value = e.label;
  editToolType.value = e.type;
  editToolSummary.value = e.summary;
  isEditingToolContext.value = false;
}

function saveToolContextEdit() {
  if (!selectedToolContext.value) return;
  selectedToolContext.value.label = editToolLabel.value;
  selectedToolContext.value.type = editToolType.value;
  selectedToolContext.value.summary = editToolSummary.value;
  selectedToolContext.value.updated = Date.now();

  // Also update inside state.context if present
  if (state.context) {
    const idx = state.context.findIndex((x) => x.id === selectedToolContext.value?.id);
    if (idx !== -1) {
      state.context[idx] = { ...selectedToolContext.value };
    }
  }
  isEditingToolContext.value = false;
  toast("Tool progress updated");
}

watch(
  () => state.activeProjectId,
  (next, prev) => {
    if (next !== prev) {
      context.clear();
      isEditingProjectMd.value = false;
      if (next) {
        context.load();
        loadLocalProjectMd(next);
      }
    }
  },
  { immediate: true },
);

function loadLocalProjectMd(projectId: string) {
  const rootEntity = state.context?.find(
    (e) => !e.scope && (e.label.toLowerCase() === "project context" || e.type === "note"),
  );
  if (rootEntity?.summary) {
    projectMdContent.value = rootEntity.summary;
  } else {
    projectMdContent.value =
      localStorage.getItem(LS_PROJECT_MD_PREFIX + projectId) ||
      `# Project Guidelines & Architecture\n\n- **Project Goals**:\n- **Key Constraints**:\n- **Technical Invariants**:\n`;
  }
}

watch(
  () => state.context,
  (ctx) => {
    if (state.activeProjectId && ctx) {
      const rootEntity = ctx.find(
        (e) => !e.scope && (e.label.toLowerCase() === "project context" || e.type === "note"),
      );
      if (rootEntity?.summary) {
        projectMdContent.value = rootEntity.summary;
      }
    }
  },
);

function saveProjectMd() {
  if (!state.activeProjectId) return;
  localStorage.setItem(LS_PROJECT_MD_PREFIX + state.activeProjectId, projectMdContent.value);
  isEditingProjectMd.value = false;
  toast("Project Context saved");
}

const ws = computed(() =>
  buildWorkspace({
    projects: state.projects,
    activeProjectId: state.activeProjectId,
    sessions: state.sessions,
    activeSessionId: state.activeSessionId,
    connectors: buildCollection(state.mcpCatalog, state.localConnectors),
    skills: state.skills,
  }),
);

// Intelligent Agent / Provider Detection
const detectedProvider = computed(() => {
  if (ws.value.session.provider) return ws.value.session.provider;
  if (state.sessions.length && state.sessions[0].provider) return state.sessions[0].provider;
  const entityWithProvider = state.context?.find((e) => e.source_provider);
  if (entityWithProvider?.source_provider) return entityWithProvider.source_provider;
  return "Ready for Agent (agy / Claude / Cursor)";
});

const isAgentActive = computed(() => {
  return (
    !!ws.value.session.provider ||
    (state.sessions.length > 0 && !!state.sessions[0].provider) ||
    state.context?.some((e) => !!e.source_provider)
  );
});

// Separate Project Context vs Tools Working Memory / Progress
const toolContextEntries = computed(() => {
  if (!state.context) return [];
  // Tool context is anything scoped to a tool OR created as an agent progress entity (decision, outcome, fact, etc.)
  return state.context.filter(
    (e) => e.scope || (e.label.toLowerCase() !== "project context" && e.type !== "project"),
  );
});

const using = computed(() => usingCapabilities(ws.value.connectors));
const available = computed(() => availableCapabilities(ws.value.connectors));

function serverColor(name: string): string {
  const palette = ["#3b82f6", "#10b981", "#f59e0b", "#8b5cf6", "#ec4899"];
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return palette[h % palette.length];
}

function badgeClass(type: string): string {
  switch (type.toLowerCase()) {
    case "decision":
      return "bg-primary/10 text-primary border-primary/25";
    case "outcome":
      return "bg-ok/10 text-ok border-ok/25";
    case "fact":
      return "bg-warn/10 text-warn border-warn/25";
    case "constraint":
      return "bg-purple-500/10 text-purple-400 border-purple-500/25";
    case "reference":
      return "bg-sky-500/10 text-sky-400 border-sky-500/25";
    default:
      return "bg-card text-muted border-border";
  }
}

function formatDate(ts?: number): string {
  if (!ts) return "recently";
  const diff = Date.now() - ts;
  if (diff < 60_000) return "just now";
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
  return new Date(ts).toLocaleDateString();
}
</script>

<template>
  <div class="max-w-5xl mx-auto p-4 md:p-6 flex flex-col gap-5">
    <div
      v-if="!state.activeProjectId"
      class="flex flex-col items-center justify-center gap-3 py-16 text-center"
    >
      <p class="text-[15px] font-semibold">No project selected</p>
      <p class="text-[12.5px] text-muted">Open Projects and choose one to get started.</p>
      <ACButton size="sm" @click="router.push('/app/projects')">Open Projects</ACButton>
    </div>

    <template v-else>
      <!-- Top Workspace Summary Card -->
      <section aria-label="Workspace summary" class="rounded-[14px] bg-panel border border-border p-4 w-full">
        <div class="flex items-center gap-2 mb-3">
          <button
            type="button"
            class="w-7 h-7 rounded-lg flex items-center justify-center text-faint hover:text-fg hover:bg-card transition-colors shrink-0 cursor-pointer"
            aria-label="Back to projects"
            title="Back to projects"
            @click="router.push('/app/projects')"
          >
            <Icon name="back" :size="16" />
          </button>
          <span class="text-[11px] text-muted font-medium">Projects / Workspace Detail</span>
        </div>

        <div class="flex items-center justify-between gap-3 flex-wrap">
          <div class="min-w-0">
            <p class="text-[10px] uppercase tracking-[0.14em] text-faint font-semibold">Active Project</p>
            <h1 class="text-[18px] font-bold text-fg truncate">
              {{ ws.project.name ?? "No project selected" }}
            </h1>
          </div>
          <ProjectSelector />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <div class="rounded-xl bg-card border border-border p-3 flex flex-col justify-between">
            <p class="text-[10px] uppercase tracking-[0.12em] text-faint font-semibold">Agent / Provider</p>
            <div class="flex items-center gap-1.5 mt-1">
              <span class="w-2 h-2 rounded-full" :class="isAgentActive ? 'bg-ok animate-pulse' : 'bg-muted'" />
              <p class="text-[12.5px] font-medium text-fg truncate">
                {{ detectedProvider }}
              </p>
            </div>
          </div>

          <div class="rounded-xl bg-card border border-border p-3 flex flex-col justify-between">
            <p class="text-[10px] uppercase tracking-[0.12em] text-faint font-semibold">Active Connectors</p>
            <p class="text-[13px] font-semibold text-fg mt-1">
              {{ using.length }} Connected
            </p>
          </div>

          <div class="rounded-xl bg-card border border-border p-3 flex flex-col justify-between">
            <p class="text-[10px] uppercase tracking-[0.12em] text-faint font-semibold">Tools Working Memory</p>
            <p class="text-[13px] font-semibold text-primary mt-1">
              {{ toolContextEntries.length }} Progress Entries
            </p>
          </div>
        </div>

        <p
          v-if="projectStale(state.projects, state.activeProjectId)"
          class="mt-3 text-[12px] text-warn"
          role="status"
        >
          Active project was deleted or removed. Select another project.
        </p>
      </section>

      <!-- Main Two-Column Layout: Project Context (Left) + Tools Working Memory (Right) -->
      <div class="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        <!-- 1. Project Context (Markdown Editable & Viewable) -->
        <section class="lg:col-span-6 rounded-[14px] bg-panel border border-border p-4 flex flex-col gap-3 min-w-0">
          <div class="flex items-center justify-between min-w-0">
            <div class="flex items-center gap-2 min-w-0">
              <div class="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                <Icon name="doc" :size="15" />
              </div>
              <div class="min-w-0">
                <h2 class="text-[13px] font-semibold text-fg tracking-wide truncate">Project Context (Root Note)</h2>
                <p class="text-[11px] text-muted truncate">Durable guidelines & background shared with AI agents</p>
              </div>
            </div>
            <div class="flex items-center gap-1.5 shrink-0">
              <button
                v-if="!isEditingProjectMd"
                @click="isEditingProjectMd = true"
                class="inline-flex items-center gap-1 text-[11px] font-medium text-muted hover:text-fg hover:bg-card px-2.5 py-1 rounded-lg border border-border transition-colors cursor-pointer"
              >
                <Icon name="edit" :size="12" /> Edit Note
              </button>
              <button
                v-else
                @click="saveProjectMd"
                class="inline-flex items-center gap-1 text-[11px] font-medium bg-primary text-primary-fg hover:bg-primary-hover px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
              >
                <Icon name="check" :size="12" /> Save
              </button>
            </div>
          </div>

          <!-- Edit Mode Textarea -->
          <div v-if="isEditingProjectMd" class="flex flex-col gap-2">
            <textarea
              v-model="projectMdContent"
              rows="12"
              class="w-full bg-card border border-primary/50 focus:border-primary rounded-xl p-3 text-[12px] font-mono text-fg leading-relaxed resize-y outline-none"
              placeholder="Enter markdown guidelines, constraints, and architecture notes..."
            />
            <div class="flex justify-end gap-2">
              <button
                @click="isEditingProjectMd = false"
                class="px-3 py-1 text-[11.5px] text-muted hover:text-fg font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                @click="saveProjectMd"
                class="px-3 py-1 bg-primary text-primary-fg rounded-lg text-[11.5px] font-medium cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>

          <!-- View Mode Markdown Box -->
          <div
            v-else
            class="rounded-xl bg-card border border-border/80 p-3.5 min-h-[220px] max-h-[380px] overflow-y-auto"
          >
            <div class="prose prose-invert max-w-none text-[12.5px] text-fg/90 whitespace-pre-wrap leading-relaxed">
              {{ projectMdContent }}
            </div>
          </div>
        </section>

        <!-- 2. Tools Context (Tool Progress, Working Memory & Agent Outputs) -->
        <section class="lg:col-span-6 rounded-[14px] bg-panel border border-border p-4 flex flex-col gap-3 min-w-0">
          <div class="flex items-center justify-between min-w-0">
            <div class="flex items-center gap-2 min-w-0">
              <div class="w-7 h-7 rounded-lg bg-emerald-500/10 text-emerald-400 flex items-center justify-center shrink-0">
                <Icon name="activity" :size="15" />
              </div>
              <div class="min-w-0">
                <h2 class="text-[13px] font-semibold text-fg tracking-wide truncate">Tools Context & Progress</h2>
                <p class="text-[11px] text-muted truncate">Step-by-step progress & outputs recorded by AI tools</p>
              </div>
            </div>
            <span class="text-[11px] font-mono text-muted border border-border px-2 py-0.5 rounded-full shrink-0">
              {{ toolContextEntries.length }} entries
            </span>
          </div>

          <div
            v-if="toolContextEntries.length"
            class="flex flex-col gap-2 max-h-[380px] overflow-y-auto pr-0.5"
          >
            <div
              v-for="e in toolContextEntries"
              :key="e.id"
              @click="openToolModal(e)"
              class="rounded-xl bg-card border border-border hover:border-primary/50 p-3 flex flex-col gap-1.5 transition-all cursor-pointer group"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-1.5 min-w-0">
                  <span
                    class="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium border uppercase tracking-wider shrink-0"
                    :class="badgeClass(e.type)"
                  >
                    {{ e.type }}
                  </span>
                  <span v-if="e.scope" class="text-[11px] font-mono text-primary font-medium truncate">
                    [{{ e.scope }}]
                  </span>
                  <span class="text-[12.5px] font-semibold text-fg truncate group-hover:text-primary transition-colors">
                    {{ e.label }}
                  </span>
                </div>
                <span class="text-[10px] text-faint shrink-0 font-mono">
                  {{ formatDate(e.updated) }}
                </span>
              </div>
              <p class="text-[11.5px] text-muted line-clamp-2 leading-relaxed">
                {{ e.summary }}
              </p>
              <div v-if="e.source_provider" class="flex items-center gap-1 text-[10px] text-faint mt-0.5">
                <Icon name="terminal" :size="10" /> via {{ e.source_provider }}
              </div>
            </div>
          </div>

          <div
            v-else
            class="rounded-xl bg-card border border-border/80 p-8 flex flex-col items-center justify-center text-center gap-2"
          >
            <div class="w-8 h-8 rounded-full bg-card-hover border border-border flex items-center justify-center text-faint">
              <Icon name="cube" :size="16" />
            </div>
            <p class="text-[12.5px] font-medium text-muted">No activity yet</p>
            <p class="text-[11px] text-faint max-w-xs">
              Activity from your AI agent will appear here once it starts working with your software.
            </p>
          </div>
        </section>
      </div>

      <!-- Bottom Row: Connected MCPs & Enabled Skills -->
      <div class="grid grid-cols-1 md:grid-cols-2 gap-5">
        <!-- Active MCP Connectors -->
        <section class="rounded-[14px] bg-panel border border-border p-4 flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <h3 class="text-[13px] font-semibold text-fg">Active Connectors (Using)</h3>
            <span class="text-[11px] text-primary-hi font-medium">{{ using.length }} Ready</span>
          </div>
          <ul class="flex flex-col gap-1.5">
            <li
              v-for="c in using"
              :key="c.local?.id ?? c.catalog?.id"
              class="flex items-center gap-2.5 rounded-xl bg-card border border-border px-3 py-2.5"
            >
              <IconTile
                :glyph="(c.local?.name ?? c.catalog?.name ?? '?')[0]"
                :color="serverColor(c.local?.name ?? c.catalog?.name ?? '?')"
                :size="28"
              />
              <span class="text-[12.5px] font-medium truncate flex-1">{{ c.local?.name ?? c.catalog?.name }}</span>
              <span class="text-[11px] font-medium text-ok shrink-0">{{ connectorStatusLabel(c) }}</span>
            </li>
            <li v-if="!using.length" class="text-[12px] text-muted py-2">
              No connectors connected yet. Go to Dashboard to install and connect them.
            </li>
          </ul>
        </section>

        <!-- Enabled Skills -->
        <section class="rounded-[14px] bg-panel border border-border p-4 flex flex-col gap-3">
          <div class="flex items-center justify-between">
            <h3 class="text-[13px] font-semibold text-fg">Available Skills</h3>
            <span class="text-[11px] text-primary-hi font-medium">{{ ws.skills.length }} Enabled</span>
          </div>
          <ul class="flex flex-col gap-1.5">
            <li
              v-for="s in ws.skills"
              :key="s.id"
              class="flex items-center gap-2.5 rounded-xl bg-card border border-border px-3 py-2.5"
            >
              <StatusDot :status="'connected'" />
              <span class="text-[12.5px] font-medium truncate flex-1">{{ s.name }}</span>
              <span class="text-[10.5px] text-ok font-mono shrink-0">Active Prompt</span>
            </li>
            <li v-if="!ws.skills.length" class="text-[12px] text-muted py-2">
              No skills enabled yet. Go to Skills to create or enable them.
            </li>
          </ul>
        </section>
      </div>

      <!-- Detail / Edit Modal for Tool Context Entry -->
      <div
        v-if="selectedToolContext"
        class="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4"
        @click.self="selectedToolContext = null"
      >
        <div class="w-full max-w-lg rounded-2xl bg-panel border border-border shadow-2xl p-5 flex flex-col gap-4">
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <span
                class="px-2 py-0.5 rounded text-[11px] font-mono font-medium border uppercase tracking-wider"
                :class="badgeClass(isEditingToolContext ? editToolType : selectedToolContext.type)"
              >
                {{ isEditingToolContext ? editToolType : selectedToolContext.type }}
              </span>
              <span v-if="selectedToolContext.scope" class="text-[12px] font-mono text-primary font-semibold">
                [{{ selectedToolContext.scope }}]
              </span>
            </div>
            <button
              @click="selectedToolContext = null"
              class="p-1 rounded-lg text-faint hover:text-fg hover:bg-card cursor-pointer"
            >
              <Icon name="x" :size="16" />
            </button>
          </div>

          <!-- Edit Mode -->
          <div v-if="isEditingToolContext" class="flex flex-col gap-3">
            <div>
              <label class="text-[10px] uppercase font-semibold text-faint tracking-wider">Entry Label</label>
              <input
                v-model="editToolLabel"
                type="text"
                class="w-full mt-1 bg-card border border-border focus:border-primary rounded-xl px-3 py-2 text-[13px] text-fg outline-none"
                placeholder="Entry label..."
              />
            </div>

            <div>
              <label class="text-[10px] uppercase font-semibold text-faint tracking-wider">Classification Type</label>
              <select
                v-model="editToolType"
                class="w-full mt-1 bg-card border border-border focus:border-primary rounded-xl px-3 py-2 text-[12.5px] text-fg outline-none cursor-pointer"
              >
                <option value="outcome">Outcome (Result / Tool output)</option>
                <option value="decision">Decision (Design or technical choice)</option>
                <option value="fact">Fact (Verified calculation or spec)</option>
                <option value="constraint">Constraint (Limit or boundary)</option>
                <option value="note">Note (General working memory)</option>
                <option value="reference">Reference (Pointer to external asset)</option>
              </select>
            </div>

            <div>
              <label class="text-[10px] uppercase font-semibold text-faint tracking-wider">Progress Markdown / Summary</label>
              <textarea
                v-model="editToolSummary"
                rows="6"
                class="w-full mt-1 bg-card border border-border focus:border-primary rounded-xl p-3 text-[12px] font-mono text-fg leading-relaxed resize-y outline-none"
                placeholder="Enter markdown summary or calculation details..."
              />
            </div>

            <div class="flex justify-end gap-2 mt-1">
              <button
                @click="isEditingToolContext = false"
                class="px-3.5 py-1.5 text-[12px] text-muted hover:text-fg font-medium cursor-pointer"
              >
                Cancel
              </button>
              <button
                @click="saveToolContextEdit"
                class="px-3.5 py-1.5 bg-primary text-primary-fg hover:bg-primary-hover rounded-xl text-[12px] font-medium transition-colors cursor-pointer"
              >
                Save Changes
              </button>
            </div>
          </div>

          <!-- View Mode -->
          <template v-else>
            <div>
              <h3 class="text-[16px] font-bold text-fg">{{ selectedToolContext.label }}</h3>
              <p class="text-[11px] text-faint font-mono mt-0.5">
                Updated {{ formatDate(selectedToolContext.updated) }}
                <template v-if="selectedToolContext.source_provider"> · via {{ selectedToolContext.source_provider }}</template>
              </p>
            </div>

            <div class="bg-card border border-border rounded-xl p-3.5 max-h-60 overflow-y-auto">
              <p class="text-[12.5px] text-fg whitespace-pre-wrap leading-relaxed font-sans">
                {{ selectedToolContext.summary }}
              </p>
            </div>

            <div class="flex items-center justify-between pt-1">
              <button
                @click="isEditingToolContext = true"
                class="inline-flex items-center gap-1.5 text-[11.5px] font-medium text-muted hover:text-fg hover:bg-card px-3 py-1.5 rounded-xl border border-border transition-colors cursor-pointer"
              >
                <Icon name="edit" :size="13" /> Edit Entry
              </button>
              <ACButton size="sm" @click="selectedToolContext = null">Close</ACButton>
            </div>
          </template>
        </div>
      </div>
    </template>
  </div>
</template>
