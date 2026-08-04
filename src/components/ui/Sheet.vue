<script setup lang="ts">
import Icon from "./Icon.vue";
defineProps<{ open: boolean; title?: string }>();
const emit = defineEmits<{ close: [] }>();
</script>

<template>
  <Transition name="sheet">
    <div v-if="open" class="absolute inset-0 z-40 flex items-end" @click.self="emit('close')">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-[2px]" @click="emit('close')" />
      <div
        class="relative w-full bg-panel border-t border-border-strong rounded-t-2xl p-5 max-h-[88%] overflow-y-auto scroll-area sheet-panel"
      >
        <div class="flex items-center justify-between mb-4">
          <h3 class="text-[15px] font-semibold tracking-wide">{{ title }}</h3>
          <button
            @click="emit('close')"
            class="text-faint hover:text-fg p-1 -mr-1"
            aria-label="Close"
          >
            <Icon name="x" :size="18" />
          </button>
        </div>
        <slot />
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.sheet-enter-active,
.sheet-leave-active {
  transition: opacity 0.2s ease;
}
.sheet-enter-active .sheet-panel,
.sheet-leave-active .sheet-panel {
  transition: transform 0.28s cubic-bezier(0.16, 1, 0.3, 1);
}
.sheet-enter-from,
.sheet-leave-to {
  opacity: 0;
}
.sheet-enter-from .sheet-panel,
.sheet-leave-to .sheet-panel {
  transform: translateY(100%);
}
</style>
