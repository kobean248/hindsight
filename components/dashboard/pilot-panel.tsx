import { PILOT, PILOT_SOURCE, type Prop } from "@/lib/pilot/results";
import { RELEVANCE_FLOOR } from "@/lib/ui/config";
import { compact, pct } from "@/lib/ui/format";
import { Card } from "@/components/ui";

function P({ x }: { x: Prop }) {
  return (
    <>
      <span className="tabular-nums">{pct(x.p)}</span>{" "}
      <span className="text-xs text-muted">
        ({pct(x.lo)}–{pct(x.hi)}, n={x.n})
      </span>
    </>
  );
}

/** Real numbers from the pilot experiment, the baseline this product has to beat. */
export function PilotPanel() {
  const { baseline: b, failures: f, waste: w, kb_effect: kb } = PILOT;
  return (
    <Card title="Pilot benchmark (live sites, before this product)">
      <p className="mb-4 text-xs text-muted">{PILOT_SOURCE}. Judge: same model, not yet hand-validated.</p>
      <dl className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <dt className="text-xs text-muted">Baseline success</dt>
          <dd className="mt-1 text-lg font-semibold"><P x={b.success} /></dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Agent said “done” and was wrong</dt>
          <dd className="mt-1 text-lg font-semibold"><P x={b.false_success} /></dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Failures a short note could prevent</dt>
          <dd className="mt-1 text-lg font-semibold"><P x={f.fixable.yes} /></dd>
        </div>
        <div>
          <dt className="text-xs text-muted">Tokens spent on failed runs</dt>
          <dd className="mt-1 text-lg font-semibold">
            {pct(w.tokens.share)}{" "}
            <span className="text-xs font-normal text-muted">
              ({compact(w.tokens.wasted)} of {compact(w.tokens.total)})
            </span>
          </dd>
        </div>
      </dl>
      <div className="mt-4 rounded-md bg-surface-2 p-3 text-sm">
        <p>
          <span className="font-medium">Naive retrieval made it worse:</span> injecting every note for the site took success from{" "}
          <P x={kb.a.success} /> to <P x={kb.b.success} />. Regressed:{" "}
          {kb.regressions.map((r) => r.task_id).join(", ")}. Irrelevant notes derailed tasks that passed without them.
        </p>
        <p className="mt-2 text-muted">
          That is why this ledger&apos;s lookup drops anything under {RELEVANCE_FLOOR} similarity and returns at most one lesson. Returning
          nothing beats returning something irrelevant.
        </p>
      </div>
    </Card>
  );
}
