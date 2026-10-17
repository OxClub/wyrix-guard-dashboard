import { useMemo, useState } from "react";
import { fetchLatest, fetchStatus, useLoad, useRealtime } from "../lib/hooks";
import { accuracyLabel, fmtDate, freshness, timeAgo } from "../lib/format";
import { GeoMap } from "../components/GeoMap";
import { CommandHistory, useCommandSender } from "../components/CommandPanel";
import { RequireDevice } from "../components/RequireDevice";
import { ErrorBox, Loading, Notice } from "../components/States";
import type { Device, DeviceStatus, LocationRow } from "../lib/types";

function Body({ d }: { d: Device }) {
  const [tick, setTick] = useState(0);
  const q = useLoad<[LocationRow | null, DeviceStatus | null]>(async () => [await fetchLatest(d.id), await fetchStatus(d.id)], [null, null], [d.id, tick]);
  useRealtime("device_locations", () => setTick((t) => t + 1), `device_id=eq.${d.id}`);
  useRealtime("device_status", () => setTick((t) => t + 1), `device_id=eq.${d.id}`);
  const { send, busy, msg } = useCommandSender(d.id);
  const [loc, st] = q.data;
  const fresh = freshness(loc?.recorded_at ?? null);
  const pts = useMemo(() => loc ? [{ lat: loc.latitude, lng: loc.longitude, accuracy: loc.accuracy_m, highlight: true, label: `${d.name}: ${fmtDate(loc.recorded_at)}` }] : [], [loc, d.name]);
  const acc = loc ? accuracyLabel(loc.accuracy_m) : null;

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Latest location · {d.name}</h1>
      {q.error && <ErrorBox message={q.error} onRetry={q.reload} />}
      {q.loading && !loc ? <Loading /> : !loc ? (
        <Notice tone="warn">No location has been received from this device yet. It needs location permission, an internet connection and tracking enabled.</Notice>
      ) : (
        <>
          <Notice tone={fresh === "recent" ? "info" : "warn"}>
            {fresh === "recent" ? "Recent fix" : "Last confirmed location, not live"}: recorded {timeAgo(loc.recorded_at)} ({fmtDate(loc.recorded_at)}). Accuracy {acc?.text}.
            {fresh !== "recent" && " The device may be off, offline, out of battery, or have stopped the app; this is where it was last confirmed."}
          </Notice>
          <GeoMap points={pts} />
          <p className="muted">{loc.latitude.toFixed(6)}, {loc.longitude.toFixed(6)} · Battery {loc.battery_pct ?? "?"}% · {loc.connection_type ?? "unknown"} · mode {loc.tracking_mode.replace("_", " ")} · last sync {timeAgo(st?.last_sync_at ?? null)}</p>
        </>
      )}
      <section className="card space-y-3">
        <h2 className="font-semibold">Ask the device for a fresh location</h2>
        <p className="muted">Delivery depends on the phone being online and the app being allowed to run. The status below shows what actually happened.</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn" disabled={busy} onClick={() => void send("REQUEST_LOCATION")}>Request location</button>
          <button className="btn-ghost" disabled={busy} onClick={() => void send("SYNC_DEVICE_STATUS")}>Sync status</button>
          <button className="btn-ghost" disabled={busy} onClick={() => void send("REQUEST_BATTERY_STATUS")}>Request battery</button>
        </div>
        {msg && <p role="status" className="text-sm">{msg}</p>}
        <CommandHistory deviceId={d.id} />
      </section>
    </div>
  );
}
export default function Location() { return <RequireDevice>{(d) => <Body key={d.id} d={d} />}</RequireDevice>; }
