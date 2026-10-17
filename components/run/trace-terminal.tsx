"use client";

import { useId, useState } from "react";
import type { TraceEvent } from "@/lib/ui/contracts";
import { describeStep, summarizeTrace, type StepTone } from "@/lib/ui/trace-view";

export interface TraceTerminalProps {
  trace: TraceEvent[];
  agentId: string;
  runId: string;
  /** run is still executing: show a blinking-cursor "agent working…" line at the end. */
  live?: boolean;
  /** evaluator verdict, if graded: shown as the last line. */
  verdict?: { passed: boolean; score: number } | null;
  /** optional heading override, default `${agentId} · run ${runId.slice(0, 8)}` */
  title?: string;
}

const TONE_CLASS: Record<StepTone, string> = {
  ok: "text-term-ok",
  bad: "text-term-bad",
  info: "text-term-accent",
  neutral: "text-term-dim",
};

function rawFields(t: TraceEvent) {
  return {
    seq: t.seq,
    ts: t.ts,
    type: t.type,
    selector: t.selector,
    value: t.value,
    result: t.result,
    error: t.error,
    screenshot_ref: t.screenshot_ref,
    duration_ms: t.duration_ms,
  };
}

function Step({ t }: { t: TraceEvent }) {
  const [open, setOpen] = useState(false);
  const view = describeStep(t);
  const errored = t.result === "error";
  const [verb, ...rest] = view.command.split(" ");
  const detailId = useId();

  return (
    <li className={errored ? "border-l-2 border-term-bad bg-term-bad/10" : "border-l-2 border-transparent"}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls={open ? detailId : undefined}
        className="block w-full px-4 py-1.5 text-left hover:bg-term-fg/5 focus-visible:outline focus-visible:outline-1 focus-visible:-outline-offset-1 focus-visible:outline-term-accent"
      >
        <div className="break-all">
          <span className="text-term-dim">$ </span>
          <span className="text-term-accent">{verb}</span>
          {rest.length > 0 && <span className="text-term-fg"> {rest.join(" ")}</span>}
        </div>
        <div className={`ml-4 break-words ${TONE_CLASS[view.tone]}`}>↳ {view.done}</div>
      </button>
      {open && (
        <pre
          id={detailId}
          className="mx-4 mb-2 ml-8 overflow-x-auto rounded border border-term-border bg-term-bg p-2 text-xs text-term-dim"
        >
          {JSON.stringify(rawFields(t), null, 2)}
        </pre>
      )}
    </li>
  );
}

export function TraceTerminal({ trace, agentId, runId, live = false, verdict = null, title }: TraceTerminalProps) {
  const summary = summarizeTrace(trace);
  const seconds = (summary.total_ms / 1000).toFixed(1);

  return (
    <section
      aria-label={title ?? `${agentId} · run ${runId.slice(0, 8)}`}
      className="overflow-hidden rounded-lg border border-term-border bg-term-bg font-mono text-sm text-term-fg"
    >
      <header className="flex items-center gap-3 border-b border-term-border px-4 py-2">
        <span className="flex gap-1.5" aria-hidden="true">
          <span className="h-2.5 w-2.5 rounded-full bg-term-dim/50" />
          <span className="h-2.5 w-2.5 rounded-full bg-term-dim/50" />
          <span className="h-2.5 w-2.5 rounded-full bg-term-dim/50" />
        </span>
        <span className="min-w-0 truncate text-xs text-term-dim">{title ?? `${agentId} · run ${runId.slice(0, 8)}`}</span>
        <span className="ml-auto shrink-0 rounded border border-term-border px-2 py-0.5 text-xs text-term-dim">
          {summary.steps} {summary.steps === 1 ? "step" : "steps"}
        </span>
      </header>

      <div className="py-2">
        {trace.length === 0 ? (
          <p className="px-4 py-1.5 text-term-dim">no steps recorded yet</p>
        ) : (
          <ol>
            {trace.map((t) => (
              <Step key={t.seq} t={t} />
            ))}
          </ol>
        )}
        {live && (
          <p className="px-4 py-1.5 text-term-dim">
            agent working…<span className="ml-0.5 animate-pulse text-term-fg">▌</span>
          </p>
        )}
      </div>

      <footer className="space-y-0.5 border-t border-term-border px-4 py-2 text-xs">
        <p className="text-term-dim">
          {summary.steps} steps · {summary.errors} errors · {seconds} s
        </p>
        {verdict && (
          <p className={verdict.passed ? "text-term-ok" : "text-term-bad"}>
            evaluator: {verdict.passed ? "PASSED" : "FAILED"} (score {verdict.score})
          </p>
        )}
        {verdict && !verdict.passed && summary.claimed_done && (
          <p className="text-term-bad">agent claimed done — evaluator disagrees</p>
        )}
      </footer>
    </section>
  );
}
