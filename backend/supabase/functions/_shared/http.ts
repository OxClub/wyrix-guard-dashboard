export class HttpError extends Error {
  constructor(public status: number, public code: string, message?: string) {
    super(message ?? code);
  }
}

export function corsHeaders(req: Request): Record<string, string> {
  const allowed = (Deno.env.get("ALLOWED_ORIGINS") ?? "").split(",").map((s) => s.trim()).filter(Boolean);
  const origin = req.headers.get("origin") ?? "";
  const allow = allowed.includes(origin) ? origin : (allowed[0] ?? "");
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Headers": "authorization, apikey, content-type, x-client-info, x-maintenance-secret",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Vary": "Origin",
  };
}

export function handler(fn: (req: Request) => Promise<unknown>) {
  return async (req: Request): Promise<Response> => {
    const cors = corsHeaders(req);
    if (req.method === "OPTIONS") return new Response("ok", { headers: cors });
    const headers = { ...cors, "content-type": "application/json" };
    try {
      if (req.method !== "POST") throw new HttpError(405, "method_not_allowed");
      const result = await fn(req);
      return new Response(JSON.stringify(result ?? { ok: true }), { status: 200, headers });
    } catch (e) {
      if (e instanceof HttpError) {
        return new Response(JSON.stringify({ error: e.code }), { status: e.status, headers });
      }
      console.error("unhandled", e instanceof Error ? e.message : e);
      return new Response(JSON.stringify({ error: "internal_error" }), { status: 500, headers });
    }
  };
}

export async function readJson(req: Request): Promise<Record<string, unknown>> {
  try {
    const v = await req.json();
    if (v === null || typeof v !== "object" || Array.isArray(v)) throw new Error();
    return v as Record<string, unknown>;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

export function str(v: unknown, code: string, max = 200): string {
  if (typeof v !== "string" || v.length === 0 || v.length > max) throw new HttpError(400, code);
  return v;
}
export function uuid(v: unknown, code: string): string {
  const s = str(v, code, 36);
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s)) throw new HttpError(400, code);
  return s.toLowerCase();
}
