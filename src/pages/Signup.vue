<script setup lang="ts">
import { ref, computed } from "vue";
import { useRouter } from "vue-router";
import { auth, state, PLANS, isAuthed } from "../lib/store";
import { postAuthTarget, takePendingAuthRoute } from "../lib/auth-redirect";
import ACButton from "../components/ui/ACButton.vue";
import TextField from "../components/ui/TextField.vue";
import Icon from "../components/ui/Icon.vue";

const router = useRouter();
// AUTH-005: a session already exists when Login.vue redirects a brand-new
// user here (email-code or Google) — skip straight to plan selection rather
// than asking an already-authenticated user to re-enter email/code.
const step = ref<1 | 2 | 3>(isAuthed.value ? 3 : 1);
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
    await auth.verifyCode(email.value, code.value.trim());
    // First-use onboarding flag is set by the BACKEND (is_new_user) in
    // establishSession — not here, so existing accounts never get it.
    step.value = 3;
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
    await auth.googleLogin();
    // First-use onboarding flag comes from the backend is_new_user in
    // establishSession — a Google login of an EXISTING account must not
    // trigger the tutorial.
    step.value = 3;
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Google sign-up didn't work. Please try again or use email instead.";
  } finally {
    loading.value = false;
  }
}

function choosePlan(id: string) {
  state.selectedPlan = id;
  if (id === "free") {
    router.push(postAuthTarget(takePendingAuthRoute()));
  } else {
    router.push({ path: "/payment", query: { from: "/signup" } });
  }
}
</script>

<template>
  <div class="page-enter flex flex-col h-full px-6 py-8">
    <div class="flex items-center gap-3">
      <button
        @click="step > 1 ? step-- : router.push('/')"
        class="text-faint hover:text-fg"
        aria-label="Back"
      >
        <Icon name="back" :size="20" />
      </button>
      <div class="flex gap-1.5">
        <span
          v-for="s in 3"
          :key="s"
          class="h-1 w-6 rounded-full"
          :class="step >= s ? 'bg-primary' : 'bg-white/12'"
        />
      </div>
    </div>

    <!-- Step 1: email -->
    <div v-if="step === 1" class="flex-1 flex flex-col justify-center">
      <h1 class="text-[23px] font-bold leading-tight">Create your<br />AI CONNECT account</h1>
      <form class="flex flex-col gap-3.5 mt-6" @submit.prevent="sendCode">
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
    </div>

    <!-- Step 2: code -->
    <div v-else-if="step === 2" class="flex-1 flex flex-col justify-center">
      <h1 class="text-[23px] font-bold">Check your email.</h1>
      <p class="text-[13px] text-muted mt-1">
        Enter the code sent to <span class="text-fg">{{ email }}</span>.
      </p>
      <form class="flex flex-col gap-3.5 mt-6" @submit.prevent="verify">
        <TextField v-model="code" label="Verification code" type="text" placeholder="••••••" :error="error" />
        <ACButton block type="submit" :loading="loading" :disabled="!codeValid">Verify</ACButton>
        <button type="button" class="text-[12px] text-primary-hi hover:underline self-center mt-1" @click="step = 1">
          Change email
        </button>
      </form>
    </div>

    <!-- Step 3: plan -->
    <div v-else class="flex-1 flex flex-col justify-center">
      <h1 class="text-[23px] font-bold">Choose your plan</h1>
      <p class="text-[13px] text-muted mt-1">Change or cancel anytime.</p>
      <div class="flex flex-col gap-3 mt-5">
        <div
          v-for="p in PLANS"
          :key="p.id"
          @click="state.selectedPlan = p.id"
          class="rounded-[14px] border p-4 cursor-pointer transition-colors"
          :class="state.selectedPlan === p.id ? 'border-primary/70 bg-primary-dim' : 'border-border bg-card'"
        >
          <div class="flex items-center justify-between">
            <div class="flex items-center gap-2">
              <h3 class="font-bold text-[15px] uppercase tracking-wide">{{ p.name }}</h3>
              <span v-if="p.highlight" class="text-[10px] font-semibold bg-primary text-white rounded-full px-2 py-0.5">
                Popular
              </span>
            </div>
            <p class="font-bold text-[15px]">
              ${{ p.price }}<span class="text-[11px] text-muted font-normal">/{{ p.period }}</span>
            </p>
          </div>
          <ul class="mt-2.5 flex flex-col gap-1.5">
            <li v-for="f in p.features" :key="f" class="flex items-center gap-2 text-[12px] text-muted">
              <Icon name="check" :size="13" class="text-primary-hi shrink-0" /> {{ f }}
            </li>
          </ul>
        </div>
      </div>
      <ACButton class="mt-5" block @click="choosePlan(state.selectedPlan!)">
        {{ state.selectedPlan === "free" ? "Continue with Free" : "Choose " + PLANS.find((p) => p.id === state.selectedPlan)?.name }}
      </ACButton>
    </div>

    <p v-if="step === 1" class="text-[13px] text-muted text-center">
      Already have an account?
      <button @click="router.push('/login')" class="text-primary-hi font-medium hover:underline">
        Sign in
      </button>
    </p>
  </div>
</template>
