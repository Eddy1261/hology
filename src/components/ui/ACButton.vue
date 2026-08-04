<script setup lang="ts">
import { ref } from "vue";
import Icon from "./Icon.vue";

withDefaults(
  defineProps<{
    variant?: "primary" | "outline" | "ghost" | "danger";
    size?: "sm" | "md";
    block?: boolean;
    loading?: boolean;
    disabled?: boolean;
  }>(),
  { variant: "primary", size: "md", block: false, loading: false, disabled: false },
);

const btn = ref<HTMLButtonElement | null>(null);
// Allow callers to return focus to the trigger (modal close convention).
defineExpose({ focus: () => btn.value?.focus() });

const base =
  "inline-flex items-center justify-center gap-2 rounded-[10px] font-semibold transition-all duration-150 disabled:opacity-45 disabled:pointer-events-none select-none active:scale-[0.98]";
const sizes: Record<string, string> = {
  sm: "text-[12px] px-3 h-8",
  md: "text-[13px] px-4 h-10",
};
const variants: Record<string, string> = {
  primary: "bg-primary text-white hover:bg-primary-hi shadow-[0_4px_16px_-4px_rgba(59,130,246,0.6)]",
  outline: "border border-primary/45 text-primary-hi hover:bg-primary-dim",
  ghost: "text-muted hover:text-fg hover:bg-white/5",
  danger: "border border-danger/40 text-danger hover:bg-danger/10",
};
</script>

<template>
  <button
    ref="btn"
    :class="[base, sizes[size], variants[variant], block ? 'w-full' : '']"
    :disabled="disabled || loading"
  >
    <Icon v-if="loading" name="refresh" :size="15" class="spin" />
    <slot v-else />
  </button>
</template>
