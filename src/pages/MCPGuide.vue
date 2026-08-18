<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import { state, mcp, catalog, toast } from "../lib/store";
import { buildCollection, type MCPCollectionItem } from "../lib/collection";
import { downloadConnector, downloads } from "../lib/store/downloads";
import { clearLease } from "../lib/lease";
import {
  gatewayConnectorConfig,
  gatewayConnectorDelete,
  gatewayConnectorTutorial,
  gatewayCredentialsGet,
  gatewayCredentialsPut,
  gatewayCredentialDelete,
} from "../lib/gateway";
import CatalogLogo from "../components/CatalogLogo.vue";
import ACButton from "../components/ui/ACButton.vue";
import Icon from "../components/ui/Icon.vue";
import EmptyState from "../components/ui/EmptyState.vue";
import ConfirmDialog from "../components/ui/ConfirmDialog.vue";
import MarkdownView from "../components/MarkdownView.vue";

const route = useRoute();
const router = useRouter();

// P4-08: single hydration owner — startup refreshes shared state; this page
// consumes it (deep links render from hydrated state).

const item = computed<MCPCollectionItem | undefined>(() =>
  buildCollection(state.mcpCatalog, state.localConnectors).find(
    (it) => (it.catalog?.id ?? it.local?.id) === route.params.id,
  ),
);

/** Download/install state for the install button. */
const dlStatus = computed(() => {
  const id = item.value?.catalog?.id;
  return id ? downloads[`connector:${id}`]?.status : undefined;
});

const configFields = ref<any[]>([]);
const configuredKeys = ref<string[]>([]);
const configKey = ref("");
const configValue = ref("");
const configBusy = ref(false);
const deleteOpen = ref(false);
const deleting = ref(false);

async function loadConfig() {
  const id = item.value?.local?.id;
  if (!id) return;
  try {
    const [cfg, creds] = await Promise.all([gatewayConnectorConfig(id), gatewayCredentialsGet(id)]);
    configFields.value = cfg.env;
    configuredKeys.value = creds.keys;
  } catch {
    configFields.value = [];
    configuredKeys.value = [];
  }
}

async function saveConfig() {
  const id = item.value?.local?.id;
  if (!id || !configKey.value || !configValue.value) return;
  configBusy.value = true;
  try {
    await gatewayCredentialsPut(id, configKey.value, configValue.value);
    configuredKeys.value = [...new Set([...configuredKeys.value, configKey.value])];
    configKey.value = "";
    configValue.value = "";
    toast("Settings saved. Reconnect the connector to apply changes.", "ok");
  } catch (e) {
    toast(e instanceof Error ? e.message : "Couldn't save settings. Please try again.", "error");
  } finally {
    configBusy.value = false;
  }
}

async function deleteConfig(key: string) {
  const id = item.value?.local?.id;
  if (!id) return;
  await gatewayCredentialDelete(id, key);
  configuredKeys.value = configuredKeys.value.filter((k) => k !== key);
}

const tutorialContent = ref("");
const tutorialLoading = ref(false);
const showQuickSteps = ref(false);

async function loadTutorial() {
  const id = item.value?.local?.id;
  if (!id) {
    tutorialContent.value = "";
    return;
  }
  tutorialLoading.value = true;
  try {
    const res = await gatewayConnectorTutorial(id);
    tutorialContent.value = res.content ? res.content.trim() : "";
  } catch {
    tutorialContent.value = "";
  } finally {
    tutorialLoading.value = false;
  }
}

onMounted(() => {
  loadConfig();
  loadTutorial();
});

watch(
  () => item.value?.local?.id,
  (newId) => {
    if (newId) {
      loadConfig();
      loadTutorial();
    } else {
      tutorialContent.value = "";
    }
  },
);

const steps = computed(() => [
  {
    title: item.value?.catalog ? "Install the connector" : "Verify the connector",
    body: item.value?.catalog
      ? `${item.value.catalog.name} is available from the AI CONNECT catalog at version ${item.value.catalog.version}. Install it to make it available to this machine.`
      : `${item.value?.local?.name ?? "This connector"} is already installed on this machine. Make sure the server is reachable (HTTP, SSE, or STDIO).`,
  },
  {
    title: "Connect",
    body: `Press Connect below. AI CONNECT opens a channel to the server, performs the protocol handshake, and lists the tools the server advertises.`,
  },
  {
    title: "Grant the agent access",
    body: `Once connected, the server's tools become available to your AI agent automatically. Entitlements from your plan apply — the gateway enforces them.`,
  },
  {
    title: "Start a session",
    body: `Open Sessions to watch the live AI ↔ connector link — connection status, available tools, and every tool call the agent makes, in real time.`,
  },
]);

async function confirmDelete() {
  const id = item.value?.local?.id;
  // Without the in-flight guard a double click fired two DELETEs, and the
  // second one 404s — toasting "Delete failed" immediately after a delete that
  // actually succeeded.
  if (!id || deleting.value) return;
  deleting.value = true;
  try {
    await gatewayConnectorDelete(id);
    toast("Connector deleted");
    deleteOpen.value = false;
    // The connector is gone from the gateway, so its client-side traces must go
    // too. The download record stays "installed" otherwise, and `isInstalled`
    // below reads it — so a deleted connector kept rendering as installed. The
    // stored activation lease would likewise be offered for reuse on reinstall,
    // for a version that may no longer be the one on disk.
    delete downloads[`connector:${id}`];
    clearLease(id);
    await mcp.refresh();
    router.push("/app/mcp");
  } catch (e) {
    toast(e instanceof Error ? e.message : "Delete failed", "error");
  } finally {
    deleting.value = false;
  }
}

async function act() {
  const it = item.value;
  if (!it) return;
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
    await Promise.all([loadConfig(), loadTutorial()]);
    toast(`${it.catalog.name} updated to v${it.catalog.version}`, "ok");
    return;
  }
  const isInstalled = it.local != null || dlStatus.value === "installed";
  if (!isInstalled) {
    // Not installed: use the canonical CP20 installation path (same as MCPCollection).
    if (it.catalog) {
      const st = downloads[`connector:${it.catalog.id}`];
      if (st?.status === "downloading" || st?.status === "installing") return;
      await downloadConnector(it.catalog.id, it.catalog.version, {
        sha256: it.catalog.sha256,
        size_bytes: it.catalog.package_size_bytes,
      });
      const endState = downloads[`connector:${it.catalog.id}`];
      if (endState?.status === "error") {
        toast(endState.message ?? `Failed to install ${it.catalog.name}`, "error");
        return;
      }
      await Promise.all([mcp.refresh(), catalog.refresh()]);
      await Promise.all([loadConfig(), loadTutorial()]);
      toast(`${it.catalog.name} installed successfully`, "ok");
      return;
    }
    toast("This connector isn't available right now.", "error");
    return;
  }
  const id = it.local?.id ?? it.catalog?.id;
  if (id) {
    if (it.status === "connected") {
      await mcp.disconnect(id);
    } else {
      await mcp.connect(id);
    }
    router.push("/app");
  }
}
</script>

<template>
  <div class="px-3.5 py-4">
    <button
      @click="router.push('/app/mcp')"
      class="flex items-center gap-1.5 text-[12px] text-muted hover:text-fg mb-4"
    >
      <Icon name="back" :size="16" /> Connectors
    </button>

    <template v-if="item">
      <!-- header -->
      <div class="flex items-center gap-3">
        <CatalogLogo
          :src="item.catalog?.logo_url"
          :name="item.catalog?.name ?? item.local?.name ?? '?'"
          :size="48"
        />
        <div class="min-w-0">
          <div class="flex items-center gap-2">
            <h1 class="text-[18px] font-bold uppercase tracking-wide truncate">
              {{ item.catalog?.name ?? item.local?.name }}
            </h1>
            <span
              v-if="item.updateAvailable"
              class="shrink-0 text-[10px] font-semibold text-warn border border-warn/40 rounded-full px-1.5 py-0.5"
            >
              Update available
            </span>
          </div>
          <p class="text-[12px] text-muted truncate">
            {{ item.catalog?.description ?? "Installed locally" }}
            <template v-if="item.catalog?.category">· {{ item.catalog.category }}</template>
          </p>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 mt-3 text-[11.5px]">
        <span class="font-mono text-faint border border-border rounded px-1.5 py-0.5">
          catalog {{ item.catalog?.version ?? "—" }}
        </span>
        <span v-if="item.local" class="font-mono text-faint border border-border rounded px-1.5 py-0.5">
          installed {{ item.local.version }}
        </span>
        <span
          v-if="item.catalog?.license"
          class="text-faint border border-border rounded px-1.5 py-0.5"
        >
          {{ item.catalog.license }}
        </span>
        <span
          v-if="!item.entitled && item.local"
          class="text-faint border border-border rounded px-1.5 py-0.5"
        >
          Not available in your plan
        </span>
        <span
          v-if="item.status === 'unlisted'"
          class="text-warn border border-warn/40 rounded px-1.5 py-0.5"
        >
          Installed (not in catalog)
        </span>
      </div>

      <!-- Tutorial loading state -->
      <div v-if="tutorialLoading" class="mt-5 rounded-[14px] bg-card border border-border p-6 flex items-center justify-center gap-2.5 text-muted text-[13px]">
        <Icon name="refresh" :size="16" class="spin text-primary" />
        <span>Loading connector guide…</span>
      </div>

      <!-- Rendered TUTORIAL.md Guide -->
      <div v-else-if="tutorialContent" class="mt-5 rounded-[14px] bg-card border border-border p-4.5 shadow-xs">
        <div class="flex items-center justify-between pb-3 mb-3 border-b border-border">
          <div class="flex items-center gap-2">
            <Icon name="doc" :size="16" class="text-primary" />
            <h2 class="text-[13.5px] font-bold text-fg">Setup & Usage Guide</h2>
          </div>
          <button
            @click="showQuickSteps = !showQuickSteps"
            class="text-[11.5px] text-muted hover:text-fg font-medium transition-colors cursor-pointer"
          >
            {{ showQuickSteps ? "Hide quick steps" : "Quick steps" }}
          </button>
        </div>

        <div v-if="showQuickSteps" class="mb-4 pb-4 border-b border-border">
          <h3 class="text-[11px] font-semibold text-muted uppercase tracking-wider mb-2.5">Connection Checklist</h3>
          <ol class="flex flex-col gap-2">
            <li v-for="(s, i) in steps" :key="i" class="flex gap-2 items-start text-[12px]">
              <span class="w-4.5 h-4.5 rounded-full bg-primary-dim text-primary-hi font-bold text-[10.5px] flex items-center justify-center shrink-0 mt-0.5">{{ i + 1 }}</span>
              <div>
                <span class="font-semibold text-fg">{{ s.title }}</span>: <span class="text-muted">{{ s.body }}</span>
              </div>
            </li>
          </ol>
        </div>

        <MarkdownView :content="tutorialContent" />
      </div>

      <!-- Fallback / Uninstalled Guide -->
      <template v-else>
        <div v-if="!item.local" class="mt-4 rounded-[14px] bg-card border border-border p-4 shadow-xs flex items-start gap-3">
          <div class="w-8 h-8 rounded-xl bg-primary-dim text-primary flex items-center justify-center shrink-0 mt-0.5">
            <Icon name="download" :size="16" />
          </div>
          <div>
            <h3 class="text-[13px] font-semibold text-fg">Install to Unlock Complete Guide & Tools</h3>
            <p class="text-[12px] text-muted mt-1 leading-relaxed">
              Install {{ item.catalog?.name ?? "this connector" }} on your machine to unpack its dedicated setup guide (<code class="text-[11px] font-mono">TUTORIAL.md</code>), prerequisites, and Model Context Protocol tools.
            </p>
          </div>
        </div>

        <p class="text-[13px] text-muted leading-relaxed mt-4">
          Follow these steps to use {{ item.catalog?.name ?? item.local?.name }} with your AI agent
          through the Model Context Protocol.
        </p>

        <!-- steps -->
        <ol class="mt-5 flex flex-col">
          <li v-for="(s, i) in steps" :key="i" class="flex gap-3 pb-5 last:pb-0 relative">
            <span v-if="i < steps.length - 1" class="absolute left-[13px] top-7 bottom-0 w-px bg-border" />
            <span
              class="relative z-10 shrink-0 w-7 h-7 rounded-full bg-primary-dim border border-primary/40 text-primary-hi text-[12px] font-bold flex items-center justify-center"
            >
              {{ i + 1 }}
            </span>
            <div class="pt-0.5">
              <h3 class="text-[13.5px] font-semibold">{{ s.title }}</h3>
              <p class="text-[12.5px] text-muted leading-relaxed mt-1">{{ s.body }}</p>
            </div>
          </li>
        </ol>
      </template>

      <section v-if="configFields.length" class="mt-5 rounded-[14px] bg-card border border-border p-3.5">
        <div class="flex items-center justify-between mb-2">
          <div>
            <h2 class="text-[13px] font-semibold">Connector configuration</h2>
            <p class="text-[11px] text-muted">Values stay encrypted and apply after reconnect.</p>
          </div>
          <Icon name="lock" :size="14" class="text-muted" />
        </div>
        <div class="flex flex-col gap-2">
          <div v-for="field in configFields" :key="field.key" class="flex items-center justify-between gap-2 text-[12px]">
            <div class="min-w-0">
              <div class="font-medium truncate">{{ field.label }}</div>
              <div class="text-[10px] text-muted truncate">{{ field.description }}</div>
            </div>
            <span class="shrink-0 text-[10px] text-muted">{{ configuredKeys.includes(field.key) ? 'Configured' : (field.required ? 'Required' : 'Optional') }}</span>
            <button v-if="configuredKeys.includes(field.key)" class="text-[11px] text-danger" @click="deleteConfig(field.key)">Clear</button>
          </div>
        </div>
        <div class="mt-3 flex flex-col gap-2">
          <select v-model="configKey" class="h-9 rounded-lg bg-panel border border-border px-2 text-[12px] text-fg">
            <option value="">Select setting</option>
            <option v-for="field in configFields" :key="field.key" :value="field.key">{{ field.label }}</option>
          </select>
          <input v-model="configValue" class="h-9 rounded-lg bg-panel border border-border px-2 text-[12px] text-fg" :type="configFields.find((f) => f.key === configKey)?.secret ? 'password' : 'text'" placeholder="Value" />
          <ACButton size="sm" :disabled="configBusy || !configKey || !configValue" @click="saveConfig">{{ configBusy ? 'Saving…' : 'Save setting' }}</ACButton>
        </div>
      </section>

      <!-- action -->
      <div class="mt-5">
        <ACButton
          v-if="item.updateAvailable && item.catalog"
          block
          @click="act"
          :disabled="dlStatus === 'downloading' || dlStatus === 'installing'"
          class="!bg-warn hover:!bg-warn/90 !text-black"
        >
          <Icon v-if="dlStatus === 'downloading' || dlStatus === 'installing'" name="refresh" :size="15" class="spin" />
          <Icon v-else name="download" :size="15" />
          {{ dlStatus === 'downloading' ? 'Updating…' : dlStatus === 'installing' ? 'Installing…' : `Update to v${item.catalog.version}` }}
        </ACButton>
        <ACButton
          v-else-if="item.status === 'available' && dlStatus !== 'installed'"
          block
          @click="act"
          :disabled="dlStatus === 'downloading' || dlStatus === 'installing'"
        >
          <Icon v-if="dlStatus === 'downloading'" name="refresh" :size="15" class="spin" />
          <Icon v-else-if="dlStatus === 'installing'" name="refresh" :size="15" class="spin" />
          <Icon v-else name="plus" :size="15" />
          {{ dlStatus === 'downloading' ? 'Downloading…' : dlStatus === 'installing' ? 'Installing…' : `Install ${item.catalog?.name}` }}
        </ACButton>
        <ACButton
          v-else-if="item.status === 'disconnected' || item.status === 'error' || dlStatus === 'installed'"
          block
          @click="act"
        >
          <Icon name="link" :size="15" />
          {{ item.status === "error" ? "Retry" : "Connect" }} {{ item.catalog?.name ?? item.local?.name }}
        </ACButton>
        <div
          v-else-if="item.status === 'connecting'"
          class="flex items-center justify-center gap-2 h-10 rounded-[10px] border border-primary/30 text-primary-hi text-[13px] font-semibold"
        >
          <Icon name="refresh" :size="15" class="spin" /> Connecting…
        </div>
        <div
          v-else
          class="flex items-center justify-center gap-2 h-10 rounded-[10px] border border-ok/30 text-ok text-[13px] font-semibold"
        >
          <Icon name="check" :size="16" /> Connected
        </div>
        <button
          v-if="item.status === 'connected'"
          class="w-full text-[12px] text-muted hover:text-danger mt-2 py-1"
          @click="act"
        >
          Disconnect
        </button>
      </div>
      <ACButton
        v-if="item.local"
        block
        variant="danger"
        @click="deleteOpen = true"
      >
        <Icon name="trash" :size="15" />
        Delete connector
      </ACButton>
      <div class="h-2" />
    </template>

    <EmptyState
      v-else
      icon="cube"
      title="Connector not found"
      body="This connector isn't available in the collection or installed on your device."
    >
      <ACButton size="sm" @click="router.push('/app/mcp')">Back to Collection</ACButton>
    </EmptyState>
  </div>

    <ConfirmDialog
      :open="deleteOpen"
      title="Delete connector?"
      :body="item?.local?.name ? `${item.local.name} will be removed from this device. This cannot be undone.` : ''"
      confirm-label="Delete"
      danger
      @confirm="confirmDelete"
      @cancel="deleteOpen = false"
    />
</template>
