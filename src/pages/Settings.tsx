import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { callFn, friendly } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useLoad, useSubscription } from "../lib/hooks";
import { download, fmtDate } from "../lib/format";
import { ErrorBox, Loading, Notice } from "../components/States";

interface Profile { display_name: string | null; history_retention_days: number; }

export default function Settings() {
  const { withReauth } = useAuth();
  const sub = useSubscription();
  const q = useLoad<Profile | null>(async () => {
    const { data, error } = await supabase.from("profiles").select("display_name,history_retention_days").maybeSingle();
    if (error) throw new Error(error.message);
    return data as Profile | null;
  }, null, []);
  const [name, setName] = useState("");
  const [days, setDays] = useState(7);
  const [msg, setMsg] = useState<string | null>(null);
  const [confirm, setConfirm] = useState("");
  useEffect(() => { if (q.data) { setName(q.data.display_name ?? ""); setDays(q.data.history_retention_days); } }, [q.data]);
  const premium = sub.data.tier === "premium";

  async function save() {
    const d = premium ? days : Math.min(days, 7);
    const { error } = await supabase.from("profiles").update({ display_name: name.trim() || null, history_retention_days: d }).eq("id", (await supabase.auth.getUser()).data.user!.id);
    setMsg(error ? error.message : "Saved."); if (!error) q.reload();
  }
  async function exportAll() {
    const tables = ["devices", "device_locations", "security_events", "geofences", "recovery_reports", "audit_logs"] as const;
    const out: Record<string, unknown> = { exported_at: new Date().toISOString() };
    for (const t of tables) { const { data } = await supabase.from(t).select(t === "devices" ? "id,name,model,android_version,consent_at,created_at" : "*").limit(10000); out[t] = data ?? []; }
    download("wyrix-guard-my-data.json", JSON.stringify(out, null, 2), "application/json");
  }
  async function deleteAccount() {
    try { await withReauth(() => callFn("delete-account", { confirm: "DELETE" })); await supabase.auth.signOut(); }
    catch (e) { setMsg(friendly(e)); }
  }

  if (q.loading) return <Loading />;
  if (q.error) return <ErrorBox message={q.error} onRetry={q.reload} />;
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Settings & privacy</h1>
      <section className="card space-y-3">
        <h2 className="font-semibold">Profile</h2>
        <div><label htmlFor="dn" className="label">Display name</label><input id="dn" className="input" maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label htmlFor="rd" className="label">Keep location history for (days)</label>
          <input id="rd" type="number" min={1} max={premium ? 365 : 7} className="input max-w-[160px]" value={days} onChange={(e) => setDays(Number(e.target.value) || 1)} />
          <p className="muted mt-1">{premium ? "Up to 365 days." : "Free plan: up to 7 days. Premium extends this."} The most recent fix per device is always kept.</p></div>
        <button className="btn" onClick={() => void save()}>Save</button>
      </section>
      <section className="card space-y-2">
        <h2 className="font-semibold">Plan</h2>
        <p className="muted">{premium ? `Premium, active until ${fmtDate(sub.data.expires_at)}.` : "Free."} Subscriptions are bought in the Android app through Google Play and verified by our server; a local flag never grants access.</p>
      </section>
      <section className="card space-y-2">
        <h2 className="font-semibold">What WYRIX GUARD collects</h2>
        <ul className="muted list-disc space-y-1 pl-5">
          <li>Location (with accuracy and time), battery and connection state from devices you enrol, including in the background while tracking is on (the phone shows a persistent notification).</li>
          <li>Security events you enable: failed unlock attempts (needs device administration), SIM state changes, geofence crossings.</li>
          <li>Optional photos after failed unlocks, only with your explicit opt-in and Android's camera permission.</li>
          <li>Data is private to your account (row-level security) and encrypted in transit. You can export or delete it at any time; deletion is free.</li>
        </ul>
        <button className="btn-ghost" onClick={() => void exportAll()}>Export my data (JSON)</button>
      </section>
      <section className="card space-y-3 border-emergency/40">
        <h2 className="font-semibold text-emergency">Delete account</h2>
        <Notice tone="warn">Permanently deletes your account, devices, locations, events, photos and reports. This cannot be undone. You will be asked for your password.</Notice>
        <div><label htmlFor="dc" className="label">Type DELETE to confirm</label><input id="dc" className="input max-w-xs" value={confirm} onChange={(e) => setConfirm(e.target.value)} /></div>
        <button className="btn-danger" disabled={confirm !== "DELETE"} onClick={() => void deleteAccount()}>Delete my account</button>
      </section>
      {msg && <p role="status" className="text-sm">{msg}</p>}
    </div>
  );
}
