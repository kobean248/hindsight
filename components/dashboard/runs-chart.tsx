import type { RunSummary } from "@/lib/ui/contracts";
import { EmptyState } from "@/components/ui";

/**
 * Steps per run in start order, coloured by the evaluator's verdict, with the
 * cumulative verified success rate as a line. Built from agent_runs rows only.
 */
export function RunsChart({ runs }: { runs: RunSummary[] }) {
  const done = runs.filter((r) => r.verified_success !== null).slice().reverse();
  if (done.length === 0) return <EmptyState title="No verified runs yet">Run the demo to see results here.</EmptyState>;

  const W = 640;
  const H = 180;
  const pad = { l: 32, r: 36, t: 10, b: 22 };
  const maxSteps = Math.max(...done.map((r) => r.steps), 1);
  const bw = (W - pad.l - pad.r) / done.length;
  const barW = Math.max(Math.min(bw * 0.7, 40), 2);
  const y = (v: number) => pad.t + (1 - v / maxSteps) * (H - pad.t - pad.b);
  const yr = (v: number) => pad.t + (1 - v) * (H - pad.t - pad.b);

  let wins = 0;
  const line = done.map((r, i) => {
    if (r.verified_success) wins++;
    return [pad.l + bw * (i + 0.5), yr(wins / (i + 1))] as const;
  });

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Steps per run and cumulative success rate">
        <line x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} stroke="var(--border)" />
        <text x={pad.l - 6} y={y(maxSteps) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{maxSteps}</text>
        <text x={pad.l - 6} y={H - pad.b} textAnchor="end" fontSize="10" fill="var(--muted)">0</text>
        <text x={W - pad.r + 6} y={yr(1) + 4} fontSize="10" fill="var(--muted)">100%</text>
        <text x={W - pad.r + 6} y={yr(0)} fontSize="10" fill="var(--muted)">0%</text>
        {done.map((r, i) => (
          <rect
            key={r.id}
            x={pad.l + bw * (i + 0.5) - barW / 2}
            width={barW}
            y={y(r.steps)}
            height={H - pad.b - y(r.steps)}
            rx={2}
            fill={r.verified_success ? "var(--ok)" : "var(--bad)"}
            opacity={0.8}
          >
            <title>{`${r.task_id} · ${r.agent_id} · ${r.steps} steps · ${r.verified_success ? "pass" : "fail"}`}</title>
          </rect>
        ))}
        <polyline
          points={line.map(([a, b]) => `${a},${b}`).join(" ")}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={2}
        />
        {line.map(([a, b], i) => (
          <circle key={i} cx={a} cy={b} r={3} fill="var(--accent)" />
        ))}
      </svg>
      <figcaption className="mt-2 flex flex-wrap gap-4 text-xs text-muted">
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-ok" />steps, evaluator pass</span>
        <span><span className="mr-1 inline-block h-2 w-2 rounded-sm bg-bad" />steps, evaluator fail</span>
        <span><span className="mr-1 inline-block h-0.5 w-3 bg-accent align-middle" />cumulative success rate</span>
      </figcaption>
    </figure>
  );
}
