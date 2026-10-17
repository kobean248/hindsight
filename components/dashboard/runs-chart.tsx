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
  const H = 200;
  const pad = { l: 32, r: 36, t: 14, b: 24 };
  const maxSteps = Math.max(...done.map((r) => r.steps), 1);
  const bw = (W - pad.l - pad.r) / done.length;
  const barW = Math.max(Math.min(bw * 0.62, 38), 2);
  const y = (v: number) => pad.t + (1 - v / maxSteps) * (H - pad.t - pad.b);
  const yr = (v: number) => pad.t + (1 - v) * (H - pad.t - pad.b);
  const baseY = H - pad.b;

  let wins = 0;
  const line = done.map((r, i) => {
    if (r.verified_success) wins++;
    return [pad.l + bw * (i + 0.5), yr(wins / (i + 1))] as const;
  });
  const linePts = line.map(([a, b]) => `${a},${b}`).join(" ");
  const areaPts = `${line[0][0]},${baseY} ${linePts} ${line[line.length - 1][0]},${baseY}`;

  return (
    <figure>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full overflow-visible" role="img" aria-label="Steps per run and cumulative success rate">
        <defs>
          <linearGradient id="bar-ok" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--ok)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--ok)" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id="bar-bad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--bad)" stopOpacity="0.95" />
            <stop offset="100%" stopColor="var(--bad)" stopOpacity="0.15" />
          </linearGradient>
          <linearGradient id="area" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--info)" stopOpacity="0.22" />
            <stop offset="100%" stopColor="var(--info)" stopOpacity="0" />
          </linearGradient>
        </defs>
        {[0, 0.25, 0.5, 0.75, 1].map((t) => {
          const gy = pad.t + t * (H - pad.t - pad.b);
          return <line key={t} x1={pad.l} x2={W - pad.r} y1={gy} y2={gy} stroke="var(--border)" strokeDasharray={t === 1 ? undefined : "2 5"} />;
        })}
        <text x={pad.l - 8} y={y(maxSteps) + 4} textAnchor="end" fontSize="10" fill="var(--muted)">{maxSteps}</text>
        <text x={pad.l - 8} y={baseY + 3} textAnchor="end" fontSize="10" fill="var(--muted)">0</text>
        <text x={W - pad.r + 8} y={yr(1) + 4} fontSize="10" fill="var(--muted)">100%</text>
        <text x={W - pad.r + 8} y={yr(0) + 3} fontSize="10" fill="var(--muted)">0%</text>
        {done.map((r, i) => (
          <rect
            key={r.id}
            x={pad.l + bw * (i + 0.5) - barW / 2}
            width={barW}
            y={y(r.steps)}
            height={baseY - y(r.steps)}
            rx={3}
            fill={r.verified_success ? "url(#bar-ok)" : "url(#bar-bad)"}
            stroke={r.verified_success ? "var(--ok)" : "var(--bad)"}
            strokeOpacity={0.5}
            className="bar-grow"
            style={{ "--d": `${i * 0.06}s` } as React.CSSProperties}
          >
            <title>{`${r.task_id} · ${r.agent_id} · ${r.steps} steps · ${r.verified_success ? "pass" : "fail"}`}</title>
          </rect>
        ))}
        {line.length > 1 && <polygon points={areaPts} fill="url(#area)" className="fade-up" style={{ "--d": "0.6s" } as React.CSSProperties} />}
        <polyline
          points={linePts}
          pathLength={1}
          fill="none"
          stroke="var(--info)"
          strokeWidth={2}
          strokeLinecap="round"
          strokeLinejoin="round"
          className="draw-line"
          style={{ filter: "drop-shadow(0 0 6px rgb(132 189 209 / 0.6))" }}
        />
        {line.map(([a, b], i) => (
          <circle
            key={i}
            cx={a}
            cy={b}
            r={3.5}
            fill="var(--bg)"
            stroke="var(--info)"
            strokeWidth={2}
            className="dot-pop"
            style={{ "--d": `${0.5 + i * 0.1}s` } as React.CSSProperties}
          />
        ))}
      </svg>
      <figcaption className="mt-3 flex flex-wrap gap-4 text-xs text-muted">
        <span><span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-ok" />steps, evaluator pass</span>
        <span><span className="mr-1.5 inline-block h-2 w-2 rounded-sm bg-bad" />steps, evaluator fail</span>
        <span><span className="mr-1.5 inline-block h-0.5 w-3 bg-info align-middle" />cumulative success rate</span>
      </figcaption>
    </figure>
  );
}
