export function accuracyLabel(m: number): { text: string; level: "good" | "fair" | "poor" } {
  const r = Math.round(m);
  if (m <= 50) return { text: `±${r} m`, level: "good" };
  if (m <= 500) return { text: `±${r} m (approximate)`, level: "fair" };
  return { text: `±${r} m (low precision: treat as an area, not a point)`, level: "poor" };
}

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "never";
  const s = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 1000));
  if (s < 60) return "just now";
  if (s < 3600) return `${Math.floor(s / 60)} min ago`;
  if (s < 86400) return `${Math.floor(s / 3600)} h ago`;
  return `${Math.floor(s / 86400)} d ago`;
}

/** Honest freshness: a fix is only "recent" within 5 minutes; we never call anything "live". */
export function freshness(iso: string | null, now = Date.now()): "recent" | "stale" | "unknown" {
  if (!iso) return "unknown";
  return now - new Date(iso).getTime() <= 5 * 60_000 ? "recent" : "stale";
}

export function fmtDate(iso: string | null): string {
  return iso ? new Date(iso).toLocaleString() : "-";
}

/** IMEI check: 15 digits + Luhn. */
export function isValidImei(v: string): boolean {
  if (!/^\d{15}$/.test(v)) return false;
  let sum = 0;
  for (let i = 0; i < 15; i++) {
    let d = Number(v[14 - i]);
    if (i % 2 === 1) { d *= 2; if (d > 9) d -= 9; }
    sum += d;
  }
  return sum % 10 === 0;
}

function csvCell(v: unknown): string {
  let s = v === null || v === undefined ? "" : String(v);
  if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formula injection
  return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}
export function toCsv(rows: Record<string, unknown>[], columns: string[]): string {
  return [columns.join(","), ...rows.map((r) => columns.map((c) => csvCell(r[c])).join(","))].join("\n");
}

export function download(filename: string, content: string | Blob, mime = "text/csv") {
  const blob = content instanceof Blob ? content : new Blob([content], { type: mime });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = filename;
  a.click();
  URL.revokeObjectURL(a.href);
}

export const EVENT_LABELS: Record<string, string> = {
  FAILED_UNLOCK: "Failed unlock attempt", SIM_CHANGED: "SIM changed", SIM_REMOVED: "SIM removed", SIM_INSERTED: "SIM inserted",
  GEOFENCE_ENTER: "Entered geofence", GEOFENCE_EXIT: "Left geofence", LOST_MODE_ON: "Lost Mode on", LOST_MODE_OFF: "Lost Mode off",
  ALARM_TRIGGERED: "Alarm triggered", TRACKING_STOPPED: "Tracking stopped", LOW_BATTERY: "Low battery", ADMIN_DISABLED: "Device admin disabled", PHOTO_CAPTURED: "Evidence photo captured",
};
