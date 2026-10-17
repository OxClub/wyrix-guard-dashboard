import type { ReactNode } from "react";
import { useDeviceCtx } from "../lib/device";
import type { Device } from "../lib/types";
import { Empty, ErrorBox, Loading } from "./States";

/** Renders children only when a device is selected; otherwise shows honest empty/error states. */
export function RequireDevice({ children }: { children: (d: Device) => ReactNode }) {
  const { devices, selected } = useDeviceCtx();
  if (devices.loading && !selected) return <Loading label="Loading devices…" />;
  if (devices.error) return <ErrorBox message={devices.error} onRetry={devices.reload} />;
  if (!selected) {
    return <Empty>No enrolled device yet. Install WYRIX GUARD on the phone you want to protect, sign in, and complete enrolment on that phone. This dashboard cannot enrol or track a phone by number or IMEI.</Empty>;
  }
  return <>{children(selected)}</>;
}
