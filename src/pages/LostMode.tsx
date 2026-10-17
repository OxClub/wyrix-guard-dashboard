import { useState } from "react";
import { CommandHistory, useCommandSender } from "../components/CommandPanel";
import { RequireDevice } from "../components/RequireDevice";
import { Notice } from "../components/States";
import type { Device } from "../lib/types";

function Body({ d }: { d: Device }) {
  const { send, busy, msg } = useCommandSender(d.id);
  const [message, setMessage] = useState(d.lost_message ?? "This phone is lost. Please contact me.");
  const [contact, setContact] = useState(d.lost_contact ?? "");
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold">Lost Mode · {d.name}</h1>
      <p className={d.lost_mode ? "font-semibold text-emergency" : "muted"}>{d.lost_mode ? "Lost Mode is ACTIVE (confirmed by the device)." : "Lost Mode is off."}</p>
      <Notice tone="warn">Lost Mode only takes effect after the phone is online, receives the command and confirms it. It cannot block power-off or a factory reset. Activating asks you to re-enter your password.</Notice>
      <form className="card space-y-3" onSubmit={(e) => { e.preventDefault(); void send("ACTIVATE_LOST_MODE", { message, contact }); }}>
        <div><label htmlFor="lm" className="label">Message shown on the phone (max 280)</label><textarea id="lm" className="input min-h-[90px] py-2" maxLength={280} required value={message} onChange={(e) => setMessage(e.target.value)} /></div>
        <div><label htmlFor="lc" className="label">Contact phone or email shown on the phone (optional)</label><input id="lc" className="input" maxLength={64} value={contact} onChange={(e) => setContact(e.target.value)} /></div>
        <div className="flex flex-wrap gap-2">
          <button className="btn-danger" disabled={busy}>Activate Lost Mode</button>
          <button type="button" className="btn-ghost" disabled={busy} onClick={() => void send("DEACTIVATE_LOST_MODE")}>Deactivate</button>
        </div>
        {msg && <p role="status" className="text-sm">{msg}</p>}
      </form>
      <section className="card space-y-2"><h2 className="font-semibold">Command status</h2><CommandHistory deviceId={d.id} /></section>
    </div>
  );
}
export default function LostMode() { return <RequireDevice>{(d) => <Body key={d.id} d={d} />}</RequireDevice>; }
