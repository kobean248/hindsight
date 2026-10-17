"use client";

import { api } from "@/lib/ui/api-client";
import { isSettled } from "@/lib/ui/run-view";
import { usePolling } from "@/lib/ui/use-polling";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { CompareView } from "./compare-view";

export function CompareLive({ baselineId, transferId }: { baselineId?: string; transferId?: string }) {
  const ready = Boolean(baselineId && transferId);
  const { data, error, loading, refresh } = usePolling(
    ready ? () => Promise.all([api.getRun(baselineId!), api.getRun(transferId!)]) : null,
    `${baselineId}|${transferId}`,
    { stopWhen: ([a, b]) => isSettled(a) && isSettled(b) },
  );
  if (!ready) return <EmptyState title="Pick a pair to compare">Open a demo run and use “Compare with paired run”.</EmptyState>;
  if (loading) return <LoadingState label="Loading both runs…" />;
  if (!data) return <ErrorState error={error ?? new Error("no data")} onRetry={refresh} />;
  return <CompareView baseline={data[0]} transfer={data[1]} />;
}
