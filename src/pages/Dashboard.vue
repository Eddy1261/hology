<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from "vue";
import { useRouter } from "vue-router";
import { state, mcp, catalog } from "../lib/store";
import { buildCollection, type MCPCollectionItem } from "../lib/collection";
import { theme, toggleTheme } from "../lib/theme";
import { notifPref, setNotifPref } from "../lib/notifications";
import { takeTutorialPending } from "../lib/tutorial";
import OnboardingTutorial from "../components/OnboardingTutorial.vue";
import ProjectSelector from "../components/ProjectSelector.vue";
import GatewayEndpointsCard from "../components/GatewayEndpointsCard.vue";
import GatewayUnavailable from "../components/ui/GatewayUnavailable.vue";
import ACButton from "../components/ui/ACButton.vue";
import Icon from "../components/ui/Icon.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import Toggle from "../components/ui/Toggle.vue";

const router = useRouter();
const refreshing = ref(false);
const tutorialOpen = ref(false);
const tutorialBtn = ref<HTMLButtonElement | null>(null);
const notifOpen = ref(false);
const notifPrefOn = ref(notifPref());

// ── Connectivity footer ──────────────────────────────────────────────
const connectivity = computed(() => {
  if (refreshing.value) return { label: "Syncing…", color: "var(--color-primary)" };
  if (state.mcpLoading) return { label: "Connecting…", color: "var(--color-warn)" };
  if (state.online) return { label: "Online", color: "var(--color-ok)" };
  return { label: "Offline — services unreachable", color: "var(--color-danger)" };
});

// ── Collection (merge model) ─────────────────────────────────────────
const collection = computed(() =>
  buildCollection(state.mcpCatalog, state.localConnectors),
);

// ── Installed connectors (for multi-select + merged list) ────────────
const installedConnectors = computed(() =>
  collection.value.filter(
    (it) => it.status !== "available" && it.local !== null,
  ),
);

// ── Connector multi-select ───────────────────────────────────────────
const connectorDropdownOpen = ref(false);
const connectorSearch = ref("");
const selectedIds = ref<string[]>([]);

watch(
  installedConnectors,
  (list) => {
    const installed = list.map((c) => c.local?.id ?? c.catalog?.id ?? "");
    if (selectedIds.value.length === 0) {
      selectedIds.value = installed;
    }
  },
  { immediate: true },
);

const filteredConnectors = computed(() => {
  const q = connectorSearch.value.toLowerCase();
  return installedConnectors.value.filter((it) => {
    const name = (it.local?.name ?? it.catalog?.name ?? "").toLowerCase();
    return !q || name.includes(q);
  });
});

const selectedConnectors = computed(() => {
  const all = buildCollection(state.mcpCatalog, state.localConnectors);
  return all.filter((c) => {
    const id = c.local?.id ?? c.catalog?.id ?? "";
    return selectedIds.value.includes(id);
  });
});

const selectedCount = computed(() => selectedIds.value.length);

const selectedNames = computed(() => {
  if (selectedCount.value === 0) return "None selected";
  if (selectedCount.value <= 2) {
    return selectedConnectors.value
      .map((c) => (c.local?.name ?? c.catalog?.name ?? "").replace(/ MCP$/i, ""))
      .join(", ");
  }
  return `${selectedCount.value} Connectors`;
});

function toggleConnector(id: string) {
  const i = selectedIds.value.indexOf(id);
  if (i >= 0) {
    selectedIds.value.splice(i, 1);
  } else {
    selectedIds.value.push(id);
  }
}

function toggleAllConnectors() {
  if (selectedIds.value.length === installedConnectors.value.length) {
    selectedIds.value = [];
  } else {
    selectedIds.value = installedConnectors.value.map(
      (c) => c.local?.id ?? c.catalog?.id ?? "",
    );
  }
}

// ── Connect power-button (batch orchestrator) ────────────────────────
const connectingBusy = ref(false);

const powerButton = computed(() => {
  const sel = selectedConnectors.value;
  if (sel.length === 0) {
    return {
      icon: "power",
      label: "CONNECT",
      sub: state.activeProjectId ? "Select connectors first" : "Select a project first",
      variant: "primary" as const,
      action: "none" as const,
      pulse: false,
    };
  }

  const statuses = sel.map((c) => c.status);
  const allRunning = statuses.every((s) => s === "connected");
  const anyStarting = statuses.some((s) => s === "connecting");
  const anyCrashed = statuses.some((s) => s === "error");
  const anyRunning = statuses.some((s) => s === "connected");

  if (allRunning) {
    return {
      icon: "check",
      label: "CONNECTED",
      sub: "All systems active",
      variant: "ok" as const,
      action: "none" as const,
      pulse: false,
    };
  }

  if (anyStarting) {
    const done = statuses.filter((s) => s === "connected").length;
    return {
      icon: "refresh",
      label: "CONNECTING",
      sub: `${done}/${sel.length} connected`,
      variant: "warn" as const,
      action: "none" as const,
      pulse: true,
    };
  }

  if (anyCrashed && !anyRunning) {
    return {
      icon: "x",
      label: "ERROR",
      sub: "Failed to connect. Try again.",
      variant: "danger" as const,
      action: "connect" as const,
      pulse: false,
    };
  }

  if (anyCrashed && anyRunning) {
    return {
      icon: "alert",
      label: "PARTIAL",
      sub: "Some connectors need attention",
      variant: "warn" as const,
      action: "connect" as const,
      pulse: false,
    };
  }

  return {
    icon: "power",
    label: "CONNECT",
    sub: "Ready to connect",
    variant: "primary" as const,
    action: "connect" as const,
    pulse: false,
  };
});

async function onPowerClick() {
  if (powerButton.value.action !== "connect" || connectingBusy.value) return;
  connectingBusy.value = true;
  try {
    const toConnect = selectedConnectors.value.filter(
      (c) => c.status === "disconnected" || c.status === "error",
    );
    for (const connector of toConnect) {
      const id = connector.local?.id ?? connector.catalog?.id;
      if (id) await mcp.connect(id);
    }
  } finally {
    connectingBusy.value = false;
  }
}

// ── Per-row actions ──────────────────────────────────────────────────
function rowId(it: MCPCollectionItem): string {
  return it.local?.id ?? it.catalog?.id ?? "";
}

function rowName(it: MCPCollectionItem): string {
  return (it.local?.name ?? it.catalog?.name ?? "Unknown").replace(/ MCP$/i, "");
}

function rowVersion(it: MCPCollectionItem): string {
  return it.local?.version ?? it.catalog?.version ?? "";
}

async function disconnectOne(id: string) {
  await mcp.disconnect(id);
}

// ── Refresh ──────────────────────────────────────────────────────────
function refresh() {
  refreshing.value = true;
  const timeout = new Promise<void>((resolve) => setTimeout(resolve, 4000));
  Promise.race([
    Promise.all([mcp.refresh(), catalog.refresh()]),
    timeout,
  ]).finally(() => {
    refreshing.value = false;
  });
}

// ── Tutorial ─────────────────────────────────────────────────────────
onMounted(() => {
  if (takeTutorialPending()) {
    tutorialOpen.value = true;
  }
});

function openTutorial() {
  tutorialOpen.value = true;
}

function closeTutorial() {
  tutorialOpen.value = false;
  void tutorialBtn.value?.focus();
}

function onNotifPref(v: boolean) {
  notifPrefOn.value = v;
  setNotifPref(v);
}

// Close connector dropdown on outside click
function onDocClick(e: MouseEvent) {
  if (connectorDropdownOpen.value && !(e.target as HTMLElement).closest("[data-connector-dropdown]")) {
    connectorDropdownOpen.value = false;
  }
}

onMounted(() => document.addEventListener("click", onDocClick));
onUnmounted(() => document.removeEventListener("click", onDocClick));
</script>

<template>
  <div class="px-3.5 py-4 flex flex-col gap-5">

    <!-- ─── ACTIVE PROJECT ──────────────────────────────────────── -->
    <section>
      <h2 class="text-[10px] font-semibold tracking-[0.14em] text-faint uppercase mb-1.5">
        Active Project
      </h2>
      <ProjectSelector />
    </section>

    <!-- ─── CONNECTORS (multi-select) ───────────────────────────── -->
    <section>
      <h2 class="text-[10px] font-semibold tracking-[0.14em] text-faint uppercase mb-1.5">
        Connectors
      </h2>
      <div class="relative" data-connector-dropdown>
        <button
          class="h-9 w-full flex items-center gap-2 rounded-lg border border-border bg-card px-2.5 text-[12px] text-fg hover:border-border-strong transition-colors"
          :aria-haspopup="'listbox'"
          :aria-expanded="connectorDropdownOpen"
          @click.stop="connectorDropdownOpen = !connectorDropdownOpen"
        >
          <span
            class="w-1.5 h-1.5 rounded-full shrink-0"
            :style="{
              background: selectedCount > 0 ? 'var(--color-primary)' : 'var(--color-faint)',
            }"
          />
          <span class="truncate flex-1 text-left">
            {{ selectedCount > 0 ? selectedNames : "No connectors" }}
          </span>
          <span v-if="selectedCount > 0 && !connectorDropdownOpen" class="text-faint text-[11px] shrink-0">
            {{ selectedCount }} selected
          </span>
          <Icon name="chevron" :size="13" class="text-faint shrink-0" :class="{ 'rotate-90': connectorDropdownOpen }" />
        </button>

        <div
          v-if="connectorDropdownOpen"
          role="listbox"
          aria-label="Connectors"
          class="absolute left-0 top-10 z-30 w-full rounded-xl bg-panel border border-border-strong shadow-lg py-1.5"
          @click.stop
        >
          <div class="px-2.5 pb-1.5">
            <div class="flex items-center gap-2 rounded-lg bg-card border border-border px-2 py-1.5">
              <Icon name="search" :size="14" class="text-faint shrink-0" />
              <input
                v-model="connectorSearch"
                placeholder="Search connectors…"
                class="bg-transparent text-[12px] text-fg placeholder:text-faint outline-none w-full"
              />
            </div>
          </div>

          <button
            class="w-full flex items-center gap-2.5 px-3 py-2 text-left text-[12px] text-muted hover:text-fg hover:bg-white/5 border-b border-border"
            @click.stop="toggleAllConnectors"
          >
            <span
              class="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0"
              :class="selectedIds.length === installedConnectors.length && installedConnectors.length > 0
                ? 'bg-primary border-primary'
                : 'border-border-strong'"
            >
              <Icon v-if="selectedIds.length === installedConnectors.length && installedConnectors.length > 0" name="check" :size="10" class="text-white" />
            </span>
            {{ selectedIds.length === installedConnectors.length && installedConnectors.length > 0 ? "Deselect all" : "Select all" }}
          </button>

          <div v-if="filteredConnectors.length" class="max-h-[200px] overflow-y-auto">
            <button
              v-for="it in filteredConnectors"
              :key="rowId(it)"
              role="option"
              :aria-selected="selectedIds.includes(rowId(it))"
              class="w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors"
              :class="selectedIds.includes(rowId(it)) ? 'bg-white/5' : ''"
              @click.stop="toggleConnector(rowId(it))"
            >
              <span
                class="w-3.5 h-3.5 rounded border flex items-center justify-center shrink-0"
                :class="selectedIds.includes(rowId(it))
                  ? 'bg-primary border-primary'
                  : 'border-border-strong'"
              >
                <Icon v-if="selectedIds.includes(rowId(it))" name="check" :size="10" class="text-white" />
              </span>
              <div class="min-w-0 flex-1">
                <div class="text-[12.5px] font-medium text-fg truncate">{{ rowName(it) }}</div>
                <div class="text-[11px] text-muted truncate">{{ rowVersion(it) }}</div>
              </div>
              <span class="shrink-0">
                <span
                  class="w-1.5 h-1.5 rounded-full inline-block"
                  :class="{
                    'bg-ok': it.status === 'connected',
                    'bg-warn pulse': it.status === 'connecting',
                    'bg-danger': it.status === 'error',
                    'bg-faint': it.status !== 'connected' && it.status !== 'connecting' && it.status !== 'error',
                  }"
                />
              </span>
            </button>
          </div>
          <p v-else class="px-3 py-3 text-[12px] text-faint">
            No connectors installed.
          </p>
        </div>
      </div>
    </section>

    <!-- ─── CONNECT power-button ────────────────────────────────── -->
    <section class="flex flex-col items-center gap-2 pt-1 pb-2">
      <button
        class="power-btn group relative flex items-center justify-center w-[72px] h-[72px] rounded-full border-2 transition-all duration-200 select-none"
        :class="{
          'heartbeat': powerButton.pulse,
          'border-primary bg-primary/10 text-primary hover:bg-primary/20 hover:shadow-[0_0_24px_-4px_rgba(59,130,246,0.5)]': powerButton.variant === 'primary',
          'border-ok bg-ok/10 text-ok': powerButton.variant === 'ok',
          'border-warn bg-warn/10 text-warn': powerButton.variant === 'warn',
          'border-danger bg-danger/10 text-danger hover:bg-danger/20': powerButton.variant === 'danger',
          'cursor-pointer': powerButton.action === 'connect',
          'cursor-default': powerButton.action !== 'connect',
        }"
        :disabled="powerButton.action !== 'connect' || connectingBusy"
        :aria-label="powerButton.label"
        @click="onPowerClick"
      >
        <Icon :name="powerButton.icon" :size="28" />
      </button>
      <div class="text-center">
        <p
          class="text-[13px] font-bold tracking-wide"
          :class="{
            'text-primary-hi': powerButton.variant === 'primary',
            'text-ok': powerButton.variant === 'ok',
            'text-warn': powerButton.variant === 'warn',
            'text-danger': powerButton.variant === 'danger',
          }"
        >
          {{ powerButton.label }}
        </p>
        <p class="text-[11px] text-muted mt-0.5">{{ powerButton.sub }}</p>
      </div>
    </section>

    <div class="border-t border-border" />

    <!-- ─── CONNECTORS LIST (unified: status + per-row actions) ── -->
    <section>
      <div class="flex items-center justify-between mb-2.5">
        <h2 class="text-[12px] font-semibold tracking-[0.12em] text-muted uppercase flex items-center gap-2">
          Connectors
          <span v-if="installedConnectors.length" class="text-primary-hi normal-case tracking-normal font-medium">
            · {{ installedConnectors.length }}
          </span>
        </h2>
        <button @click="refresh" class="text-faint hover:text-fg p-1" aria-label="Refresh">
          <Icon name="refresh" :size="16" :class="{ spin: refreshing }" />
        </button>
      </div>

      <div
        v-if="state.mcpLoading"
        class="flex items-center justify-center gap-2 py-8 text-muted text-[13px]"
        role="status"
        aria-live="polite"
      >
        <Icon name="refresh" :size="16" class="spin" /> Loading connectors…
      </div>

      <GatewayUnavailable
        v-else-if="!state.online && !state.localConnectors.length && !state.mcpLoading"
        icon="cube"
        @retry="refresh"
      />

      <template v-else>
        <!-- Connected / Connecting rows -->
        <div v-if="installedConnectors.filter(c => c.status === 'connected' || c.status === 'connecting').length" class="flex flex-col gap-2 mb-3">
          <div
            v-for="it in installedConnectors.filter(c => c.status === 'connected' || c.status === 'connecting')"
            :key="rowId(it)"
            class="rounded-[14px] bg-card border border-border p-3"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-9 h-9 rounded-lg flex items-center justify-center text-[14px] font-bold shrink-0"
                :style="{ background: 'var(--color-ok-dim)', color: 'var(--color-ok)' }"
              >
                {{ rowName(it)[0]?.toUpperCase() ?? "?" }}
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="font-semibold text-[13px] truncate">{{ rowName(it) }}</h3>
                <span class="inline-flex items-center gap-1.5 text-[11px] font-medium mt-0.5">
                  <span
                    class="w-1.5 h-1.5 rounded-full"
                    :class="it.status === 'connected' ? 'bg-ok' : 'bg-warn pulse'"
                  />
                  <span :class="it.status === 'connected' ? 'text-ok' : 'text-warn'">
                    {{ it.status === 'connected' ? 'Connected' : 'Connecting…' }}
                  </span>
                </span>
              </div>
              <button
                class="flex items-center gap-1.5 text-[11px] font-medium text-danger/70 hover:text-danger border border-danger/20 hover:border-danger/40 rounded-lg px-2.5 py-1.5 transition-colors shrink-0"
                :aria-label="`Disconnect ${rowName(it)}`"
                @click="disconnectOne(rowId(it))"
              >
                <Icon name="disconnect" :size="13" /> Disconnect
              </button>
            </div>
          </div>
        </div>

        <!-- Offline / Error rows -->
        <div v-if="installedConnectors.filter(c => c.status !== 'connected' && c.status !== 'connecting').length" class="flex flex-col gap-2">
          <div
            v-for="it in installedConnectors.filter(c => c.status !== 'connected' && c.status !== 'connecting')"
            :key="rowId(it)"
            class="rounded-[14px] bg-card border border-border p-3"
          >
            <div class="flex items-center gap-3">
              <div
                class="w-9 h-9 rounded-lg flex items-center justify-center text-[14px] font-bold shrink-0"
                :style="{
                  background: it.status === 'error' ? 'var(--color-danger-dim)' : 'var(--color-card-hover)',
                  color: it.status === 'error' ? 'var(--color-danger)' : 'var(--color-muted)',
                }"
              >
                {{ rowName(it)[0]?.toUpperCase() ?? "?" }}
              </div>
              <div class="min-w-0 flex-1">
                <h3 class="font-semibold text-[13px] truncate">{{ rowName(it) }}</h3>
                <span class="inline-flex items-center gap-1.5 text-[11px] font-medium mt-0.5">
                  <span
                    class="w-1.5 h-1.5 rounded-full"
                    :class="it.status === 'error' ? 'bg-danger' : 'bg-faint'"
                  />
                  <span :class="it.status === 'error' ? 'text-danger' : 'text-faint'">
                    {{ it.status === 'error' ? 'Error' : 'Offline' }}
                  </span>
                </span>
              </div>
              <ACButton
                variant="outline"
                size="sm"
                @click="it.status === 'error' ? mcp.connect(rowId(it)) : mcp.connect(rowId(it))"
              >
                {{ it.status === 'error' ? 'Retry' : 'Connect' }}
              </ACButton>
            </div>
          </div>
        </div>

        <!-- Empty state -->
        <EmptyState
          v-if="!installedConnectors.length && !state.mcpLoading"
          icon="cube"
          title="No connectors installed"
          body="Browse connectors to install your first connector."
        >
          <ACButton size="sm" @click="router.push('/app/mcp')">Browse Connectors</ACButton>
        </EmptyState>
      </template>
    </section>

    <!-- ─── GATEWAY ENDPOINTS ────────────────────────────────────── -->
    <GatewayEndpointsCard />

    <!-- ─── BROWSE MCP COLLECTION ───────────────────────────────── -->
    <button
      class="w-full flex items-center gap-3 rounded-[12px] bg-card border border-border px-3 py-2.5 hover:border-border-strong transition-colors text-left"
      @click="router.push('/app/mcp')"
    >
      <div class="w-[38px] h-[38px] rounded-xl bg-primary-dim flex items-center justify-center shrink-0">
        <Icon name="plus" :size="18" class="text-primary" />
      </div>
      <div class="min-w-0 flex-1">
        <h3 class="font-semibold text-[13.5px] text-fg truncate">Browse Connectors</h3>
        <p class="text-[11.5px] text-muted truncate">Discover and install more connectors</p>
      </div>
      <Icon name="chevron" :size="14" class="text-faint shrink-0" />
    </button>

    <!-- ─── FOOTER ──────────────────────────────────────────────── -->
    <div class="flex items-center justify-between pt-1 pb-2">
      <span
        class="flex items-center gap-2 text-[12px] text-muted"
        role="status"
        aria-live="polite"
      >
        <span class="w-1.5 h-1.5 rounded-full" :style="{ background: connectivity.color }" />
        {{ connectivity.label }}
      </span>
      <div class="flex items-center gap-1 text-faint">
        <button
          class="p-1.5 mt-[4px] hover:text-fg"
          :aria-label="theme.mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
          :title="theme.mode === 'dark' ? 'Switch to light theme' : 'Switch to dark theme'"
          @click="toggleTheme"
        >
          <span class="swap-rotate" :class="{ 'is-dark': theme.mode === 'dark' }">
            <svg class="swap-on h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M5.64,17l-.71.71a1,1,0,0,0,0,1.41,1,1,0,0,0,1.41,0l.71-.71A1,1,0,0,0,5.64,17ZM5,12a1,1,0,0,0-1-1H3a1,1,0,0,0,0,2H4A1,1,0,0,0,5,12Zm7-7a1,1,0,0,0,1-1V3a1,1,0,0,0-2,0V4A1,1,0,0,0,12,5ZM5.64,7.05a1,1,0,0,0,.7.29,1,1,0,0,0,.71-.29,1,1,0,0,0,0-1.41l-.71-.71A1,1,0,0,0,4.93,6.34Zm12,.29a1,1,0,0,0,.7-.29l.71-.71a1,1,0,1,0-1.41-1.41L17,5.64a1,1,0,0,0,0,1.41A1,1,0,0,0,17.66,7.34ZM21,11H20a1,1,0,0,0,0,2h1a1,1,0,0,0,0-2Zm-9,8a1,1,0,0,0-1,1v1a1,1,0,0,0,2,0V20A1,1,0,0,0,12,19ZM18.36,17A1,1,0,0,0,17,18.36l.71.71a1,1,0,0,0,1.41,0,1,1,0,0,0,0-1.41ZM12,6.5A5.5,5.5,0,1,0,17.5,12,5.51,5.51,0,0,0,12,6.5Zm0,9A3.5,3.5,0,1,1,15.5,12,3.5,3.5,0,0,1,12,15.5Z"/>
            </svg>
            <svg class="swap-off h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor">
              <path d="M21.64,13a1,1,0,0,0-1.05-.14,8.05,8.05,0,0,1-3.37.73A8.15,8.15,0,0,1,9.08,5.49a8.59,8.59,0,0,1,.25-2A1,1,0,0,0,8,2.36,10.14,10.14,0,1,0,22,14.05,1,1,0,0,0,21.64,13Zm-9.5,6.69A8.14,8.14,0,0,1,7.08,5.22v.27A10.15,10.15,0,0,0,17.22,15.63a9.79,9.79,0,0,0,2.1-.22A8.11,8.11,0,0,1,12.14,19.73Z"/>
            </svg>
          </span>
        </button>
        <div class="relative">
          <button
            class="p-1.5 hover:text-fg"
            aria-label="Notification settings"
            :aria-expanded="notifOpen"
            @click="notifOpen = !notifOpen"
          >
            <Icon name="bell" :size="16" />
          </button>
          <div
            v-if="notifOpen"
            class="absolute right-0 bottom-9 z-30 w-64 rounded-xl bg-panel border border-border-strong shadow-lg p-3.5"
          >
            <p class="text-[12.5px] font-semibold mb-1.5">Notifications</p>
            <Toggle
              :model-value="notifPrefOn"
              label="Operational notifications"
              @update:model-value="onNotifPref"
            />
            <p class="text-[11px] text-muted mt-2 leading-relaxed">
              ON — operational notifications allowed. OFF — non-critical
              notifications suppressed. Critical auth &amp; security errors
              always show.
            </p>
          </div>
        </div>
        <button class="p-1.5 hover:text-fg" aria-label="Settings" @click="router.push('/app/settings')">
          <Icon name="gear" :size="16" />
        </button>
      </div>
    </div>

    <OnboardingTutorial :open="tutorialOpen" @close="closeTutorial" />
  </div>
</template>

<style scoped>
.power-btn:disabled {
  opacity: 0.6;
}
.power-btn:not(:disabled):hover {
  transform: scale(1.04);
}
.power-btn:not(:disabled):active {
  transform: scale(0.97);
}
.heartbeat {
  animation: heartbeat 1.2s ease-in-out infinite;
}
@keyframes heartbeat {
  0%, 100% { transform: scale(1); }
  14% { transform: scale(1.12); }
  28% { transform: scale(1); }
  42% { transform: scale(1.12); }
  56% { transform: scale(1); }
}
</style>
