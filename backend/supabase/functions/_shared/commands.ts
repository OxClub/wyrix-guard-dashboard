import { HttpError } from "./http.ts";

export const COMMAND_TYPES = [
  "REQUEST_LOCATION", "ACTIVATE_LOST_MODE", "DEACTIVATE_LOST_MODE", "TRIGGER_ALARM",
  "STOP_ALARM", "SYNC_DEVICE_STATUS", "REQUEST_BATTERY_STATUS",
] as const;
export type CommandType = typeof COMMAND_TYPES[number];
export type CommandState = "requested" | "delivered" | "executed" | "failed" | "expired";

export const TTL_SECONDS: Record<CommandType, number> = {
  REQUEST_LOCATION: 300, ACTIVATE_LOST_MODE: 900, DEACTIVATE_LOST_MODE: 900, TRIGGER_ALARM: 120,
  STOP_ALARM: 120, SYNC_DEVICE_STATUS: 300, REQUEST_BATTERY_STATUS: 300,
};
export const SENSITIVE: ReadonlySet<CommandType> = new Set(["ACTIVATE_LOST_MODE", "DEACTIVATE_LOST_MODE"]);

export function isCommandType(v: unknown): v is CommandType {
  return typeof v === "string" && (COMMAND_TYPES as readonly string[]).includes(v);
}

export function rateLimitFor(type: CommandType): { max: number; windowSec: number } {
  return type === "TRIGGER_ALARM" ? { max: 3, windowSec: 60 } : { max: 10, windowSec: 60 };
}

export function validatePayload(type: CommandType, payload: unknown): Record<string, unknown> {
  const p = (payload ?? {}) as Record<string, unknown>;
  if (typeof p !== "object" || Array.isArray(p)) throw new HttpError(400, "invalid_payload");
  if (type === "ACTIVATE_LOST_MODE") {
    const message = typeof p.message === "string" ? p.message.trim() : "";
    const contact = typeof p.contact === "string" ? p.contact.trim() : "";
    if (message.length === 0 || message.length > 280) throw new HttpError(400, "invalid_message");
    if (contact.length > 64) throw new HttpError(400, "invalid_contact");
    return { message, contact };
  }
  return {};
}

const NEXT: Record<CommandState, CommandState[]> = {
  requested: ["delivered", "executed", "failed", "expired"],
  delivered: ["executed", "failed", "expired"],
  executed: [], failed: [], expired: [],
};
export function canTransition(from: CommandState, to: CommandState): boolean {
  return NEXT[from]?.includes(to) ?? false;
}
