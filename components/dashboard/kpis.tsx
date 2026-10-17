import type { GetDashboardResponse } from "@/lib/ui/contracts";
import { num, pct, ratio } from "@/lib/ui/format";
import { Stat } from "@/components/ui";

export function Kpis({ kpis: k }: { kpis: GetDashboardResponse["kpis"] }) {
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        label="Verified success rate"
        value={pct(ratio(k.verified_successes, k.verified_runs))}
        hint={`${k.verified_successes} of ${k.verified_runs} evaluator-graded runs`}
      />
      <Stat
        label="False success"
        value={pct(ratio(k.false_successes, k.claimed_done_runs))}
        hint={`${k.false_successes} of ${k.claimed_done_runs} runs where the agent said “done”`}
      />
      <Stat label="Active lessons" value={k.active_lessons} hint={`mean confidence ${num(k.mean_confidence)}`} />
      <Stat
        label="Verified applications"
        value={k.verified_applications}
        hint="lesson uses with an evaluator verdict"
      />
    </div>
  );
}
