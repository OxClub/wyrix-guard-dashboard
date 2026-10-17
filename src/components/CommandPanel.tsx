import { useCallback, useEffect, useState } from "react";
import { supabase } from "../lib/supabase";
import { callFn, friendly } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useRealtime } from "../lib/hooks";
import { fmtDate } from "../lib/format";
import type { CommandType, RemoteCommand } from "../lib/types";

const STATE_TEXT: Record<string, string> = {
  requested: "Requested: waiting for the device to pick it up",
  delivered: "Delivered: the device received it",
  executed: "Executed: the device confirmed it",
  failed: "Failed on the device",
  expired: "Expired before the device responded",
};

export function useCommandSender(deviceId: string) {
  const { withReauth } = useAuth();
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const send = useCallback(async (type: CommandType, payload?: Record<string, unknown>) => {
    setBusy(true); setMsg(null);
    try {
      const r = await withReauth(() => callFn<{ push: string }>("send-command", { device_id: deviceId, type, payload }));
      const pushNote: Record<string, string> = {
        sent: "Wake-up notification sent.", no_token: "No push token registered; the device will pick this up next time it syncs.",
        unregistered: "The device's push token is no longer valid; it will pick this up next time it syncs.",
        failed: "Push delivery failed; the device will pick this up next time it syncs.",
        not_configured: "Push is not configured on the server; the device will pick this up next time it syncs.",
      };
      setMsg(pushNote[r.push] ?? "");
    } catch (e) { setMsg(friendly(e)); }
    finally { setBusy(false); }
  }, [deviceId, withReauth]);
  return { send, busy, msg };
}

/** Live list of recent commands for a device with real states. Execution is never assumed. */
export function CommandHistory({ deviceId }: { deviceId: string }) {
  const [rows, setRows] = useState<RemoteCommand[]>([]);
  const [err, setErr] = useState<string | null>(null);
  const load = useCallback(async () => {
    const { data, error } = await supabase.from("remote_commands").select("*").eq("device_id", deviceId)
      .order("created_at", { ascending: false }).limit(8);
    if (error) setErr(error.message); else { setErr(null); setRows((data ?? []) as RemoteCommand[]); }
  }, [deviceId]);
  useEffect(() => { void load(); }, [load]);
  useRealtime("remote_commands", () => void load(), `device_id=eq.${deviceId}`);
  // Poll lightly so "expired" shows even without a realtime event (expiry is applied lazily server-side).
  useEffect(() => { const t = setInterval(() => void load(), 15000); return () => clearInterval(t); }, [load]);

  if (err) return <p role="alert" className="text-sm text-emergency">{err}</p>;
  if (!rows.length) return <p className="muted">No commands sent yet.</p>;
  const now = Date.now();
  return (
    <ul className="space-y-2" aria-label="Recent commands">
      {rows.map((c) => {
        const state = (c.state === "requested" || c.state === "delivered") && new Date(c.expires_at).getTime() < now ? "expired" : c.state;
        return (
          <li key={c.id} className="rounded-lg border border-slate-200 p-3 text-sm dark:border-white/10">
            <div className="flex justify-between gap-2">
              <span className="font-medium">{c.type.replaceAll("_", " ").toLowerCase()}</span>
              <span className={state === "executed" ? "text-secgreen" : state === "failed" || state === "expired" ? "text-emergency" : "text-muted"}>{state}</span>
            </div>
            <p className="muted">{STATE_TEXT[state]}</p>
            <p className="muted">Sent {fmtDate(c.created_at)}{c.failure_reason ? ` · ${c.failure_reason}` : ""}</p>
          </li>
        );
      })}
    </ul>
  );
}
