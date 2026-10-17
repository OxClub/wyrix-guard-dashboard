export type TrackingMode = "normal" | "battery_saving" | "recovery";
export type CommandType =
  | "REQUEST_LOCATION" | "ACTIVATE_LOST_MODE" | "DEACTIVATE_LOST_MODE" | "TRIGGER_ALARM"
  | "STOP_ALARM" | "SYNC_DEVICE_STATUS" | "REQUEST_BATTERY_STATUS";
export type CommandState = "requested" | "delivered" | "executed" | "failed" | "expired";

export interface Device {
  id: string; owner_id: string; name: string; model: string | null; android_version: string | null;
  key_fingerprint: string; consent_at: string; consent_version: string; tracking_mode: TrackingMode;
  lost_mode: boolean; lost_message: string | null; lost_contact: string | null;
  imei_owner_entered: string | null; revoked_at: string | null; last_seen_at: string | null; created_at: string;
}
export interface DeviceStatus {
  device_id: string; battery_pct: number | null; charging: boolean | null; connection_type: string | null;
  android_version: string | null; tracking_active: boolean; capabilities: Record<string, unknown>;
  last_sync_at: string | null; updated_at: string;
}
export interface LocationRow {
  id?: number; device_id: string; latitude: number; longitude: number; accuracy_m: number; recorded_at: string;
  battery_pct: number | null; charging: boolean | null; connection_type: string | null; tracking_mode: TrackingMode;
}
export interface RemoteCommand {
  id: string; device_id: string; type: CommandType; state: CommandState; created_at: string; expires_at: string;
  delivered_at: string | null; executed_at: string | null; failure_reason: string | null;
}
export interface SecurityEvent {
  id: string; device_id: string; type: string; details: Record<string, unknown>; occurred_at: string;
}
export interface Evidence { id: string; event_id: string | null; device_id: string; storage_path: string; captured_at: string; retain_until: string | null; }
export interface Geofence {
  id: string; device_id: string; name: string; latitude: number; longitude: number; radius_m: number;
  notify_enter: boolean; notify_exit: boolean; active: boolean;
}
export interface Contact { id: string; name: string; email: string; status: "pending" | "verified"; share_enabled: boolean; verified_at: string | null; }
export interface Subscription { tier: "free" | "premium"; status: string; expires_at: string | null; }
export interface ReportSnapshot {
  owner_claims: { device_name: string; imei: string | null; note: string };
  verified_records: {
    device_key_fingerprint: string; enrolled_with_consent_at: string;
    last_location: { latitude: number; longitude: number; accuracy_m: number; recorded_at: string } | null;
    last_sync_at: string | null; recent_events: { type: string; occurred_at: string }[];
  };
  generated_at: string;
}
export interface Report { id: string; device_id: string | null; snapshot: ReportSnapshot; created_at: string; }
