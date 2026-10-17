import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { fetchLatest, fetchStatus, useLoad, useRealtime, useSubscription } from "../lib/hooks";
import { useDeviceCtx } from "../lib/device";
import { accuracyLabel, fmtDate, freshness, timeAgo } from "../lib/format";
import type { Device, DeviceStatus, LocationRow } from "../lib/types";
import { Empty, ErrorBox, Loading } from "../components/States";

function DeviceCard({ d }: { d: Device }) {
  const [tick, setTick] = useState(0);
  const st = useLoad<[DeviceStatus | null, LocationRow | null]>(
    async () => [await fetchStatus(d.id), await fetchLatest(d.id)], [null, null], [d.id, tick]);
  useRealtime("device_status", () => setTick((t) => t + 1), `device_id=eq.${d.id}`);
  const [status, loc] = st.data;
  const fresh = freshness(status?.last_sync_at ?? null);
  return (
    <article className="card space-y-2" aria-label={d.name}>
      <div className="flex items-start justify-between gap-2">
        <div>
          <h3 className="font-semibold">{d.name}</h3>
          <p className="muted">{d.model ?? "Android"} · Android {status?.android_version ?? d.android_version ?? "?"}</p>
        </div>
        <span className={`rounded-full px-2 py-0.5 text-xs ${fresh === "recent" ? "bg-secgreen/20 text-secgreen" : "bg-slate-500/20 text-muted"}`}>
          {fresh === "recent" ? "Reported recently" : fresh === "stale" ? "Offline / no recent report" : "No report yet"}
        </span>
      </div>
      {d.lost_mode && <p className="rounded bg-emergency/15 p-2 text-sm text-emergency">Lost Mode is active</p>}
      {st.loading && !status ? <Loading /> : st.error ? <ErrorBox message={st.error} onRetry={st.reload} /> : (
        <dl className="grid grid-cols-2 gap-2 text-sm">
          <div><dt className="muted">Battery</dt><dd>{status?.battery_pct != null ? `${status.battery_pct}%${status.charging ? " (charging)" : ""}` : "unknown"}</dd></div>
          <div><dt className="muted">Connection</dt><dd>{status?.connection_type ?? "unknown"}</dd></div>
          <div><dt className="muted">Last report</dt><dd title={fmtDate(status?.last_sync_at ?? null)}>{timeAgo(status?.last_sync_at ?? null)}</dd></div>
          <div><dt className="muted">Tracking</dt><dd>{status?.tracking_active ? "Active" : "Not active"} · {d.tracking_mode.replace("_", " ")}</dd></div>
          <div className="col-span-2">
            <dt className="muted">Last confirmed location</dt>
            <dd>{loc ? <>{loc.latitude.toFixed(5)}, {loc.longitude.toFixed(5)} · {accuracyLabel(loc.accuracy_m).text} · {fmtDate(loc.recorded_at)}</> : "None recorded yet"}</dd>
          </div>
        </dl>
      )}
      <Link className="btn-ghost" to="/location">View on map</Link>
    </article>
  );
}

export default function Overview() {
  const { devices } = useDeviceCtx();
  const sub = useSubscription();
  const [email, setEmail] = useState("");
  const audit = useLoad<{ id: number; action: string; created_at: string }[]>(async () => {
    const { data, error } = await supabase.from("audit_logs").select("id,action,created_at").order("created_at", { ascending: false }).limit(10);
    if (error) throw new Error(error.message);
    return data ?? [];
  }, [], []);
  useEffect(() => { void supabase.auth.getUser().then(({ data }) => setEmail(data.user?.email ?? "")); }, []);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-bold">Account overview</h1>
        <p className="muted">{email} · Plan: <strong>{sub.data.tier === "premium" ? "Premium" : "Free"}</strong>{sub.data.expires_at && sub.data.tier === "premium" ? ` (renews/expires ${fmtDate(sub.data.expires_at)})` : ""}</p>
      </header>
      {devices.loading && !devices.data.length ? <Loading /> : devices.error ? <ErrorBox message={devices.error} onRetry={devices.reload} /> :
        devices.data.length === 0 ? <Empty>No device enrolled. Enrol a phone from the WYRIX GUARD Android app; enrolment requires your consent on that device.</Empty> :
          <div className="grid gap-4 lg:grid-cols-2">{devices.data.map((d) => <DeviceCard key={d.id} d={d} />)}</div>}
      <section aria-labelledby="audit-h">
        <h2 id="audit-h" className="mb-2 text-lg font-semibold">Recent security activity</h2>
        {audit.loading ? <Loading /> : audit.error ? <ErrorBox message={audit.error} onRetry={audit.reload} /> : audit.data.length === 0 ? <Empty>No activity yet.</Empty> : (
          <ul className="card divide-y divide-slate-200 dark:divide-white/10">
            {audit.data.map((a) => <li key={a.id} className="flex justify-between py-2 text-sm"><span>{a.action.replaceAll("_", " ").toLowerCase()}</span><span className="muted">{fmtDate(a.created_at)}</span></li>)}
          </ul>)}
      </section>
    </div>
  );
}
