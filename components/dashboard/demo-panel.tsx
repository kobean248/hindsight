"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { api } from "@/lib/ui/api-client";
import type { DemoPhase, DemoState } from "@/lib/ui/contracts";
import { usePolling } from "@/lib/ui/use-polling";
import { Badge, Card, ErrorState, RunLink } from "@/components/ui";

const LAST_DEMO_KEY = "ledger.lastDemoId";

const ROUNDS: { phase: DemoPhase; title: string; blurb: string }[] = [
  { phase: "baseline", title: "Round 1 · baseline", blurb: "Agent A runs with no lessons." },
  { phase: "reflecting", title: "Round 2 · reflecting", blurb: "Reflect diagnoses the verified failure; the lesson is contributed." },
  { phase: "transfer", title: "Round 3 · transfer", blurb: "Fresh Agent B runs with only what lookup returns." },
];
const ORDER: DemoPhase[] = ["baseline", "reflecting", "transfer", "done"];

function roundState(demo: DemoState | null, phase: DemoPhase): "pending" | "active" | "complete" | "error" {
  if (!demo) return "pending";
  const cur = demo.phase === "error" ? -1 : ORDER.indexOf(demo.phase);
  const me = ORDER.indexOf(phase);
  if (demo.phase === "error") {
    const reached = phase === "baseline" ? demo.baseline_run_id : phase === "reflecting" ? demo.lesson_id : demo.transfer_run_id;
    return reached ? "error" : "pending";
  }
  return me < cur ? "complete" : me === cur ? "active" : "pending";
}

function readLastDemo(): string | null {
  try {
    return window.localStorage.getItem(LAST_DEMO_KEY);
  } catch {
    return null;
  }
}

function writeLastDemo(id: string) {
  try {
    window.localStorage.setItem(LAST_DEMO_KEY, id);
  } catch {
    /* storage unavailable: the demo still runs, it just isn't restored on reload */
  }
}

export interface RecordedSummary {
  name: string;
  captured_at: string;
  source: "live" | "test_double";
}

export function DemoPanel({ recorded }: { recorded: RecordedSummary[] }) {
  const [tasks, setTasks] = useState<{ task_id: string; domain: string; instruction: string }[] | null>(null);
  const [taskId, setTaskId] = useState<string>("");
  const [demoId, setDemoId] = useState<string | null>(null);
  const [startError, setStartError] = useState<Error | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api
      .demoTasks()
      .then((r) => {
        setTasks(r.tasks);
        setTaskId(r.tasks[0]?.task_id ?? "");
      })
      .catch((e: Error) => setStartError(e));
    setDemoId(readLastDemo());
  }, []);

  const poll = usePolling(demoId ? () => api.getDemo(demoId) : null, demoId ?? "none", {
    stopWhen: (d) => d.phase === "done" || d.phase === "error",
  });
  const demo = poll.data;
  const running = !!demo && demo.phase !== "done" && demo.phase !== "error";

  async function start() {
    setStarting(true);
    setStartError(null);
    try {
      const d = await api.startDemoRun(taskId || undefined);
      writeLastDemo(d.id);
      setDemoId(d.id);
    } catch (e) {
      setStartError(e as Error);
    } finally {
      setStarting(false);
    }
  }

  const task = tasks?.find((t) => t.task_id === (demo?.task_id ?? taskId));

  return (
    <Card
      title="Demo: baseline → lesson → transfer"
      action={
        <div className="flex items-center gap-2">
          {tasks && tasks.length > 1 && (
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="rounded border border-border bg-surface px-2 py-1 text-sm"
              disabled={running}
            >
              {tasks.map((t) => (
                <option key={t.task_id} value={t.task_id}>{t.task_id}</option>
              ))}
            </select>
          )}
          <button
            onClick={start}
            disabled={starting || running || !tasks || tasks.length === 0}
            className="btn btn-accent btn-sm"
          >
            {running ? "Running…" : starting ? "Starting…" : "Run demo"}
          </button>
        </div>
      }
    >
      {task && (
        <p className="mb-3 text-sm text-muted">
          <span className="font-mono text-xs">{task.task_id}</span> on {task.domain}: {task.instruction}
        </p>
      )}
      {startError && <ErrorState error={startError} />}
      {poll.error && <ErrorState error={poll.error} onRetry={poll.refresh} />}

      <ol className="grid gap-3 sm:grid-cols-3">
        {ROUNDS.map((r, i) => {
          const st = roundState(demo, r.phase);
          const border =
            st === "active" ? "border-accent/70 bg-ok-bg" : st === "complete" ? "border-ok/40" : st === "error" ? "border-bad/50 bg-bad-bg" : "border-border";
          const dot =
            st === "active"
              ? "bg-accent text-[#02130c] ring-pulse"
              : st === "complete"
                ? "bg-ok text-[#02130c]"
                : st === "error"
                  ? "bg-bad text-[#1a0905]"
                  : "border border-border-strong text-muted";
          return (
            <li key={r.phase} className={`relative overflow-hidden rounded-xl border ${border} p-4 transition-colors duration-500`}>
              {st === "active" && <span className="scan-line" />}
              {i < ROUNDS.length - 1 && (
                <span className="absolute -right-3 top-8 z-10 hidden h-px w-3 bg-border-strong sm:block" aria-hidden="true" />
              )}
              <div className="relative flex items-center gap-3">
                <span className={`grid h-7 w-7 shrink-0 place-items-center rounded-full font-mono text-xs font-semibold transition-colors duration-500 ${dot}`}>
                  {st === "complete" ? "?" : st === "error" ? "!" : i + 1}
                </span>
                <span className="text-sm font-medium">{r.title}</span>
                <span className="ml-auto">
                  {st === "active" && <Badge tone="info">in progress</Badge>}
                  {st === "complete" && <Badge tone="ok">done</Badge>}
                  {st === "error" && <Badge tone="bad">stopped</Badge>}
                </span>
              </div>
              <p className="relative mt-3 text-xs leading-relaxed text-muted">{r.blurb}</p>
              <div className="relative mt-2 text-xs">
                {r.phase === "baseline" && demo?.baseline_run_id && <RunLink id={demo.baseline_run_id}>run {demo.baseline_run_id.slice(0, 8)}</RunLink>}
                {r.phase === "reflecting" && demo?.lesson_id && (
                  <Link className="font-mono text-accent hover:underline" href={`/lessons/${demo.lesson_id}`}>
                    lesson {demo.lesson_id.slice(0, 8)}
                  </Link>
                )}
                {r.phase === "transfer" && demo?.transfer_run_id && <RunLink id={demo.transfer_run_id}>run {demo.transfer_run_id.slice(0, 8)}</RunLink>}
              </div>
            </li>
          );
        })}
      </ol>

      {demo?.error && <p className="mt-3 text-sm text-bad">{demo.error}</p>}
      {demo?.phase === "done" && demo.baseline_run_id && demo.transfer_run_id && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <Link
            href={`/runs/compare?baseline=${demo.baseline_run_id}&transfer=${demo.transfer_run_id}`}
            className="font-medium text-accent hover:underline"
          >
            Compare baseline vs transfer →
          </Link>
          <span className="text-xs text-muted">
            One paired run: a promising result, not a statistically conclusive improvement.
          </span>
        </div>
      )}
      <div className="mt-4 border-t border-border pt-3 text-sm">
        <span className="font-medium">Recorded fallback: </span>
        {recorded.length === 0 ? (
          <span className="text-muted">
            none captured yet. Record a rehearsal pair with <code className="font-mono text-xs">npm run capture-pair</code> (PRD §10).
          </span>
        ) : (
          <span className="inline-flex flex-wrap gap-x-3 gap-y-1">
            {recorded.map((r) => (
              <Link key={r.name} href={`/runs/recorded/${r.name}`} className="text-accent hover:underline">
                {r.name}
                <span className="ml-1 text-xs text-muted">({r.source === "live" ? "recorded live" : "recorded test double"})</span>
              </Link>
            ))}
          </span>
        )}
      </div>
      {demo?.source === "test_double" && (
        <p className="mt-3 text-xs text-warn">This demo ran against the scripted test double, not a live agent.</p>
      )}
    </Card>
  );
}
