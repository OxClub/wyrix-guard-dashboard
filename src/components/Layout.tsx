import { NavLink, Outlet } from "react-router-dom";
import { supabase } from "../lib/supabase";
import { useDeviceCtx } from "../lib/device";
import { useOnline } from "../lib/hooks";

const NAV: [string, string][] = [
  ["/", "Overview"], ["/devices", "Devices"], ["/location", "Latest location"], ["/history", "History"],
  ["/lost", "Lost Mode"], ["/alarm", "Alarm"], ["/events", "Security events"], ["/evidence", "Evidence"],
  ["/sim", "SIM alerts"], ["/geofences", "Geofences"], ["/reports", "Reports"], ["/contacts", "Emergency contacts"], ["/settings", "Settings"],
];

export function Layout() {
  const { devices, selected, select } = useDeviceCtx();
  const online = useOnline();
  return (
    <div className="min-h-screen md:flex">
      <a href="#main" className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:bg-white focus:p-2 focus:text-black">Skip to content</a>
      <aside className="border-b border-slate-200 bg-white p-3 dark:border-white/10 dark:bg-navy md:w-64 md:shrink-0 md:border-b-0 md:border-r">
        <div className="mb-3 flex items-center justify-between md:block">
          <div>
            <p className="text-lg font-bold tracking-wide">WYRIX GUARD</p>
            <p className="text-xs text-muted">Control Center</p>
          </div>
          <button className="btn-ghost md:mt-3 md:w-full" onClick={() => void supabase.auth.signOut()}>Sign out</button>
        </div>
        {devices.data.length > 1 && (
          <div className="mb-3">
            <label htmlFor="devsel" className="label">Device</label>
            <select id="devsel" className="input" value={selected?.id ?? ""} onChange={(e) => select(e.target.value)}>
              {devices.data.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
            </select>
          </div>
        )}
        <nav aria-label="Main" className="flex gap-1 overflow-x-auto md:flex-col md:overflow-visible">
          {NAV.map(([to, label]) => (
            <NavLink key={to} to={to} end={to === "/"}
              className={({ isActive }) => `whitespace-nowrap rounded-lg px-3 py-2 text-sm ${isActive ? "bg-electric text-white" : "hover:bg-slate-100 dark:hover:bg-white/5"}`}>
              {label}
            </NavLink>
          ))}
        </nav>
      </aside>
      <main id="main" className="min-w-0 flex-1 p-4 md:p-6">
        {!online && <div role="status" className="mb-4 rounded-lg border border-amber-500/50 p-3 text-sm text-amber-700 dark:text-amber-300">You are offline. Showing the last data loaded; nothing here is live.</div>}
        <Outlet />
      </main>
    </div>
  );
}
