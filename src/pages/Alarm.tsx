import { CommandHistory, useCommandSender } from "../components/CommandPanel";
import { RequireDevice } from "../components/RequireDevice";
import { Notice } from "../components/States";
import type { Device } from "../lib/types";

function Body({ d }: { d: Device }) {
  const { send, busy, msg } = useCommandSender(d.id);
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Remote alarm · {d.name}</h1>
      <Notice>The phone shows a full-screen alarm with a stop control. Volume depends on the phone's audio and Do Not Disturb settings, and the alarm only starts if the phone receives the command in time (expires in 2 minutes). Limited to 3 requests per minute.</Notice>
      <div className="card flex flex-wrap gap-2">
        <button className="btn-danger" disabled={busy} onClick={() => void send("TRIGGER_ALARM")}>Sound alarm</button>
        <button className="btn-ghost" disabled={busy} onClick={() => void send("STOP_ALARM")}>Stop alarm</button>
      </div>
      {msg && <p role="status" className="text-sm">{msg}</p>}
      <section className="card space-y-2"><h2 className="font-semibold">Command status</h2><CommandHistory deviceId={d.id} /></section>
    </div>
  );
}
export default function Alarm() { return <RequireDevice>{(d) => <Body key={d.id} d={d} />}</RequireDevice>; }
