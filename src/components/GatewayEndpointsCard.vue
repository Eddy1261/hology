<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from "vue";
import { mcp, state, toast } from "../lib/store";
import { gatewayTunnelStart, gatewayTunnelStatus, gatewayTunnelStop } from "../lib/gateway";
import Icon from "./ui/Icon.vue";

// The gateway is not guaranteed to be on 8788 — it falls back to an
// OS-assigned port when that one is taken. This is the URL the user copies
// into an external agent, so a stale port here is a setup that silently
// never connects.
const LOCAL_MCP_URL = computed(() => `${state.gatewayBaseUrl}/mcp`);

/** Public tunnel tokens reset every hour (relay SESSION_TOKEN_TTL=1h). */
const TUNNEL_TTL_MS = 3_600_000;
/** Below this remaining time the UI switches to "expiring soon" styling. */
const RENEW_WARN_MS = 5 * 60_000;
const STARTED_KEY = "aiconnect.tunnelStartedAt";

const tunnelActive = ref(false);
const tunnelUrl = ref<string | null>(null);
/** Last known URL — preserved across expiry/failure so the text never
 *  disappears out from under the user. Only replaced by a newer URL. */
const lastTunnelUrl = ref<string | null>(null);
const tunnelStartedAt = ref<number | null>(loadStartedAt());
const tunnelBusy = ref(false);
const nowMs = ref(Date.now());
let tickTimer: ReturnType<typeof setInterval> | undefined;
/** URL the current 1h clock was started for (rotation detection). */
let clockUrl: string | null = null;

function loadStartedAt(): number | null {
  try {
    const v = localStorage.getItem(STARTED_KEY);
    const n = v === null ? NaN : Number(v);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

function saveStartedAt(v: number | null): void {
  try {
    if (v === null) localStorage.removeItem(STARTED_KEY);
    else localStorage.setItem(STARTED_KEY, String(v));
  } catch {
    /* storage unavailable — countdown just won't survive reloads */
  }
}

const expiresAt = computed(() =>
  tunnelStartedAt.value === null ? null : tunnelStartedAt.value + TUNNEL_TTL_MS,
);
const remainingMs = computed(() =>
  expiresAt.value === null ? null : Math.max(0, expiresAt.value - nowMs.value),
);
const timerExpired = computed(() => remainingMs.value === 0);
const expiringSoon = computed(
  () => remainingMs.value !== null && remainingMs.value > 0 && remainingMs.value <= RENEW_WARN_MS,
);
const remainingText = computed(() => {
  if (remainingMs.value === null) return "";
  const s = Math.floor(remainingMs.value / 1000);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  return h > 0
    ? `${h}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`
    : `${m}:${String(ss).padStart(2, "0")}`;
});

const isTunnelActive = computed(
  () => tunnelActive.value && !!tunnelUrl.value && !timerExpired.value,
);
/** Had a URL but it's no longer live (expired TTL or dropped session). */
const isTunnelExpired = computed(
  () => !!lastTunnelUrl.value && !isTunnelActive.value,
);

// AppShell re-keys <router-view> on $route.path, so navigating away and back
// mounts a SECOND card while this one's poll (up to 10s) is still running —
// two loops writing the same refs, and the stale one wins whenever it lands
// last. Bumping the generation on unmount, and on each new toggle, retires
// every earlier loop.
let pollGeneration = 0;

async function refreshTunnel() {
  try {
    const info = await gatewayTunnelStatus();
    tunnelActive.value = info.active;
    tunnelUrl.value = info.public_url;
    if (info.active && info.public_url) {
      lastTunnelUrl.value = info.public_url;
      if (clockUrl !== info.public_url) {
        // New tunnel session (URL rotated) → restart the 1h clock.
        clockUrl = info.public_url;
        tunnelStartedAt.value = Date.now();
        saveStartedAt(tunnelStartedAt.value);
      } else if (tunnelStartedAt.value === null) {
        // Tunnel predates our clock (e.g. app restarted) — start it now.
        tunnelStartedAt.value = Date.now();
        saveStartedAt(tunnelStartedAt.value);
      }
    }
  } catch {
    // Deliberately does NOT write "inactive". "Gateway unreachable" and
    // "tunnel is off" are different facts, and collapsing them made a
    // transient failure inside the poll loop below silently report the tunnel
    // closed — the card then offered to open one that was already open. Keep
    // the last known state; the next successful poll corrects it.
    // NOTE: lastTunnelUrl is intentionally preserved — the tunnel text
    // must not disappear when the session drops or the token expires.
  }
}

/** Poll up to ~10s for the tunnel to come live after (re)start. `gen` is the
 *  pollGeneration this loop was started under — checked each iteration so a
 *  stale loop (superseded toggle/renew, or a since-unmounted double-mounted
 *  card) retires instead of racing a newer one. */
async function waitForActive(gen: number): Promise<void> {
  for (let i = 0; i < 20 && gen === pollGeneration; i++) {
    await new Promise((resolve) => setTimeout(resolve, 500));
    await refreshTunnel();
    if (isTunnelActive.value) break;
  }
}

async function toggleTunnel() {
  const gen = ++pollGeneration;
  tunnelBusy.value = true;
  try {
    if (isTunnelActive.value) {
      await gatewayTunnelStop();
      toast("Shared access turned off");
      await refreshTunnel();
    } else {
      await gatewayTunnelStart();
      toast("Turning on shared access…");
      // POST returns 202 — the relay session is established asynchronously,
      // so the public URL only appears on a later status read.
      await waitForActive(gen);
    }
    // Connector-level exposure (`ConnectorInfo.exposed` / `public_url`) is the
    // same fact viewed from the other side, and it drives the connector cards.
    // Without this refresh the two surfaces disagree until something unrelated
    // reloads the connector list.
    await mcp.refresh();
  } catch (e) {
    toast(e instanceof Error ? e.message : "Couldn't change shared access. Please try again.", "error");
  } finally {
    if (gen === pollGeneration) tunnelBusy.value = false;
  }
}

/** Expired tunnel → stop the dead session (best-effort) and open a fresh
 *  one, restarting the 1h clock. One click, no confusion. */
async function renewTunnel() {
  const gen = ++pollGeneration;
  tunnelBusy.value = true;
  try {
    try {
      await gatewayTunnelStop();
    } catch {
      /* session already gone — proceed to start a fresh one */
    }
    tunnelActive.value = false;
    tunnelUrl.value = null;
    await gatewayTunnelStart();
    toast("Renewing shared access…");
    await waitForActive(gen);
    if (isTunnelActive.value) toast("Shared access renewed");
    else toast("Couldn't renew shared access. Please try again.", "error");
  } catch (e) {
    toast(e instanceof Error ? e.message : "Couldn't renew shared access. Please try again.", "error");
  } finally {
    if (gen === pollGeneration) tunnelBusy.value = false;
  }
}

function copyTunnel() {
  if (isTunnelExpired.value || !tunnelUrl.value) {
    toast("This tunnel URL has expired — renew it to get a fresh one.", "error");
    return;
  }
  void copyEndpoint(tunnelUrl.value, "Public Tunnel Endpoint");
}

onMounted(() => {
  void refreshTunnel();
  tickTimer = setInterval(() => {
    nowMs.value = Date.now();
  }, 1000);
});

onUnmounted(() => {
  if (tickTimer !== undefined) clearInterval(tickTimer);
  pollGeneration++;
});

async function copyEndpoint(url: string, label: string) {
  try {
    await navigator.clipboard.writeText(url);
    toast(`Copied ${label} to clipboard`);
  } catch {
    toast(`Failed to copy ${label}`);
  }
}
</script>

<template>
  <section class="rounded-[14px] bg-card border border-border p-3.5 w-full flex flex-col gap-3">
    <div class="flex items-center justify-between min-w-0">
      <div class="flex items-center gap-2.5 min-w-0">
        <div class="w-7 h-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
          <Icon name="terminal" :size="15" />
        </div>
        <div class="min-w-0">
          <h2 class="text-[13px] font-semibold text-fg tracking-wide truncate">Gateway Endpoints</h2>
          <p class="text-[11px] text-muted truncate">Connection URLs for AI agents & remote web tools</p>
        </div>
      </div>
    </div>

    <div class="grid grid-cols-1 lg:grid-cols-2 gap-2.5 pt-0.5">
      <!-- Local Loopback HTTP -->
      <div class="rounded-xl bg-panel border border-border/80 p-3 flex flex-col justify-between gap-2 min-w-0">
        <div class="flex items-center justify-between gap-2 min-w-0">
          <div class="flex items-center gap-1.5 min-w-0 shrink-0">
            <span class="text-[11px] font-semibold text-fg uppercase tracking-wider">Local HTTP</span>
            <span class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-ok/10 text-ok border border-ok/20 shrink-0">
              <span class="w-1.5 h-1.5 rounded-full bg-ok" /> Loopback
            </span>
          </div>
          <button
            @click="copyEndpoint(LOCAL_MCP_URL, 'Local HTTP Endpoint')"
            class="inline-flex items-center gap-1 text-[11px] font-medium text-muted hover:text-fg hover:bg-card-hover px-2 py-1 rounded-lg transition-colors border border-transparent hover:border-border shrink-0 cursor-pointer"
            title="Copy local endpoint"
            aria-label="Copy local endpoint"
          >
            <Icon name="copy" :size="13" /> Copy
          </button>
        </div>
        <div class="bg-card border border-border rounded-lg px-2.5 py-1.5 flex items-center justify-between min-w-0 overflow-hidden">
          <code class="text-[11.5px] font-mono text-primary truncate select-all block w-full" :title="LOCAL_MCP_URL">{{ LOCAL_MCP_URL }}</code>
        </div>
      </div>

      <!-- Public Cloud Tunnel -->
      <div class="rounded-xl bg-panel border border-border/80 p-3 flex flex-col justify-between gap-2 min-w-0">
        <div class="flex items-center justify-between gap-2 min-w-0">
          <div class="flex items-center gap-1.5 min-w-0 shrink-0">
            <span class="text-[11px] font-semibold text-fg uppercase tracking-wider">Public Tunnel</span>
            <span
              v-if="isTunnelActive"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-primary/10 text-primary border border-primary/20 shrink-0"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" /> Live & Shared
            </span>
            <span
              v-else-if="isTunnelExpired"
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-warn/10 text-warn border border-warn/40 shrink-0"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-warn" /> Expired
            </span>
            <span
              v-else
              class="inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-card text-muted border border-border shrink-0"
            >
              <span class="w-1.5 h-1.5 rounded-full bg-muted" /> Inactive
            </span>
          </div>
          <button
            @click="isTunnelActive || isTunnelExpired ? copyTunnel() : toggleTunnel()"
            :disabled="tunnelBusy"
            class="inline-flex items-center gap-1 text-[11px] font-medium text-muted hover:text-fg hover:bg-card-hover px-2 py-1 rounded-lg transition-colors border border-transparent hover:border-border shrink-0 cursor-pointer"
            :title="isTunnelActive ? 'Copy tunnel endpoint' : isTunnelExpired ? 'Copy expired tunnel endpoint' : 'Open shared tunnel'"
            :aria-label="isTunnelActive ? 'Copy tunnel endpoint' : isTunnelExpired ? 'Copy expired tunnel endpoint' : 'Open shared tunnel'"
          >
            <Icon :name="isTunnelActive || isTunnelExpired ? 'copy' : 'globe'" :size="13" /> {{ isTunnelActive || isTunnelExpired ? 'Copy' : 'Open' }}
          </button>
        </div>
        <div class="bg-card border border-border rounded-lg px-2.5 py-1.5 flex items-center justify-between min-w-0 overflow-hidden">
          <code v-if="isTunnelActive" class="text-[11.5px] font-mono text-primary truncate select-all block w-full" :title="tunnelUrl ?? ''">{{ tunnelUrl }}</code>
          <code v-else-if="isTunnelExpired" class="text-[11.5px] font-mono text-muted line-through opacity-70 truncate select-all block w-full" :title="lastTunnelUrl ?? ''">{{ lastTunnelUrl }}</code>
          <span v-else class="text-[11px] text-faint italic truncate block w-full">Open shared tunnel when remote access needed</span>
        </div>
        <p v-if="isTunnelActive && remainingText" :class="expiringSoon ? 'text-[11px] text-warn' : 'text-[11px] text-faint'">
          Token expires in {{ remainingText }} · resets every hour for security
        </p>
        <div class="flex items-center gap-3">
          <button v-if="isTunnelActive" @click="toggleTunnel" :disabled="tunnelBusy" class="self-start text-[11px] text-danger hover:text-danger/80">Close tunnel</button>
          <button v-if="isTunnelExpired" @click="renewTunnel" :disabled="tunnelBusy" class="self-start text-[11px] font-semibold text-primary hover:text-primary-hi">Renew tunnel</button>
        </div>
      </div>
    </div>
  </section>
</template>
