import { adminClient, authenticate, requireRecentAuth } from "../_shared/auth.ts";
import { handler, HttpError, readJson } from "../_shared/http.ts";

Deno.serve(handler(async (req) => {
  const { user, claims } = await authenticate(req);
  requireRecentAuth(claims, 300);
  const body = await readJson(req);
  if (body.confirm !== "DELETE") throw new HttpError(400, "confirmation_required");
  const db = adminClient();
  // Remove stored evidence files first (DB rows cascade when the auth user is deleted).
  for (;;) {
    const { data: files } = await db.storage.from("evidence").list(user.id, { limit: 100 });
    if (!files || files.length === 0) break;
    // One level of device sub-folders: list and remove recursively.
    for (const f of files) {
      if (f.id === null) {
        const { data: inner } = await db.storage.from("evidence").list(`${user.id}/${f.name}`, { limit: 1000 });
        const paths = (inner ?? []).map((x) => `${user.id}/${f.name}/${x.name}`);
        if (paths.length) await db.storage.from("evidence").remove(paths);
      } else {
        await db.storage.from("evidence").remove([`${user.id}/${f.name}`]);
      }
    }
    if (files.length < 100) break;
  }
  const { error } = await db.auth.admin.deleteUser(user.id);
  if (error) throw new HttpError(500, "delete_failed");
  return { ok: true };
}));
