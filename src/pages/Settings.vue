<script setup lang="ts">
import { ref } from "vue";
import { useRouter } from "vue-router";
import { state, auth, billing, toast } from "../lib/store";
import { theme, setTheme } from "../lib/theme";
import { notifPref, setNotifPref } from "../lib/notifications";
import Icon from "../components/ui/Icon.vue";
import ACButton from "../components/ui/ACButton.vue";
import Toggle from "../components/ui/Toggle.vue";
import ConfirmDialog from "../components/ui/ConfirmDialog.vue";

const router = useRouter();
// P5R: shared notification preference (same store as the footer control).
const notifications = ref(notifPref());
const confirmSignOut = ref(false);
const expired = () => state.subscription.status === "expired";
// The status check failed (upstream/network), as opposed to the user genuinely
// having no subscription. Both used to render as the same "unknown" card.
const statusUnavailable = () => !!state.subscription.error;
const retrying = ref(false);

async function retryStatus() {
  retrying.value = true;
  try {
    await billing.refreshStatus();
    if (state.subscription.error) toast("Still can't reach the billing service.");
  } finally {
    retrying.value = false;
  }
}

function onNotifPref(v: boolean) {
  notifications.value = v;
  setNotifPref(v);
}

function doSignOut() {
  confirmSignOut.value = false;
  auth.logout();
  router.push("/");
}
</script>

<template>
  <div class="px-3.5 py-4 flex flex-col gap-5">
    <h1 class="text-[19px] font-bold">Settings</h1>

    <!-- Account -->
    <section>
      <h2 class="text-[11px] font-semibold tracking-[0.12em] text-faint uppercase mb-2">Account</h2>
      <div class="rounded-[14px] bg-card border border-border p-4">
        <p class="text-[11px] text-faint uppercase tracking-wide">Account</p>
        <p class="text-[13.5px] font-mono mt-0.5">{{ state.user?.email ?? "Signed out" }}</p>
        <!-- P5R: no finalized account-management feature — show the real
             account info the frontend has; never fabricate controls. -->
      </div>
    </section>

    <!-- Email connection -->
    <section>
      <h2 class="text-[11px] font-semibold tracking-[0.12em] text-faint uppercase mb-2">Email Connection</h2>
      <div class="rounded-[14px] bg-card border border-border p-4 flex items-center justify-between">
        <div>
          <p class="text-[13px] font-medium">Connected Email</p>
          <span class="flex items-center gap-1.5 text-[12px] text-ok mt-1">
            <span class="w-1.5 h-1.5 rounded-full bg-ok" /> Connected
          </span>
        </div>
        <ACButton size="sm" variant="ghost" @click="toast('Connection managed')">Manage</ACButton>
      </div>
    </section>

    <!-- Subscription -->
    <section>
      <h2 class="text-[11px] font-semibold tracking-[0.12em] text-faint uppercase mb-2">Subscription</h2>
      <div
        class="rounded-[14px] border p-4"
        :class="expired() ? 'border-danger/40 bg-danger/5' : state.subscription.status === 'unknown' ? 'border-border bg-card' : 'border-primary/30 bg-primary-dim/40'"
      >
        <template v-if="state.subscription.status === 'unknown'">
          <p class="text-[13px] text-muted">We couldn't check your subscription status.</p>
          <p v-if="statusUnavailable()" class="text-[12px] text-muted mt-1">
            The billing service didn't respond. Your plan is unchanged — this is a
            connection problem, not a cancellation.
          </p>
          <p v-else class="text-[12px] text-muted mt-1">Check your internet connection, or view plans to subscribe.</p>
          <div class="flex items-center gap-2 mt-3.5">
            <ACButton v-if="statusUnavailable()" size="sm" :disabled="retrying" @click="retryStatus">
              {{ retrying ? "Checking…" : "Try Again" }}
            </ACButton>
            <ACButton
              size="sm"
              :variant="statusUnavailable() ? 'outline' : 'primary'"
              @click="router.push({ path: '/payment', query: { from: '/app/settings' } })"
            >View Plans</ACButton>
          </div>
        </template>
        <template v-else>
          <div class="flex items-center justify-between">
            <span class="font-bold text-[15px] uppercase tracking-wide">{{ state.subscription.plan }} Plan</span>
            <span
              class="flex items-center gap-1.5 text-[12px] font-medium"
              :style="{ color: expired() ? 'var(--color-danger)' : 'var(--color-ok)' }"
            >
              <span class="w-1.5 h-1.5 rounded-full" :style="{ background: expired() ? 'var(--color-danger)' : 'var(--color-ok)' }" />
              {{ expired() ? "Expired" : "Active" }}
            </span>
          </div>
          <template v-if="state.subscription.status === 'active' && !expired()">
            <div class="flex items-center justify-between text-[12px] text-muted mt-3">
              <span>Renews {{ state.subscription.renews }}</span>
              <span class="text-fg font-medium">{{ state.subscription.daysRemaining }} days left</span>
            </div>
            <div class="h-1.5 rounded-full bg-white/10 mt-2 overflow-hidden">
              <div
                class="h-full bg-primary rounded-full"
                :style="{ width: ((state.subscription.daysRemaining ?? 0) / 30) * 100 + '%' }"
              />
            </div>
          </template>
          <template v-else-if="state.subscription.status === 'none' || state.subscription.plan.toLowerCase() === 'free'">
            <p class="text-[12px] text-muted mt-2">
              Free plan active. Upgrade to Pro for unlimited connectors and priority updates.
            </p>
          </template>
          <ACButton
            class="mt-3.5"
            size="sm"
            :variant="state.subscription.status === 'active' && !expired() ? 'outline' : 'primary'"
            @click="router.push({ path: '/payment', query: { from: '/app/settings' } })"
          >
            {{ expired() ? "Renew Plan" : state.subscription.status === 'active' ? "Manage Subscription" : "Upgrade to Pro" }}
          </ACButton>
        </template>
      </div>
    </section>

    <!-- Application -->
    <section>
      <h2 class="text-[11px] font-semibold tracking-[0.12em] text-faint uppercase mb-2">Application</h2>
      <div class="rounded-[14px] bg-card border border-border divide-y divide-border">
        <div class="flex items-center justify-between px-4 py-3">
          <span class="flex items-center gap-2.5 text-[13px]"><Icon name="bell" :size="16" class="text-muted" /> Notifications</span>
          <Toggle
            :model-value="notifications"
            label="Operational notifications"
            @update:model-value="onNotifPref"
          />
        </div>
        <!-- P5R: full theme control — same single theme state as the footer
             button (lib/theme.ts). Dark ↔ Light, persisted, never touches
             connectivity. -->
        <div class="flex items-center justify-between px-4 py-3">
          <span class="flex items-center gap-2.5 text-[13px]"><Icon name="moon" :size="16" class="text-muted" /> Appearance</span>
          <div class="flex gap-1.5" role="group" aria-label="Theme">
            <button
              class="h-7 px-3 rounded-full text-[12px] font-medium border transition-colors"
              :class="theme.mode === 'dark' ? 'border-primary/60 bg-primary-dim text-primary-hi' : 'border-border text-muted hover:text-fg'"
              :aria-pressed="theme.mode === 'dark'"
              @click="setTheme('dark')"
            >
              Dark
            </button>
            <button
              class="h-7 px-3 rounded-full text-[12px] font-medium border transition-colors"
              :class="theme.mode === 'light' ? 'border-primary/60 bg-primary-dim text-primary-hi' : 'border-border text-muted hover:text-fg'"
              :aria-pressed="theme.mode === 'light'"
              @click="setTheme('light')"
            >
              Light
            </button>
          </div>
        </div>
        <div class="flex items-center justify-between px-4 py-3">
          <span class="flex items-center gap-2.5 text-[13px]"><Icon name="help" :size="16" class="text-muted" /> About AI CONNECT</span>
          <span class="text-[12px] text-faint">v1.0.0</span>
        </div>
      </div>
    </section>

    <ACButton block variant="danger" @click="confirmSignOut = true"><Icon name="back" :size="15" /> Sign Out</ACButton>

    <ConfirmDialog
      :open="confirmSignOut"
      title="Sign out?"
      body="You will be signed out of this device. Your projects and connectors stay on this machine."
      confirm-label="Sign out"
      danger
      @confirm="doSignOut"
      @cancel="confirmSignOut = false"
    />
    <div class="h-2" />
  </div>
</template>
