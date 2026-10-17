"use client";

import { api } from "@/lib/ui/api-client";
import { usePolling } from "@/lib/ui/use-polling";
import { Card, ErrorState, LoadingState } from "@/components/ui";
import { Kpis } from "./kpis";
import { RunsChart } from "./runs-chart";
import { FailureList, RunsTable } from "./runs-table";

export function DashboardLive() {
  const { data, error, loading, refresh } = usePolling(api.getDashboard, "dashboard");
  if (loading) return <LoadingState label="Loading dashboard…" />;
  if (!data) return <ErrorState error={error ?? new Error("no data")} onRetry={refresh} />;
  return (
    <div className="space-y-6">
      {error && <ErrorState error={error} onRetry={refresh} />}
      <Kpis kpis={data.kpis} />
      <div className="grid gap-6 lg:grid-cols-5">
        <Card title="Steps per run and success rate" className="fade-up [--d:0.3s] lg:col-span-3">
          <RunsChart runs={data.runs} />
        </Card>
        <Card title="Recent failures" className="fade-up [--d:0.4s] lg:col-span-2">
          <FailureList runs={data.recent_failures.slice(0, 5)} />
        </Card>
      </div>
      <Card title="Recent runs" className="fade-up [--d:0.5s]">
        <RunsTable runs={data.runs.slice(0, 10)} empty="No runs yet. Start the demo above." />
      </Card>
    </div>
  );
}
