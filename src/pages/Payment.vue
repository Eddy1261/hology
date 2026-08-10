<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from "vue";
import { useRoute, useRouter } from "vue-router";
import { state, PLANS, billing } from "../lib/store";
import ACButton from "../components/ui/ACButton.vue";
import Icon from "../components/ui/Icon.vue";
import { paymentReturnPath } from "../lib/payment-return";

const router = useRouter();
const route = useRoute();
const returnPath = computed(() => {
  return paymentReturnPath(route.query.from);
});
const plan = computed(() => PLANS.find((p) => p.id === state.selectedPlan) ?? PLANS[1]);

const status = ref<"checking" | "idle" | "loading" | "processing" | "success" | "error">("checking");
const error = ref("");

let pollTimer: number | undefined;

async function refreshAndCheck(): Promise<boolean> {
  await billing.refreshStatus();
  return state.subscription.status === "active";
}

async function checkExistingSubscription() {
  status.value = "checking";
  try {
    if (await refreshAndCheck()) {
      status.value = "success";
      setTimeout(() => router.push("/app"), 1100);
      return;
    }
    status.value = "idle";
  } catch {
    status.value = "error";
    error.value = "We couldn't verify your subscription. Please try again.";
  }
}

async function subscribe() {
  if (status.value === "checking" || status.value === "loading" || status.value === "processing") return;
  // Block re-purchase if subscription already exists. NOTE: state.subscription
  // .status is the UI status, where billing.ts STATUS_UI already maps the raw
  // "past_due" onto "expired" — so comparing against "past_due" here was dead
  // code that never matched (and was a type error).
  if (state.subscription.status === "expired") {
    error.value = "You already have a subscription. Contact support to renew.";
    return;
  }
  error.value = "";
  status.value = "loading";
  try {
    await billing.subscribe(plan.value.id);
    status.value = "processing";
    // Payment completes via Xendit webhook — poll status while the user is
    // in the browser, and after they return (they may have closed it unpaid).
    pollTimer = window.setInterval(async () => {
      if (await refreshAndCheck()) {
        window.clearInterval(pollTimer);
        status.value = "success";
        setTimeout(() => router.push("/app"), 1100);
      }
    }, 3000);
  } catch (e) {
    status.value = "error";
    error.value = e instanceof Error ? e.message : "Payment didn't go through. Please try again.";
  }
}

function retry() {
  checkExistingSubscription();
}

onMounted(() => {
  // Verify the authoritative billing state before rendering a checkout CTA.
  // An already-active subscriber should never be encouraged to purchase again.
  void checkExistingSubscription();
});

onUnmounted(() => {
  if (pollTimer) window.clearInterval(pollTimer);
});
</script>

<template>
  <div class="page-enter flex flex-col h-full px-6 py-8">
    <button @click="router.push(returnPath)" class="text-faint hover:text-fg self-start" aria-label="Back">
      <Icon name="back" :size="20" />
    </button>

    <div v-if="status === 'checking'" class="flex-1 flex flex-col items-center justify-center text-center">
      <Icon name="refresh" :size="20" class="text-primary-hi spin" />
      <p class="text-[13px] text-muted mt-3">Checking your subscription…</p>
    </div>

    <div v-else-if="status === 'error'" class="flex-1 flex flex-col items-center justify-center text-center">
      <h1 class="text-[20px] font-bold">Subscription status unavailable</h1>
      <p class="text-[13px] text-muted mt-1.5">We couldn't verify your current plan, so checkout is not shown.</p>
      <ACButton class="mt-4" size="sm" @click="retry">Retry</ACButton>
    </div>

    <div v-else-if="status !== 'success'" class="flex-1 flex flex-col justify-center">
      <h1 class="text-[22px] font-bold">Complete your subscription</h1>
      <p class="text-[13px] text-muted mt-1">Secure checkout opens in your browser — QRIS and card options included.</p>

      <div class="flex items-center justify-between rounded-[12px] border border-border bg-card px-4 py-3 mt-5">
        <span class="font-semibold uppercase tracking-wide text-[14px]">{{ plan.name }}</span>
        <span class="font-bold">${{ plan.price }}<span class="text-[11px] text-muted font-normal">/{{ plan.period }}</span></span>
      </div>

      <div class="flex flex-col gap-3.5 mt-5">
        <div>
          <span class="block text-[12px] font-medium text-muted mb-1.5">Email</span>
          <p class="text-[13px] text-fg font-mono">{{ state.user?.email ?? "you@email.com" }}</p>
        </div>
      </div>

      <div v-if="status === 'processing'" class="rounded-[12px] border border-border bg-card p-4 mt-4">
        <div class="flex items-center gap-2.5">
          <Icon name="refresh" :size="16" class="text-primary-hi spin" />
          <p class="text-[13px] text-fg font-medium">Waiting for payment…</p>
        </div>
        <p class="text-[12px] text-muted mt-1.5">
          Complete the checkout in your browser. This page updates automatically — you can close the tab once paid.
        </p>
      </div>

      <ACButton v-if="status !== 'processing'" class="mt-5" block :loading="status === 'loading'" @click="subscribe">
        Subscribe
      </ACButton>
      <p v-if="error" class="text-[12px] text-danger mt-2 text-center">{{ error }}</p>
      <button class="text-[12px] text-faint hover:text-muted mt-3 self-center" @click="router.push(returnPath)">
        Cancel
      </button>
    </div>

    <!-- success -->
    <div v-else class="flex-1 flex flex-col items-center justify-center text-center">
      <div class="w-16 h-16 rounded-full bg-ok/15 border border-ok/40 flex items-center justify-center text-ok mb-4">
        <Icon name="check" :size="30" />
      </div>
      <h1 class="text-[20px] font-bold">You're already subscribed</h1>
      <p class="text-[13px] text-muted mt-1.5">Your active plan is already enabled. Returning you to AI CONNECT…</p>
    </div>
  </div>
</template>
