<script setup lang="ts">
import Icon from "./Icon.vue";
defineProps<{ icon?: string; title: string; body?: string }>();
</script>

<template>
  <div class="flex flex-col items-center text-center py-10 px-4">
    <div
      class="w-12 h-12 rounded-2xl bg-card border border-border flex items-center justify-center text-faint mb-3"
    >
      <Icon :name="icon ?? 'cube'" :size="22" />
    </div>
    <p class="text-[14px] font-semibold text-fg">{{ title }}</p>
    <p v-if="body" class="text-[12.5px] text-muted mt-1.5 leading-relaxed max-w-[240px]">{{ body }}</p>
    <div class="mt-4"><slot /></div>
  </div>
</template>
