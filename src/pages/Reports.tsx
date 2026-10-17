import { useState } from "react";
import { supabase } from "../lib/supabase";
import { fetchLatest, fetchStatus, useLoad } from "../lib/hooks";
import { useDeviceCtx } from "../lib/device";
import { download, fmtDate } from "../lib/format";
import { buildReportPdf } from "../lib/report";
import { Empty, ErrorBox, Loading, Notice } from "../components/States";
import type { Report, ReportSnapshot } from "../lib/types";

export default function Reports() {
  const { selected } = useDeviceCtx();
  const [note, setNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const q = useLoad<Report[]>(async () => {
    const { data, error } = await supabase.from("recovery_reports").select("*").order("created_at", { ascending: false }).limit(20);
    if (error) throw new Error(error.message);
    return (data ?? []) as Report[];
  }, [], []);

  async function generate() {
    if (!selected) return;
    const [loc, st, ev] = await Promise.all([
      fetchLatest(selected.id), fetchStatus(selected.id),
      supabase.from("security_events").select("type,occurred_at").eq("device_id", selected.id).order("occurred_at", { ascending: false }).limit(15),
    ]);
    const snap: ReportSnapshot = {
      generated_at: new Date().toISOString(),
      owner_claims: { device_name: selected.name, imei: selected.imei_owner_entered, note: note.trim().slice(0, 500) },
      verified_records: {
        device_key_fingerprint: selected.key_fingerprint, enrolled_with_consent_at: selected.consent_at,
        last_location: loc ? { latitude: loc.latitude, longitude: loc.longitude, accuracy_m: loc.accuracy_m, recorded_at: loc.recorded_at } : null,
        last_sync_at: st?.last_sync_at ?? null, recent_events: (ev.data ?? []) as { type: string; occurred_at: string }[],
      },
    };
    const { error } = await supabase.from("recovery_reports").insert({ device_id: selected.id, snapshot: snap });
    if (error) { setMsg(error.message); return; }
    download(`wyrix-recovery-report-${new Date().toISOString().slice(0, 10)}.pdf`, buildReportPdf(snap), "application/pdf");
    setMsg("Report saved and downloaded."); q.reload();
  }

  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Recovery reports</h1>
      <Notice>Reports separate what you typed (owner claims) from what the enrolled phone reported (verified app records). They are not official police documents.</Notice>
      {!selected ? <Empty>Enrol a device to generate a report.</Empty> : (
        <div className="card space-y-3">
          <p className="muted">Device: {selected.name}</p>
          <div><label htmlFor="rn" className="label">Note for the report (optional, max 500)</label><textarea id="rn" className="input min-h-[80px] py-2" maxLength={500} value={note} onChange={(e) => setNote(e.target.value)} /></div>
          <button className="btn" onClick={() => void generate()}>Generate PDF</button>
          {msg && <p role="status" className="text-sm">{msg}</p>}
        </div>)}
      <h2 className="text-lg font-semibold">Saved reports</h2>
      {q.error && <ErrorBox message={q.error} onRetry={q.reload} />}
      {q.loading ? <Loading /> : q.data.length === 0 ? <Empty>No reports yet.</Empty> : (
        <ul className="card divide-y divide-slate-200 dark:divide-white/10">{q.data.map((r) => (
          <li key={r.id} className="flex items-center justify-between gap-2 py-2 text-sm"><span>{r.snapshot.owner_claims.device_name} · {fmtDate(r.created_at)}</span>
            <span className="flex gap-2"><button className="btn-ghost" onClick={() => download(`wyrix-report-${r.id.slice(0, 8)}.pdf`, buildReportPdf(r.snapshot), "application/pdf")}>PDF</button>
              <button className="btn-danger" onClick={async () => { await supabase.from("recovery_reports").delete().eq("id", r.id); q.reload(); }}>Delete</button></span></li>))}</ul>)}
    </div>
  );
}
