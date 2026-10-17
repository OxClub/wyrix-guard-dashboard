import { adminClient, authenticate, audit } from "../_shared/auth.ts";
import { handler, HttpError, readJson, str } from "../_shared/http.ts";
import { randomToken, sha256Hex } from "../_shared/encoding.ts";
import { sendEmail } from "../_shared/email.ts";

Deno.serve(handler(async (req) => {
  const { user } = await authenticate(req);
  const body = await readJson(req);
  const name = str(body.name, "invalid_name", 80);
  const email = str(body.email, "invalid_email", 254).toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError(400, "invalid_email");

  const db = adminClient();
  const { count } = await db.from("emergency_contacts").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
  if ((count ?? 0) >= 5) throw new HttpError(409, "contact_limit");

  const token = randomToken(32);
  const dash = Deno.env.get("DASHBOARD_URL");
  if (!dash) throw new HttpError(503, "dashboard_url_not_configured");
  const sent = await sendEmail(email, "WYRIX GUARD: emergency contact request",
    `${user.email ?? "A WYRIX GUARD user"} asked to add you as an emergency contact.\n\n` +
    `If you agree, open this link and confirm. After you confirm, they can let you see the last confirmed ` +
    `location of their phone if it is lost. You can stop at any time on that page.\n\n${dash}/#/contact?token=${token}\n\n` +
    `If you were not expecting this, ignore this email; nothing is shared unless you confirm.`);
  if (!sent) throw new HttpError(503, "email_not_configured");  // never store a contact we could not invite
  const { error } = await db.from("emergency_contacts").insert({
    owner_id: user.id, name, email, token_hash: await sha256Hex(token),
  });
  if (error) throw new HttpError(409, error.code === "23505" ? "contact_exists" : "contact_create_failed");
  await audit(user.id, "CONTACT_INVITED", null, { email });
  return { ok: true };
}));
