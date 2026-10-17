import { bytesToB64Url, b64ToBytes, enc } from "./encoding.ts";

function pemToDer(pem: string): Uint8Array {
  return b64ToBytes(pem.replace(/-----[A-Z ]+-----/g, "").replace(/\s+/g, ""));
}

/** OAuth2 access token from a service-account JSON (kept only in Edge Function secrets). */
export async function googleAccessToken(serviceAccountJson: string, scope: string): Promise<string> {
  const sa = JSON.parse(serviceAccountJson);
  const now = Math.floor(Date.now() / 1000);
  const part = (o: unknown) => bytesToB64Url(enc.encode(JSON.stringify(o)));
  const unsigned = `${part({ alg: "RS256", typ: "JWT" })}.${part({
    iss: sa.client_email, scope, aud: "https://oauth2.googleapis.com/token", iat: now, exp: now + 3600,
  })}`;
  const key = await crypto.subtle.importKey(
    "pkcs8", pemToDer(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const sig = new Uint8Array(await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(unsigned)));
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: `${unsigned}.${bytesToB64Url(sig)}`,
    }),
  });
  if (!res.ok) throw new Error(`google_token_${res.status}`);
  return (await res.json()).access_token as string;
}
