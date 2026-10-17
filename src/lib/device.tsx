import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { useDevices, type Loadable } from "./hooks";
import type { Device } from "./types";

interface Value { devices: Loadable<Device[]>; selected: Device | null; select: (id: string) => void; }
const Ctx = createContext<Value | null>(null);

export function DeviceProvider({ children }: { children: ReactNode }) {
  const devices = useDevices();
  const [id, setId] = useState<string | null>(() => sessionStorage.getItem("wg.device"));
  useEffect(() => {
    if (id) sessionStorage.setItem("wg.device", id);
  }, [id]);
  const selected = devices.data.find((d) => d.id === id) ?? devices.data[0] ?? null;
  return <Ctx.Provider value={{ devices, selected, select: setId }}>{children}</Ctx.Provider>;
}
export function useDeviceCtx(): Value {
  const v = useContext(Ctx);
  if (!v) throw new Error("DeviceProvider missing");
  return v;
}
