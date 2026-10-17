import type { RunSummary } from "@/lib/ui/contracts";
import { when } from "@/lib/ui/format";
import { FalseSuccessBadge, RunStatusBadge, VerdictBadge } from "@/components/status";
import { Badge, EmptyState, RunLink } from "@/components/ui";

export function RunsTable({ runs, empty }: { runs: RunSummary[]; empty: string }) {
  if (runs.length === 0) return <EmptyState title={empty} />;
  return (
    <div className="-mx-4 overflow-x-auto px-4">
      <table className="w-full min-w-[560px] text-left text-sm">
        <thead className="text-xs text-muted">
          <tr>
            <th className="py-1.5 pr-3 font-medium">Run</th>
            <th className="py-1.5 pr-3 font-medium">Task</th>
            <th className="py-1.5 pr-3 font-medium">Agent</th>
            <th className="py-1.5 pr-3 font-medium">Status</th>
            <th className="py-1.5 pr-3 font-medium">Verdict</th>
            <th className="py-1.5 pr-3 text-right font-medium">Steps</th>
            <th className="py-1.5 font-medium">Started</th>
          </tr>
        </thead>
        <tbody>
          {runs.map((r) => (
            <tr key={r.id} className="border-t border-border align-top">
              <td className="py-2 pr-3"><RunLink id={r.id} /></td>
              <td className="py-2 pr-3 font-mono text-xs">{r.task_id}</td>
              <td className="py-2 pr-3">
                {r.agent_id}
                {r.lessons_applied > 0 && <span className="ml-1"><Badge tone="info">{r.lessons_applied} lesson{r.lessons_applied > 1 ? "s" : ""}</Badge></span>}
              </td>
              <td className="py-2 pr-3">
                <RunStatusBadge status={r.status} />
                {r.error_code && <div className="mt-1 font-mono text-xs text-bad">{r.error_code}</div>}
              </td>
              <td className="py-2 pr-3">
                <div className="flex flex-wrap gap-1">
                  <VerdictBadge verified={r.verified_success} />
                  {r.agent_claimed_done && r.verified_success === false && <FalseSuccessBadge />}
                </div>
              </td>
              <td className="py-2 pr-3 text-right tabular-nums">{r.steps}</td>
              <td className="py-2 text-xs text-muted">{when(r.started_at)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export function FailureList({ runs }: { runs: RunSummary[] }) {
  if (runs.length === 0) return <EmptyState title="No failed runs yet" />;
  return (
    <ul className="divide-y divide-border text-sm">
      {runs.map((r) => (
        <li key={r.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-2">
          <RunLink id={r.id} />
          <span className="font-mono text-xs">{r.task_id}</span>
          <span className="text-xs text-muted">{r.agent_id}</span>
          <span className="ml-auto flex flex-wrap gap-1">
            {r.error_code ? <Badge tone="bad">{r.error_code}</Badge> : <VerdictBadge verified={r.verified_success} />}
            {r.agent_claimed_done && r.verified_success === false && <FalseSuccessBadge />}
          </span>
        </li>
      ))}
    </ul>
  );
}
