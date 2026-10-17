import { useState } from "react";
import { supabase } from "../lib/supabase";
import { useLoad, useRealtime } from "../lib/hooks";
import { EVENT_LABELS, fmtDate } from "../lib/format";
import { RequireDevice } from "../components/RequireDevice";
import { Empty, ErrorBox, Loading, Notice } from "../components/States";
import type { Device, SecurityEvent } from "../lib/types";

function Body({ d, mode }: { d: Device; mode: "all" | "sim" }) {
  const [filter, setFilter] = useState("");
  const q = useLoad<SecurityEvent[]>(async () => {
    let r = supabase.from("security_events").select("*").eq("device_id", d.id);
    if (mode === "sim") r = r.like("type", "SIM_%");
    else if (filter) r = r.eq("type", filter);
    const { data, error } = await r.order("occurred_at", { ascending: false }).limit(200);
    if (error) throw new Error(error.message);
    return (data ?? []) as SecurityEvent[];
  }, [], [d.id, mode, filter]);
  useRealtime("security_events", q.reload, `device_id=eq.${d.id}`);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">{mode === "sim" ? "SIM alerts" : "Security events"} · {d.name}</h1>
      {mode === "sim"
        ? <Notice>SIM alerts use only what Android exposes to normal apps: that a SIM was inserted, removed or changed. WYRIX GUARD cannot read the new SIM's number or its owner, and cannot get data from your telecom operator.</Notice>
        : <Notice>Failed-unlock events require you to enable device administration on the phone. If a photo could not be taken, the event is recorded without one.</Notice>}
      {mode === "all" && (
        <div className="max-w-xs"><label htmlFor="ef" className="label">Filter</label>
          <select id="ef" className="input" value={filter} onChange={(e) => setFilter(e.target.value)}>
            <option value="">All events</option>{Object.entries(EVENT_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </select></div>)}
      {q.error && <ErrorBox message={q.error} onRetry={q.reload} />}
      {q.loading ? <Loading /> : q.data.length === 0 ? <Empty>No events recorded.</Empty> : (
        <ul className="card divide-y divide-slate-200 dark:divide-white/10">
          {q.data.map((e) => (
            <li key={e.id} className="py-2 text-sm"><div className="flex justify-between gap-2"><strong>{EVENT_LABELS[e.type] ?? e.type}</strong><span className="muted">{fmtDate(e.occurred_at)}</span></div>
              {Object.keys(e.details).length > 0 && <p className="muted break-words">{Object.entries(e.details).map(([k, v]) => `${k}: ${String(v)}`).join(" · ")}</p>}</li>))}
        </ul>)}
    </div>
  );
}
export default function Events({ mode }: { mode: "all" | "sim" }) { return <RequireDevice>{(d) => <Body key={d.id + mode} d={d} mode={mode} />}</RequireDevice>; }
