import { DashboardLive } from "@/components/dashboard/dashboard-live";
import { DemoPanel } from "@/components/dashboard/demo-panel";
import { PilotPanel } from "@/components/dashboard/pilot-panel";
import { PageHeader } from "@/components/ui";

export default function OverviewPage() {
  return (
    <>
      <PageHeader
        title="Overview"
        subtitle="Lessons from failed agent runs, ranked by evaluator-verified outcomes. An agent's own “done” never counts as success."
      />
      <div className="space-y-6">
        <DemoPanel />
        <DashboardLive />
        <PilotPanel />
      </div>
    </>
  );
}
