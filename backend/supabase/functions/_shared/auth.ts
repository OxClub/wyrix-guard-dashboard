import { createClient, SupabaseClient, User } from "npm:@supabase/supabase-js@2";
import { HttpError } from "./http.ts";
import { b64ToBytes } from "./encoding.ts";

let _admin: SupabaseClient | null = null;
/** service_role client. Only ever constructed inside Edge Functions. */
export function adminClient(): SupabaseClient {
  if (!_admin) {
    _admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
  }
  return _admin;
}

export interface AuthCtx {
  user: User;
  claims: Record<string, unknown>;
}

export async function authenticate(req: Request): Promise<AuthCtx> {
  const token = (req.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  if (!token) throw new HttpError(401, "unauthenticated");
  const { data, error } = await adminClient().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, "unauthenticated");
  let claims: Record<string, unknown> = {};
  try {
    claims = JSON.parse(new TextDecoder().decode(b64ToBytes(token.split(".")[1])));
  } catch { /* claims stay empty -> reauth checks fail closed */ }
  return { user: data.user, claims };
}

/** Fails closed unless the user performed an interactive sign-in within maxAgeSec (JWT `amr` timestamps). */
export function requireRecentAuth(claims: Record<string, unknown>, maxAgeSec = 600, nowSec = Math.floor(Date.now() / 1000)) {
  const amr = claims["amr"];
  if (!Array.isArray(amr)) throw new HttpError(401, "reauth_required");
  const interactive = new Set(["password", "otp", "oauth", "magiclink", "totp", "sso/saml"]);
  let latest = 0;
  for (const e of amr) {
    const m = (e as { method?: string }).method;
    const t = Number((e as { timestamp?: number }).timestamp ?? 0);
    if (m && interactive.has(m) && t > latest) latest = t;
  }
  if (latest === 0 || nowSec - latest > maxAgeSec) throw new HttpError(401, "reauth_required");
}

export async function audit(ownerId: string, action: string, deviceId: string | null, detail: Record<string, unknown> = {}) {
  const { error } = await adminClient().from("audit_logs").insert({ owner_id: ownerId, device_id: deviceId, action, detail });
  if (error) console.error("audit_failed", error.message);
}
