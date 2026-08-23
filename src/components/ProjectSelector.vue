<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { state, projects, toast } from "../lib/store";
import { selectorLabel } from "../lib/project-selector.ts";
import Icon from "./ui/Icon.vue";

const open = ref(false);
const highlight = ref(0);
const creating = ref(false);
const createId = ref("");
const createName = ref("");
const renamingId = ref<string | null>(null);
const renameDraft = ref("");

// Presentation-only by design (audit F1.2.1): the STORE/startup lifecycle owns
// projects.refresh() + projects.loadActive() (main.ts + post-login). The
// selector must not trigger duplicate project API requests.

const label = computed(() =>
  selectorLabel(state.projects, state.activeProjectId),
);

function startRename(p: { id: string; name: string }) {
  renamingId.value = p.id;
  renameDraft.value = p.name;
}

async function saveRename() {
  if (!renamingId.value) return;
  const name = renameDraft.value.trim();
  if (!name) return;
  try {
    await projects.rename(renamingId.value, name);
    renamingId.value = null;
  } catch (e) {
    toast(e instanceof Error ? e.message : "Rename failed", "error");
  }
}

async function saveCreate() {
  const id = createId.value.trim();
  if (!id) return;
  try {
    await projects.create(id, createName.value.trim() || undefined);
    creating.value = false;
    createId.value = "";
    createName.value = "";
  } catch (e) {
    toast(e instanceof Error ? e.message : "Create failed", "error");
  }
}

const activeIndex = computed(() =>
  state.projects.findIndex((p) => p.id === state.activeProjectId),
);

function toggle() {
  open.value = !open.value;
  if (open.value) {
    highlight.value = activeIndex.value >= 0 ? activeIndex.value : 0;
  }
}

function close() {
  open.value = false;
}

async function select(id: string) {
  try {
    await projects.activate(id); // backend accepts BEFORE local update
    close(); // close only after success
  } catch (e) {
    toast(e instanceof Error ? e.message : "Failed to switch project", "error");
  }
}

async function clearActive() {
  try {
    await projects.clear();
    close();
  } catch (e) {
    toast(e instanceof Error ? e.message : "Failed to clear project", "error");
  }
}

function onKeydown(e: KeyboardEvent) {
  if (!open.value) return;
  const n = state.projects.length;
  // Guard BEFORE modulo (audit F1.2.2): zero projects → no arrow nav at all,
  // modulo 0 would produce NaN and crash selection.
  if (n === 0) {
    e.preventDefault();
    return;
  }
  switch (e.key) {
    case "ArrowDown":
      e.preventDefault();
      highlight.value = (highlight.value + 1) % n;
      break;
    case "ArrowUp":
      e.preventDefault();
      highlight.value = (highlight.value - 1 + n) % n;
      break;
    case "Enter":
    case " ":
      e.preventDefault();
      void select(state.projects[highlight.value].id);
      break;
    case "Escape":
      close();
      break;
  }
}

// Close on outside click.
function onDocClick(e: MouseEvent) {
  if (open.value && !(e.target as HTMLElement).closest("[data-project-selector]")) {
    close();
  }
}

onMounted(() => document.addEventListener("click", onDocClick));
onUnmounted(() => document.removeEventListener("click", onDocClick));
</script>

<template>
  <div class="relative min-w-0" data-project-selector>
    <button
      class="h-9 max-w-[150px] w-full flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 text-[12px] text-fg hover:border-border-strong transition-colors"
      :aria-haspopup="'listbox'"
      :aria-expanded="open"
      @click.stop="toggle"
      @keydown="onKeydown"
    >
      <span
        class="w-1.5 h-1.5 rounded-full shrink-0"
        :style="{
          background:
            selectorLabel(state.projects, state.activeProjectId) === 'Select a project' ||
            selectorLabel(state.projects, state.activeProjectId) === 'No projects yet'
              ? 'var(--color-faint)'
              : 'var(--color-ok)',
        }"
      />
      <span class="truncate">{{ label }}</span>
      <Icon name="chevron" :size="13" class="text-faint shrink-0 ml-auto" />
    </button>

    <div
      v-if="open"
      role="listbox"
      aria-label="Projects"
      class="absolute right-0 top-10 z-30 w-56 rounded-xl bg-panel border border-border-strong shadow-lg py-1.5"
      @keydown="onKeydown"
    >
      <p class="px-3 py-1.5 text-[10px] font-semibold tracking-[0.12em] text-faint uppercase">
        Projects
      </p>
      <!-- rename row (presentation metadata only — id immutable) -->
      <div
        v-if="renamingId"
        class="px-2 py-1.5"
        @click.stop
        @keydown.stop
      >
        <input
          v-model="renameDraft"
          class="w-full rounded-lg bg-card border border-border px-2 py-1.5 text-[12px] focus:border-primary outline-none"
          :aria-label="'Rename project'"
          @click.stop
          @keydown.enter.stop="saveRename"
          @keydown.esc.stop="renamingId = null"
        />
        <div class="flex gap-1.5 mt-1.5">
          <button class="text-[11px] text-primary-hi hover:underline" @click="saveRename">Save</button>
          <button class="text-[11px] text-muted hover:text-fg" @click="renamingId = null">Cancel</button>
        </div>
      </div>
      <button
        v-for="(p, i) in state.projects"
        :key="p.id"
        role="option"
        :aria-selected="p.id === state.activeProjectId"
        class="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12.5px] transition-colors"
        :class="[
          i === highlight ? 'bg-white/5' : '',
          p.id === state.activeProjectId ? 'text-fg font-medium' : 'text-muted',
        ]"
        @mouseenter="highlight = i"
        @click.stop="select(p.id)"
      >
        <span
          class="w-1.5 h-1.5 rounded-full shrink-0"
          :style="{
            background: p.id === state.activeProjectId ? 'var(--color-primary)' : 'transparent',
          }"
        />
        <span class="truncate flex-1">{{ p.name }}</span>
        <span
          class="p-1 rounded hover:bg-white/10 text-faint hover:text-fg shrink-0"
          role="button"
          tabindex="0"
          :aria-label="`Rename ${p.name}`"
          @click.stop="startRename(p)"
          @keydown.enter.stop="startRename(p)"
        >
          <Icon name="edit" :size="12" />
        </span>
      </button>
      <p v-if="state.projects.length === 0" class="px-3 py-2 text-[12px] text-faint">
        No projects yet
      </p>
      <!-- create project -->
      <div v-if="creating" class="px-2 py-1.5 flex flex-col gap-1.5" @click.stop @keydown.stop>
        <input
          v-model="createId"
          placeholder="project-id (letters, -, _)"
          class="w-full rounded-lg bg-card border border-border px-2 py-1.5 text-[12px] focus:border-primary outline-none"
          aria-label="New project id"
          @click.stop
          @keydown.enter.stop="saveCreate"
        />
        <input
          v-model="createName"
          placeholder="Display name (optional)"
          class="w-full rounded-lg bg-card border border-border px-2 py-1.5 text-[12px] focus:border-primary outline-none"
          aria-label="New project display name"
          @click.stop
          @keydown.enter.stop="saveCreate"
        />
        <div class="flex gap-1.5">
          <button class="text-[11px] text-primary-hi hover:underline" @click="saveCreate">Create</button>
          <button class="text-[11px] text-muted hover:text-fg" @click="creating = false">Cancel</button>
        </div>
      </div>
      <button
        v-else
        class="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-muted hover:text-fg hover:bg-white/5"
        @click.stop="creating = true"
      >
        <Icon name="plus" :size="14" /> New project
      </button>
      <div class="border-t border-border my-1" />
      <button
        class="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12.5px] text-muted hover:text-fg hover:bg-white/5"
        :disabled="!state.activeProjectId"
        @click.stop="clearActive"
      >
        <Icon name="x" :size="14" /> Clear active project
      </button>
    </div>
  </div>
</template>
