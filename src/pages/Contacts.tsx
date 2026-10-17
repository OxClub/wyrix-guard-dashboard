import { useState, type FormEvent } from "react";
import { supabase } from "../lib/supabase";
import { callFn, friendly } from "../lib/api";
import { useLoad } from "../lib/hooks";
import { fmtDate } from "../lib/format";
import { Empty, ErrorBox, Loading, Notice } from "../components/States";
import type { Contact } from "../lib/types";

export default function Contacts() {
  const q = useLoad<Contact[]>(async () => {
    const { data, error } = await supabase.from("emergency_contacts").select("id,name,email,status,share_enabled,verified_at").order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as Contact[];
  }, [], []);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function invite(e: FormEvent) {
    e.preventDefault(); setBusy(true); setMsg(null);
    try { await callFn("contact-invite", { name, email }); setName(""); setEmail(""); setMsg("Invitation emailed. Nothing is shared until they confirm AND you turn sharing on."); q.reload(); }
    catch (err) { setMsg(friendly(err)); }
    setBusy(false);
  }
  async function toggle(c: Contact) { await supabase.from("emergency_contacts").update({ share_enabled: !c.share_enabled }).eq("id", c.id); q.reload(); }
  async function remove(c: Contact) { if (window.confirm(`Remove ${c.name}? Their link stops working immediately.`)) { await supabase.from("emergency_contacts").delete().eq("id", c.id); q.reload(); } }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Emergency contacts</h1>
      <Notice>A contact can see your phone's last confirmed location only if (1) they confirmed by email and (2) you switched sharing on. You can switch it off or remove them at any time. Every view is recorded in your activity log.</Notice>
      <form onSubmit={invite} className="card grid gap-3 md:grid-cols-3">
        <div><label htmlFor="cn" className="label">Name</label><input id="cn" className="input" required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label htmlFor="ce" className="label">Email</label><input id="ce" type="email" className="input" required value={email} onChange={(e) => setEmail(e.target.value)} /></div>
        <div className="flex items-end"><button className="btn w-full" disabled={busy}>{busy ? "Sending…" : "Send invitation"}</button></div>
      </form>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      {q.error && <ErrorBox message={q.error} onRetry={q.reload} />}
      {q.loading ? <Loading /> : q.data.length === 0 ? <Empty>No contacts.</Empty> : (
        <ul className="card divide-y divide-slate-200 dark:divide-white/10">{q.data.map((c) => (
          <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm">
            <span><strong>{c.name}</strong> · {c.email}<br /><span className="muted">{c.status === "verified" ? `Confirmed ${fmtDate(c.verified_at)}` : "Waiting for confirmation"} · sharing {c.share_enabled ? "ON" : "off"}</span></span>
            <span className="flex gap-2"><button className="btn-ghost" disabled={c.status !== "verified"} onClick={() => void toggle(c)}>{c.share_enabled ? "Stop sharing" : "Allow sharing"}</button><button className="btn-danger" onClick={() => void remove(c)}>Remove</button></span></li>))}</ul>)}
    </div>
  );
}
