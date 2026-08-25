<script setup lang="ts">
import { ref, computed } from "vue";
import { toast } from "../lib/store";
import Icon from "./ui/Icon.vue";

export interface TutorialStep {
  title: string;
  description: string;
  command?: string;
  tip?: string;
}

const props = withDefaults(
  defineProps<{
    title?: string;
    steps: TutorialStep[];
    modelValue?: number; // 1-indexed currentStep
  }>(),
  {
    title: "Connect Tutorial",
    modelValue: 1,
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", step: number): void;
  (e: "finish"): void;
}>();

const internalStep = ref(props.modelValue);

const currentStep = computed({
  get: () => props.modelValue ?? internalStep.value,
  set: (val: number) => {
    internalStep.value = val;
    emit("update:modelValue", val);
  },
});

const totalSteps = computed(() => props.steps.length);

const currentStepData = computed<TutorialStep | undefined>(() => {
  const idx = Math.max(0, Math.min(currentStep.value - 1, totalSteps.value - 1));
  return props.steps[idx];
});

function goToStep(step: number) {
  if (step >= 1 && step <= totalSteps.value) {
    currentStep.value = step;
  }
}

function prevStep() {
  if (currentStep.value > 1) {
    currentStep.value -= 1;
  }
}

function nextStep() {
  if (currentStep.value < totalSteps.value) {
    currentStep.value += 1;
  } else {
    emit("finish");
    toast("Tutorial completed! Agent is ready to use.");
  }
}

async function copyCommand(text?: string) {
  if (!text) return;
  try {
    await navigator.clipboard.writeText(text);
    toast("Command copied to clipboard");
  } catch {
    toast("Failed to copy command");
  }
}
</script>

<template>
  <div class="rounded-[18px] bg-card border border-border p-4.5 w-full flex flex-col gap-4 shadow-sm transition-colors">
    <!-- Header -->
    <div>
      <h3 class="text-[15px] font-bold text-fg">{{ title }}</h3>
    </div>

    <!-- Step Bubble Indicator Row (Cohesive warm theme in Light & Dark Mode) -->
    <div class="flex items-center justify-between gap-2 px-0.5">
      <button
        v-for="stepNum in totalSteps"
        :key="stepNum"
        @click="goToStep(stepNum)"
        class="w-9 h-9 rounded-full flex items-center justify-center text-[13px] font-bold transition-all cursor-pointer select-none"
        :class="[
          stepNum === currentStep
            ? 'bg-primary text-white shadow-md ring-2 ring-primary/30 scale-105'
            : 'bg-panel text-muted hover:text-fg hover:bg-card-hover border border-border'
        ]"
      >
        {{ stepNum }}
      </button>
    </div>

    <!-- Step Content Details -->
    <div v-if="currentStepData" class="flex flex-col gap-2.5 pt-1">
      <div>
        <h4 class="text-[13.5px] font-bold text-fg">
          Step {{ currentStep }}: {{ currentStepData.title }}
        </h4>
        <p class="text-[12px] text-muted mt-1 leading-relaxed">
          {{ currentStepData.description }}
        </p>
      </div>

      <!-- Cohesive Terminal Box (Uses light panel in light mode, dark panel in dark mode) -->
      <div
        v-if="currentStepData.command"
        class="rounded-[14px] bg-panel border border-border p-3.5 flex flex-col gap-2 relative overflow-hidden mt-1 transition-colors"
      >
        <div class="flex items-center justify-between gap-2 border-b border-border/80 pb-2">
          <span class="text-[10.5px] font-semibold text-muted uppercase tracking-wider">Terminal / Command</span>
          <button
            @click="copyCommand(currentStepData.command)"
            class="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-card border border-border text-[11px] font-medium text-fg hover:bg-card-hover hover:border-border-strong transition-colors cursor-pointer shadow-xs"
          >
            <Icon name="terminal" :size="12" class="text-primary" />
            <span>Copy</span>
          </button>
        </div>
        <pre class="font-mono text-[12px] text-fg overflow-x-auto leading-relaxed pt-1 select-all whitespace-pre-wrap break-all font-medium">{{ currentStepData.command }}</pre>
      </div>

      <!-- Cohesive Tip Box -->
      <div
        v-if="currentStepData.tip"
        class="rounded-xl bg-primary-dim border border-primary/20 p-3 flex items-start gap-2.5 mt-1 transition-colors"
      >
        <Icon name="chevron" :size="14" class="shrink-0 mt-0.5 text-primary" />
        <p class="text-[11.5px] leading-relaxed text-fg">
          <span class="font-semibold text-primary">Tip: </span>{{ currentStepData.tip }}
        </p>
      </div>
    </div>

    <!-- Footer Action Buttons -->
    <div class="flex items-center justify-between pt-3 border-t border-border mt-1">
      <button
        v-if="currentStep > 1"
        @click="prevStep"
        class="px-4 py-2 rounded-xl text-[12.5px] font-medium border border-border bg-panel hover:bg-card-hover text-fg transition-colors cursor-pointer"
      >
        Previous
      </button>
      <div v-else />

      <button
        @click="nextStep"
        class="px-4 py-2 rounded-xl text-[12.5px] font-semibold bg-primary text-white hover:bg-primary-hi transition-all shadow-xs cursor-pointer active:scale-95"
      >
        {{ currentStep === totalSteps ? 'Done' : 'Next Step →' }}
      </button>
    </div>
  </div>
</template>
