import { useMemo, useState } from "react";
import { supabase } from "../lib/supabase";
import { friendly } from "../lib/api";
import { useLoad, useSubscription } from "../lib/hooks";
import { GeoMap } from "../components/GeoMap";
import { RequireDevice } from "../components/RequireDevice";
import { Empty, ErrorBox, Loading, Notice } from "../components/States";
import type { Device, Geofence } from "../lib/types";

function Body({ d }: { d: Device }) {
  const sub = useSubscription();
  const q = useLoad<Geofence[]>(async () => {
    const { data, error } = await supabase.from("geofences").select("*").eq("device_id", d.id).order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as Geofence[];
  }, [], [d.id]);
  const [name, setName] = useState("");
  const [radius, setRadius] = useState(300);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const circles = useMemo(() => [
    ...q.data.map((g) => ({ lat: g.latitude, lng: g.longitude, radius: g.radius_m, label: g.name })),
    ...(pos ? [{ lat: pos.lat, lng: pos.lng, radius, label: "New (unsaved)" }] : []),
  ], [q.data, pos, radius]);

  async function add() {
    if (!pos || !name.trim()) { setMsg("Click the map to choose a centre and enter a name."); return; }
    const { error } = await supabase.from("geofences").insert({ device_id: d.id, name: name.trim(), latitude: pos.lat, longitude: pos.lng, radius_m: radius });
    if (error) setMsg(friendly(new Error(error.message.includes("premium_required") ? "premium_required" : error.message)));
    else { setName(""); setPos(null); setMsg("Saved. The phone installs it the next time it syncs."); q.reload(); }
  }
  async function toggle(g: Geofence) { await supabase.from("geofences").update({ active: !g.active }).eq("id", g.id); q.reload(); }
  async function remove(g: Geofence) { await supabase.from("geofences").delete().eq("id", g.id); q.reload(); }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Geofences · {d.name}</h1>
      <Notice>{sub.data.tier === "premium" ? "Premium feature enabled." : "Geofences are a Premium feature."} Arrival and departure alerts are opt-in and best-effort: Android may delay them when the phone is idle or battery saver is on.</Notice>
      <GeoMap circles={circles} onClick={(lat, lng) => setPos({ lat, lng })} height="360px" />
      <div className="card grid gap-3 md:grid-cols-4">
        <div className="md:col-span-2"><label htmlFor="gn" className="label">Name</label><input id="gn" className="input" maxLength={60} value={name} onChange={(e) => setName(e.target.value)} /></div>
        <div><label htmlFor="gr" className="label">Radius (m, 100-50000)</label><input id="gr" type="number" min={100} max={50000} className="input" value={radius} onChange={(e) => setRadius(Math.min(50000, Math.max(100, Number(e.target.value) || 100)))} /></div>
        <div className="flex items-end"><button className="btn w-full" onClick={() => void add()}>Add geofence</button></div>
        <p className="muted md:col-span-4">{pos ? `Centre: ${pos.lat.toFixed(5)}, ${pos.lng.toFixed(5)}` : "Click the map to set the centre."}</p>
      </div>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      {q.error && <ErrorBox message={q.error} onRetry={q.reload} />}
      {q.loading ? <Loading /> : q.data.length === 0 ? <Empty>No geofences.</Empty> : (
        <ul className="card divide-y divide-slate-200 dark:divide-white/10">{q.data.map((g) => (
          <li key={g.id} className="flex flex-wrap items-center justify-between gap-2 py-2 text-sm"><span><strong>{g.name}</strong> · {Math.round(g.radius_m)} m · {g.active ? "active" : "paused"}</span>
            <span className="flex gap-2"><button className="btn-ghost" onClick={() => void toggle(g)}>{g.active ? "Pause" : "Resume"}</button><button className="btn-danger" onClick={() => void remove(g)}>Delete</button></span></li>))}</ul>)}
    </div>
  );
}
export default function GeofencesPage() { return <RequireDevice>{(d) => <Body key={d.id} d={d} />}</RequireDevice>; }
