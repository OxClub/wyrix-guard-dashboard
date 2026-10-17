import { adminClient, authenticate, audit } from "../_shared/auth.ts";
import { handler, HttpError, readJson, str } from "../_shared/http.ts";
import { sha256Hex } from "../_shared/encoding.ts";
import { acknowledgePurchase, queryPlaySubscription } from "../_shared/play.ts";

Deno.serve(handler(async (req) => {
  const { user } = await authenticate(req);
  const body = await readJson(req);
  const token = str(body.purchase_token, "invalid_purchase_token", 4096);
  const allowed = (Deno.env.get("PLAY_PRODUCT_IDS") ?? "wyrix_premium_monthly,wyrix_premium_yearly").split(",");

  let sub;
  try { sub = await queryPlaySubscription(token); }
  catch (e) {
    const m = e instanceof Error ? e.message : "";
    if (m === "play_not_configured") throw new HttpError(503, "billing_not_configured");
    throw new HttpError(502, "play_verification_failed");
  }
  if (!sub.productId || !allowed.includes(sub.productId)) throw new HttpError(400, "unknown_product");
  // Bind the purchase to this account: the app sets obfuscatedAccountId = sha256(user.id).
  if (sub.obfuscatedAccountId !== await sha256Hex(user.id)) throw new HttpError(403, "purchase_account_mismatch");

  const db = adminClient();
  const { data: existing } = await db.from("subscriptions").select("owner_id").eq("purchase_token", token).maybeSingle();
  if (existing && existing.owner_id !== user.id) throw new HttpError(409, "purchase_already_claimed");

  if (sub.ackPending && sub.status !== "inactive") {
    try { await acknowledgePurchase(sub.productId, token); } catch (e) { console.error("ack_failed", e instanceof Error ? e.message : e); }
  }
  const premium = sub.status !== "inactive";
  const { error } = await db.from("subscriptions").upsert({
    owner_id: user.id, tier: premium ? "premium" : "free", status: sub.status, product_id: sub.productId,
    purchase_token: token, expires_at: sub.expiresAt, verified_at: new Date().toISOString(), updated_at: new Date().toISOString(),
  }, { onConflict: "owner_id" });
  if (error) throw new HttpError(500, "entitlement_write_failed");
  await audit(user.id, "SUBSCRIPTION_VERIFIED", null, { status: sub.status, product: sub.productId });
  return { tier: premium ? "premium" : "free", status: sub.status, expires_at: sub.expiresAt };
}));
