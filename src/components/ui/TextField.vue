<script setup lang="ts">
defineProps<{
  modelValue: string;
  label?: string;
  type?: string;
  placeholder?: string;
  error?: string;
}>();
defineEmits<{ "update:modelValue": [string] }>();
</script>

<template>
  <label class="block">
    <span v-if="label" class="block text-[12px] font-medium text-muted mb-1.5">{{ label }}</span>
    <input
      :type="type ?? 'text'"
      :value="modelValue"
      :placeholder="placeholder"
      @input="$emit('update:modelValue', ($event.target as HTMLInputElement).value)"
      class="w-full h-10 px-3 rounded-[10px] bg-card border text-[13px] outline-none transition-colors text-fg placeholder:text-faint"
      :class="error ? 'border-danger/60' : 'border-border focus:border-primary/60'"
    />
    <span v-if="error" class="block text-[11px] text-danger mt-1">{{ error }}</span>
  </label>
</template>
