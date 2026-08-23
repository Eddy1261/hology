<script setup lang="ts">
// P5R: Project List — the user-facing Projects collection.
// Projects are mirrored from the local gateway registry (authoritative);
// while the gateway is offline the last-known list stays visible with an
// explicit offline banner. Create Project is a local-gateway operation:
// Project ID required, Display Name optional. Selecting a project opens the
// Project Detail (AI Workspace).
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { state, projects, toast } from "../lib/store";
import Icon from "../components/ui/Icon.vue";
import ACButton from "../components/ui/ACButton.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import TextField from "../components/ui/TextField.vue";
import ConfirmDialog from "../components/ui/ConfirmDialog.vue";
import GatewayUnavailable from "../components/ui/GatewayUnavailable.vue";

const router = useRouter();
const deleteTarget = ref<{ id: string; name: string } | null>(null);
const creating = ref(false);
const createId = ref("");
const createName = ref("");
const busy = ref(false);

const offline = computed(() => !state.online);

async function createProject() {
  const id = createId.value.trim();
  if (!id || busy.value) return;
  busy.value = true;
  try {
    // Display name optional — empty name must not prevent creation.
    await projects.create(id, createName.value.trim() || undefined);
    creating.value = false;
    createId.value = "";
    createName.value = "";
    toast(`Project ${id} created`);
  } catch (e) {
    toast(e instanceof Error ? e.message : "Create failed", "error");
  } finally {
    busy.value = false;
  }
}

function cancelCreate() {
  creating.value = false;
  createId.value = "";
  createName.value = "";
}

async function activateProject(id: string) {
  try {
    await projects.activate(id); // backend accepts before local update
    router.push("/app/workspace");
  } catch (e) {
    toast(e instanceof Error ? e.message : "Failed to open project", "error");
  }
}

function openProject(id: string) {
  if (id === state.activeProjectId) {
    router.push("/app/workspace");
  } else {
    activateProject(id);
  }
}

// R3: destructive delete — confirmation first. The gateway has no delete
// API; deletion is the local layer's (offline) operation by design. Online
// the store surfaces that clearly instead of faking a cloud delete.
async function deleteProject(p: { id: string; name: string }) {
  deleteTarget.value = p;
}

async function confirmDelete() {
  const p = deleteTarget.value;
  if (!p) return;
  deleteTarget.value = null;
  try {
    await projects.remove(p.id);
    toast(`Project ${p.name} deleted`);
    if (router.currentRoute.value.path !== "/app/projects") {
      router.push("/app/projects");
    }
  } catch (e) {
    toast(e instanceof Error ? e.message : "Delete failed", "error");
  }
}
</script>

<template>
  <div class="px-3.5 py-4 flex flex-col gap-4">
    <div class="flex items-center justify-between">
      <h1 class="text-[19px] font-bold">Projects</h1>
      <ACButton size="sm" :disabled="creating" @click="creating = true">
        <Icon name="plus" :size="14" /> New Project
      </ACButton>
    </div>

    <!-- Offline: last-known local projects stay visible; gateway ops are
         clearly distinguished (never faked, never hidden). -->
    <div
      v-if="offline"
      class="rounded-[10px] border border-warn/40 bg-warn/5 px-3 py-2 text-[12px] text-warn"
      role="status"
    >
      <span class="font-semibold">Offline — can't reach the app.</span>
      {{ state.projects.length ? "Showing projects saved on your device." : "Connect to the internet to manage your projects." }}
    </div>

    <!-- Create project form -->
    <div
      v-if="creating"
      class="rounded-[14px] bg-card border border-border p-4 flex flex-col gap-3"
      @keydown.esc="cancelCreate"
    >
      <p class="text-[13px] font-semibold">Create Project</p>
      <TextField
        v-model="createId"
        label="Project ID"
        placeholder="project-id (letters, -, _)"
        aria-label="Project ID"
      />
      <TextField
        v-model="createName"
        label="Display Name"
        placeholder="Optional display name"
        aria-label="Display name (optional)"
        @keydown.enter="createProject"
      />
      <p class="text-[11px] text-muted -mt-1">Display name is optional — the project ID is used when empty.</p>
      <div class="flex gap-2">
        <ACButton block size="sm" :disabled="!createId.trim() || busy" @click="createProject">
          {{ busy ? "Creating…" : "Create" }}
        </ACButton>
        <ACButton block size="sm" variant="ghost" @click="cancelCreate">
          Cancel
        </ACButton>
      </div>
    </div>

    <!-- Project list -->
    <div v-if="state.projects.length" class="flex flex-col gap-2">
      <div
        v-for="p in state.projects"
        :key="p.id"
        class="flex items-center gap-3 rounded-[12px] bg-card border border-border px-3.5 py-3 text-left hover:border-border-strong transition-colors cursor-pointer"
        :class="p.id === state.activeProjectId ? 'border-primary/50' : ''"
        :aria-label="`Project ${p.name}`"
        @click="openProject(p.id)"
      >
        <span
          class="w-2 h-2 rounded-full shrink-0"
          :style="{ background: p.id === state.activeProjectId ? 'var(--color-primary)' : 'var(--color-faint)' }"
        />
        <div class="min-w-0 flex-1">
          <h3 class="font-semibold text-[13.5px] truncate">{{ p.name }}</h3>
          <p class="text-[11px] text-faint font-mono">{{ p.id }}</p>
        </div>
        <span class="text-[11px] text-muted shrink-0" v-if="p.id === state.activeProjectId">
          Active
        </span>
        <ACButton v-else size="sm" @click.stop="activateProject(p.id)">
          Activate
        </ACButton>
        <span
          role="button"
          tabindex="0"
          class="text-[11px] text-danger shrink-0 px-1.5 py-0.5 rounded hover:bg-danger/10"
          aria-label="Delete project"
          @click.stop="deleteProject(p)"
          @keydown.enter.stop="deleteProject(p)"
        >
          Delete
        </span>
        <Icon name="chevron" :size="15" class="text-faint shrink-0" />
      </div>
    </div>

    <GatewayUnavailable
      v-else-if="offline"
      icon="grid"
      title="Projects unavailable offline"
      body="Your projects are stored locally. Connect to the internet to load them."
      @retry="projects.refresh()"
    />

    <EmptyState
      v-else
      icon="grid"
      title="No projects yet"
      body="Create your first project to organize your AI workspace."
    >
      <ACButton size="sm" @click="creating = true">Create Project</ACButton>
    </EmptyState>
  </div>

  <ConfirmDialog
    :open="!!deleteTarget"
    title="Delete project?"
    :body="deleteTarget ? `${deleteTarget.name} will be permanently removed. This can't be undone.` : ''"
    confirm-label="Delete"
    danger
    @confirm="deleteTarget && confirmDelete()"
    @cancel="deleteTarget = null"
  />
</template>
