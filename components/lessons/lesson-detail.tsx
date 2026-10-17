"use client";

import { api } from "@/lib/ui/api-client";
import { when } from "@/lib/ui/format";
import { usePolling } from "@/lib/ui/use-polling";
import { RunStatusBadge, VerificationBadge } from "@/components/status";
import { Badge, Card, EmptyState, ErrorState, Field, LoadingState, PageHeader, RunLink } from "@/components/ui";
import { ConfidenceLabel } from "./lesson-card";

function List({ items, empty }: { items: string[]; empty: string }) {
  if (items.length === 0) return <span className="text-muted">{empty}</span>;
  return (
    <ul className="list-disc space-y-0.5 pl-5">
      {items.map((x) => (
        <li key={x}>{x}</li>
      ))}
    </ul>
  );
}

export function LessonDetail({ id }: { id: string }) {
  const { data, error, loading, refresh } = usePolling(() => api.getLesson(id), id);
  if (loading) return <LoadingState label="Loading lesson…" />;
  if (!data) return <ErrorState error={error ?? new Error("no data")} onRetry={refresh} />;
  const { lesson: l, applications } = data;

  return (
    <>
      <PageHeader
        title={l.task_pattern}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <Badge>{l.domain}</Badge>
            <Badge tone={l.status === "active" ? "ok" : "warn"}>{l.status}</Badge>
            <ConfidenceLabel lesson={l} />
          </span>
        }
      />
      {error && <ErrorState error={error} onRetry={refresh} />}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card title="Lesson" className="lg:col-span-2">
          <dl className="space-y-4">
            {l.applies_when && <Field label="Applies when">{l.applies_when}</Field>}
            <Field label="Lesson">{l.lesson_text ?? <span className="text-muted">none written</span>}</Field>
            <Field label="Root cause">
              {l.root_cause ?? <span className="text-muted">not recorded (pilot notes kept only the fix)</span>}
            </Field>
            <Field label="Success criteria">
              {l.success_criteria ?? <span className="text-muted">none</span>}
            </Field>
            <Field label="Risk warnings (irreversible steps)">
              <List items={l.risk_warnings} empty="none" />
            </Field>
            {l.handoff_points && (
              <Field label="Human handoff points">
                <List items={l.handoff_points} empty="none" />
              </Field>
            )}
          </dl>
        </Card>
        <Card title="Evidence">
          <dl className="space-y-3">
            <Field label="Verified successes (s)">{l.times_succeeded}</Field>
            <Field label="Verified applications (n)">{l.times_applied}</Field>
            <Field label="Confidence">
              {l.confidence.toFixed(3)} <span className="text-xs text-muted">Wilson lower bound, 95%</span>
            </Field>
            <Field label="Last validated">{when(l.last_validated_at)}</Field>
            <Field label="Created">{when(l.created_at)}</Field>
            {l.source_run_id && (
              <Field label="Written from run">
                <span className="break-all font-mono text-xs">{l.source_run_id}</span>
              </Field>
            )}
            <Field label="Embedding model">
              <span className="font-mono text-xs">{l.embedding_model}</span>
            </Field>
          </dl>
        </Card>
      </div>
      <Card title="Application history" className="mt-6">
        {applications.length === 0 ? (
          <EmptyState title="Not applied yet">
            Confidence stays at 0 until a later run uses this lesson and the evaluator grades it.
          </EmptyState>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[520px] text-left text-sm">
              <thead className="text-xs text-muted">
                <tr>
                  <th className="py-1.5 pr-3 font-medium">Run</th>
                  <th className="py-1.5 pr-3 font-medium">Task</th>
                  <th className="py-1.5 pr-3 font-medium">Agent</th>
                  <th className="py-1.5 pr-3 font-medium">Run status</th>
                  <th className="py-1.5 pr-3 font-medium">Verification</th>
                  <th className="py-1.5 font-medium">Applied</th>
                </tr>
              </thead>
              <tbody>
                {applications.map((a) => (
                  <tr key={a.id} className="border-t border-border">
                    <td className="py-2 pr-3"><RunLink id={a.run_id} /></td>
                    <td className="py-2 pr-3 font-mono text-xs">{a.task_id}</td>
                    <td className="py-2 pr-3">{a.agent_id}</td>
                    <td className="py-2 pr-3"><RunStatusBadge status={a.run_status} /></td>
                    <td className="py-2 pr-3"><VerificationBadge status={a.verification_status} /></td>
                    <td className="py-2 text-xs text-muted">{when(a.applied_at)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
