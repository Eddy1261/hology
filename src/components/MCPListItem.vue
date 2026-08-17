<script setup lang="ts">
import IconTile from "./ui/IconTile.vue";
import Icon from "./ui/Icon.vue";
import ACButton from "./ui/ACButton.vue";
import type { MCPApp } from "../lib/types";

defineProps<{ app: MCPApp }>();
const emit = defineEmits<{ connect: []; details: [] }>();
</script>

<template>
  <div class="flex items-center gap-3 rounded-[12px] bg-card border border-border px-3 py-2.5 hover:border-border-strong transition-colors">
    <IconTile :glyph="app.icon" :color="app.color" :size="38" />
    <button class="min-w-0 flex-1 text-left" @click="emit('details')">
      <h3 class="font-semibold text-[13.5px] truncate uppercase tracking-wide">{{ app.name }}</h3>
      <p class="text-[11.5px] text-muted truncate">{{ app.description }}</p>
    </button>
    <ACButton
      v-if="app.status === 'disconnected' || app.status === 'error'"
      variant="outline"
      size="sm"
      @click="emit('connect')"
    >
      {{ app.status === "error" ? "Retry" : "Connect" }}
    </ACButton>
    <ACButton v-else-if="app.status === 'connecting'" variant="outline" size="sm" loading>
      Connecting
    </ACButton>
    <span v-else class="flex items-center gap-1 text-[12px] text-ok font-medium px-2">
      <Icon name="check" :size="14" /> Connected
    </span>
    <button @click="emit('details')" class="text-faint hover:text-fg p-1" aria-label="Details">
      <Icon name="more" :size="16" />
    </button>
  </div>
</template>
