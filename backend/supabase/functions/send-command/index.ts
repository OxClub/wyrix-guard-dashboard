import { adminClient, authenticate, audit, requireRecentAuth } from "../_shared/auth.ts";
import { handler, HttpError, readJson, uuid } from "../_shared/http.ts";
import {
  isCommandType, rateLimitFor, SENSITIVE, TTL_SECONDS, validatePayload,
} from "../_shared/commands.ts";
import { sendCommandWake } from "../_shared/fcm.ts";

Deno.serve(handler(async (req) => {
  const { user, claims } = await authenticate(req);
  const body = await readJson(req);
  const deviceId = uuid(body.device_id, "invalid_device_id");
  if (!isCommandType(body.type)) throw new HttpError(400, "invalid_command_type");
  const type = body.type;
  const payload = validatePayload(type, body.payload);
  if (SENSITIVE.has(type)) requireRecentAuth(claims, 600);

  const db = adminClient();
  // 1. Ownership: the device must belong to the caller and not be revoked.
  const { data: device } = await db.from("devices")
    .select("id, owner_id, fcm_token, revoked_at").eq("id", deviceId).maybeSingle();
  if (!device || device.owner_id !== user.id) throw new HttpError(404, "device_not_found");  // same answer for foreign ids
  if (device.revoked_at) throw new HttpError(409, "device_revoked");

  // 2. Housekeeping + rate limit (per device, per type).
  await db.rpc("expire_stale_commands");
  const rl = rateLimitFor(type);
  const since = new Date(Date.now() - rl.windowSec * 1000).toISOString();
  const { count } = await db.from("remote_commands").select("id", { count: "exact", head: true })
    .eq("device_id", deviceId).eq("type", type).gte("created_at", since);
  if ((count ?? 0) >= rl.max) throw new HttpError(429, "rate_limited");

  // 3. Create the command (server-generated id, nonce, expiry).
  const now = new Date();
  const { data: cmd, error } = await db.from("remote_commands").insert({
    device_id: deviceId, owner_id: user.id, type, payload,
    expires_at: new Date(now.getTime() + TTL_SECONDS[type] * 1000).toISOString(),
  }).select("id, state, created_at, expires_at").single();
  if (error || !cmd) throw new HttpError(500, "command_create_failed");

  // 4. Wake-up push (best effort; never authorization).
  let push = "no_token";
  if (device.fcm_token) {
    push = await sendCommandWake(device.fcm_token, cmd.id, deviceId);
    if (push === "unregistered") await db.from("devices").update({ fcm_token: null }).eq("id", deviceId);
  }
  await audit(user.id, `COMMAND_${type}`, deviceId, { command_id: cmd.id, push });
  return { command: cmd, push };
}));
