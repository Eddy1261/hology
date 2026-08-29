<script setup lang="ts">
import { ref, computed } from "vue";
import { state, toast, skills } from "../lib/store";
import { gatewaySkillContent } from "../lib/gateway";
import SearchBar from "../components/ui/SearchBar.vue";
import Icon from "../components/ui/Icon.vue";
import ACButton from "../components/ui/ACButton.vue";
import Toggle from "../components/ui/Toggle.vue";
import Sheet from "../components/ui/Sheet.vue";
import TextField from "../components/ui/TextField.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ConfirmDialog from "../components/ui/ConfirmDialog.vue";
import GatewayUnavailable from "../components/ui/GatewayUnavailable.vue";
import type { Skill } from "../lib/types";

function errText(e: unknown, fallback: string): string {
  if (e instanceof Error) return e.message || fallback;
  if (typeof e === "string") return e.trim() || fallback;
  if (e && typeof e === "object" && "message" in e) {
    const m = (e as { message: unknown }).message;
    if (typeof m === "string" && m.trim()) return m;
  }
  return fallback;
}

const query = ref("");
const selected = ref<Skill | null>(null);
const editing = ref(false);
const draft = ref("");
const creating = ref(false);
const newName = ref("");
const newContent = ref("");
const importedFile = ref("");
const confirmDelete = ref<Skill | null>(null);
const busy = ref(false);
const contentLoadFailed = ref(false);
const fileInput = ref<HTMLInputElement | null>(null);
const createTab = ref<"write" | "preview">("write");

function triggerImport() {
  fileInput.value?.click();
}

async function onImportFile(e: Event) {
  const input = e.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;
  try {
    const content = await file.text();
    const name = file.name.replace(/\.md$/i, "").trim() || "Imported Skill";
    newName.value = name;
    newContent.value = content;
    importedFile.value = file.name;
    creating.value = true;
  } catch (err) {
    toast(errText(err, "Import failed"), "error");
  }
}

const filtered = computed(() =>
  state.skills.filter((s) => s.name.toLowerCase().includes(query.value.toLowerCase())),
);

async function open(s: Skill) {
  selected.value = s;
  editing.value = false;
  contentLoadFailed.value = false;
  try {
    if (s.has_content) {
      const content = await gatewaySkillContent(s.id);
      selected.value = { ...s, content };
      draft.value = content;
    } else {
      draft.value = "";
    }
  } catch (e) {
    contentLoadFailed.value = true;
    draft.value = "";
    toast(errText(e, "Could not load skill content"), "error");
  }
}
async function saveEdit() {
  if (!selected.value || busy.value) return;
  if (contentLoadFailed.value) {
    toast("Cannot save: the existing skill content could not be loaded", "error");
    return;
  }
  busy.value = true;
  try {
    await skills.update(selected.value.id, selected.value.name, draft.value, selected.value.enabled);
    const fresh = state.skills.find((k) => k.name === selected.value?.name);
    if (fresh && selected.value) selected.value.id = fresh.id;
    editing.value = false;
    toast("Skill saved");
  } catch (e) {
    toast(errText(e, "Save failed"), "error");
  } finally {
    busy.value = false;
  }
}
async function toggleEnabled(s: Skill) {
  s.enabled = !s.enabled;
  try {
    await skills.toggle(s.id);
  } catch (e) {
    s.enabled = !s.enabled;
    toast(errText(e, "Toggle failed"), "error");
  }
}
async function remove(s: Skill) {
  try {
    await skills.remove(s.id);
  } catch (e) {
    toast(errText(e, "Delete failed"), "error");
    confirmDelete.value = null;
    return;
  }
  selected.value = null;
  confirmDelete.value = null;
  toast("Skill deleted");
}

function getStandardSkillTemplate(name: string = "Custom Skill") {
  const slug = name.toLowerCase().trim().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "") || "custom-skill";
  return `---
name: ${slug}
description: Reusable domain instructions and workflows for AI agents
tags: [engineering, workflow]
version: 1.0.0
---

# ${name.trim() || "Custom Skill"}

## 1. Domain Guidelines & Invariants
- Detail standard rules, calculation methods, or design criteria.
- State any project-specific constraints or limitations.

## 2. Tool Execution Workflow
- Step 1: Inspect project files or run calculations via connected tools.
- Step 2: Verify compliance with engineering standards.
- Step 3: Record finalized outputs to Project Memory.

## 3. Memory Recording Instructions
- Save design choices with type \`decision\`.
- Save tool outputs and calculations with type \`outcome\`.
- Save technical invariants with type \`constraint\`.
`;
}

function openCreateForm() {
  creating.value = true;
  newName.value = "";
  importedFile.value = "";
  newContent.value = getStandardSkillTemplate("New Skill");
  createTab.value = "write";
}

function resetCreate() {
  creating.value = false;
  newName.value = "";
  newContent.value = "";
  importedFile.value = "";
}

async function create() {
  if (!newName.value.trim() || busy.value) return;
  busy.value = true;
  try {
    const content = newContent.value || getStandardSkillTemplate(newName.value.trim());
    await skills.create(newName.value.trim(), content);
    resetCreate();
    toast("Skill created");
  } catch (e) {
    toast(errText(e, "Create failed"), "error");
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="px-3.5 pt-4 pb-3">
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-[19px] font-bold">Skills</h1>
        <ACButton size="sm" @click="openCreateForm"><Icon name="plus" :size="14" /> New</ACButton>
      </div>
      <SearchBar v-model="query" placeholder="Search skills" />
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto scroll-area px-3.5 pb-4">
      <!-- Inline Create Form -->
      <div v-if="creating" class="rounded-[14px] bg-card border border-border p-4 mb-3">
        <h3 class="text-[14px] font-semibold mb-3">{{ importedFile ? 'Import Skill' : 'New Skill' }}</h3>
        <TextField v-model="newName" label="Skill Name" placeholder="e.g. Structural Review" class="mb-3" />
        <p v-if="importedFile" class="text-[11px] text-muted truncate mb-3" :title="importedFile">
          Imported from {{ importedFile }}
        </p>

        <!-- Tab Buttons: Write / Preview / Import -->
        <div class="flex gap-1 mb-3">
          <button
            @click="createTab = 'write'"
            class="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer"
            :class="createTab === 'write' ? 'bg-primary text-white' : 'text-muted hover:text-fg'"
          >
            <Icon name="edit" :size="13" class="inline mr-1" /> Write
          </button>
          <button
            @click="createTab = 'preview'"
            class="px-3 py-1.5 rounded-lg text-[12px] font-medium transition-colors cursor-pointer"
            :class="createTab === 'preview' ? 'bg-primary text-white' : 'text-muted hover:text-fg'"
          >
            <Icon name="doc" :size="13" class="inline mr-1" /> Preview
          </button>
          <button
            @click="triggerImport"
            class="px-3 py-1.5 rounded-lg text-[12px] font-medium text-muted hover:text-fg transition-colors cursor-pointer"
          >
            <Icon name="upload" :size="13" class="inline mr-1" /> Import .md
          </button>
        </div>

        <!-- Write Tab -->
        <div v-if="createTab === 'write'">
          <textarea
            v-model="newContent"
            rows="12"
            class="w-full rounded-xl bg-panel border border-border focus:border-primary p-3 text-[11.5px] font-mono text-fg outline-none resize-y leading-relaxed scroll-area"
            aria-label="Markdown content"
          />
        </div>

        <!-- Preview Tab -->
        <div v-else-if="createTab === 'preview'">
          <div class="bg-panel border border-border rounded-xl p-3.5 max-h-72 overflow-y-auto">
            <pre v-if="newContent" class="text-[12px] font-mono text-fg whitespace-pre-wrap leading-relaxed">{{ newContent }}</pre>
            <p v-else class="text-[12px] text-muted">Nothing to preview yet.</p>
          </div>
        </div>

        <!-- Actions -->
        <div class="flex gap-2 mt-3">
          <ACButton block variant="ghost" @click="resetCreate">Cancel</ACButton>
          <ACButton block :disabled="!newName.trim() || busy" :loading="busy" @click="create">Create Skill</ACButton>
        </div>
        <input
          ref="fileInput"
          type="file"
          accept=".md,text/markdown"
          class="hidden"
          @change="onImportFile"
        />
      </div>

      <div
        v-if="state.skillsLoading"
        class="flex items-center justify-center gap-2 py-10 text-muted text-[13px]"
        role="status"
        aria-live="polite"
      >
        <Icon name="refresh" :size="16" class="spin" /> Loading skills…
      </div>
      <GatewayUnavailable
        v-else-if="!state.online && !state.skills.length"
        icon="doc"
        @retry="skills.refresh()"
      />
      <div v-else-if="filtered.length" class="flex flex-col gap-2">
        <button
          v-for="s in filtered"
          :key="s.id"
          @click="open(s)"
          class="flex items-center gap-3 rounded-[12px] bg-card border border-border px-3.5 py-3 text-left hover:border-border-strong transition-colors"
        >
          <div class="w-9 h-9 rounded-[9px] bg-primary-dim border border-primary/30 flex items-center justify-center text-primary-hi shrink-0">
            <Icon name="doc" :size="17" />
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <h2 class="text-[13.5px] font-semibold text-fg truncate">{{ s.name }}</h2>
              <span v-if="s.enabled" class="text-[10px] text-ok border border-ok/25 rounded px-1.5 py-0.5">Active</span>
            </div>
            <p class="text-[11.5px] text-muted truncate mt-0.5">{{ s.description || "Reusable skill prompt" }}</p>
          </div>
          <span @click.stop>
            <Toggle :model-value="s.enabled" @update:model-value="toggleEnabled(s)" label="Toggle skill" />
          </span>
        </button>
      </div>
      <EmptyState
        v-else
        icon="doc"
        title="No skills found"
        body="Create your first skill or import a Markdown file to guide your AI."
      >
        <ACButton size="sm" @click="openCreateForm"><Icon name="plus" :size="14" /> New Skill</ACButton>
      </EmptyState>
    </div>

    <!-- View / Edit Modal Sheet -->
    <Sheet :open="!!selected" :title="selected?.name ?? 'Skill'" @close="selected = null">
      <template v-if="selected">
        <div class="flex items-center justify-between mb-4 pb-3 border-b border-border">
          <div class="flex items-center gap-2">
            <span class="text-[11px] font-mono text-muted">Status:</span>
            <span class="text-[11.5px] font-medium" :class="selected.enabled ? 'text-ok' : 'text-faint'">
              {{ selected.enabled ? "● Enabled (Sent to AI)" : "○ Disabled" }}
            </span>
          </div>
          <div class="flex items-center gap-2">
            <button
              v-if="!editing"
              @click="editing = true"
              class="px-2.5 py-1 rounded-lg border border-border text-[11.5px] text-muted hover:text-fg hover:bg-card transition-colors cursor-pointer"
            >
              <Icon name="edit" :size="13" /> Edit
            </button>
            <button
              @click="confirmDelete = selected"
              class="px-2 py-1 rounded-lg text-[11.5px] text-danger hover:bg-danger/10 transition-colors cursor-pointer"
              title="Delete skill"
            >
              <Icon name="trash" :size="13" />
            </button>
          </div>
        </div>

        <div v-if="!editing" class="bg-card border border-border rounded-xl p-3.5 max-h-72 overflow-y-auto">
          <pre class="text-[12px] font-mono text-fg whitespace-pre-wrap leading-relaxed">{{ selected.content }}</pre>
        </div>

        <div v-else class="flex flex-col gap-2">
          <label class="text-[11px] uppercase font-semibold text-faint">Markdown Prompt</label>
          <textarea
            v-model="draft"
            rows="10"
            class="w-full rounded-xl bg-card border border-border focus:border-primary p-3 text-[12px] font-mono text-fg outline-none resize-y"
          />
          <div class="flex justify-end gap-2 mt-2">
            <button
              @click="editing = false"
              class="px-3.5 py-1.5 text-[12px] text-muted hover:text-fg font-medium cursor-pointer"
            >
              Cancel
            </button>
            <button
              @click="saveEdit"
              :disabled="busy"
              class="px-3.5 py-1.5 bg-primary text-primary-fg hover:bg-primary-hover rounded-xl text-[12px] font-medium transition-colors cursor-pointer"
            >
              Save Changes
            </button>
          </div>
        </div>
      </template>
    </Sheet>

    <ConfirmDialog
      :open="!!confirmDelete"
      title="Delete skill?"
      :body="confirmDelete ? `${confirmDelete.name} will be permanently removed. This can't be undone.` : ''"
      confirm-label="Delete"
      danger
      @confirm="confirmDelete && remove(confirmDelete)"
      @cancel="confirmDelete = null"
    />
  </div>
</template>
