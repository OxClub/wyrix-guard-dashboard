import { adminClient } from "../_shared/auth.ts";
import { handler, HttpError, readJson, str } from "../_shared/http.ts";
import { sha256Hex } from "../_shared/encoding.ts";

/** Returns last confirmed locations ONLY for a verified contact whose owner has enabled sharing. */
Deno.serve(handler(async (req) => {
  const token = str((await readJson(req)).token, "invalid_token", 100);
  const db = adminClient();
  const { data: c } = await db.from("emergency_contacts")
    .select("id, owner_id, status, share_enabled").eq("token_hash", await sha256Hex(token)).maybeSingle();
  if (!c) throw new HttpError(404, "invalid_token");
  if (c.status !== "verified") throw new HttpError(403, "not_verified");
  if (!c.share_enabled) throw new HttpError(403, "sharing_disabled");
  const { data: devices } = await db.from("devices").select("id, name, lost_mode").eq("owner_id", c.owner_id).is("revoked_at", null);
  const out = [];
  for (const d of devices ?? []) {
    const { data: loc } = await db.from("device_latest_location")
      .select("latitude, longitude, accuracy_m, recorded_at").eq("device_id", d.id).maybeSingle();
    out.push({ name: d.name, lost_mode: d.lost_mode, last_confirmed_location: loc ?? null });
  }
  await db.from("audit_logs").insert({ owner_id: c.owner_id, action: "CONTACT_VIEWED_LOCATION", detail: { contact_id: c.id } });
  return { devices: out };
}));
