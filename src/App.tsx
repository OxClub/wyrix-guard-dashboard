import { HashRouter, Navigate, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./lib/auth";
import { DeviceProvider } from "./lib/device";
import { isConfigured } from "./lib/supabase";
import { Layout } from "./components/Layout";
import { Loading, Notice } from "./components/States";
import Login from "./pages/Login";
import Overview from "./pages/Overview";
import Devices from "./pages/Devices";
import Location from "./pages/Location";
import History from "./pages/History";
import LostMode from "./pages/LostMode";
import Alarm from "./pages/Alarm";
import Events from "./pages/Events";
import Evidence from "./pages/Evidence";
import Geofences from "./pages/Geofences";
import Reports from "./pages/Reports";
import Contacts from "./pages/Contacts";
import Settings from "./pages/Settings";
import ContactPublic from "./pages/ContactPublic";

function Protected() {
  const { session, loading } = useAuth();
  if (loading) return <div className="p-6"><Loading /></div>;
  if (!session) return <Navigate to="/login" replace />;
  return <DeviceProvider><Layout /></DeviceProvider>;
}

export default function App() {
  if (!isConfigured) {
    return <div className="p-6"><Notice tone="warn">Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY at build time (see .env.example).</Notice></div>;
  }
  return (
    <AuthProvider>
      <HashRouter>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/contact" element={<ContactPublic />} />
          <Route element={<Protected />}>
            <Route index element={<Overview />} />
            <Route path="devices" element={<Devices />} />
            <Route path="location" element={<Location />} />
            <Route path="history" element={<History />} />
            <Route path="lost" element={<LostMode />} />
            <Route path="alarm" element={<Alarm />} />
            <Route path="events" element={<Events mode="all" />} />
            <Route path="sim" element={<Events mode="sim" />} />
            <Route path="evidence" element={<Evidence />} />
            <Route path="geofences" element={<Geofences />} />
            <Route path="reports" element={<Reports />} />
            <Route path="contacts" element={<Contacts />} />
            <Route path="settings" element={<Settings />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </HashRouter>
    </AuthProvider>
  );
}
