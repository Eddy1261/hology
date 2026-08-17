<script setup lang="ts">
import { ref } from "vue";
import IconTile from "./ui/IconTile.vue";
import StatusDot from "./ui/StatusDot.vue";
import Toggle from "./ui/Toggle.vue";
import Icon from "./ui/Icon.vue";
import ConfirmDialog from "./ui/ConfirmDialog.vue";
import type { MCPServer } from "../lib/types";

const props = defineProps<{ server: MCPServer }>();
const emit = defineEmits<{ disconnect: []; toggle: []; expose: []; delete: [] }>();

const menuOpen = ref(false);
const confirmOpen = ref(false);

function confirmDisconnect() {
  confirmOpen.value = false;
  menuOpen.value = false;
  emit("disconnect");
}
</script>

<template>
  <div class="rounded-[14px] bg-card border border-border p-3.5">
    <div class="flex items-center gap-3">
      <IconTile :glyph="server.icon" :color="server.color" :size="42" />
      <div class="min-w-0 flex-1">
        <div class="flex items-center gap-2">
          <h3 class="font-semibold text-[14px] truncate uppercase tracking-wide">{{ server.name }}</h3>
          <span class="text-[10px] font-mono text-muted border border-border rounded px-1.5 py-0.5">{{ server.version }}</span>
        </div>
        <StatusDot v-if="server.enabled" :status="server.status" class="mt-1" />
        <span v-else class="inline-flex items-center gap-1.5 text-[12px] font-medium text-faint mt-1">
          <span class="w-1.5 h-1.5 rounded-full bg-faint" /> Paused
        </span>
      </div>
      <div class="flex items-center gap-1.5">
        <span
          v-if="server.enabled"
          class="flex items-center gap-1 text-[11px] text-ok font-medium border border-ok/25 rounded-full px-2 py-1"
        >
          <Icon name="activity" :size="12" /> Healthy
        </span>
        <Toggle :model-value="props.server.enabled" @update:model-value="emit('toggle')" label="Enable server" />
        <div class="relative">
          <div v-if="menuOpen" class="fixed inset-0 z-10" @click="menuOpen = false" />
          <button
            @click="menuOpen = !menuOpen"
            class="text-faint hover:text-fg p-1"
            aria-label="Server options"
            aria-haspopup="menu"
            :aria-expanded="menuOpen"
          >
            <Icon name="more" :size="18" />
          </button>
          <div
            v-if="menuOpen"
            class="absolute right-0 top-8 z-20 w-40 rounded-xl bg-panel border border-border-strong shadow-lg py-1"
          >
            <button
              @click="emit('toggle'); menuOpen = false"
              class="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-muted hover:text-fg hover:bg-white/5"
            >
              <Icon name="activity" :size="14" /> {{ server.enabled ? "Pause" : "Resume" }}
            </button>

            <button
              @click="confirmOpen = true"
              class="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-danger hover:bg-danger/10"
            >
              <Icon name="link" :size="14" /> Disconnect
            </button>
            <button
              @click="emit('delete'); menuOpen = false"
              class="w-full flex items-center gap-2.5 px-3 py-2 text-[12.5px] text-danger hover:bg-danger/10"
            >
              <Icon name="trash" :size="14" /> Delete connector
            </button>
          </div>
        </div>
      </div>
    </div>

    <ConfirmDialog
      :open="confirmOpen"
      title="Disconnect server?"
      :body="`${server.name} will be removed from your connected servers and returned to Available MCP Apps.`"
      confirm-label="Disconnect"
      danger
      @confirm="confirmDisconnect"
      @cancel="confirmOpen = false"
    />
  </div>
</template>
