import { adminClient } from "../_shared/auth.ts";
import { handler, HttpError } from "../_shared/http.ts";
import { timingSafeEqual } from "../_shared/encoding.ts";
import { queryPlaySubscription } from "../_shared/play.ts";

/** Invoked on a schedule (GitHub Actions cron) with x-maintenance-secret. */
Deno.serve(handler(async (req) => {
  const secret = Deno.env.get("MAINTENANCE_SECRET") ?? "";
  const given = req.headers.get("x-maintenance-secret") ?? "";
  if (!secret || !timingSafeEqual(secret, given)) throw new HttpError(401, "unauthorized");
  const db = adminClient();
  const report: Record<string, unknown> = {};

  report.commands_expired = (await db.rpc("expire_stale_commands")).data;
  report.locations_purged = (await db.rpc("purge_expired_locations")).data;

  // Expired evidence: delete files, then rows.
  const { data: ev } = await db.from("intruder_evidence").select("id, storage_path").lt("retain_until", new Date().toISOString()).limit(500);
  if (ev && ev.length) {
    await db.storage.from("evidence").remove(ev.map((e) => e.storage_path));
    await db.from("intruder_evidence").delete().in("id", ev.map((e) => e.id));
  }
  report.evidence_purged = ev?.length ?? 0;

  // Re-verify subscriptions that expire within a day (renewals, cancellations, refunds).
  let refreshed = 0;
  if (Deno.env.get("GOOGLE_PLAY_SERVICE_ACCOUNT_JSON")) {
    const horizon = new Date(Date.now() + 24 * 3600_000).toISOString();
    const { data: subs } = await db.from("subscriptions").select("owner_id, purchase_token").eq("tier", "premium").lt("expires_at", horizon).limit(200);
    for (const s of subs ?? []) {
      try {
        const p = await queryPlaySubscription(s.purchase_token);
        await db.from("subscriptions").update({
          status: p.status, tier: p.status === "inactive" ? "free" : "premium",
          expires_at: p.expiresAt, verified_at: new Date().toISOString(), updated_at: new Date().toISOString(),
        }).eq("owner_id", s.owner_id);
        refreshed++;
      } catch (e) { console.error("reverify_failed", e instanceof Error ? e.message : e); }
    }
  }
  report.subscriptions_refreshed = refreshed;
  return report;
}));
