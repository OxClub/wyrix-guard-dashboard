import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";

export function ReauthDialog({ email, onDone }: { email: string; onDone: (ok: boolean) => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null);
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    setBusy(false);
    if (error) { setErr("Password incorrect. Accounts that use Google sign-in must sign out and sign in again."); return; }
    onDone(true);
  }
  return (
    <div role="dialog" aria-modal="true" aria-labelledby="reauth-title" className="fixed inset-0 z-[1000] grid place-items-center bg-black/60 p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-3">
        <h2 id="reauth-title" className="text-lg font-semibold">Confirm it's you</h2>
        <p className="muted">This action is sensitive. Enter your password for {email}.</p>
        <div>
          <label htmlFor="reauth-pw" className="label">Password</label>
          <input id="reauth-pw" className="input" type="password" autoFocus autoComplete="current-password" value={pw} onChange={(e) => setPw(e.target.value)} required />
        </div>
        {err && <p role="alert" className="text-sm text-emergency">{err}</p>}
        <div className="flex gap-2">
          <button className="btn flex-1" disabled={busy}>{busy ? "Checking…" : "Confirm"}</button>
          <button type="button" className="btn-ghost" onClick={() => onDone(false)}>Cancel</button>
        </div>
      </form>
    </div>
  );
}
