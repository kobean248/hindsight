"use client";

import Link from "next/link";
import { api } from "@/lib/ui/api-client";
import { durationMs, when } from "@/lib/ui/format";
import { failureStep, isSettled } from "@/lib/ui/run-view";
import { usePolling } from "@/lib/ui/use-polling";
import { RunStatusBadge } from "@/components/status";
import { Badge, Card, ErrorState, LoadingState, PageHeader } from "@/components/ui";
import { DiagnosisPanel, RetrievedLessons } from "./lessons-panels";
import { Timeline } from "./timeline";
import { Verdict } from "./verdict";

export function RunInspector({ id }: { id: string }) {
  const { data, error, loading, refresh } = usePolling(() => api.getRun(id), id, { stopWhen: isSettled });
  if (loading) return <LoadingState label="Loading run…" />;
  if (!data) return <ErrorState error={error ?? new Error("no data")} onRetry={refresh} />;
  const { run } = data;
  const fail = failureStep(data);
  const isBaseline = data.events.some((e) => e.event_type === "lookup_skipped");

  return (
    <>
      <PageHeader
        title={`Run ${run.id.slice(0, 8)}`}
        subtitle={
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs">{run.task_id}</span>
            <span>{run.agent_id}</span>
            <RunStatusBadge status={run.status} />
            {!isSettled(data) && <Badge tone="info">live · polling every 2 s</Badge>}
            <span className="text-xs">
              started {when(run.started_at)} · {durationMs(run.started_at, run.completed_at)}
            </span>
          </span>
        }
        action={
          data.paired_run_id && (
            <Link
              href={
                isBaseline
                  ? `/runs/compare?baseline=${run.id}&transfer=${data.paired_run_id}`
                  : `/runs/compare?baseline=${data.paired_run_id}&transfer=${run.id}`
              }
              className="text-sm font-medium text-accent hover:underline"
            >
              Compare with paired {isBaseline ? "transfer" : "baseline"} run →
            </Link>
          )
        }
      />
      {error && <ErrorState error={error} onRetry={refresh} />}
      <div className="space-y-6">
        <Verdict data={data} />
        <div className="grid gap-6 lg:grid-cols-2">
          <RetrievedLessons data={data} />
          <DiagnosisPanel data={data} />
        </div>
        <Card title={`Timeline (${run.trace.length} trace steps)`}>
          {fail && (
            <p className="mb-3 text-sm text-bad">
              First failing step: #{fail.seq} {fail.type}
              {fail.error ? ` (${fail.error})` : ""}
            </p>
          )}
          <Timeline events={data.events} />
        </Card>
      </div>
    </>
  );
}
