// Run: deno test backend/supabase/functions/_shared/shared_test.ts
import { assert, assertEquals, assertFalse, assertThrows } from "jsr:@std/assert@1";
import { canTransition, isCommandType, rateLimitFor, validatePayload } from "./commands.ts";
import { requireRecentAuth } from "./auth.ts";
import { ackMessage, derToRaw, verifyDeviceSignature } from "./signature.ts";
import { sha256Hex } from "./encoding.ts";

Deno.test("command type allow-list", () => {
  assert(isCommandType("TRIGGER_ALARM"));
  assertFalse(isCommandType("FORMAT_DEVICE"));
});

Deno.test("state machine rejects replays and terminal transitions", () => {
  assert(canTransition("requested", "delivered"));
  assert(canTransition("delivered", "executed"));
  assertFalse(canTransition("executed", "executed"));
  assertFalse(canTransition("expired", "delivered"));
  assertFalse(canTransition("failed", "executed"));
});

Deno.test("lost mode payload validation", () => {
  assertEquals(validatePayload("ACTIVATE_LOST_MODE", { message: " call me ", contact: "+91 99999" }),
    { message: "call me", contact: "+91 99999" });
  assertThrows(() => validatePayload("ACTIVATE_LOST_MODE", { message: "" }));
  assertThrows(() => validatePayload("ACTIVATE_LOST_MODE", { message: "x".repeat(281) }));
  assertEquals(validatePayload("TRIGGER_ALARM", { evil: true }), {});
});

Deno.test("alarm is rate limited tighter than other commands", () => {
  assert(rateLimitFor("TRIGGER_ALARM").max < rateLimitFor("REQUEST_LOCATION").max);
});

Deno.test("reauth fails closed", () => {
  const now = 1_000_000;
  assertThrows(() => requireRecentAuth({}, 600, now));
  assertThrows(() => requireRecentAuth({ amr: [{ method: "password", timestamp: now - 601 }] }, 600, now));
  assertThrows(() => requireRecentAuth({ amr: [{ method: "token_refresh", timestamp: now }] }, 600, now));
  requireRecentAuth({ amr: [{ method: "password", timestamp: now - 10 }] }, 600, now);
});

Deno.test("device signature: DER (Android-style) verifies; tampering does not", async () => {
  const kp = await crypto.subtle.generateKey({ name: "ECDSA", namedCurve: "P-256" }, true, ["sign", "verify"]);
  const spki = new Uint8Array(await crypto.subtle.exportKey("spki", kp.publicKey));
  const spkiB64 = btoa(String.fromCharCode(...spki));
  const msg = ackMessage("11111111-1111-1111-1111-111111111111", "executed", 1700000000000);
  const raw = new Uint8Array(await crypto.subtle.sign({ name: "ECDSA", hash: "SHA-256" }, kp.privateKey, new TextEncoder().encode(msg)));
  // Build DER from raw r||s exactly as Android's Signature would emit.
  const der = rawToDer(raw);
  assertEquals(derToRaw(der), raw);
  const sigB64 = btoa(String.fromCharCode(...der));
  assert(await verifyDeviceSignature(spkiB64, msg, sigB64));
  assertFalse(await verifyDeviceSignature(spkiB64, msg.replace("executed", "failed"), sigB64));
});

Deno.test("sha256Hex known vector", async () => {
  assertEquals(await sha256Hex("abc"), "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad");
});

function rawToDer(raw: Uint8Array): Uint8Array {
  const enc = (v: Uint8Array) => {
    let i = 0; while (i < v.length - 1 && v[i] === 0) i++;
    let x = v.slice(i); if (x[0] & 0x80) x = new Uint8Array([0, ...x]);
    return new Uint8Array([0x02, x.length, ...x]);
  };
  const r = enc(raw.slice(0, 32)), s = enc(raw.slice(32));
  return new Uint8Array([0x30, r.length + s.length, ...r, ...s]);
}
