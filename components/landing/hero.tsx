import Link from "next/link";
import { PILOT } from "@/lib/pilot/results";
import { pct } from "@/lib/ui/format";

function Kpi({ label, value, tone = "text-text", delay }: { label: string; value: string; tone?: string; delay: number }) {
  return (
    <div className="fade-up rounded-lg border border-border bg-surface/80 p-4" style={{ "--d": `${delay}s` } as React.CSSProperties}>
      <p className="font-mono text-[10px] uppercase tracking-[0.1em] text-muted">{label}</p>
      <p className={`mt-2 text-2xl font-semibold tabular-nums tracking-tight ${tone}`}>{value}</p>
    </div>
  );
}

const ROUNDS = [
  { t: "Round 1 · baseline", d: "Agent A runs with no lessons", state: "done" },
  { t: "Round 2 · reflect", d: "Verified failure becomes a lesson", state: "done" },
  { t: "Round 3 · transfer", d: "Fresh Agent B runs with the lesson", state: "active" },
] as const;

/** Preview of the dashboard, built from the real pilot numbers. */
function ProductPreview() {
  const { baseline: b, failures: f, waste: w } = PILOT;
  return (
    <div className="product-in relative mx-auto mt-16 w-full max-w-[1000px] md:mt-[72px]">
      <div className="pointer-events-none absolute -inset-x-10 -top-6 bottom-0 -z-10 rounded-[40px] bg-[radial-gradient(60%_50%_at_50%_0%,rgb(0_185_126/0.16),transparent_70%)] blur-2xl" />
      <div className="overflow-hidden rounded-2xl border border-border-strong bg-surface shadow-[0_40px_120px_-40px_rgb(0_0_0/0.9)]">
        <div className="flex items-center gap-2 border-b border-border bg-term-bg px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
          <span className="mx-auto rounded-md border border-border bg-bg px-10 py-1 font-mono text-[11px] text-term-dim">
            agent-ledger / dashboard
          </span>
        </div>
        <div className="space-y-5 p-5 text-left md:p-7">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <p className="eyebrow">Overview</p>
              <p className="mt-1 text-lg font-semibold tracking-tight">Lessons from failed agent runs, ranked by verified outcomes</p>
            </div>
            <span className="inline-flex items-center gap-2 rounded-full border border-border px-3 py-1 font-mono text-[11px] text-muted">
              <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
              pilot benchmark · {b.runs} runs
            </span>
          </div>
          <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
            <Kpi label="Baseline success" value={pct(b.success.p)} delay={1.0} />
            <Kpi label="Said “done”, was wrong" value={pct(b.false_success.p)} tone="text-bad" delay={1.1} />
            <Kpi label="Fixable by a note" value={pct(f.fixable.yes.p)} tone="text-accent" delay={1.2} />
            <Kpi label="Tokens on failed runs" value={pct(w.tokens.share)} tone="text-warn" delay={1.3} />
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            {ROUNDS.map((r, i) => (
              <div
                key={r.t}
                className={`fade-up relative overflow-hidden rounded-lg border p-4 ${
                  r.state === "active" ? "border-accent/60 bg-ok-bg" : "border-border"
                }`}
                style={{ "--d": `${1.4 + i * 0.12}s` } as React.CSSProperties}
              >
                {r.state === "active" && <span className="scan-line" />}
                <div className="relative flex items-center justify-between gap-2">
                  <span className="text-sm font-medium">{r.t}</span>
                  {r.state === "active" ? (
                    <span className="rounded-full bg-info-bg px-2 py-0.5 text-[11px] text-info">in progress</span>
                  ) : (
                    <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[11px] text-ok">done</span>
                  )}
                </div>
                <p className="relative mt-1.5 text-xs text-muted">{r.d}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function Hero() {
  return (
    <section className="relative overflow-hidden border-b border-border">
      <div className="hero-glow" />
      <div className="grid-bg pointer-events-none absolute inset-0" />
      <div className="relative mx-auto max-w-[1160px] px-5 pb-24 pt-20 md:pb-28 md:pt-[104px]">
        <div className="mx-auto max-w-[780px] text-center">
          <p
            className="rise mx-auto mb-7 inline-flex items-center gap-2 rounded-full border border-border-strong bg-surface/70 px-3.5 py-1.5 font-mono text-[11px] uppercase tracking-[0.12em] text-muted backdrop-blur"
            style={{ "--d": "0.1s" } as React.CSSProperties}
          >
            <span className="pulse-dot h-1.5 w-1.5 rounded-full bg-accent" />
            Shared memory for AI agents
          </p>
          <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.035em] sm:text-6xl md:text-[72px]">
            <span className="rise inline-block" style={{ "--d": "0.2s" } as React.CSSProperties}>
              Every agent run starts from zero.
            </span>{" "}
            <span className="rise text-gold-gradient inline-block" style={{ "--d": "0.4s" } as React.CSSProperties}>
              Not anymore.
            </span>
          </h1>
          <p
            className="rise mx-auto mt-7 max-w-[620px] text-[17px] leading-relaxed text-muted md:text-lg"
            style={{ "--d": "0.6s" } as React.CSSProperties}
          >
            Agent Ledger turns failed runs into lessons, verifies them with a real evaluator, and ranks them by
            outcome, so the next agent starts from the lesson instead of the mistake.
          </p>
          <div
            className="rise mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
            style={{ "--d": "0.8s" } as React.CSSProperties}
          >
            <Link href="/dashboard" className="btn btn-primary">
              Open dashboard <span className="arrow">→</span>
            </Link>
            <a href="#loop" className="btn btn-ghost">
              See how it works
            </a>
          </div>
        </div>
        <ProductPreview />
      </div>
    </section>
  );
}
