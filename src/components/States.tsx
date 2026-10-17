import type { ReactNode } from "react";

export function Loading({ label = "Loading…" }: { label?: string }) {
  return <p role="status" className="muted animate-pulse">{label}</p>;
}
export function ErrorBox({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return (
    <div role="alert" className="card border-emergency/50">
      <p className="text-sm text-emergency">{message}</p>
      {onRetry && <button className="btn-ghost mt-2" onClick={onRetry}>Retry</button>}
    </div>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="card muted">{children}</div>;
}
export function Notice({ tone = "info", children }: { tone?: "info" | "warn"; children: ReactNode }) {
  return <div role="note" className={`rounded-lg border p-3 text-sm ${tone === "warn" ? "border-amber-500/50 text-amber-700 dark:text-amber-300" : "border-electric/40"}`}>{children}</div>;
}
