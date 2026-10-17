import { useState } from "react";
import { supabase } from "../lib/supabase";
import { callFn, friendly } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useDeviceCtx } from "../lib/device";
import { fmtDate, isValidImei } from "../lib/format";
import type { Device, TrackingMode } from "../lib/types";
import { Empty, ErrorBox, Loading, Notice } from "../components/States";

function DeviceRow({ d, onChanged }: { d: Device; onChanged: () => void }) {
  const { withReauth } = useAuth();
  const [name, setName] = useState(d.name);
  const [imei, setImei] = useState(d.imei_owner_entered ?? "");
  const [msg, setMsg] = useState<string | null>(null);

  async function save() {
    if (imei && !isValidImei(imei)) { setMsg("That IMEI is not valid (15 digits, checksum). Dial *#06# on the phone to read it."); return; }
    const { error } = await supabase.from("devices").update({ name, imei_owner_entered: imei || null }).eq("id", d.id);
    setMsg(error ? error.message : "Saved."); if (!error) onChanged();
  }
  async function mode(m: TrackingMode) {
    const { error } = await supabase.from("devices").update({ tracking_mode: m }).eq("id", d.id);
    setMsg(error ? error.message : `Tracking mode set to ${m.replace("_", " ")}. The device applies it the next time it syncs.`);
    if (!error) onChanged();
  }
  async function revoke() {
    if (!window.confirm(`Revoke "${d.name}"? It will stop being tracked and its commands will be cancelled.`)) return;
    try { await withReauth(() => callFn("revoke-device", { device_id: d.id })); onChanged(); }
    catch (e) { setMsg(friendly(e)); }
  }
  return (
    <article className="card space-y-3" aria-label={d.name}>
      <div className="grid gap-3 md:grid-cols-2">
        <div><label className="label" htmlFor={`n-${d.id}`}>Name</label><input id={`n-${d.id}`} className="input" value={name} maxLength={60} onChange={(e) => setName(e.target.value)} /></div>
        <div>
          <label className="label" htmlFor={`m-${d.id}`}>Tracking mode</label>
          <select id={`m-${d.id}`} className="input" value={d.tracking_mode} onChange={(e) => void mode(e.target.value as TrackingMode)}>
            <option value="normal">Normal</option><option value="battery_saving">Battery saving</option><option value="recovery">Recovery (more frequent, uses more battery)</option>
          </select>
        </div>
        <div className="md:col-span-2">
          <label className="label" htmlFor={`i-${d.id}`}>IMEI (your own record; optional)</label>
          <input id={`i-${d.id}`} className="input" inputMode="numeric" maxLength={15} value={imei} onChange={(e) => setImei(e.target.value.replace(/\D/g, ""))} />
          <p className="muted mt-1">Stored only to help you file a police or telecom report. It is never used to locate or authenticate a device.</p>
        </div>
      </div>
      <dl className="muted grid gap-1 text-xs md:grid-cols-2">
        <div>Model: {d.model ?? "-"} · Android {d.android_version ?? "-"}</div>
        <div>Enrolled with consent: {fmtDate(d.consent_at)} (policy {d.consent_version})</div>
        <div className="md:col-span-2 break-all">Device key fingerprint: {d.key_fingerprint}</div>
      </dl>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      <div className="flex flex-wrap gap-2"><button className="btn" onClick={() => void save()}>Save</button><button className="btn-danger" onClick={() => void revoke()}>Revoke device</button></div>
    </article>
  );
}

export default function Devices() {
  const { devices } = useDeviceCtx();
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Devices</h1>
      <Notice>Devices are enrolled from the phone itself, with the owner's explicit consent. Free plan: 1 device. Premium: multiple devices.</Notice>
      {devices.loading && !devices.data.length ? <Loading /> : devices.error ? <ErrorBox message={devices.error} onRetry={devices.reload} /> :
        devices.data.length === 0 ? <Empty>No devices yet.</Empty> : devices.data.map((d) => <DeviceRow key={d.id} d={d} onChanged={devices.reload} />)}
      <section className="card space-y-2">
        <h2 className="font-semibold">If your phone is stolen</h2>
        <ul className="muted list-disc space-y-1 pl-5">
          <li>Report it to the police and keep the complaint/FIR number.</li>
          <li>Ask your mobile operator to block the SIM; keep your IMEI ready.</li>
          <li>In India, use the government's <a className="text-electric underline" href="https://sancharsaathi.gov.in/" target="_blank" rel="noreferrer">Sanchar Saathi</a> portal (CEIR) to block the phone by IMEI.</li>
          <li>WYRIX GUARD cannot find a phone from its IMEI or phone number, and cannot work if the phone is off, reset or has no connection.</li>
        </ul>
      </section>
    </div>
  );
}
