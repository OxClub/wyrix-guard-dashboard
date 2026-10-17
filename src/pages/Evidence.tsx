import { useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { useLoad } from "../lib/hooks";
import { fmtDate } from "../lib/format";
import { RequireDevice } from "../components/RequireDevice";
import { Empty, ErrorBox, Loading, Notice } from "../components/States";
import type { Device, Evidence } from "../lib/types";

function Thumb({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    void supabase.storage.from("evidence").createSignedUrl(path, 120).then(({ data }) => { if (live) setUrl(data?.signedUrl ?? null); });
    return () => { live = false; };
  }, [path]);
  return url ? <img src={url} alt="Captured evidence" className="aspect-[3/4] w-full rounded-lg object-cover" loading="lazy" /> : <div className="aspect-[3/4] w-full animate-pulse rounded-lg bg-slate-500/20" />;
}

function Body({ d }: { d: Device }) {
  const q = useLoad<Evidence[]>(async () => {
    const { data, error } = await supabase.from("intruder_evidence").select("*").eq("device_id", d.id).order("captured_at", { ascending: false }).limit(100);
    if (error) throw new Error(error.message);
    return (data ?? []) as Evidence[];
  }, [], [d.id]);
  async function remove(e: Evidence) {
    if (!window.confirm("Delete this photo permanently?")) return;
    await supabase.storage.from("evidence").remove([e.storage_path]);
    await supabase.from("intruder_evidence").delete().eq("id", e.id);
    q.reload();
  }
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Evidence gallery · {d.name}</h1>
      <Notice>Photos exist only if you enabled the optional feature, granted camera permission on the phone, and Android allowed the capture. They are private to your account and deleted automatically after the retention period (7 days free, 30 days Premium).</Notice>
      {q.error && <ErrorBox message={q.error} onRetry={q.reload} />}
      {q.loading ? <Loading /> : q.data.length === 0 ? <Empty>No photos captured.</Empty> : (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          {q.data.map((e) => (
            <figure key={e.id} className="card p-2"><Thumb path={e.storage_path} /><figcaption className="muted mt-1 text-xs">{fmtDate(e.captured_at)}<br />Deletes {fmtDate(e.retain_until)}</figcaption>
              <button className="btn-danger mt-2 w-full" onClick={() => void remove(e)}>Delete</button></figure>))}
        </div>)}
    </div>
  );
}
export default function EvidencePage() { return <RequireDevice>{(d) => <Body key={d.id} d={d} />}</RequireDevice>; }
