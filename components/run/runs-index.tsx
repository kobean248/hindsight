"use client";

import { api } from "@/lib/ui/api-client";
import { usePolling } from "@/lib/ui/use-polling";
import { RunsTable } from "@/components/dashboard/runs-table";
import { Card, ErrorState, LoadingState } from "@/components/ui";

export function RunsIndex() {
  const { data, error, loading, refresh } = usePolling(api.getDashboard, "runs");
  if (loading) return <LoadingState label="Loading runs…" />;
  if (!data) return <ErrorState error={error ?? new Error("no data")} onRetry={refresh} />;
  return (
    <Card>
      <RunsTable runs={data.runs} empty="No runs yet. Start the demo from the Overview." />
    </Card>
  );
}
