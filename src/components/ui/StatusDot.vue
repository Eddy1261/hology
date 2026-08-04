<script setup lang="ts">
import type { ConnStatus } from "../../lib/types";

const props = defineProps<{
  status: ConnStatus | "active" | "expired";
  label?: boolean;
}>();

// Human-readable status map — no jargon
const map: Record<string, { variant: string; t: string }> = {
  connected:    { variant: "ok",     t: "Connected" },
  active:       { variant: "ok",     t: "Active" },
  connecting:   { variant: "warn",   t: "Connecting…" },
  disconnected: { variant: "muted",  t: "Disconnected" },
  error:        { variant: "danger", t: "Error" },
  expired:      { variant: "danger", t: "Expired" },
};

const info = () => map[props.status] ?? map.disconnected;
</script>

<template>
  <span :class="`status-badge ${info().variant}`">
    <span
      class="w-1.5 h-1.5 rounded-full shrink-0"
      :class="{
        pulse: status === 'connecting',
        'bg-current': true
      }"
    />
    <span v-if="label !== false">{{ info().t }}</span>
  </span>
</template>
