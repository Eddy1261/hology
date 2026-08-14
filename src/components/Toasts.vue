<script setup lang="ts">
import Icon from "./ui/Icon.vue";
import { state } from "../lib/store";
</script>

<template>
  <div class="absolute left-0 right-0 bottom-3 z-[60] flex flex-col items-center gap-2 px-4 pointer-events-none">
    <TransitionGroup name="toast">
      <div
        v-for="t in state.toasts"
        :key="t.id"
        class="flex items-center gap-2 px-3.5 py-2.5 rounded-xl bg-card border border-border-strong shadow-lg text-[13px] font-medium max-w-full"
      >
        <Icon
          :name="t.kind === 'ok' ? 'check' : 'x'"
          :size="15"
          :style="{ color: t.kind === 'ok' ? 'var(--color-ok)' : 'var(--color-danger)' }"
        />
        <span>{{ t.text }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: all 0.25s ease;
}
.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(10px);
}
</style>
