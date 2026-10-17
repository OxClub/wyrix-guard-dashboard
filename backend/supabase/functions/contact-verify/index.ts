import { adminClient } from "../_shared/auth.ts";
import { handler, HttpError, readJson, str } from "../_shared/http.ts";
import { sha256Hex } from "../_shared/encoding.ts";

/** Contact explicitly confirms consent. Sharing additionally requires the owner to enable it. */
Deno.serve(handler(async (req) => {
  const token = str((await readJson(req)).token, "invalid_token", 100);
  const db = adminClient();
  const { data: c } = await db.from("emergency_contacts").select("id, owner_id, status").eq("token_hash", await sha256Hex(token)).maybeSingle();
  if (!c) throw new HttpError(404, "invalid_token");
  if (c.status !== "verified") {
    await db.from("emergency_contacts").update({ status: "verified", verified_at: new Date().toISOString() }).eq("id", c.id);
    await db.from("audit_logs").insert({ owner_id: c.owner_id, action: "CONTACT_VERIFIED", detail: { contact_id: c.id } });
  }
  return { ok: true };
}));
