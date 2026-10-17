import Link from "next/link";
import { RELEVANCE_FLOOR } from "@/lib/ui/config";
import type { GetRunResponse } from "@/lib/ui/contracts";
import { num } from "@/lib/ui/format";
import { contributeOf, diagnosisOf, lookupStateOf } from "@/lib/ui/run-view";
import { VerificationBadge } from "@/components/status";
import { Card, EmptyState, Field } from "@/components/ui";

export function RetrievedLessons({ data }: { data: GetRunResponse }) {
  const state = lookupStateOf(data);
  const appByLesson = new Map(data.applied_lessons.map((a) => [a.lesson_id, a]));
  return (
    <Card title="Lessons retrieved before execution">
      {state === "skipped" && (
        <EmptyState title="Baseline: ran without lessons">No lookup by design, so the failure is the agent&apos;s own.</EmptyState>
      )}
      {state === "empty" && (
        <EmptyState title={`Nothing cleared the ${RELEVANCE_FLOOR} relevance floor`}>
          The agent ran with no injected lessons, which beats running with irrelevant ones.
        </EmptyState>
      )}
      {state === "unknown" && <EmptyState title="No lookup recorded for this run" />}
      {state === "returned" && (
        <ul className="space-y-3">
          {data.retrieved_lessons.map((l) => {
            const app = appByLesson.get(l.id);
            return (
              <li key={l.id} className="rounded-md border border-border p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Link href={`/lessons/${encodeURIComponent(l.id)}`} className="text-sm font-medium hover:underline">
                    {l.task_pattern}
                  </Link>
                  {app && (
                    <span className="ml-auto">
                      <VerificationBadge status={app.verification_status} />
                    </span>
                  )}
                </div>
                <p className="mt-1 text-sm text-muted">{l.lesson_text}</p>
                <p className="mt-1 font-mono text-xs text-muted">
                  similarity {num(l.similarity)} ≥ {RELEVANCE_FLOOR} · confidence {num(l.confidence)} · rank {num(l.rank_score)}
                </p>
              </li>
            );
          })}
        </ul>
      )}
    </Card>
  );
}

export function DiagnosisPanel({ data }: { data: GetRunResponse }) {
  const d = diagnosisOf(data);
  const c = contributeOf(data);
  if (!d && !data.created_lesson) return null;
  return (
    <Card title="Reflect diagnosis">
      {d && (
        <dl className="space-y-3">
          <Field label="Root cause">{d.root_cause ?? "—"}</Field>
          <Field label="Proposed lesson">{d.lesson_text ?? "—"}</Field>
          <Field label="Success criteria">{d.success_criteria ?? "—"}</Field>
          {d.risk_warnings.length > 0 && <Field label="Risk warnings">{d.risk_warnings.join("; ")}</Field>}
        </dl>
      )}
      {data.created_lesson && (
        <p className="mt-3 text-sm">
          {c?.deduplicated ? "Matched existing lesson " : "Contributed as lesson "}
          <Link href={`/lessons/${encodeURIComponent(data.created_lesson.id)}`} className="font-mono text-accent hover:underline">
            {data.created_lesson.id.slice(0, 8)}
          </Link>
          {c?.deduplicated && c.similarity !== null && (
            <span className="text-muted"> (similarity {num(c.similarity)} ≥ 0.92, so no duplicate row)</span>
          )}
        </p>
      )}
    </Card>
  );
}
