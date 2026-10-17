import type { GetDashboardResponse } from "@/lib/ui/contracts";
import { num, pct, ratio } from "@/lib/ui/format";
import { CountUp } from "@/components/count-up";
import { Stat } from "@/components/ui";

/** Animated percentage; shows an em dash when there is nothing to divide by. */
function Pct({ x }: { x: number | null }) {
  if (x === null) return <>{pct(x)}</>;
  return <CountUp to={x} format={(n) => pct(n)} />;
}

export function Kpis({ kpis: k }: { kpis: GetDashboardResponse["kpis"] }) {
  const success = ratio(k.verified_successes, k.verified_runs);
  const falseSuccess = ratio(k.false_successes, k.claimed_done_runs);
  return (
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat
        label="Verified success rate"
        tone="ok"
        fill={success}
        delay={0}
        value={<Pct x={success} />}
        hint={`${k.verified_successes} of ${k.verified_runs} evaluator-graded runs`}
      />
      <Stat
        label="False success"
        tone="bad"
        fill={falseSuccess}
        delay={0.08}
        value={<Pct x={falseSuccess} />}
        hint={`${k.false_successes} of ${k.claimed_done_runs} runs where the agent said “done”`}
      />
      <Stat
        label="Active lessons"
        tone="info"
        delay={0.16}
        value={<CountUp to={k.active_lessons} format={(n) => String(Math.round(n))} />}
        hint={`mean confidence ${num(k.mean_confidence)}`}
      />
      <Stat
        label="Verified applications"
        tone="warn"
        delay={0.24}
        value={<CountUp to={k.verified_applications} format={(n) => String(Math.round(n))} />}
        hint="lesson uses with an evaluator verdict"
      />
    </div>
  );
}
