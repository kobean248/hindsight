import { PILOT, PILOT_SOURCE, type Prop } from "@/lib/pilot/results";
import { RELEVANCE_FLOOR } from "@/lib/ui/config";
import { compact, pct } from "@/lib/ui/format";
import { Card } from "@/components/ui";

const TONES = {
  text: { ok: "text-ok", bad: "text-bad", warn: "text-warn", info: "text-info", neutral: "text-text" },
  bar: { ok: "bg-ok", bad: "bg-bad", warn: "bg-warn", info: "bg-info", neutral: "bg-muted" },
};
type Tone = keyof typeof TONES.text;

/** A proportion drawn as a bar with its 95% interval as a lighter band behind the point estimate. */
function Meter({ label, x, tone, delay }: { label: string; x: Prop; tone: Tone; delay: number }) {
  return (
    <div>
      <dt className="text-xs text-muted">{label}</dt>
      <dd className="mt-2">
        <span className={`text-3xl font-semibold tabular-nums tracking-tight ${TONES.text[tone]}`}>{pct(x.p)}</span>
        <span className="ml-2 text-xs text-muted">
          ({pct(x.lo)}–{pct(x.hi)}, n={x.n})
        </span>
        <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
          <div
            className={`absolute inset-y-0 rounded-full opacity-25 ${TONES.bar[tone]}`}
            style={{ left: `${x.lo * 100}%`, width: `${(x.hi - x.lo) * 100}%` }}
          />
          <div
            className={`bar-x absolute inset-y-0 left-0 rounded-full ${TONES.bar[tone]}`}
            style={{ width: `${x.p * 100}%`, "--d": `${delay}s` } as React.CSSProperties}
          />
        </div>
      </dd>
    </div>
  );
}

/** Real numbers from the pilot experiment, the baseline this product has to beat. */
export function PilotPanel() {
  const { baseline: b, failures: f, waste: w, kb_effect: kb } = PILOT;
  return (
    <Card title="Pilot benchmark (live sites, before this product)">
      <p className="mb-5 text-xs text-muted">{PILOT_SOURCE}. Judge: same model, not yet hand-validated.</p>
      <dl className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        <Meter label="Baseline success" x={b.success} tone="neutral" delay={0.1} />
        <Meter label="Agent said “done” and was wrong" x={b.false_success} tone="bad" delay={0.2} />
        <Meter label="Failures a short note could prevent" x={f.fixable.yes} tone="ok" delay={0.3} />
        <div>
          <dt className="text-xs text-muted">Tokens spent on failed runs</dt>
          <dd className="mt-2">
            <span className="text-3xl font-semibold tabular-nums tracking-tight text-warn">{pct(w.tokens.share)}</span>
            <span className="ml-2 text-xs text-muted">
              ({compact(w.tokens.wasted)} of {compact(w.tokens.total)})
            </span>
            <div className="relative mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className="bar-x absolute inset-y-0 left-0 rounded-full bg-warn"
                style={{ width: `${w.tokens.share * 100}%`, "--d": "0.4s" } as React.CSSProperties}
              />
            </div>
          </dd>
        </div>
      </dl>

      <div className="mt-6 rounded-xl border border-border bg-surface-2/60 p-4 text-sm">
        <p className="font-medium">Naive retrieval made it worse</p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <div>
            <div className="flex items-baseline justify-between text-xs text-muted">
              <span>No notes</span>
              <span className="tabular-nums text-text">{pct(kb.a.success.p)}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface">
              <div className="bar-x h-full rounded-full bg-muted" style={{ width: `${kb.a.success.p * 100}%`, "--d": "0.2s" } as React.CSSProperties} />
            </div>
          </div>
          <div>
            <div className="flex items-baseline justify-between text-xs text-muted">
              <span>Every note for the site injected</span>
              <span className="tabular-nums text-bad">{pct(kb.b.success.p)}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface">
              <div className="bar-x h-full rounded-full bg-bad" style={{ width: `${kb.b.success.p * 100}%`, "--d": "0.35s" } as React.CSSProperties} />
            </div>
          </div>
        </div>
        <p className="mt-3 text-muted">
          Regressed: {kb.regressions.map((r) => r.task_id).join(", ")}. Irrelevant notes derailed tasks that passed without them.
        </p>
        <p className="mt-2 text-muted">
          That is why this ledger&apos;s lookup drops anything under {RELEVANCE_FLOOR} similarity and returns at most one lesson. Returning
          nothing beats returning something irrelevant.
        </p>
      </div>
    </Card>
  );
}
