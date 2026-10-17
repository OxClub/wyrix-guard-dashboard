import { adminClient, authenticate, audit } from "../_shared/auth.ts";
import { handler, HttpError, readJson, str, uuid } from "../_shared/http.ts";
import { canTransition, CommandState } from "../_shared/commands.ts";
import { ackMessage, verifyDeviceSignature } from "../_shared/signature.ts";

const ACK_STATES = ["delivered", "executed", "failed"] as const;

Deno.serve(handler(async (req) => {
  const { user } = await authenticate(req);
  const body = await readJson(req);
  const commandId = uuid(body.command_id, "invalid_command_id");
  const state = body.state as CommandState;
  if (!(ACK_STATES as readonly string[]).includes(state)) throw new HttpError(400, "invalid_state");
  const ts = Number(body.ts);
  if (!Number.isFinite(ts) || Math.abs(Date.now() - ts) > 5 * 60_000) throw new HttpError(400, "stale_timestamp");
  const signature = str(body.signature, "invalid_signature", 400);
  const failureReason = typeof body.failure_reason === "string" ? body.failure_reason.slice(0, 200) : null;
  const result = typeof body.result === "object" && body.result !== null && !Array.isArray(body.result)
    ? body.result as Record<string, unknown> : null;

  const db = adminClient();
  const { data: cmd } = await db.from("remote_commands").select("*").eq("id", commandId).maybeSingle();
  if (!cmd || cmd.owner_id !== user.id) throw new HttpError(404, "command_not_found");
  const { data: device } = await db.from("devices").select("id, public_key, revoked_at").eq("id", cmd.device_id).single();
  if (!device || device.revoked_at) throw new HttpError(409, "device_revoked");

  // The acknowledgment must be signed by the device's Keystore key (bound to this command, state and time).
  const ok = await verifyDeviceSignature(device.public_key, ackMessage(commandId, state, ts), signature);
  if (!ok) { await audit(user.id, "ACK_SIGNATURE_REJECTED", cmd.device_id, { command_id: commandId }); throw new HttpError(403, "bad_signature"); }

  if (new Date(cmd.expires_at) < new Date() && (cmd.state === "requested" || cmd.state === "delivered")) {
    await db.from("remote_commands").update({ state: "expired" }).eq("id", commandId);
    throw new HttpError(409, "command_expired");
  }
  if (!canTransition(cmd.state, state)) throw new HttpError(409, "invalid_transition");  // replay / duplicate acks fail here

  const patch: Record<string, unknown> = { state };
  const nowIso = new Date().toISOString();
  if (state === "delivered") patch.delivered_at = nowIso;
  if (state === "executed") { patch.executed_at = nowIso; patch.result = result; }
  if (state === "failed") { patch.failure_reason = failureReason ?? "unspecified"; patch.executed_at = nowIso; }
  // Conditional update: only succeeds if the state we validated is still current (race-safe).
  const { data: updated } = await db.from("remote_commands").update(patch)
    .eq("id", commandId).eq("state", cmd.state).select("id").maybeSingle();
  if (!updated) throw new HttpError(409, "invalid_transition");

  if (state === "executed" && cmd.type === "ACTIVATE_LOST_MODE") {
    // Use the server-stored payload, never the device-supplied one.
    await db.from("devices").update({ lost_mode: true, lost_message: cmd.payload.message, lost_contact: cmd.payload.contact || null }).eq("id", cmd.device_id);
  }
  if (state === "executed" && cmd.type === "DEACTIVATE_LOST_MODE") {
    await db.from("devices").update({ lost_mode: false, lost_message: null, lost_contact: null }).eq("id", cmd.device_id);
  }
  await audit(user.id, `ACK_${state.toUpperCase()}`, cmd.device_id, { command_id: commandId, type: cmd.type });
  return { ok: true, state };
}));
