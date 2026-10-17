import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { callFn, friendly } from "../lib/api";
import { accuracyLabel, fmtDate } from "../lib/format";
import { GeoMap } from "../components/GeoMap";
import { Notice } from "../components/States";

interface Share { devices: { name: string; lost_mode: boolean; last_confirmed_location: { latitude: number; longitude: number; accuracy_m: number; recorded_at: string } | null }[]; }

/** Public page for an emergency contact. Access is by a secret emailed token only. */
export default function ContactPublic() {
  const [params] = useSearchParams();
  const token = params.get("token") ?? "";
  const [confirmed, setConfirmed] = useState(false);
  const [share, setShare] = useState<Share | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function confirm() {
    try { await callFn("contact-verify", { token }); setConfirmed(true); setMsg(null); } catch (e) { setMsg(friendly(e)); }
  }
  async function view() {
    try { setShare(await callFn<Share>("contact-share", { token })); setMsg(null); }
    catch (e) { setMsg(friendly(e).includes("sharing_disabled") ? "The owner has not switched sharing on." : friendly(e)); }
  }
  if (!token) return <div className="p-6"><Notice tone="warn">This link is missing its token.</Notice></div>;
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-4">
      <h1 className="text-2xl font-bold">WYRIX GUARD · Emergency contact</h1>
      <Notice>Someone asked to add you as an emergency contact. If you confirm, they may let you see the last confirmed location of their phone if it is lost. Confirming does not share anything by itself, and you can ignore this page.</Notice>
      <div className="card flex flex-wrap gap-2">
        <button className="btn" onClick={() => void confirm()} disabled={confirmed}>{confirmed ? "Confirmed" : "I agree to be a contact"}</button>
        <button className="btn-ghost" onClick={() => void view()}>View last confirmed location</button>
      </div>
      {msg && <p role="alert" className="text-sm text-emergency">{msg}</p>}
      {share?.devices.map((d) => (
        <section key={d.name} className="card space-y-2">
          <h2 className="font-semibold">{d.name}{d.lost_mode ? " (marked lost)" : ""}</h2>
          {d.last_confirmed_location ? (<>
            <p className="muted">Recorded {fmtDate(d.last_confirmed_location.recorded_at)} · accuracy {accuracyLabel(d.last_confirmed_location.accuracy_m).text}. This is the last confirmed position, not live tracking.</p>
            <GeoMap height="300px" points={[{ lat: d.last_confirmed_location.latitude, lng: d.last_confirmed_location.longitude, accuracy: d.last_confirmed_location.accuracy_m, highlight: true }]} />
          </>) : <p className="muted">No location recorded.</p>}
        </section>))}
    </div>
  );
}
