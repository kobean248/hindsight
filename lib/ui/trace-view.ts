import type { RunSummary, TraceEvent, TraceEventType } from "./contracts";

export type StepTone = "ok" | "bad" | "info" | "neutral";

export interface StepView {
  seq: number;
  /** terminal line WITHOUT the "$ " prefix */
  command: string;
  /** present-progressive status shown while the step is "in flight" */
  running: string;
  /** final status line: "<Past verb> · ok · 420 ms" or "Failed · <error> · 420 ms" */
  done: string;
  tone: StepTone;
}

const MAX_VALUE_CHARS = 80;

function clip(s: string): string {
  return s.length > MAX_VALUE_CHARS ? `${s.slice(0, MAX_VALUE_CHARS)}…` : s;
}

function line(...parts: string[]): string {
  return parts.filter((p) => p !== "").join(" ");
}

const VERB: Record<TraceEventType, string> = {
  navigate: "Loaded",
  click: "Clicked",
  fill: "Filled",
  select: "Selected",
  screenshot: "Captured",
  finish: "Reported done",
  error: "Failed",
};

export function describeStep(t: TraceEvent): StepView {
  const selector = t.selector ?? "";
  const value = clip(t.value ?? "");
  const quoted = `"${value}"`;

  let command: string;
  let running: string;
  switch (t.type) {
    case "navigate":
      command = line("navigate", clip(t.value ?? t.selector ?? ""));
      running = "Navigating…";
      break;
    case "click":
      command = line("click", selector);
      running = `${line("Clicking", selector)}…`;
      break;
    case "fill":
      command = line("fill", selector, quoted);
      running = `${line("Typing into", selector)}…`;
      break;
    case "select":
      command = line("select", selector, quoted);
      running = `${line("Selecting in", selector)}…`;
      break;
    case "screenshot":
      command = "snapshot";
      running = "Reading page…";
      break;
    case "finish":
      command = line("finish", quoted);
      running = "Agent reports done…";
      break;
    case "error":
      command = "error";
      running = "Step failed…";
      break;
  }

  const failed = t.result === "error";
  const done = failed
    ? `Failed · ${t.error ?? "unknown error"} · ${t.duration_ms} ms`
    : `${VERB[t.type]} · ok · ${t.duration_ms} ms`;
  const tone: StepTone = failed || t.type === "error" ? "bad" : t.type === "finish" ? "info" : "ok";

  return { seq: t.seq, command, running, done, tone };
}

export interface TraceSummary {
  steps: number;
  errors: number;
  /** sum of duration_ms */
  total_ms: number;
  first_error_seq: number | null;
  /** trace contains a finish step */
  claimed_done: boolean;
  by_type: Partial<Record<TraceEventType, number>>;
}

export function summarizeTrace(trace: TraceEvent[]): TraceSummary {
  const summary: TraceSummary = {
    steps: trace.length,
    errors: 0,
    total_ms: 0,
    first_error_seq: null,
    claimed_done: false,
    by_type: {},
  };
  for (const t of trace) {
    summary.total_ms += t.duration_ms;
    summary.by_type[t.type] = (summary.by_type[t.type] ?? 0) + 1;
    if (t.type === "finish") summary.claimed_done = true;
    if (t.result === "error") {
      summary.errors += 1;
      summary.first_error_seq ??= t.seq;
    }
  }
  return summary;
}

export interface AgentGroup {
  agent_id: string;
  /** newest first by started_at (null started_at sorts last) */
  runs: RunSummary[];
  /** runs[0] */
  latest: RunSummary;
  /** sum of runs[].steps */
  total_steps: number;
}

function startedMs(r: RunSummary): number | null {
  if (r.started_at === null) return null;
  const ms = Date.parse(r.started_at);
  return Number.isNaN(ms) ? null : ms;
}

function newestFirst(a: RunSummary, b: RunSummary): number {
  const am = startedMs(a);
  const bm = startedMs(b);
  if (am === null && bm === null) return 0;
  if (am === null) return 1;
  if (bm === null) return -1;
  return bm - am;
}

/** Groups runs per agent; groups sorted by agent_id ascending. */
export function groupByAgent(runs: RunSummary[]): AgentGroup[] {
  const byAgent = new Map<string, RunSummary[]>();
  for (const r of runs) {
    const list = byAgent.get(r.agent_id);
    if (list) list.push(r);
    else byAgent.set(r.agent_id, [r]);
  }
  return [...byAgent.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([agent_id, list]) => {
      const sorted = [...list].sort(newestFirst);
      return {
        agent_id,
        runs: sorted,
        latest: sorted[0],
        total_steps: sorted.reduce((n, r) => n + r.steps, 0),
      };
    });
}

/** clamp(duration_ms, 250, 1200) ms; non-finite -> 400 */
export function replayDelay(t: TraceEvent): number {
  if (!Number.isFinite(t.duration_ms)) return 400;
  return Math.min(1200, Math.max(250, t.duration_ms));
}
