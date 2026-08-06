<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { auth } from "../lib/store";
import { postAuthTarget, takePendingAuthRoute } from "../lib/auth-redirect";
import { classifyGoogleError } from "../lib/google-oauth-errors";
import ACButton from "../components/ui/ACButton.vue";
import TextField from "../components/ui/TextField.vue";
import Icon from "../components/ui/Icon.vue";

const router = useRouter();
const step = ref<1 | 2>(1);
const email = ref("");
const code = ref("");
const loading = ref(false);
const error = ref("");

const emailValid = computed(() => email.value.includes("@"));
const codeValid = computed(() => code.value.trim().length >= 4);

async function sendCode() {
  if (!emailValid.value || loading.value) return;
  error.value = "";
  loading.value = true;
  try {
    await auth.requestCode(email.value);
    step.value = 2;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "We couldn't send the verification code. Check your email and try again.";
  } finally {
    loading.value = false;
  }
}

async function verify() {
  if (!codeValid.value || loading.value) return;
  error.value = "";
  loading.value = true;
  try {
    const isNewUser = await auth.verifyCode(email.value, code.value.trim());
    if (isNewUser) {
      // AUTH-005: new users must pick a plan (Free included) before any
      // checkout page — reuse Signup's plan-selection step rather than
      // dropping straight into Payment.vue with a silently-defaulted plan.
      router.push({ path: "/signup", query: { from: "/login" } });
    } else {
      router.push(postAuthTarget(takePendingAuthRoute()));
    }
  } catch (e) {
    error.value = e instanceof Error ? e.message : "That code doesn't look right. Please check and try again.";
  } finally {
    loading.value = false;
  }
}

async function google() {
  if (loading.value) return;
  error.value = "";
  loading.value = true;
  try {
    const isNewUser = await auth.googleLogin();
    if (isNewUser) {
      // AUTH-005: new user via Google OAuth — go to Signup's plan-selection
      // step (same as email signup) instead of Payment.vue directly, so
      // Free is reachable and no plan is silently assumed.
      router.push({ path: "/signup", query: { from: "/login" } });
    } else {
      router.push(postAuthTarget(takePendingAuthRoute()));
    }
  } catch (e) {
    error.value = classifyGoogleError(e);
  } finally {
    loading.value = false;
  }
}
</script>

<template>
  <div class="page-enter flex flex-col h-full px-6 py-8">
    <div class="flex items-center gap-3">
      <button
        @click="step === 2 ? (step = 1) : router.push('/')"
        class="text-faint hover:text-fg"
        aria-label="Back"
      >
        <Icon name="back" :size="20" />
      </button>
      <div class="flex gap-1.5">
        <span class="h-1 w-8 rounded-full" :class="step >= 1 ? 'bg-primary' : 'bg-white/12'" />
        <span class="h-1 w-8 rounded-full" :class="step >= 2 ? 'bg-primary' : 'bg-white/12'" />
      </div>
    </div>

    <div class="flex-1 flex flex-col justify-center">
      <template v-if="step === 1">
        <h1 class="text-[24px] font-bold">Welcome back.</h1>
        <p class="text-[13px] text-muted mt-1">We'll email you a one-time sign-in code.</p>

        <form class="flex flex-col gap-3.5 mt-7" @submit.prevent="sendCode">
          <TextField v-model="email" label="Email" type="email" placeholder="you@email.com" :error="error" />
          <ACButton block type="submit" :loading="loading" :disabled="!emailValid">Send code</ACButton>
        </form>

        <div class="flex items-center gap-3 my-5">
          <span class="h-px flex-1 bg-white/12" />
          <span class="text-[11px] text-faint">OR</span>
          <span class="h-px flex-1 bg-white/12" />
        </div>

        <ACButton block variant="outline" :loading="loading" @click="google">
          Continue with Google
        </ACButton>
      </template>

      <template v-else>
        <h1 class="text-[24px] font-bold">Check your email.</h1>
        <p class="text-[13px] text-muted mt-1">Enter the code sent to <span class="text-fg">{{ email }}</span>.</p>
        <p class="text-[12px] text-faint mt-1">The verification code expires in 10 minutes.</p>

        <form class="flex flex-col gap-3.5 mt-7" @submit.prevent="verify">
          <TextField v-model="code" label="Verification code" type="text" placeholder="••••••" :error="error" />
          <ACButton block type="submit" :loading="loading" :disabled="!codeValid">Sign in</ACButton>
          <button
            type="button"
            class="text-[12px] text-primary-hi hover:underline self-center mt-1"
            @click="step = 1"
          >
            Change email
          </button>
        </form>
      </template>
    </div>

    <p class="text-[13px] text-muted text-center">
      Don't have an account?
      <button @click="router.push('/signup')" class="text-primary-hi font-medium hover:underline">
        Create account
      </button>
    </p>
  </div>
</template>
