import { supabase } from "./supabase";

export class ApiError extends Error {
  constructor(public code: string, public status: number) { super(code); }
}

const MESSAGES: Record<string, string> = {
  reauth_required: "Please confirm your password to continue.",
  rate_limited: "Too many requests. Wait a minute and try again.",
  device_not_found: "Device not found.",
  device_revoked: "This device has been revoked.",
  premium_required: "This feature requires WYRIX GUARD Premium.",
  device_limit_free: "The free plan supports one device.",
  unauthenticated: "Your session expired. Please sign in again.",
  email_not_configured: "Email delivery is not configured on the server yet.",
  contact_limit: "You can add up to 5 emergency contacts.",
  contact_exists: "That contact already exists.",
  invalid_message: "Enter a message (1-280 characters).",
};
export function friendly(e: unknown): string {
  if (e instanceof ApiError) return MESSAGES[e.code] ?? `Request failed (${e.code}).`;
  if (e instanceof Error) return MESSAGES[e.message] ?? e.message;
  return "Something went wrong.";
}

export async function callFn<T = unknown>(name: string, body: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.functions.invoke(name, { body });
  if (error) {
    let code = "network_error", status = 0;
    const ctx = (error as { context?: Response }).context;
    if (ctx && typeof ctx.json === "function") {
      status = ctx.status;
      try { code = (await ctx.json()).error ?? "request_failed"; } catch { code = "request_failed"; }
    }
    throw new ApiError(code, status);
  }
  return data as T;
}
