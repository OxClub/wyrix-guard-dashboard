import { useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useAuth } from "../lib/auth";

type Mode = "signin" | "signup" | "reset";

export default function Login() {
  const { session } = useAuth();
  const [mode, setMode] = useState<Mode>("signin");
  const [email, setEmail] = useState("");
  const [pw, setPw] = useState("");
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  if (session) return <Navigate to="/" replace />;
  const redirect = window.location.origin + window.location.pathname;

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setMsg(null);
    if (mode === "signin") {
      const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
      if (error) setMsg({ ok: false, text: error.message === "Email not confirmed" ? "Verify your email first (check your inbox)." : "Incorrect email or password." });
    } else if (mode === "signup") {
      if (pw.length < 10) { setMsg({ ok: false, text: "Use at least 10 characters." }); setBusy(false); return; }
      const { error } = await supabase.auth.signUp({ email, password: pw, options: { emailRedirectTo: redirect } });
      setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "Check your email to verify your account, then sign in." });
    } else {
      const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: redirect });
      setMsg(error ? { ok: false, text: error.message } : { ok: true, text: "If that account exists, a reset link is on its way." });
    }
    setBusy(false);
  }

  return (
    <div className="grid min-h-screen place-items-center p-4">
      <form onSubmit={submit} className="card w-full max-w-sm space-y-4">
        <div>
          <h1 className="text-2xl font-bold">WYRIX GUARD</h1>
          <p className="muted">Your Device. Your Security. Your Control.</p>
        </div>
        <h2 className="text-lg font-semibold">{mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Reset password"}</h2>
        <div>
          <label htmlFor="email" className="label">Email</label>
          <input id="email" className="input" type="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </div>
        {mode !== "reset" && (
          <div>
            <label htmlFor="pw" className="label">Password</label>
            <input id="pw" className="input" type="password" autoComplete={mode === "signin" ? "current-password" : "new-password"} value={pw} onChange={(e) => setPw(e.target.value)} required />
          </div>
        )}
        {msg && <p role="alert" className={`text-sm ${msg.ok ? "text-secgreen" : "text-emergency"}`}>{msg.text}</p>}
        <button className="btn w-full" disabled={busy}>{busy ? "Please wait…" : mode === "signin" ? "Sign in" : mode === "signup" ? "Create account" : "Send reset link"}</button>
        {import.meta.env.VITE_ENABLE_GOOGLE === "true" && mode !== "reset" && (
          <button type="button" className="btn-ghost w-full" onClick={() => void supabase.auth.signInWithOAuth({ provider: "google", options: { redirectTo: redirect } })}>Continue with Google</button>
        )}
        <div className="flex justify-between text-sm">
          <button type="button" className="text-electric underline" onClick={() => setMode(mode === "signin" ? "signup" : "signin")}>{mode === "signin" ? "Create account" : "Back to sign in"}</button>
          {mode === "signin" && <button type="button" className="text-electric underline" onClick={() => setMode("reset")}>Forgot password?</button>}
        </div>
        <p className="muted">WYRIX GUARD only protects devices you personally enrol. It cannot locate a phone by number or IMEI.</p>
      </form>
    </div>
  );
}
