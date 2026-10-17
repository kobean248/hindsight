import { DashboardLive } from "@/components/dashboard/dashboard-live";
import { DemoPanel } from "@/components/dashboard/demo-panel";
import { PilotPanel } from "@/components/dashboard/pilot-panel";
import { PageHeader } from "@/components/ui";
import { POLL_INTERVAL_MS } from "@/lib/ui/config";
import { listRecorded } from "@/lib/recorded";

export const dynamic = "force-dynamic";

export default async function OverviewPage() {
  const recorded = await listRecorded();
  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Lessons from failed agent runs, ranked by evaluator-verified outcomes. An agent's own “done” never counts as success."
        action={
          <span className="inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface/70 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.1em] text-muted backdrop-blur">
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
            live · every {POLL_INTERVAL_MS / 1000}s
          </span>
        }
      />
      <div className="space-y-6">
        <DemoPanel recorded={recorded} />
        <DashboardLive />
        <PilotPanel />
      </div>
    </>
  );
}
