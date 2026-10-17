export const enc = new TextEncoder();
export function b64ToBytes(b64: string): Uint8Array {
  const clean = b64.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(clean);
  return Uint8Array.from(bin, (c) => c.charCodeAt(0));
}
export function bytesToB64Url(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
export async function sha256Hex(input: string): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest("SHA-256", enc.encode(input)));
  return Array.from(d, (b) => b.toString(16).padStart(2, "0")).join("");
}
export function randomToken(bytes = 32): string {
  return bytesToB64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}
export function timingSafeEqual(a: string, b: string): boolean {
  const x = enc.encode(a), y = enc.encode(b);
  if (x.length !== y.length) return false;
  let r = 0;
  for (let i = 0; i < x.length; i++) r |= x[i] ^ y[i];
  return r === 0;
}
