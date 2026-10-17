import Link from "next/link";
import type { GetRunResponse } from "@/lib/ui/contracts";
import { num } from "@/lib/ui/format";
import { claimOf, evaluatorOf, isFalseSuccess } from "@/lib/ui/run-view";
import { FalseSuccessBadge, VerdictBadge } from "@/components/status";
import { Badge, Card, EmptyState, Field, RunLink } from "@/components/ui";

function Column({ role, data, href }: { role: string; data: GetRunResponse; href: boolean }) {
  const { run } = data;
  const claim = claimOf(data);
  const ev = evaluatorOf(data);
  const steps = run.trace.filter((t) => t.type !== "screenshot");
  return (
    <Card
      title={
        <span className="flex flex-wrap items-center gap-2">
          {role}
          <span className="text-xs font-normal text-muted">{run.agent_id}</span>
          {href ? <RunLink id={run.id} /> : <span className="font-mono text-xs text-muted">{run.id.slice(0, 8)}</span>}
        </span>
      }
      action={<VerdictBadge verified={run.verified_success} />}
    >
      <dl className="space-y-3">
        <Field label="Lessons in context">
          {data.retrieved_lessons.length === 0 ? (
            <span className="text-muted">none</span>
          ) : (
            <ul className="space-y-1">
              {data.retrieved_lessons.map((l) => (
                <li key={l.id}>
                  {l.task_pattern} <span className="font-mono text-xs text-muted">sim {num(l.similarity)}</span>
                </li>
              ))}
            </ul>
          )}
        </Field>
        <Field label={`Actions (${steps.length})`}>
          <ol className="space-y-1 font-mono text-xs">
            {steps.map((t, i) => (
              <li key={t.seq} className={`break-all ${t.result === "error" ? "text-bad" : ""}`}>
                {i + 1}. {t.type} {t.selector ?? ""} {t.type !== "finish" && t.value ? t.value : ""}
              </li>
            ))}
          </ol>
        </Field>
        <Field label="Agent's claim">
          {claim ? `“${claim.summary}”` : <span className="text-muted">no finish() call</span>}
          {isFalseSuccess(data) && (
            <div className="mt-1">
              <FalseSuccessBadge />
            </div>
          )}
        </Field>
        <Field label="Evaluator evidence">
          {ev ? (
            <>
              <p>{ev.evidence.detail}</p>
              <pre className="mt-1 whitespace-pre-wrap break-words rounded bg-surface-2 p-2 font-mono text-xs">{JSON.stringify(ev, null, 2)}</pre>
            </>
          ) : (
            <span className="text-muted">{run.error_code ?? "pending"}</span>
          )}
        </Field>
      </dl>
    </Card>
  );
}

/** Pure side-by-side view; the live page and recorded playback both render it. */
export function CompareView({
  baseline,
  transfer,
  linkRuns = true,
}: {
  baseline: GetRunResponse;
  transfer: GetRunResponse;
  linkRuns?: boolean;
}) {
  const lesson = baseline.created_lesson;
  const transferred = lesson && transfer.retrieved_lessons.some((l) => l.id === lesson.id);
  return (
    <div className="space-y-6">
      <Card title="Lesson written from the baseline failure">
        {lesson ? (
          <div className="space-y-2 text-sm">
            <p>
              {linkRuns ? (
                <Link href={`/lessons/${encodeURIComponent(lesson.id)}`} className="font-medium hover:underline">
                  {lesson.task_pattern}
                </Link>
              ) : (
                <span className="font-medium">{lesson.task_pattern}</span>
              )}{" "}
              {transferred ? <Badge tone="ok">retrieved by the transfer run</Badge> : <Badge tone="warn">not retrieved by the transfer run</Badge>}
            </p>
            {lesson.root_cause && <p className="text-muted">Root cause: {lesson.root_cause}</p>}
            <p>{lesson.lesson_text}</p>
          </div>
        ) : (
          <EmptyState title="No lesson recorded for the baseline run" />
        )}
      </Card>
      <div className="grid gap-6 lg:grid-cols-2">
        <Column role="Baseline" data={baseline} href={linkRuns} />
        <Column role="Transfer" data={transfer} href={linkRuns} />
      </div>
      <p className="text-xs text-muted">
        Same task, model, prompt and step budget; only the retrieved lesson differs. This is one paired run demonstrating a
        promising result, not a statistically conclusive improvement.
      </p>
    </div>
  );
}
