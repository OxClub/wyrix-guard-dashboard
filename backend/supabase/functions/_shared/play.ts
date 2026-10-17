import { googleAccessToken } from "./google.ts";

const SCOPE = "https://www.googleapis.com/auth/androidpublisher";
export interface PlaySub {
  status: "active" | "grace" | "inactive";
  expiresAt: string | null;
  productId: string | null;
  obfuscatedAccountId: string | null;
  ackPending: boolean;
}

function cfg() {
  const sa = Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON");
  const pkg = Deno.env.get("PLAY_PACKAGE_NAME") ?? "com.wyrix.guard";
  if (!sa) throw new Error("play_not_configured");
  return { sa, pkg };
}

export async function queryPlaySubscription(purchaseToken: string): Promise<PlaySub> {
  const { sa, pkg } = cfg();
  const at = await googleAccessToken(sa, SCOPE);
  const res = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases/subscriptionsv2/tokens/${encodeURIComponent(purchaseToken)}`,
    { headers: { authorization: `Bearer ${at}` } });
  if (!res.ok) throw new Error(`play_query_${res.status}`);
  const j = await res.json();
  const li = (j.lineItems ?? [])[0] ?? {};
  const expiry: string | null = (j.lineItems ?? []).map((x: { expiryTime?: string }) => x.expiryTime)
    .filter(Boolean).sort().pop() ?? null;
  const state: string = j.subscriptionState ?? "";
  let status: PlaySub["status"] = "inactive";
  if (state === "SUBSCRIPTION_STATE_ACTIVE" || state === "SUBSCRIPTION_STATE_CANCELED") status = "active";
  else if (state === "SUBSCRIPTION_STATE_IN_GRACE_PERIOD") status = "grace";
  if (status !== "inactive" && (!expiry || new Date(expiry) <= new Date())) status = "inactive";
  return {
    status,
    expiresAt: expiry,
    productId: li.productId ?? null,
    obfuscatedAccountId: j.externalAccountIdentifiers?.obfuscatedExternalAccountId ?? null,
    ackPending: j.acknowledgementState === "ACKNOWLEDGEMENT_STATE_PENDING",
  };
}

export async function acknowledgePurchase(productId: string, purchaseToken: string): Promise<void> {
  const { sa, pkg } = cfg();
  const at = await googleAccessToken(sa, SCOPE);
  const res = await fetch(
    `https://androidpublisher.googleapis.com/androidpublisher/v3/applications/${pkg}/purchases/subscriptions/${encodeURIComponent(productId)}/tokens/${encodeURIComponent(purchaseToken)}:acknowledge`,
    { method: "POST", headers: { authorization: `Bearer ${at}`, "content-type": "application/json" }, body: "{}" });
  if (!res.ok) throw new Error(`play_ack_${res.status}`);
}
