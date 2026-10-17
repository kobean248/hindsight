"use client";

import { useState, type ReactNode } from "react";
import { useLoop } from "./use-loop";

/* Illustrative loops: scripted frames that mirror the real lookup → verify → rank flow. */

function DemoFrame({
  title,
  chip,
  height = 340,
  children,
}: {
  title: string;
  chip: ReactNode;
  height?: number;
  children: ReactNode;
}) {
  return (
    <div className="relative overflow-hidden rounded-t-xl border-b border-border bg-term-bg" style={{ height }}>
      <div className="flex items-center justify-between border-b border-border px-4 py-2.5 font-mono text-[11px] text-term-dim">
        <span className="flex items-center gap-1.5">
          <span className="h-2 w-2 rounded-full bg-border-strong" />
          <span className="h-2 w-2 rounded-full bg-border-strong" />
          <span className="h-2 w-2 rounded-full bg-border-strong" />
          <span className="ml-2">{title}</span>
        </span>
        {chip}
      </div>
      <div className="relative p-4 font-mono text-[12.5px] leading-6">{children}</div>
    </div>
  );
}

function Line({ on, children, className = "" }: { on: boolean; children: ReactNode; className?: string }) {
  return <div className={`step ${on ? "on" : ""} ${className}`}>{children}</div>;
}

/* ───────── 1. lookup ───────── */
function LookupDemo({ paused }: { paused: boolean }) {
  const { ref, step } = useLoop(5, 1100, paused);
  return (
    <div ref={ref}>
      <DemoFrame title="lookup_lessons" chip={<span className="text-term-ok">MCP</span>}>
        <Line on={step >= 0} className="break-all">
          <span className="text-term-dim">$ </span>
          <span className="text-term-accent">lookup</span>
          <span className="text-term-fg">(domain=&quot;usps.com&quot;, task=&quot;find Saturday hours&quot;)</span>
          {step === 0 && <span className="caret text-term-fg" />}
        </Line>
        <Line on={step >= 1} className="text-term-dim">
          embedding task · all-MiniLM-L6-v2 · 384-dim
        </Line>
        <Line on={step >= 2} className="text-term-dim">
          3 candidates · <span className="text-term-fg">1</span> clears the 0.55 relevance floor
        </Line>
        <Line
          on={step >= 3}
          className={`mt-2 rounded-lg border p-3 ${step >= 3 ? "border-ok/40 bg-ok-bg" : "border-transparent"}`}
        >
          <div className="flex items-center justify-between text-[11px]">
            <span className="text-term-ok">LESSON · usps.com</span>
            <span className="text-term-dim">sim 0.81 · conf 0.74</span>
          </div>
          <p className="mt-1 whitespace-normal font-sans text-[13px] leading-5 text-term-fg">
            Hours live under the store-locator detail pane, not the results table. Open the pane before reading.
          </p>
        </Line>
        <Line on={step >= 4} className="mt-1 text-term-ok">
          → 1 lesson injected into agent context
        </Line>
      </DemoFrame>
    </div>
  );
}

/* ───────── 2. verify ───────── */
function VerifyDemo({ paused }: { paused: boolean }) {
  const { ref, step } = useLoop(5, 1300, paused);
  return (
    <div ref={ref}>
      <DemoFrame
        title="evaluator"
        chip={
          <span className="flex items-center gap-1.5 text-term-dim">
            <span className={`h-1.5 w-1.5 rounded-full bg-term-ok ${step < 4 ? "pulse-dot" : ""}`} />
            live
          </span>
        }
      >
        <Line on={step >= 0}>
          <span className="text-term-dim">agent A · run 8f2a </span>
          <span className="text-term-fg">finish(&quot;Saturday 9–1&quot;)</span>
        </Line>
        <Line on={step >= 1} className="relative mt-2 overflow-hidden rounded-lg border border-border-strong p-3">
          {step === 1 && <span className="scan-line" />}
          <span className="text-term-dim">checking final page state against the task’s ground truth…</span>
        </Line>
        <Line on={step >= 2} className="mt-2 flex flex-wrap items-center gap-2">
          <span className="rounded-full bg-bad-bg px-2 py-0.5 text-[11px] text-term-bad">evaluator: fail</span>
          <span className="rounded-full bg-warn-bg px-2 py-0.5 text-[11px] text-warn">claimed done, not verified</span>
        </Line>
        <Line on={step >= 3} className="mt-2 text-term-dim">
          reflect → root cause: read the weekday row.
          <br />
          <span className="text-term-ok">lesson contributed</span>
        </Line>
        <Line on={step >= 4} className="mt-2">
          <span className="text-term-dim">agent B · run c41d + lesson </span>
          <span className="rounded-full bg-ok-bg px-2 py-0.5 text-[11px] text-term-ok">evaluator: pass</span>
        </Line>
      </DemoFrame>
    </div>
  );
}

/* ───────── 3. rank ───────── */
const ROWS = [
  { id: "a", name: "store-locator detail pane", domain: "usps.com", conf: [0.71, 0.71, 0.71, 0.58] },
  { id: "b", name: "dismiss cookie banner first", domain: "ikea.com", conf: [0.64, 0.64, 0.64, 0.64] },
  { id: "c", name: "filter “Open Saturday” first", domain: "usps.com", conf: [0.31, 0.31, 0.79, 0.79] },
];
// order[step] = row ids top to bottom
const ORDER: string[][] = [
  ["a", "b", "c"],
  ["a", "b", "c"],
  ["c", "a", "b"],
  ["c", "b", "a"],
];
const CAPTION = [
  "Ranking by confidence × similarity",
  "New verified application recorded for “Open Saturday”",
  "Verified success: lesson promoted",
  "Verified failure: older lesson demoted",
];

function RankDemo({ paused }: { paused: boolean }) {
  const { ref, step } = useLoop(4, 1500, paused);
  const order = ORDER[step];
  return (
    <div ref={ref}>
      <DemoFrame title="rank_score" chip={<span className="text-term-dim">0.7 × sim + 0.3 × conf</span>}>
        <div className="relative" style={{ height: 3 * 58 }}>
          {ROWS.map((r) => {
            const idx = order.indexOf(r.id);
            const promoted = r.id === "c" && step >= 2;
            const demoted = r.id === "a" && step === 3;
            return (
              <div
                key={r.id}
                className="absolute inset-x-0 flex h-[50px] items-center justify-between rounded-lg border px-3 transition-[transform,background-color,border-color,box-shadow] duration-700 [transition-timing-function:cubic-bezier(.22,1,.36,1)]"
                style={{
                  transform: `translateY(${idx * 58}px)`,
                  background: promoted ? "rgb(0 185 126 / 0.12)" : demoted ? "rgb(236 134 116 / 0.1)" : "rgb(255 255 255 / 0.02)",
                  borderColor: promoted ? "rgb(0 185 126 / 0.5)" : demoted ? "rgb(236 134 116 / 0.4)" : "#1e2220",
                  boxShadow: promoted ? "inset 2px 0 #00b97e" : demoted ? "inset 2px 0 #ec8674" : "inset 2px 0 transparent",
                }}
              >
                <div className="min-w-0">
                  <div className="truncate font-sans text-[13px] text-term-fg">{r.name}</div>
                  <div className="text-[11px] text-term-dim">{r.domain}</div>
                </div>
                <div className="shrink-0 text-right">
                  <div
                    className={`tabular-nums transition-colors duration-500 ${
                      promoted ? "text-term-ok" : demoted ? "text-term-bad" : "text-term-fg"
                    }`}
                  >
                    {r.conf[step].toFixed(2)}
                  </div>
                  <div className="text-[11px] text-term-dim">confidence</div>
                </div>
              </div>
            );
          })}
        </div>
        <p className="mt-3 truncate text-[11px] text-term-dim" aria-live="polite">
          {CAPTION[step]}
        </p>
      </DemoFrame>
    </div>
  );
}

/* ───────── deck ───────── */
export function DemoDeck() {
  const [paused, setPaused] = useState(false);
  return (
    <div>
      <div className="mb-4 flex justify-end">
        <button
          type="button"
          onClick={() => setPaused((p) => !p)}
          aria-pressed={paused}
          className="btn btn-ghost btn-sm"
        >
          {paused ? "▶ Play demos" : "❚❚ Pause demos"}
        </button>
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        {[
          { n: "01", t: "Lookup", d: "Before acting, an agent asks the ledger. Anything under the relevance floor is dropped, so nothing irrelevant derails the task.", demo: <LookupDemo paused={paused} /> },
          { n: "02", t: "Verify", d: "A WebArena evaluator grades the final state. The agent’s own “done” never counts as success.", demo: <VerifyDemo paused={paused} /> },
          { n: "03", t: "Rank", d: "Every verified outcome re-scores the lesson. Winners rise, lessons that stop working decay.", demo: <RankDemo paused={paused} /> },
        ].map((c) => (
          <div key={c.n} className="panel panel-hover overflow-hidden">
            {c.demo}
            <div className="p-5">
              <p className="eyebrow">{c.n}</p>
              <h3 className="mt-2 text-lg font-semibold tracking-tight">{c.t}</h3>
              <p className="mt-2 text-sm leading-relaxed text-muted">{c.d}</p>
            </div>
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-muted">Illustrative example, scripted to mirror the real flow.</p>
    </div>
  );
}
