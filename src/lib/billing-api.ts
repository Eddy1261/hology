// Billing-service client (cloud/billing-service). Checkout returns a Xendit
// hosted-checkout redirect URL — the desktop shell opens it in the SYSTEM
// browser (no embedded webview; QRIS is handled by Xendit's page). Payment
// completion arrives via the Xendit webhook; the UI polls /billing/status.

import { billingServiceUrl } from "./config.ts";
import { ensureFreshAccessToken } from "./store/auth.ts";

export interface BillingStatus {
  plan_id: string | null;
  status: "active" | "past_due" | "canceled" | "none";
  current_period_end: string | null;
}

async function billingHeaders(): Promise<Record<string, string>> {
  const token = await ensureFreshAccessToken();
  if (!token) throw new Error("Please sign in to view your subscription.");
  return { Authorization: `Bearer ${token}` };
}

export async function billingCheckout(
  userId: string,
  planId: string,
): Promise<string> {
  const headers = await billingHeaders();
  headers["Content-Type"] = "application/json";
  const res = await fetch(`${billingServiceUrl}/billing/checkout`, {
    method: "POST",
    headers,
    body: JSON.stringify({ plan_id: planId }),
  });
  if (res.status === 401) {
    const fresh = await ensureFreshAccessToken();
    if (fresh) {
      headers["Authorization"] = `Bearer ${fresh}`;
      const retry = await fetch(`${billingServiceUrl}/billing/checkout`, {
        method: "POST",
        headers,
        body: JSON.stringify({ plan_id: planId }),
      });
      if (!retry.ok) throw new Error(`billing checkout ${retry.status}`);
      return ((await retry.json()) as { redirect_url: string }).redirect_url;
    }
  }
  if (!res.ok) throw new Error(`billing checkout ${res.status}`);
  const j = (await res.json()) as { redirect_url: string };
  return j.redirect_url;
}

export async function billingStatus(userId: string): Promise<BillingStatus> {
  const headers = await billingHeaders();
  const url = `${billingServiceUrl}/billing/status/${encodeURIComponent(userId)}`;
  const res = await fetch(url, { headers });
  console.info(`[billing:request] GET ${url} status=${res.status}`);
  if (res.status === 401) {
    const fresh = await ensureFreshAccessToken();
    if (fresh) {
      headers["Authorization"] = `Bearer ***`;
      const retry = await fetch(url, { headers });
      if (!retry.ok) throw new Error(`billing status ${retry.status}`);
      const body = (await retry.json()) as BillingStatus;
      console.info(`[billing:response] plan_id=${body.plan_id ?? "none"} status=${body.status} current_period_end=${body.current_period_end ?? "none"}`);
      return body;
    }
  }
  if (!res.ok) throw new Error(`billing status ${res.status}`);
  const body = (await res.json()) as BillingStatus;
  console.info(`[billing:response] plan_id=${body.plan_id ?? "none"} status=${body.status} current_period_end=${body.current_period_end ?? "none"}`);
  return body;
}
