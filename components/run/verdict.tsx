import type { GetRunResponse } from "@/lib/ui/contracts";
import { claimOf, evaluatorOf, isFalseSuccess } from "@/lib/ui/run-view";
import { FalseSuccessBadge, VerdictBadge } from "@/components/status";
import { Card } from "@/components/ui";

/** The agent's own claim beside the evaluator's verdict and raw evidence (§03 boundary, §09). */
export function Verdict({ data }: { data: GetRunResponse }) {
  const claim = claimOf(data);
  const ev = evaluatorOf(data);
  const { run } = data;
  return (
    <div className="grid gap-4 md:grid-cols-2">
      <Card title="Agent's claim">
        {claim ? (
          <>
            <p className="text-sm">{claim.summary || <span className="text-muted">(empty finish summary)</span>}</p>
            <p className="mt-2 text-xs text-muted">From the agent&apos;s finish() call. Never counted as success on its own.</p>
          </>
        ) : (
          <p className="text-sm text-muted">The agent did not call finish(){run.status === "running" ? " yet" : ""}.</p>
        )}
      </Card>
      <Card title="Evaluator verdict" action={<VerdictBadge verified={run.verified_success} />}>
        {isFalseSuccess(data) && (
          <div className="mb-2">
            <FalseSuccessBadge />
          </div>
        )}
        {run.error_code && (
          <p className="mb-2 text-sm text-bad">
            Run ended with error code <code className="font-mono">{run.error_code}</code>
          </p>
        )}
        {ev ? (
          <>
            <p className="text-sm">{ev.evidence.detail}</p>
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-muted">Raw evaluator payload</summary>
              <pre className="mt-2 whitespace-pre-wrap break-words rounded bg-surface-2 p-2 font-mono text-xs">{JSON.stringify(ev, null, 2)}</pre>
            </details>
          </>
        ) : (
          <p className="text-sm text-muted">{run.error_code ? "No evaluator result was produced." : "Waiting for the evaluator."}</p>
        )}
      </Card>
    </div>
  );
}
