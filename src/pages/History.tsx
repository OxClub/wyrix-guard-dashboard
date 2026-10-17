import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { useLoad, useSubscription } from "../lib/hooks";
import { accuracyLabel, download, fmtDate, toCsv } from "../lib/format";
import { GeoMap } from "../components/GeoMap";
import { RequireDevice } from "../components/RequireDevice";
import { Empty, ErrorBox, Loading, Notice } from "../components/States";
import type { Device, LocationRow } from "../lib/types";

const iso = (d: Date) => d.toISOString().slice(0, 16);

function Body({ d }: { d: Device }) {
  const sub = useSubscription();
  const [from, setFrom] = useState(iso(new Date(Date.now() - 24 * 3600_000)));
  const [to, setTo] = useState(iso(new Date()));
  const [maxAcc, setMaxAcc] = useState(0);
  const [sel, setSel] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const q = useLoad<LocationRow[]>(async () => {
    let r = supabase.from("device_locations").select("*").eq("device_id", d.id)
      .gte("recorded_at", new Date(from).toISOString()).lte("recorded_at", new Date(to).toISOString());
    if (maxAcc > 0) r = r.lte("accuracy_m", maxAcc);
    const { data, error } = await r.order("recorded_at", { ascending: false }).limit(1000);
    if (error) throw new Error(error.message);
    return (data ?? []) as LocationRow[];
  }, [], [d.id, from, to, maxAcc]);

  const points = useMemo(() => q.data.map((r, i) => ({
    lat: r.latitude, lng: r.longitude, accuracy: i === sel ? r.accuracy_m : undefined, highlight: i === sel,
    label: `${fmtDate(r.recorded_at)} · ${accuracyLabel(r.accuracy_m).text}`,
  })), [q.data, sel]);

  function exportCsv() {
    download(`wyrix-history-${d.name}.csv`, toCsv(q.data as unknown as Record<string, unknown>[],
      ["recorded_at", "latitude", "longitude", "accuracy_m", "battery_pct", "charging", "connection_type", "tracking_mode"]));
  }
  async function deleteRange() {
    if (!window.confirm(`Permanently delete ${q.data.length} shown location records?`)) return;
    const ids = q.data.map((r) => r.id).filter((x): x is number => x !== undefined);
    const { error } = await supabase.from("device_locations").delete().in("id", ids);
    setMsg(error ? error.message : "Deleted."); if (!error) q.reload();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Location history · {d.name}</h1>
      {sub.data.tier === "free" && <Notice>Free plan keeps 7 days of history. Premium allows up to 365 days (set in Settings).</Notice>}
      <div className="card grid gap-3 md:grid-cols-4">
        <div><label className="label" htmlFor="f">From</label><input id="f" type="datetime-local" className="input" value={from} onChange={(e) => setFrom(e.target.value)} /></div>
        <div><label className="label" htmlFor="t">To</label><input id="t" type="datetime-local" className="input" value={to} onChange={(e) => setTo(e.target.value)} /></div>
        <div><label className="label" htmlFor="a">Max error (m, 0 = any)</label><input id="a" type="number" min={0} className="input" value={maxAcc} onChange={(e) => setMaxAcc(Number(e.target.value) || 0)} /></div>
        <div className="flex items-end gap-2"><button className="btn-ghost" disabled={!q.data.length} onClick={exportCsv}>Export CSV</button><button className="btn-danger" disabled={!q.data.length} onClick={() => void deleteRange()}>Delete shown</button></div>
      </div>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      {q.error && <ErrorBox message={q.error} onRetry={q.reload} />}
      {q.loading ? <Loading /> : q.data.length === 0 ? <Empty>No records in this range.</Empty> : (
        <>
          <GeoMap points={points} path onSelect={setSel} />
          <p className="muted">{q.data.length} records (max 1000 shown). Click a marker to see its accuracy circle.</p>
          <div className="card overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr className="muted"><th className="p-2">Time</th><th className="p-2">Position</th><th className="p-2">Accuracy</th><th className="p-2">Battery</th></tr></thead>
            <tbody>{q.data.slice(0, 100).map((r, i) => (
              <tr key={r.id ?? i} className={`cursor-pointer border-t border-slate-200 dark:border-white/10 ${i === sel ? "bg-electric/10" : ""}`} onClick={() => setSel(i)}>
                <td className="p-2">{fmtDate(r.recorded_at)}</td><td className="p-2">{r.latitude.toFixed(5)}, {r.longitude.toFixed(5)}</td><td className="p-2">{accuracyLabel(r.accuracy_m).text}</td><td className="p-2">{r.battery_pct ?? "?"}%</td></tr>))}</tbody></table></div>
        </>)}
    </div>
  );
}
export default function History() { return <RequireDevice>{(d) => <Body key={d.id} d={d} />}</RequireDevice>; }
