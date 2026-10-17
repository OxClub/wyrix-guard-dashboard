import { googleAccessToken } from "./google.ts";

export type PushResult = "sent" | "unregistered" | "failed" | "not_configured";

/**
 * Sends a DATA-ONLY wake-up. The payload carries ids only and is never treated as authorization:
 * the device must fetch the command from Supabase over its authenticated session and validate it.
 */
export async function sendCommandWake(fcmToken: string, commandId: string, deviceId: string): Promise<PushResult> {
  const saJson = Deno.env.get("FCM_SERVICE_ACCOUNT_JSON");
  if (!saJson) return "not_configured";
  try {
    const projectId = JSON.parse(saJson).project_id as string;
    const token = await googleAccessToken(saJson, "https://www.googleapis.com/auth/firebase.messaging");
    const res = await fetch(`https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
      body: JSON.stringify({
        message: {
          token: fcmToken,
          data: { kind: "command", command_id: commandId, device_id: deviceId },
          android: { priority: "HIGH", ttl: "120s" },
        },
      }),
    });
    if (res.ok) return "sent";
    const body = await res.text();
    if (res.status === 404 || body.includes("UNREGISTERED")) return "unregistered";
    console.error("fcm_error", res.status);
    return "failed";
  } catch (e) {
    console.error("fcm_exception", e instanceof Error ? e.message : e);
    return "failed";
  }
}
