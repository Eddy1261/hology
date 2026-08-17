<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { state, mcp, catalog, toast } from "../lib/store";
import { buildCollection, type MCPCollectionItem } from "../lib/collection";
import { syncFeedback, type SyncFeedback } from "../lib/mcp-sync";
import { downloadConnector, downloads } from "../lib/store/downloads";
import SearchBar from "../components/ui/SearchBar.vue";
import CatalogLogo from "../components/CatalogLogo.vue";
import Icon from "../components/ui/Icon.vue";
import EmptyState from "../components/ui/EmptyState.vue";

const router = useRouter();
const query = ref("");
const category = ref("All");
const syncing = ref(false);
const syncMsg = ref<SyncFeedback | null>(null);

// Manual or automatic sync with remote catalog and gateway
async function doSync(quiet = false) {
  if (syncing.value) return;
  syncing.value = true;
  try {
    await Promise.all([mcp.refresh(), catalog.refresh()]);
    if (!quiet) {
      toast(`Catalog synced (${state.mcpCatalog.length} connectors available)`, "ok");
    }
  } catch (e) {
    if (!quiet) {
      toast("Failed to sync catalog", "error");
    }
  } finally {
    syncing.value = false;
    syncMsg.value = syncFeedback({
      online: state.online,
      catalogConfigured: state.catalogState !== "not-configured",
      catalogFailed: state.catalogState === "unavailable",
      installed: state.localConnectors.length,
    });
  }
}

function handleWindowFocus() {
  void doSync(true);
}

onMounted(() => {
  // Auto-sync on page navigation / mount (non-blocking)
  void doSync(true);
  window.addEventListener("focus", handleWindowFocus);
});

onUnmounted(() => {
  window.removeEventListener("focus", handleWindowFocus);
});

// P4-08: single hydration owner — startup (main.ts) refreshes shared state;
// this page consumes it. Manual refresh button below still revalidates.

const collection = computed(() =>
  buildCollection(state.mcpCatalog, state.localConnectors),
);

const categories = computed(() => {
  const set = new Set<string>();
  for (const c of state.mcpCatalog) {
    if (c.category) set.add(c.category);
  }
  return ["All", ...Array.from(set).sort()];
});

const filtered = computed(() => {
  const q = query.value.trim().toLowerCase();
  return collection.value.filter((it) => {
    const cat = it.catalog?.category ?? "";
    if (category.value !== "All" && cat !== category.value) return false;
    if (!q) return true;
    const hay = [
      it.catalog?.name ?? it.local?.name ?? "",
      it.catalog?.description ?? "",
      it.catalog?.category ?? "",
      ...(it.catalog?.tags ?? []),
    ]
      .join(" ")
      .toLowerCase();
    return hay.includes(q);
  });
});

const catalogBanner = computed(() => {
  switch (state.catalogState) {
    case "unavailable":
    case "not-configured":
      return { kind: "warn", text: "Catalog unavailable. Showing only installed connectors." } as const;
    case "stale":
      return { kind: "warn", text: "You're offline. Showing cached connector list." } as const;
    case "empty":
      return { kind: "info", text: "The catalog is empty. No connectors available right now." } as const;
    default:
      return null;
  }
});

const statusLabel: Record<string, string> = {
  available: "Available",
  installing: "Installing…",
  disconnected: "Installed",
  connecting: "Connecting…",
  connected: "Connected",
  error: "Error",
  unlisted: "Installed (not in catalog)",
};

function statusColor(status: string): string {
  switch (status) {
    case "connected":
      return "var(--color-ok)";
    case "connecting":
    case "installing":
      return "var(--color-primary)";
    case "error":
      return "var(--color-danger)";
    case "unlisted":
      return "var(--color-warn)";
    default:
      return "var(--color-faint)";
  }
}

async function act(it: MCPCollectionItem) {
  if (it.updateAvailable && it.catalog) {
    const st = downloads[`connector:${it.catalog.id}`];
    if (st?.status === "downloading" || st?.status === "installing") return;
    await downloadConnector(it.catalog.id, it.catalog.version, {
      sha256: it.catalog.sha256,
      size_bytes: it.catalog.package_size_bytes,
    });
    const endState = downloads[`connector:${it.catalog.id}`];
    if (endState?.status === "error") {
      toast(endState.message ?? `Failed to update ${it.catalog.name}`, "error");
      return;
    }
    await Promise.all([mcp.refresh(), catalog.refresh()]);
    toast(`${it.catalog.name} updated to v${it.catalog.version}`, "ok");
    return;
  }
  if (!it.local) {
    // Not installed: download through the C-8 marketplace client. The server
    // authorizes + verifies; the UI only initiates and reflects state.
    if (it.catalog) {
      const st = downloads[`connector:${it.catalog.id}`];
      if (st?.status === "downloading" || st?.status === "installing") return; // duplicate-click guard
      await downloadConnector(it.catalog.id, it.catalog.version, {
        sha256: it.catalog.sha256,
        size_bytes: it.catalog.package_size_bytes,
      });
      const endState = downloads[`connector:${it.catalog.id}`];
      if (endState?.status === "error") {
        toast(endState.message ?? `Failed to install ${it.catalog.name}`, "error");
        return;
      }
      // P5R: after a SUCCESSFUL install, refresh the local MCP state so the
      // newly installed connector appears immediately (no manual Sync).
      await Promise.all([mcp.refresh(), catalog.refresh()]);
      toast(`${it.catalog.name} installed successfully`, "ok");
      return;
    }
    toast("Artifact unavailable", "error");
    return;
  }
  switch (it.status) {
    case "disconnected":
    case "error":
      await mcp.connect(it.local.id);
      break;
    case "connected":
      await mcp.disconnect(it.local.id);
      break;
    default:
      break;
  }
}

/** Per-item download state for the button label (idle/downloading/success/error). */
function dl(it: MCPCollectionItem) {
  return it.catalog ? downloads[`connector:${it.catalog.id}`] : undefined;
}

function openGuide(it: MCPCollectionItem) {
  router.push(`/app/mcp/${it.catalog?.id ?? it.local?.id}`);
}
</script>

<template>
  <div class="flex flex-col h-full">
    <div class="px-3.5 pt-4 pb-3 shrink-0">
      <div class="flex items-center justify-between mb-3">
        <h1 class="text-[19px] font-bold">Connectors</h1>
        <button
          @click="() => doSync()"
          class="text-faint hover:text-fg p-1"
          :aria-label="'Sync connectors'"
          :title="'Sync'"
          :disabled="syncing"
        >
          <Icon name="refresh" :size="16" :class="{ spin: syncing }" />
        </button>
      </div>
      <SearchBar v-model="query" placeholder="Search connectors" />
      <p
        v-if="syncMsg"
        class="mt-2.5 rounded-[10px] border px-3 py-2 text-[12px]"
        :class="syncMsg.kind === 'ok' ? 'border-ok/40 text-ok bg-ok/5' : 'border-warn/40 text-warn bg-warn/5'"
        role="status"
        aria-live="polite"
      >
        {{ syncMsg.text }}
      </p>
      <div v-if="categories.length > 1" class="flex gap-1.5 mt-3 overflow-x-auto scroll-area -mx-3.5 px-3.5 pb-1">
        <button
          v-for="c in categories"
          :key="c"
          @click="category = c"
          class="shrink-0 h-7 px-3 rounded-full text-[12px] font-medium border transition-colors"
          :class="category === c ? 'border-primary/60 bg-primary-dim text-primary-hi' : 'border-border text-muted hover:text-fg'"
        >
          {{ c }}
        </button>
      </div>
      <p
        v-if="catalogBanner"
        class="mt-2.5 rounded-[10px] border px-3 py-2 text-[12px]"
        :class="catalogBanner.kind === 'warn' ? 'border-warn/40 text-warn bg-warn/5' : 'border-border text-muted bg-card'"
      >
        {{ catalogBanner.text }}
      </p>
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto scroll-area px-3.5 pb-4">
      <div v-if="filtered.length" class="grid grid-cols-1 gap-2">
        <button
          v-for="it in filtered"
          :key="it.catalog?.id ?? it.local?.id"
          @click="openGuide(it)"
          class="text-left rounded-[14px] bg-card border border-border p-3.5 hover:border-border-strong transition-colors"
        >
          <div class="flex items-center gap-3">
            <CatalogLogo
              :src="it.catalog?.logo_url"
              :name="it.catalog?.name ?? it.local?.name ?? '?'"
              :size="42"
            />
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <h3 class="font-semibold text-[14px] uppercase tracking-wide truncate">
                  {{ it.catalog?.name ?? it.local?.name }}
                </h3>
                <span
                  v-if="it.updateAvailable"
                  class="shrink-0 text-[10px] font-semibold text-warn border border-warn/40 rounded-full px-1.5 py-0.5"
                >
                  Update available
                </span>
                <span
                  v-if="!it.entitled && it.local"
                  class="shrink-0 text-[10px] font-semibold text-faint border border-border rounded-full px-1.5 py-0.5"
                >
                  Not in your plan
                </span>
              </div>
              <p class="text-[11.5px] text-muted truncate">
                {{ it.catalog?.description ?? it.local?.name }}
              </p>
            </div>
            <Icon name="chevron" :size="16" class="text-faint shrink-0" />
          </div>
          <div class="flex items-center justify-between mt-3">
            <span class="flex items-center gap-1.5 text-[12px] font-medium" :style="{ color: statusColor(it.status) }">
              <span class="w-1.5 h-1.5 rounded-full" :style="{ background: statusColor(it.status) }" />
              {{ statusLabel[it.status] }}
              <span v-if="it.local" class="text-faint font-mono">v{{ it.local.version }}</span>
              <span v-else-if="it.catalog" class="text-faint font-mono">v{{ it.catalog.version }}</span>
            </span>
            <span
              class="text-[12px] font-medium flex items-center gap-1"
              :class="it.updateAvailable ? 'text-warn font-semibold' : (it.status === 'connected' ? 'text-ok' : 'text-primary-hi')"
              @click.stop="act(it)"
            >
              <template v-if="it.updateAvailable && it.catalog">
                <template v-if="dl(it)?.status === 'downloading'">
                  <Icon name="refresh" :size="13" class="spin" /> Updating…
                </template>
                <template v-else-if="dl(it)?.status === 'installing'">
                  <Icon name="refresh" :size="13" class="spin" /> Installing…
                </template>
                <template v-else>
                  <Icon name="download" :size="13" /> Update v{{ it.catalog.version }}
                </template>
              </template>
              <template v-else-if="it.status === 'available'">
                <template v-if="dl(it)?.status === 'downloading'">
                  <Icon name="refresh" :size="13" class="spin" /> Downloading…
                </template>
                <template v-else-if="dl(it)?.status === 'installing'">
                  <Icon name="refresh" :size="13" class="spin" /> Installing…
                </template>
                <template v-else-if="dl(it)?.status === 'success' || dl(it)?.status === 'installed'">
                  <Icon name="check" :size="13" /> Installed
                </template>
                <template v-else>
                  <Icon name="download" :size="13" />
                  {{ dl(it)?.status === "error" ? "Retry" : "Install" }}
                </template>
              </template>
              <template v-else-if="it.status === 'disconnected' || it.status === 'error'">
                <Icon name="link" :size="13" /> {{ it.status === "error" ? "Retry" : "Connect" }}
              </template>
              <template v-else-if="it.status === 'connected'">
                <Icon name="x" :size="13" /> Disconnect
              </template>
              <template v-else-if="it.status === 'connecting'">
                Connecting…
              </template>
              <template v-else>Guide</template>
            </span>
          </div>
        </button>
      </div>
      <EmptyState
        v-else
        icon="search"
        :title="query || category !== 'All' ? 'No matches' : 'No connectors available'"
        :body="query || category !== 'All' ? 'Try a different search term or category.' : 'No connectors available right now. Check your internet connection.'"
      />
    </div>
  </div>
</template>
