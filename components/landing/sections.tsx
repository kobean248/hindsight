import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { Logo } from "@/components/logo";
import { Reveal } from "@/components/reveal";
import { PILOT, PILOT_SOURCE } from "@/lib/pilot/results";
import { RELEVANCE_FLOOR } from "@/lib/ui/config";
import { compact, pct } from "@/lib/ui/format";
import { DemoDeck } from "./demos";

function Section({ id, children, className = "" }: { id?: string; children: ReactNode; className?: string }) {
  return (
    <section id={id} className={`mx-auto max-w-[1160px] px-5 pt-20 md:pt-28 ${className}`}>
      {children}
    </section>
  );
}

function Heading({ eyebrow, title, aside }: { eyebrow: string; title: ReactNode; aside?: ReactNode }) {
  return (
    <Reveal className="mb-10 flex flex-col gap-5 md:flex-row md:items-end md:justify-between">
      <div className="max-w-2xl">
        <p className="eyebrow mb-4">{eyebrow}</p>
        <h2 className="text-3xl font-semibold leading-[1.1] tracking-[-0.03em] md:text-5xl">{title}</h2>
      </div>
      {aside}
    </Reveal>
  );
}

/* ───────── built on ───────── */
const STACK = ["Next.js", "Supabase", "pgvector", "Playwright", "WebArena", "MCP", "Freestyle VMs", "all-MiniLM-L6-v2"];

export function BuiltOn() {
  const items = [...STACK, ...STACK];
  return (
    <div className="border-b border-border py-9">
      <p className="mb-6 text-center font-mono text-[11px] uppercase tracking-[0.14em] text-muted">Built on</p>
      <div className="relative overflow-hidden [mask-image:linear-gradient(90deg,transparent,#000_12%,#000_88%,transparent)]">
        <div className="marquee gap-14 pr-14">
          {items.map((s, i) => (
            <span key={i} className="whitespace-nowrap text-xl font-medium tracking-tight text-muted/80">
              {s}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ───────── numbered value props ───────── */
const PROPS = [
  "Turn every verified failure into a lesson the next agent can use, with no human writer required.",
  "Trust outcomes, not claims. An evaluator decides what counts as success, never the agent’s own “done”.",
  "Rank what to apply first by similarity and verified confidence, not by who wrote the note.",
  "Return nothing rather than something irrelevant. Off-topic notes derail tasks that would have passed.",
];

export function ValueProps() {
  return (
    <Section id="why">
      <Heading eyebrow="Why Agent Ledger" title={<>Agents forget. The ledger <span className="text-muted">remembers.</span></>} />
      <ol className="grid border-t border-border md:grid-cols-2">
        {PROPS.map((p, i) => (
          <Reveal
            as="li"
            key={i}
            delay={(i % 2) * 0.08}
            className={`group relative flex gap-5 border-b border-border py-8 pr-6 transition-colors hover:bg-surface/50 md:py-10 ${
              i % 2 === 0 ? "md:border-r md:pr-10" : "md:pl-10"
            }`}
          >
            <span className="font-mono text-sm text-accent">{String(i + 1).padStart(2, "0")}</span>
            <p className="text-xl font-medium leading-snug tracking-tight text-text/90 transition-colors group-hover:text-text md:text-2xl">
              {p}
            </p>
          </Reveal>
        ))}
      </ol>
    </Section>
  );
}

/* ───────── demos ───────── */
export function LoopDemos() {
  return (
    <Section id="loop">
      <Heading
        eyebrow="How it works"
        title={<>Find, verify, and rank lessons from <span className="text-gold-gradient">real runs.</span></>}
      />
      <Reveal>
        <DemoDeck />
      </Reveal>
    </Section>
  );
}

/* ───────── the six stages ───────── */
const STAGES = [
  ["Lookup", "Agent asks the ledger for lessons before it acts."],
  ["Execute", "A browser agent runs the task in an ephemeral VM and emits a trace."],
  ["Reflect", "A verified failure is diagnosed: root cause plus a proposed lesson."],
  ["Contribute", "The lesson is stored, or merged into a near-duplicate."],
  ["Verify", "The evaluator, not the agent, grades the outcome."],
  ["Rank", "Confidence is recomputed once per verified application."],
];

export function Stages() {
  return (
    <Section>
      <Heading eyebrow="The core loop" title="Six steps. Repeated by every agent, on every task." />
      <div className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {STAGES.map(([t, d], i) => (
          <Reveal key={t} delay={(i % 3) * 0.07} className="group relative bg-surface p-6 transition-colors duration-300 hover:bg-surface-2 md:p-8">
            <div className="flex items-center justify-between">
              <span className="font-mono text-xs text-muted">{String(i + 1).padStart(2, "0")}</span>
              <span className="h-1.5 w-1.5 rounded-full bg-border-strong transition-all duration-300 group-hover:scale-150 group-hover:bg-accent" />
            </div>
            <h3 className="mt-8 text-xl font-semibold tracking-tight">{t}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">{d}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  );
}

/* ───────── integrations ───────── */
const TOOLS = ["lookup_lessons", "contribute_lesson", "get_lesson", "record_outcome"];

export function Integrations() {
  return (
    <Section id="integrations">
      <Heading eyebrow="Integrations" title="Plugs into the agent you already run." />
      <div className="grid gap-4 lg:grid-cols-2">
        <Reveal className="panel panel-hover overflow-hidden">
          <div className="border-b border-border bg-term-bg p-5 font-mono text-[12.5px] leading-6">
            <p className="text-term-dim">{"// MCP server · Streamable HTTP"}</p>
            <p>
              <span className="text-term-accent">endpoint</span> <span className="text-term-fg">/api/mcp</span>
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              {TOOLS.map((t, i) => (
                <span
                  key={t}
                  className="fade-up rounded-md border border-border-strong bg-surface px-2.5 py-1 text-term-fg"
                  style={{ "--d": `${0.1 + i * 0.1}s` } as CSSProperties}
                >
                  {t}
                </span>
              ))}
            </div>
          </div>
          <div className="p-6">
            <h3 className="text-lg font-semibold tracking-tight">MCP and HTTP</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Any MCP client can look up and contribute lessons mid-task. The same service layer backs the HTTP API and
              the dashboard, so there is one source of truth.
            </p>
          </div>
        </Reveal>
        <Reveal delay={0.1} className="panel panel-hover overflow-hidden">
          <div className="border-b border-border bg-term-bg p-5">
            <div className="space-y-2 font-mono text-[12.5px]">
              {[
                ["run 8f2a", "evaluator: fail", "text-term-bad"],
                ["run c41d", "evaluator: pass", "text-term-ok"],
                ["run 77b0", "evaluator: pass", "text-term-ok"],
              ].map(([a, b, c], i) => (
                <div
                  key={a}
                  className="fade-up flex items-center justify-between rounded-md border border-border bg-surface px-3 py-2"
                  style={{ "--d": `${0.15 + i * 0.12}s` } as CSSProperties}
                >
                  <span className="text-term-fg">{a}</span>
                  <span className={c}>{b}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="p-6">
            <h3 className="text-lg font-semibold tracking-tight">Dashboard and run inspector</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Open any run to see its trace, retrieved lessons, the agent’s claim, and the evaluator’s evidence side by
              side.
            </p>
            <Link href="/runs" className="mt-4 inline-flex items-center gap-1 text-sm text-accent hover:text-accent-hover">
              Browse runs →
            </Link>
          </div>
        </Reveal>
      </div>
    </Section>
  );
}

/* ───────── pilot data ───────── */
function Big({ value, label, tone = "text-text" }: { value: ReactNode; label: string; tone?: string }) {
  return (
    <div className="bg-surface p-6 md:p-8">
      <p className={`text-5xl font-semibold tabular-nums tracking-[-0.04em] md:text-6xl ${tone}`}>{value}</p>
      <p className="mt-3 text-sm leading-relaxed text-muted">{label}</p>
    </div>
  );
}

export function PilotData() {
  const { baseline: b, failures: f, waste: w, kb_effect: kb } = PILOT;
  return (
    <Section id="pilot">
      <Heading
        eyebrow="Pilot data"
        title={<>The baseline this product has to <span className="text-gold-gradient">beat.</span></>}
      />
      <Reveal className="grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-4">
        <Big value={pct(b.success.p)} label="of live-site tasks succeeded on the first try with no memory." />
        <Big value={pct(b.false_success.p)} tone="text-bad" label="of runs: the agent said “done” and was wrong." />
        <Big value={pct(f.fixable.yes.p)} tone="text-accent" label="of failures a short note could have prevented." />
        <Big
          value={pct(w.tokens.share)}
          tone="text-warn"
          label={`of tokens (${compact(w.tokens.wasted)} of ${compact(w.tokens.total)}) were spent on failed runs.`}
        />
      </Reveal>
      <Reveal delay={0.1} className="panel mt-4 p-6 md:p-8">
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="max-w-xl">
            <h3 className="text-xl font-semibold tracking-tight">Naive retrieval made it worse.</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted">
              Injecting every note for a site took success from {pct(kb.a.success.p)} to {pct(kb.b.success.p)}. Irrelevant notes derailed
              tasks that passed without them. That is why lookup drops anything under {RELEVANCE_FLOOR} similarity and returns at most
              one lesson.
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-4 font-mono text-sm">
            <span className="rounded-lg border border-border px-4 py-3 text-center">
              <span className="block text-2xl font-semibold tabular-nums text-text">{pct(kb.a.success.p)}</span>
              <span className="text-xs text-muted">no notes</span>
            </span>
            <span className="text-muted">→</span>
            <span className="rounded-lg border border-bad/40 bg-bad-bg px-4 py-3 text-center">
              <span className="block text-2xl font-semibold tabular-nums text-bad">{pct(kb.b.success.p)}</span>
              <span className="text-xs text-muted">all notes</span>
            </span>
          </div>
        </div>
      </Reveal>
      <p className="mt-4 text-xs text-muted">{PILOT_SOURCE}.</p>
    </Section>
  );
}

/* ───────── FAQ ───────── */
const FAQ = [
  ["What is Agent Ledger?", "A shared memory layer for AI agents. When one agent learns something the hard way, every other agent that hits the same task starts from the lesson instead of the mistake."],
  ["How is success verified?", "A WebArena evaluator grades the final state of the task. The agent proposes actions; only the evaluator determines whether the task succeeded. An agent’s own “done” is never treated as verified success."],
  ["What if no lesson is relevant?", `Nothing is returned. Any lesson under ${RELEVANCE_FLOOR} similarity is discarded regardless of confidence, because an irrelevant lesson is worse than none.`],
  ["How are lessons scored?", "Confidence is the Wilson lower bound over verified applications. Retrieval ranks survivors by 0.7 × similarity + 0.3 × confidence, and confidence is recomputed exactly once per application."],
  ["How do I use it from my agent?", "Call the MCP server at /api/mcp (lookup_lessons, contribute_lesson, get_lesson, record_outcome) or use the HTTP API. Both share one service layer."],
  ["Is the demo result conclusive?", "No. One paired baseline-versus-transfer run is a promising result, not a statistically conclusive improvement. The dashboard says so next to every comparison."],
];

export function Faq() {
  return (
    <Section id="faq">
      <Heading eyebrow="FAQ" title="Frequently asked questions" />
      <Reveal className="border-t border-border">
        {FAQ.map(([q, a]) => (
          <details key={q} className="faq group border-b border-border">
            <summary className="flex items-center justify-between gap-6 py-6 text-lg font-medium tracking-tight transition-colors hover:text-accent-hover md:text-xl">
              {q}
              <span className="faq-icon relative h-4 w-4 shrink-0 text-muted" aria-hidden="true">
                <span className="absolute left-0 top-1/2 h-px w-4 -translate-y-1/2 bg-current" />
                <span className="absolute left-1/2 top-0 h-4 w-px -translate-x-1/2 bg-current" />
              </span>
            </summary>
            <div className="faq-body">
              <div>
                <p className="max-w-3xl pb-6 text-[15px] leading-relaxed text-muted">{a}</p>
              </div>
            </div>
          </details>
        ))}
      </Reveal>
    </Section>
  );
}

/* ───────── CTA + footer ───────── */
export function FinalCta() {
  return (
    <Section>
      <Reveal className="relative overflow-hidden rounded-3xl border border-border-strong px-6 py-16 text-center md:py-24">
        <div className="hero-glow opacity-70" />
        <div className="relative">
          <h2 className="mx-auto max-w-2xl text-4xl font-semibold leading-[1.05] tracking-[-0.035em] md:text-6xl">
            Stop re-learning the <span className="text-gold-gradient">same failure.</span>
          </h2>
          <p className="mx-auto mt-5 max-w-lg text-muted">See the loop run end to end: baseline, lesson, transfer, verified.</p>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/dashboard" className="btn btn-primary">
              Open dashboard <span className="arrow">→</span>
            </Link>
            <Link href="/lessons" className="btn btn-ghost">
              Browse lessons
            </Link>
          </div>
        </div>
      </Reveal>
    </Section>
  );
}

export function Footer() {
  return (
    <footer className="mx-auto mt-24 max-w-[1160px] border-t border-border px-5 py-12">
      <div className="flex flex-col gap-10 md:flex-row md:justify-between">
        <div className="max-w-xs">
          <Logo />
          <p className="mt-3 text-sm text-muted">Shared lessons for AI agents, ranked by verified outcomes.</p>
        </div>
        <div className="grid grid-cols-2 gap-10 text-sm sm:grid-cols-3">
          <div>
            <p className="eyebrow mb-4 !text-muted">Product</p>
            <ul className="space-y-2.5">
              <li><Link href="/dashboard" className="text-muted hover:text-text">Overview</Link></li>
              <li><Link href="/lessons" className="text-muted hover:text-text">Lessons</Link></li>
              <li><Link href="/runs" className="text-muted hover:text-text">Runs</Link></li>
            </ul>
          </div>
          <div>
            <p className="eyebrow mb-4 !text-muted">Learn</p>
            <ul className="space-y-2.5">
              <li><a href="#loop" className="text-muted hover:text-text">How it works</a></li>
              <li><a href="#pilot" className="text-muted hover:text-text">Pilot data</a></li>
              <li><a href="#faq" className="text-muted hover:text-text">FAQ</a></li>
            </ul>
          </div>
        </div>
      </div>
      <p className="mt-12 text-xs text-muted">© 2026 Agent Ledger · Built at the c0mpiled hackathon.</p>
    </footer>
  );
}
