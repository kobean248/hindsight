import type { RunStatus, TraceEvent, VerificationStatus } from "./contracts";

export function pct(x: number | null | undefined, digits = 0): string {
  if (x === null || x === undefined || Number.isNaN(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

export function ratio(k: number, n: number): number | null {
  return n === 0 ? null : k / n;
}

export function num(x: number, digits = 2): string {
  return x.toFixed(digits);
}

export function compact(n: number): string {
  if (n >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (n >= 1e3) return `${Math.round(n / 1e3)}k`;
  return String(n);
}

export function when(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString(undefined, { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit", second: "2-digit" });
}

export function durationMs(start: string | null, end: string | null): string {
  if (!start || !end) return "—";
  const ms = new Date(end).getTime() - new Date(start).getTime();
  return ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`;
}

export function shortId(id: string): string {
  return id.length > 10 ? id.slice(0, 8) : id;
}

/** The agent's own "done" claim: its finish() call, if any. Never a verdict. */
export function finishEvent(trace: TraceEvent[]): TraceEvent | null {
  for (let i = trace.length - 1; i >= 0; i--) if (trace[i].type === "finish") return trace[i];
  return null;
}

export const TERMINAL: RunStatus[] = ["succeeded", "failed", "cancelled", "timed_out"];

export function isTerminal(s: RunStatus): boolean {
  return TERMINAL.includes(s);
}

export const VERIFICATION_LABEL: Record<VerificationStatus, string> = {
  pending: "Pending",
  verified_success: "Verified success",
  verified_failure: "Verified failure",
  unrelated_failure: "Unrelated failure",
};
