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

type DemoTaskOption = {
  task_id: string;
  domain: string;
  instruction: string;
  start_url?: string;
  success_url_includes?: string | null;
};

export function DemoPanel({ recorded }: { recorded: RecordedSummary[] }) {
  const [tasks, setTasks] = useState<DemoTaskOption[] | null>(null);
  const [taskId, setTaskId] = useState<string>("");
  const [startUrl, setStartUrl] = useState<string>("");
  const [demoId, setDemoId] = useState<string | null>(null);
  const [startError, setStartError] = useState<Error | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    api
      .demoTasks()
      .then((r) => {
        setTasks(r.tasks);
        setTaskId(r.tasks[0]?.task_id ?? "");
        setStartUrl(r.tasks[0]?.start_url ?? "");
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
      const d = await api.startDemoRun(taskId || undefined, startUrl.trim() || undefined);
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
              onChange={(e) => {
                const nextId = e.target.value;
                setTaskId(nextId);
                setStartUrl(tasks.find((item) => item.task_id === nextId)?.start_url ?? "");
              }}
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
            className="rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
          >
            {running ? "Running…" : starting ? "Starting…" : "Run demo"}
          </button>
        </div>
      }
    >
      {task && (
        <div className="mb-3 space-y-2 text-sm text-muted">
          <p>
            <span className="font-mono text-xs">{task.task_id}</span> on {task.domain}: {task.instruction}
          </p>
          {task.start_url !== undefined && (
            <label className="block text-xs">
              Start URL
              <input
                value={startUrl}
                onChange={(e) => setStartUrl(e.target.value)}
                disabled={running}
                spellCheck={false}
                className="mt-1 w-full rounded border border-border bg-surface px-2 py-1 font-mono text-xs"
              />
            </label>
          )}
          {task.success_url_includes && (
            <p className="text-xs">Passes when the final page URL contains <span className="font-mono">{task.success_url_includes}</span>.</p>
          )}
        </div>
      )}
      {startError && <ErrorState error={startError} />}
      {poll.error && <ErrorState error={poll.error} onRetry={poll.refresh} />}

      <ol className="grid gap-2 sm:grid-cols-3">
        {ROUNDS.map((r) => {
          const st = roundState(demo, r.phase);
          const border =
            st === "active" ? "border-accent" : st === "complete" ? "border-ok/50" : st === "error" ? "border-bad/50" : "border-border";
          return (
            <li key={r.phase} className={`rounded-md border ${border} p-3`}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-medium">{r.title}</span>
                {st === "active" && <Badge tone="info">in progress</Badge>}
                {st === "complete" && <Badge tone="ok">done</Badge>}
                {st === "error" && <Badge tone="bad">stopped</Badge>}
              </div>
              <p className="mt-1 text-xs text-muted">{r.blurb}</p>
              <div className="mt-2 text-xs">
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
