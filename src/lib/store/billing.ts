// Billing: real checkout (Checkpoint D). Subscribe → billing-service
// checkout → Xendit hosted page in the SYSTEM browser (QRIS included there)
// → completion via webhook → poll status.

import { state } from "./state.ts";
import { PLANS } from "./state.ts";
import { billingStatus, billingCheckout } from "../billing-api.ts";
import { openExternal, sessionUserId } from "../session-storage.ts";

const STATUS_UI: Record<string, "active" | "expired" | "none"> = {
  active: "active",
  past_due: "expired",
  canceled: "none",
  none: "none",
};

export const billing = {
  /** Pull subscription status into state.subscription. Fails soft (offline). */
  async refreshStatus(): Promise<void> {
    const uid = await sessionUserId();
    console.info(`[billing:status] user_id=${uid ?? "none"}`);
    if (!uid) {
      // Signed out / local mode defaults to Free tier
      state.subscription = {
        plan: "Free",
        status: "none",
        renews: "—",
        daysRemaining: null,
        error: undefined,
      };
      return;
    }
    try {
      const s = await billingStatus(uid);
      const plan = PLANS.find((p) => p.id === s.plan_id);
      const end = s.current_period_end ? new Date(s.current_period_end) : null;
      const isZero = end && end.getFullYear() <= 1;
      const isPast = end && !isZero ? end.getTime() <= Date.now() : false;
      const uiStatus = (s.status === "active" && isPast) ? "expired" : (STATUS_UI[s.status] ?? "none");
      state.subscription = {
        plan: plan?.name ?? (s.plan_id ?? "Free"),
        status: uiStatus,
        renews: end ? end.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—",
        daysRemaining: end && s.status === "active" ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000)) : null,
        error: undefined,
      };
    } catch (e) {
      const msg = e instanceof Error ? e.message : "unknown error";
      console.warn(`[billing:status] failed user_id=${uid}`, msg);
      // Fail soft — keep any previously-known-good status — but record WHY, so
      // the UI can offer a retry instead of silently showing "unknown" forever.
      // A dead upstream (e.g. the proxy's billing hop refusing connections) used
      // to be indistinguishable here from "this user has no subscription".
      state.subscription = { ...state.subscription, error: msg };
    }
  },

  /** Subscribe: create the Xendit invoice and open it in the system browser.
   *  Returns the redirect URL (caller can re-open if the browser closed). */
  async subscribe(planId: string): Promise<string> {
    const uid = await sessionUserId();
    if (!uid) throw new Error("Please sign in to manage your subscription.");
    const url = await billingCheckout(uid, planId);
    await openExternal(url);
    return url;
  },
};
