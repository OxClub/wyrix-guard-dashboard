import { useCallback, useEffect, useState } from "react";
import { supabase } from "./supabase";
import type { Device, DeviceStatus, LocationRow, Subscription } from "./types";

export interface Loadable<T> { data: T; loading: boolean; error: string | null; reload: () => void; }

/** Generic loader with error state; `deps` re-run it. */
export function useLoad<T>(fn: () => Promise<T>, initial: T, deps: unknown[]): Loadable<T> {
  const [data, setData] = useState<T>(initial);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    fn().then((d) => { if (!cancelled) { setData(d); setError(null); } })
      .catch((e: unknown) => { if (!cancelled) setError(e instanceof Error ? e.message : "Failed to load"); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, tick]);
  const reload = useCallback(() => setTick((t) => t + 1), []);
  return { data, loading, error, reload };
}

export function useOnline(): boolean {
  const [on, setOn] = useState(navigator.onLine);
  useEffect(() => {
    const u = () => setOn(true), d = () => setOn(false);
    window.addEventListener("online", u); window.addEventListener("offline", d);
    return () => { window.removeEventListener("online", u); window.removeEventListener("offline", d); };
  }, []);
  return on;
}

/** Subscribes to Postgres changes for a table (RLS applies to Realtime too). */
export function useRealtime(table: string, onChange: () => void, filter?: string) {
  useEffect(() => {
    const ch = supabase.channel(`rt-${table}-${filter ?? "all"}-${Math.random().toString(36).slice(2)}`)
      .on("postgres_changes", { event: "*", schema: "public", table, ...(filter ? { filter } : {}) }, () => onChange())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [table, filter]);
}

export function useDevices() {
  const l = useLoad<Device[]>(async () => {
    const { data, error } = await supabase.from("devices").select("*").is("revoked_at", null).order("created_at");
    if (error) throw new Error(error.message);
    return (data ?? []) as Device[];
  }, [], []);
  useRealtime("devices", l.reload);
  return l;
}

export async function fetchStatus(deviceId: string): Promise<DeviceStatus | null> {
  const { data } = await supabase.from("device_status").select("*").eq("device_id", deviceId).maybeSingle();
  return (data as DeviceStatus | null) ?? null;
}
export async function fetchLatest(deviceId: string): Promise<LocationRow | null> {
  const { data } = await supabase.from("device_latest_location").select("*").eq("device_id", deviceId).maybeSingle();
  return (data as LocationRow | null) ?? null;
}

export function useSubscription() {
  return useLoad<Subscription>(async () => {
    const { data } = await supabase.from("subscriptions").select("tier,status,expires_at").maybeSingle();
    const s = data as Subscription | null;
    const active = s && s.tier === "premium" && ["active", "grace"].includes(s.status) && s.expires_at && new Date(s.expires_at) > new Date();
    return active ? s : { tier: "free", status: "inactive", expires_at: null };
  }, { tier: "free", status: "inactive", expires_at: null }, []);
}
