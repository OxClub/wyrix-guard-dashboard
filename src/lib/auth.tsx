import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { supabase } from "./supabase";
import { ApiError } from "./api";
import { ReauthDialog } from "../components/ReauthDialog";

interface AuthValue {
  session: Session | null; loading: boolean;
  /** Runs `fn`; if the server demands a fresh sign-in, prompts for the password and retries once. */
  withReauth: <T>(fn: () => Promise<T>) => Promise<T>;
}
const Ctx = createContext<AuthValue>({ session: null, loading: true, withReauth: (f) => f() });
export const useAuth = () => useContext(Ctx);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);
  const [prompt, setPrompt] = useState<{ resolve: (ok: boolean) => void } | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { setSession(data.session); setLoading(false); });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const askReauth = () => new Promise<boolean>((resolve) => setPrompt({ resolve }));
  const withReauth = async <T,>(fn: () => Promise<T>): Promise<T> => {
    try { return await fn(); }
    catch (e) {
      if (e instanceof ApiError && e.code === "reauth_required") {
        if (await askReauth()) return await fn();
      }
      throw e;
    }
  };

  return (
    <Ctx.Provider value={{ session, loading, withReauth }}>
      {children}
      {prompt && (
        <ReauthDialog email={session?.user.email ?? ""} onDone={(ok) => { prompt.resolve(ok); setPrompt(null); }} />
      )}
    </Ctx.Provider>
  );
}
