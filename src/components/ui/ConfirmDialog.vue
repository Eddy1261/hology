<script setup lang="ts">
import ACButton from "./ACButton.vue";
defineProps<{
  open: boolean;
  title: string;
  body?: string;
  confirmLabel?: string;
  danger?: boolean;
}>();
const emit = defineEmits<{ confirm: []; cancel: [] }>();
</script>

<template>
  <Transition name="cd">
    <div v-if="open" class="absolute inset-0 z-[55] flex items-center justify-center p-6" @click.self="emit('cancel')">
      <div class="absolute inset-0 bg-black/60 backdrop-blur-[2px]" @click="emit('cancel')" />
      <div class="cd-panel relative w-full max-w-[300px] rounded-2xl bg-panel border border-border-strong p-5">
        <h3 class="text-[15px] font-semibold">{{ title }}</h3>
        <p v-if="body" class="text-[12.5px] text-muted leading-relaxed mt-1.5">{{ body }}</p>
        <div class="flex gap-2 mt-5">
          <ACButton block variant="ghost" @click="emit('cancel')">Cancel</ACButton>
          <ACButton block :variant="danger ? 'danger' : 'primary'" @click="emit('confirm')">
            {{ confirmLabel ?? "Confirm" }}
          </ACButton>
        </div>
      </div>
    </div>
  </Transition>
</template>

<style scoped>
.cd-enter-active,
.cd-leave-active {
  transition: opacity 0.18s ease;
}
.cd-enter-active .cd-panel,
.cd-leave-active .cd-panel {
  transition: transform 0.2s cubic-bezier(0.16, 1, 0.3, 1);
}
.cd-enter-from,
.cd-leave-to {
  opacity: 0;
}
.cd-enter-from .cd-panel,
.cd-leave-to .cd-panel {
  transform: scale(0.94);
}
</style>
