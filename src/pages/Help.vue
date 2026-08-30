<script setup lang="ts">
import { ref } from "vue";
import { state, toast } from "../lib/store";
import Icon from "../components/ui/Icon.vue";
import ACButton from "../components/ui/ACButton.vue";
import AgentSetupCard from "../components/AgentSetupCard.vue";
import { openExternal } from "../lib/session-storage.ts";

const COMMUNITY_URL = "https://whatsapp.com/channel/0029Vb985LrJJhzTe3KlDv14";

const open = ref<number | null>(null);
const supportOpen = ref(false);

async function copyEmail() {
  try {
    await navigator.clipboard.writeText("anjayrendy303@gmail.com");
    toast("Email copied to clipboard");
    supportOpen.value = false;
  } catch {
    toast("Failed to copy", "error");
  }
}
</script>

<template>
  <div class="px-4.5 py-4 page-enter scroll-area overflow-y-auto flex-1 flex flex-col gap-4">
    <h1 class="text-[20px] font-bold text-fg">Help</h1>

    <!-- AI Agent Setup Card -->
    <AgentSetupCard />

    <h2 class="text-[12px] font-semibold tracking-[0.12em] text-muted uppercase mt-2 mb-1">
      Frequently Asked Questions
    </h2>
    <div class="flex flex-col gap-2">
      <div
        v-for="(f, i) in state.faq"
        :key="f.q"
        class="rounded-[12px] bg-card border border-border overflow-hidden shadow-xs"
      >
        <button
          @click="open === i ? (open = null) : (open = i)"
          class="w-full flex items-center gap-2 px-3.5 py-3 text-left transition-colors hover:bg-black/5 dark:hover:bg-white/5"
        >
          <Icon
            name="chevron"
            :size="15"
            class="text-primary shrink-0 transition-transform"
            :style="{ transform: open === i ? 'rotate(90deg)' : 'none' }"
          />
          <span class="text-[13px] font-medium text-fg">{{ f.q }}</span>
        </button>
        <div v-if="open === i" class="px-3.5 pb-3.5 pl-9">
          <p class="text-[12.5px] text-muted leading-relaxed">{{ f.a }}</p>
        </div>
      </div>
    </div>

    <div class="rounded-[14px] border border-border bg-card p-4 mt-2 text-center shadow-xs">
      <p class="text-[13px] font-semibold text-fg">Still need help?</p>
      <p class="text-[12px] text-muted mt-1 mb-3">Have questions or need assistance? Reach out to our support team.</p>
      <div class="flex items-center justify-center gap-3">
        <ACButton size="sm" variant="outline" @click="supportOpen = true">Contact Support</ACButton>
        <a :href="COMMUNITY_URL" @click.prevent="openExternal(COMMUNITY_URL)"
          class="px-4 py-2 rounded-xl text-[12.5px] font-medium border border-border bg-panel hover:bg-card-hover text-fg transition-colors cursor-pointer">
          Community
        </a>
      </div>
    </div>

    <!-- Support Email Bottom Sheet -->
    <Transition name="bs">
      <div v-if="supportOpen" class="absolute inset-0 z-[55] flex items-end" @click.self="supportOpen = false">
        <div class="absolute inset-0 bg-black/60 backdrop-blur-[2px]" @click="supportOpen = false" />
        <div class="relative w-full rounded-t-2xl bg-panel border-t border-border-strong p-5 pb-6">
          <div class="w-10 h-1 rounded-full bg-border-strong mx-auto mb-4" />
          <h3 class="text-[15px] font-semibold">Contact Support</h3>
          <p class="text-[12.5px] text-muted leading-relaxed mt-1.5">Copy the email below and send us a message.</p>
          <div class="mt-4 rounded-xl bg-card border border-border p-3 flex items-center justify-between">
            <span class="text-[13px] text-primary font-medium select-all">anjayrendy303@gmail.com</span>
            <button @click="copyEmail" class="text-[11px] text-primary-hi font-medium hover:underline shrink-0 ml-2">Copy</button>
          </div>
          <div class="flex gap-2 mt-5">
            <ACButton block variant="ghost" @click="supportOpen = false">Close</ACButton>
          </div>
        </div>
      </div>
    </Transition>
  </div>
</template>

<style scoped>
.bs-enter-active,
.bs-leave-active {
  transition: opacity 0.2s ease;
}
.bs-enter-active > div:last-child,
.bs-leave-active > div:last-child {
  transition: transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
}
.bs-enter-from,
.bs-leave-to {
  opacity: 0;
}
.bs-enter-from > div:last-child,
.bs-leave-to > div:last-child {
  transform: translateY(100%);
}
</style>
