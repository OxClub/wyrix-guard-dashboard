import { b64ToBytes } from "./encoding.ts";

/** Android's SHA256withECDSA yields an ASN.1 DER signature; WebCrypto wants raw r||s. */
export function derToRaw(der: Uint8Array, size = 32): Uint8Array {
  if (der[0] !== 0x30) throw new Error("bad_der");
  let i = 2;
  if (der[1] & 0x80) i = 2 + (der[1] & 0x7f);
  const readInt = () => {
    if (der[i] !== 0x02) throw new Error("bad_der");
    const len = der[i + 1];
    let v = der.slice(i + 2, i + 2 + len);
    i += 2 + len;
    while (v.length > size && v[0] === 0) v = v.slice(1);
    if (v.length > size) throw new Error("bad_der");
    const out = new Uint8Array(size);
    out.set(v, size - v.length);
    return out;
  };
  const r = readInt();
  const s = readInt();
  const raw = new Uint8Array(size * 2);
  raw.set(r, 0);
  raw.set(s, size);
  return raw;
}

export async function verifyDeviceSignature(spkiB64: string, message: string, sigDerB64: string): Promise<boolean> {
  try {
    const key = await crypto.subtle.importKey(
      "spki", b64ToBytes(spkiB64), { name: "ECDSA", namedCurve: "P-256" }, false, ["verify"]);
    return await crypto.subtle.verify(
      { name: "ECDSA", hash: "SHA-256" }, key, derToRaw(b64ToBytes(sigDerB64)), new TextEncoder().encode(message));
  } catch {
    return false;
  }
}

export function ackMessage(commandId: string, state: string, tsMs: number): string {
  return `${commandId}|${state}|${tsMs}`;
}
