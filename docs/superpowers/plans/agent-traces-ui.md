# Agent Traces UI — Implementation Plan

**Goal:** Let the demo audience watch and inspect each individual agent's trace as a live, terminal-style
session (inspired by the OpenHack landing page: dark command panels, `$ command` lines, progressive status
lines like "Sending request… Response received", red/green verdicts). Today a run's trace is only a thin
timeline row list inside the Run Inspector.

**Branch:** `feature/agent-traces-ui` (off `main` @ bc38dd2). Do not commit to `main`.

## Global Constraints (binding on every task)

- **Scope:** UI only. Files you may touch: `components/**`, `app/**` (pages only, no new API routes),
  `lib/ui/**`, `app/globals.css`, `tests/**`, `vitest.config.ts` (only to add test files to `include`).
  Do **not** edit `lib/loop`, `lib/db`, `lib/execution`, `lib/test-double`, `agent/`, `supabase/`, or `PRD.md`.
- **No fabricated data.** Everything shown comes from a `GetRunResponse` (`run.trace`, `events`,
  `verified_success`, evaluator `run_event`) or a `RunSummary`. If a field is absent, show nothing or an
  explicit empty state. Never invent steps, reasoning text, or screenshots. (`screenshot_ref` may be `null`.)
- **This is NOT the Next.js you know** (see `AGENTS.md`): before writing any new route/page/client component
  read the relevant guide in `node_modules/next/dist/docs/`. Match the patterns of the existing files in
  `app/(run)/runs/` and `components/run/`.
- **Styling:** Tailwind v4 with the existing tokens in `app/globals.css` (`bg-surface`, `border-border`,
  `text-muted`, `text-ok`, `text-bad`, `bg-bad-bg`, `text-accent`, …). The terminal panel is the one exception:
  it is **always dark** (both color schemes) using new CSS variables `--term-bg: #0d0d0c`,
  `--term-fg: #e6e6e1`, `--term-dim: #8a8a83`, `--term-ok: #5fd39a`, `--term-bad: #ff8a80`,
  `--term-accent: #7c9dff`, `--term-border: #2a2a27`, exposed as Tailwind colors `term-bg`, `term-fg`,
  `term-dim`, `term-ok`, `term-bad`, `term-accent`, `term-border` via `@theme inline`.
- Every data-fetching view needs **empty, loading and error states** (use `EmptyState`, `LoadingState`,
  `ErrorState` from `components/ui.tsx`). Polling uses `usePolling` (2 s) from `lib/ui/use-polling.ts`.
- Pure logic goes in `lib/ui/*.ts` with unit tests in `tests/*.test.ts` (vitest, node environment — no DOM).
  New test files must be added to `include` in `vitest.config.ts`.
- **Verification commands (run and report output):** `npm run typecheck`, `npx vitest run <your test file>`,
  and for tasks that touch pages/components `npm run build`.
- Commit your work on the branch with a clear message. Stage only files you changed (never `package-lock.json`,
  `.env`, or `node_modules`).

## Existing code you will build on

- `lib/ui/contracts.ts`: `TraceEvent { seq, ts, type: navigate|click|fill|select|screenshot|finish|error,
  selector, value, result: "ok"|"error", error, screenshot_ref, duration_ms }`, `RunSummary`, `GetRunResponse`,
  `DemoState`.
- `lib/ui/run-view.ts`: `evaluatorOf`, `failureStep`, `claimOf`, `isSettled`, `isFalseSuccess`.
- `components/run/timeline.tsx` (keep it; it renders run *events*), `components/run/run-inspector.tsx`,
  `components/dashboard/demo-panel.tsx`, `components/nav-bar.tsx`, `components/ui.tsx`.
- `lib/ui/api-client.ts`: `api.getRun(id)`, `api.getDashboard()`.

---

### Task 1: Trace view helpers (pure, tested)

Create `lib/ui/trace-view.ts` and `tests/trace-view.test.ts` (add the test to `vitest.config.ts` `include`).

Exports (exact names and shapes):

```ts
export type StepTone = "ok" | "bad" | "info" | "neutral";

export interface StepView {
  seq: number;
  command: string;   // terminal line WITHOUT the "$ " prefix, see table
  running: string;   // present-progressive status shown while the step is "in flight"
  done: string;      // final status line: "<Past verb> · ok · 420 ms" or "Failed · <error> · 420 ms"
  tone: StepTone;
}

export function describeStep(t: TraceEvent): StepView;

export interface TraceSummary {
  steps: number;
  errors: number;
  total_ms: number;               // sum of duration_ms
  first_error_seq: number | null;
  claimed_done: boolean;          // trace contains a finish step
  by_type: Partial<Record<TraceEventType, number>>;
}
export function summarizeTrace(trace: TraceEvent[]): TraceSummary;

export interface AgentGroup {
  agent_id: string;
  runs: RunSummary[];             // newest first by started_at (null started_at sorts last)
  latest: RunSummary;             // runs[0]
  total_steps: number;            // sum of runs[].steps
}
export function groupByAgent(runs: RunSummary[]): AgentGroup[]; // sorted by agent_id ascending

export function replayDelay(t: TraceEvent): number; // clamp(duration_ms, 250, 1200) ms; non-finite -> 400
```

`command` table (use `selector`/`value` from the event; truncate any value longer than 80 chars with `…`):

| type | command | running | done verb |
|---|---|---|---|
| navigate | `navigate <value ?? selector ?? "">` | `Navigating…` | `Loaded` |
| click | `click <selector>` | `Clicking <selector>…` | `Clicked` |
| fill | `fill <selector> "<value>"` | `Typing into <selector>…` | `Filled` |
| select | `select <selector> "<value>"` | `Selecting in <selector>…` | `Selected` |
| screenshot | `snapshot` | `Reading page…` | `Captured` |
| finish | `finish "<value>"` | `Agent reports done…` | `Reported done` |
| error | `error` | `Step failed…` | `Failed` |

Missing selector/value render as empty string with no stray double spaces (trim the command). `done` =
`"<verb> · ok · <duration_ms> ms"` when `result === "ok"`, else `"Failed · <error ?? "unknown error"> · <duration_ms> ms"`.
Tone: `result === "error"` → `bad`; `finish` → `info`; `navigate`/`click`/`fill`/`select`/`screenshot` with ok → `ok`;
`error` type → `bad`.

Tests (write them first, all must pass): one `describeStep` case per type incl. an errored click and a
missing-selector case; value truncation; `summarizeTrace` on an empty trace, a trace with an error and a finish;
`groupByAgent` ordering (newest first, null started_at last, agents sorted); `replayDelay` clamps low, high,
and NaN.

### Task 2: Terminal trace component + Run Inspector integration

1. `app/globals.css`: add the `--term-*` variables (same values in both color schemes) and `@theme inline`
   mappings from Global Constraints.
2. Create `components/run/trace-terminal.tsx` (client component) exporting `TraceTerminal`:

```ts
interface TraceTerminalProps {
  trace: TraceEvent[];
  agentId: string;
  runId: string;
  /** run is still executing: show a blinking-cursor "agent working…" line at the end. */
  live?: boolean;
  /** evaluator verdict, if graded: shown as the last line. */
  verdict?: { passed: boolean; score: number } | null;
  /** optional heading override, default `${agentId} · run ${runId.slice(0, 8)}` */
  title?: string;
}
```

   Layout: rounded dark panel (`bg-term-bg text-term-fg border-term-border font-mono text-sm`), header bar with
   three muted dots, the title, and a step-count chip. Body: for each step `describeStep` → a `$ <command>` line
   (`$` in `term-dim`, command in `term-fg`, `term-accent` for the verb), then an indented status line
   (`↳ <done>`) colored by tone (`ok` → `term-ok`, `bad` → `term-bad`, `info` → `term-accent`). Errored steps get a
   left border in `term-bad` and a faint red background. Clicking a step toggles an expanded block showing the
   raw `TraceEvent` fields (`seq`, `ts`, `type`, `selector`, `value`, `result`, `error`, `screenshot_ref`,
   `duration_ms`) as pretty JSON; expanded state is local; rows are keyboard accessible (a `<button>`).
   Footer from `summarizeTrace`: `N steps · E errors · T s` and, when `verdict` is given, a final line
   `evaluator: PASSED (score 1)` in `term-ok` or `evaluator: FAILED (score 0)` in `term-bad`; if `claimed_done`
   and verdict failed, add the line `agent claimed done — evaluator disagrees` in `term-bad`.
   Empty `trace` → a dim `no steps recorded yet` line (plus the live cursor line when `live`).
3. `components/run/run-inspector.tsx`: add a Card titled `Agent trace` containing `<TraceTerminal>` **above** the
   existing `Timeline` card, using `run.agent_id`, `run.id`, `run.trace`, `live={!isSettled(data)}` and the verdict
   from `evaluatorOf(data)`. Keep the existing Timeline card.

Verify with typecheck and `npm run build`. Also start `npm run dev` on a free port, open `/runs/<id>` for a run
from the test double (create one with `POST /api/start-demo-run`, then use the baseline/transfer run ids from
`GET /api/start-demo-run?id=<demo id>`) and confirm via fetching the page that it returns HTTP 200 (you cannot
see pixels; do not claim visual verification).

### Task 3: Replay mode

1. Create `lib/ui/use-replay.ts` — `useReplay(trace: TraceEvent[])` hook returning
   `{ shown: number; phase: "running" | "done"; playing: boolean; finished: boolean; speed: 1 | 2 | 4;
   play(): void; pause(): void; restart(): void; setSpeed(s: 1 | 2 | 4): void }`.
   Semantics: starts paused at `shown = 0`. While `playing`, step index `shown` is displayed as `running`
   for `replayDelay(step) / speed` ms, flips to `done`, waits `150 / speed` ms, then `shown` advances. When
   `shown === trace.length` it sets `finished = true` and `playing = false`. `restart()` resets to 0 and plays.
   Timers must be cleaned up on unmount and when `trace` identity changes.
   Put the advance logic in an exported **pure** function `nextReplayState(state, trace)` and unit-test it in
   `tests/trace-view.test.ts` (extend that file): transitions running→done, done→next step, finish at the end,
   empty trace.
2. Extend `TraceTerminal` with an optional prop `replay?: boolean`. When true it renders only the steps the
   hook has revealed, showing the current step's `running` line (with a blinking cursor) until it flips to its
   `done` line, and renders a control bar (Play / Pause / Restart and a 1× 2× 4× speed toggle) in the header.
   Without `replay` the component behaves exactly as in Task 2. The verdict/footer lines appear only once
   `finished` (or always, when not in replay mode).
3. In `RunInspector`, add a `Replay` toggle button in the `Agent trace` card header; it switches the terminal to
   `replay` mode. Default is the full static trace. The toggle is disabled while the run is still live.

Verify: typecheck, `npx vitest run tests/trace-view.test.ts`, `npm run build`.

### Task 4: `/traces` agent-traces board + nav link

1. Create `components/run/traces-board.tsx` (client) and `app/(run)/traces/page.tsx` (mirror
   `app/(run)/runs/page.tsx`). Add `{ href: "/traces", label: "Traces" }` to `components/nav-bar.tsx`
   between Runs and the end of the list.
2. `TracesBoard`: polls `api.getDashboard()` with `usePolling`; `groupByAgent(data.runs)` gives one **column per
   agent** (`agent-a`, `agent-b`, …; stack on narrow screens, side-by-side from `lg`). Each column header shows the
   agent id, run count and total steps. Under it, a run picker (list of that agent's runs, newest first, each
   with status badge via `RunStatusBadge`, steps count, and verified/claimed-done marker) — default selection is
   the agent's latest run. The selected run is loaded with `api.getRun(id)` (polling while not settled, same as
   `RunInspector`) and rendered in a `TraceTerminal` with `live`, `verdict` (from `evaluatorOf`) and a
   `View full run →` link to `/runs/<id>`. An agent filter row of chips ("All agents" + one per agent) hides
   other columns. States: loading, error with retry, and empty ("No agent runs yet — start a demo on the
   Overview page") with a link to `/`.
3. Keep the selected run per agent in component state; unmount/refresh must not crash when a previously selected
   run disappears (fall back to the agent's latest).

Verify: typecheck, `npm run build`, and fetch `/traces` from a dev server (HTTP 200).

### Task 5: Live side-by-side agent traces on the Overview demo

In `components/dashboard/demo-panel.tsx`, under the three round cards, add a `Live agent traces` section that
shows when `demo?.baseline_run_id` or `demo?.transfer_run_id` is set: a two-column grid (stack below `lg`) with
**Agent A (baseline)** and **Agent B (transfer)**. Each side is a small component (put it in
`components/dashboard/live-agent-trace.tsx`) that polls `api.getRun(runId)` via `usePolling` (stop when settled)
and renders a `TraceTerminal` (with `live` while unsettled and `verdict` when graded). When the transfer run id is
not yet set, show a dim placeholder card "Agent B starts after Reflect writes the lesson". Show a
`Open in Run Inspector →` link on each side. Keep the existing "Compare baseline vs transfer" link and all
existing behavior of the panel unchanged. Loading/error states per side.

Verify: typecheck, `npm run build`, `npm test` (full suite must stay green), and run a demo via the API on a dev
server, confirming both run ids resolve with `GET /api/test-double/get-run?run_id=<id>`.
