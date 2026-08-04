<script setup lang="ts">
const props = defineProps<{ modelValue: boolean; label?: string }>();
const emit = defineEmits<{ "update:modelValue": [boolean] }>();
</script>

<template>
  <button
    type="button"
    role="switch"
    :aria-checked="modelValue"
    :aria-label="label ?? 'toggle'"
    @click="emit('update:modelValue', !modelValue)"
    class="relative w-10 h-[22px] rounded-full transition-colors duration-200 shrink-0"
    :class="modelValue ? 'bg-primary' : 'bg-white/12'"
  >
    <span
      class="absolute top-[3px] left-[3px] w-4 h-4 rounded-full bg-white transition-transform duration-200 shadow"
      :style="{ transform: modelValue ? 'translateX(18px)' : 'translateX(0)' }"
    />
  </button>
</template>
