import { adminClient, authenticate, audit, requireRecentAuth } from "../_shared/auth.ts";
import { handler, HttpError, readJson, uuid } from "../_shared/http.ts";

Deno.serve(handler(async (req) => {
  const { user, claims } = await authenticate(req);
  requireRecentAuth(claims, 600);
  const deviceId = uuid((await readJson(req)).device_id, "invalid_device_id");
  const db = adminClient();
  const { data: d } = await db.from("devices").select("id, owner_id, revoked_at").eq("id", deviceId).maybeSingle();
  if (!d || d.owner_id !== user.id) throw new HttpError(404, "device_not_found");
  if (d.revoked_at) return { ok: true, already: true };
  await db.from("devices").update({ revoked_at: new Date().toISOString(), fcm_token: null, lost_mode: false }).eq("id", deviceId);
  await db.from("remote_commands").update({ state: "expired" }).eq("device_id", deviceId).in("state", ["requested", "delivered"]);
  await audit(user.id, "DEVICE_REVOKED", deviceId);
  return { ok: true };
}));
