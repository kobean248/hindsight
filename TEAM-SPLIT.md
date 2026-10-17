# Agent Ledger — Team Split (3 builders, 3 agents)

Companion to `PRD.md` (AL-002). Read that first — this doc assigns
ownership and sequencing for a 3-person team, each running their own
coding agent in parallel; it does not redefine anything the PRD already
locked. Where this doc and the PRD disagree, the PRD wins — flag it,
don't silently resolve it in favor of whichever is more convenient to
build.

## Why this split works

Three things the PRD already locked are what make three agents
parallelizable instead of a chain of blocking handoffs:

1. **Every contract between the lanes is already written down** — the
   DB schema (PRD §05), the `ExecutionAdapter` interface (§08), and the
   API operation table (§07). No lane needs to wait on a design
   conversation with another lane; they need to wait on an
   *implementation*, and only for specific calls (below).
2. **The `ExecutionAdapter` test double (§08) decouples the data/loop
   logic and the frontend from the real Freestyle/Playwright/WebArena
   integration.** Two of the three lanes can build their entire scope
   against a fake and never touch a live VM until the final integration
   pass.
3. **Directory ownership below is non-overlapping.** Three agents
   editing the same repo without overlapping files is what keeps this
   from becoming a merge-conflict exercise.

**Hard rule for all three agents: don't edit outside your lane's
directories, and don't change a shared contract (schema, the
`ExecutionAdapter` interface signature, or the §07 API table) without
raising it to the other two first.** A lane discovering the contract is
wrong is a real, expected outcome — silently patching around it in your
own lane is not.

## Working mechanics

- One branch per lane off `main`: `lane-a-data`, `lane-b-execution`,
  `lane-c-frontend`. Each person's agent works in its own clone/branch.
- Give each agent the full `PRD.md` **and** this doc at kickoff, and tell
  it explicitly which lane it owns.
- Merge at the checkpoints below, not continuously — continuous merges
  across three agents editing concurrently is how semantic drift creeps
  in unnoticed.
- After each checkpoint merge, one person (rotate, or whoever's lane just
  landed) runs typecheck/lint/build on the merged result before the next
  checkpoint starts. A broken `main` blocks everyone, so this step isn't
  optional.
- If a lane is blocked waiting on another lane's real implementation, it
  keeps working against the test double / the published contract shape —
  it does not stall, and it does not start implementing the other lane's
  piece itself "to unblock."

## Lane A — Data & Core Loop

**Owns:** the database, the confidence/ranking math, the loop
orchestration that sequences `reflect → contribute → recordApplication →
verify → recordOutcome`, and **both public entry points over that same
logic** — the HTTP routes and the MCP server (PRD §03/04/06/07).

**Directories:** `supabase/migrations/*`, `lib/db/*`, `lib/scoring/*`
(Wilson confidence + ranking, §06), `lib/loop/*` (orchestration),
`app/api/lookup`, `app/api/contribute`, `app/api/get-run`,
`app/api/get-dashboard`, `app/api/mcp/*` (thin route/tool handlers
calling into `lib/` — the MCP tool handlers must not reimplement any
logic that already lives in `lib/`).

**Build, in order:**
1. Apply the 4-table schema + DB functions from PRD §05 as migrations.
2. Typed DB access layer (`lib/db`) — no raw SQL strings outside this layer.
3. Confidence + ranking exactly as specified in §06 (Wilson lower bound,
   0.75 relevance floor, `0.7×similarity + 0.3×confidence`, 0.92 dedup
   threshold) — unit test these against hand-built fixtures before
   anything else touches them.
4. `lookup`/`contribute`/`getLesson` route handlers.
5. The MCP server at `/api/mcp` (Streamable HTTP) exposing
   `lookup_lessons`/`contribute_lesson`/`get_lesson` as thin wrappers over
   the exact same calls the HTTP routes make — PRD §04 is explicit that
   this is MVP, not optional, since the product's whole premise is an
   external agent calling in. `record_outcome` lands once step 6 exists.
6. The loop orchestrator (`reflect`→…→`recordOutcome`), calling
   `ExecutionAdapter.verify`-equivalent through the interface Lane B
   publishes (see below) — build this against Lane B's **test double**
   from hour one; do not wait for the real adapter. Wire the MCP
   `record_outcome` tool as a chained `verify()`-then-`recordOutcome()`
   call that only ever accepts `application_id`/`run_id` from the
   caller — never a client-supplied success value (PRD §04's trust
   boundary).
7. Idempotency: unique-constraint-guarded `recordOutcome`, unit test the
   double-call-is-a-no-op case explicitly — this is the easiest rule in
   the PRD to accidentally violate.

**Depends on:** nothing to start — the schema and math are already fully
specified. Needs Lane B's `ExecutionAdapter` *interface* (just the TS
type) to compile against; if Lane B hasn't published it within the first
hour, write it yourself from PRD §08 verbatim and flag the duplication
for Lane B to reconcile into, don't block on it.

**Hands off by end of day 1:** all 9 operations' internal logic working
against the test double, reachable through both HTTP and MCP, with unit
tests for scoring/dedup/idempotency green.

## Lane B — Execution & Agent

**Owns:** the `ExecutionAdapter` interface and both its implementations,
the Claude tool-use agent loop, the Freestyle VM template, and the
WebArena evaluator wiring (PRD §08).

**Directories:** `lib/execution/*` (interface + `TestExecutionAdapter` +
`FreestyleExecutionAdapter`), `agent/*` (tool-use loop: `navigate`,
`click`, `fill`, `select`, `screenshot`, `finish`), VM template /
provisioning config, evaluator subprocess wiring.

**Build, in order:**
1. **Publish the `ExecutionAdapter` TS interface first** (it's already
   written in PRD §08 — transcribe it, don't redesign it) and the
   `TestExecutionAdapter` with scripted traces/evaluator results matching
   the exact JSON shapes in §08. This is the single highest-priority
   deliverable in the whole team split — Lanes A and C are both waiting
   on it.
2. Confirm the real WebArena `task_id` against WebArena's own config
   files — this is the PRD's one flagged **TBD**, and it's this lane's
   job to close it, before step 4 below starts.
3. Build the Freestyle VM template (Playwright + WebArena + Python
   preinstalled) — build once, not per run.
4. Wire the Claude tool-use agent loop (40-step budget, system prompt =
   task instructions + optional retrieved lesson) driving Playwright
   inside that VM.
5. Wire the WebArena evaluator as a one-shot subprocess per PRD §08's
   stdin/stdout JSON contract — this is the one output nothing downstream
   should ever substitute the agent's own "done" claim for.
6. `FreestyleExecutionAdapter` implementing the same interface as the
   test double, so Lane A's orchestrator and Lane C's UI don't change a
   single call site when swapped in.

**Depends on:** nothing to start the interface + test double. Needs
nothing from the other lanes to reach a real end-to-end run on its own —
this lane can validate the full Execute→Verify path in isolation before
anyone else's code touches it.

**Hands off:** the interface + test double within the first 1–2 hours
(unblocks A and C); one real, evaluator-graded run completing end to end
by the mid-point of the build.

## Lane C — Frontend & Demo

**Owns:** the Next.js app shell, all three UI screens, and the demo
orchestration/rehearsal (PRD §09/10).

**Directories:** `app/(dashboard)/*`, `app/(lessons)/*`, `app/(run)/*`
(the three screens), `app/api/start-demo-run` (thin wrapper calling Lane
A's loop orchestrator through the Round 1→2→3 sequence), shared UI
components, polling hooks.

**Build, in order:**
1. Next.js app shell + routing for the three screens, built against
   **hand-mocked JSON matching the PRD §07 response shapes** — do not
   wait for Lane A's routes to literally exist to start layout/components.
2. Screen A (Overview/Demo): KPI cards, the Run Demo button + per-round
   status indicator, success-rate/action-count chart, recent runs/failures.
3. Screen B (Lessons): search, domain/status filters, lesson detail,
   application history, and — explicitly — the empty/loading/error states
   named in §09. These three states are graded as part of acceptance
   criteria; don't leave them for a final pass.
4. Screen C (Run Inspector): trace timeline, Reflect diagnosis, retrieved
   lessons, evaluator evidence (the raw payload, not just pass/fail),
   baseline-vs-transfer side-by-side view.
5. `startDemoRun`: drives Round 1 → 2 → 3 against Lane A's real
   orchestrator once it's wired; 2-second polling of `getRun`/`getDashboard`
   per §09 (no Realtime for the MVP).
6. During rehearsal (PRD §10, build block 7): capture the recorded
   fallback run pair and wire the UI to play it back labeled honestly as
   recorded, not live, if invoked.

**Depends on:** Lane A's response shapes (already fixed in PRD §07 — can
build against those immediately without waiting for Lane A's actual
implementation) and Lane B's test double for early demo-flow testing
before any real VM exists.

**Hands off:** full UI working against the test double by end of day 1;
switches its data source to the real adapter once Lanes A and B's
integration lands, with no component changes required if the interface
boundary held.

## Checkpoints

| Checkpoint | What has to be true | Who's blocked until it happens |
|---|---|---|
| 0 — Kickoff (~30 min) | All three have read the PRD and this doc; Lane B has started on the interface. | — |
| 1 — Interface live (~hour 1–2) | `ExecutionAdapter` interface + test double merged to `main`. | Lanes A and C switch from stubs/mocks to the real test double. |
| 2 — Core loop live (~day 1 end) | Lane A's 9 operations work end to end against the test double, reachable via both HTTP and MCP; Lane C's UI renders real (test-double-backed) data. | Lane C stops hand-mocking JSON. |
| 3 — Real execution live (~mid-build) | Lane B's real adapter completes one evaluator-graded run; WebArena `task_id` confirmed. | Lane A/C swap from the test double to the real adapter. |
| 4 — Full integration | All three lanes merged; one real run flows lookup→execute→reflect→contribute→verify→recordOutcome→UI with no mocks left in the path. | Demo rehearsal (PRD §10) can start. |
| 5 — Demo rehearsal | Baseline fails for the intended reason, transfer succeeds, evidence is real, repeated more than once; fallback pair recorded. | Nothing — this is the last gate before presenting. |

## If something doesn't fit the split

If a lane discovers mid-build that the PRD's contract for another lane is
wrong or missing something (e.g. the `ExecutionAdapter` needs a method
the PRD didn't specify), that's a real finding — raise it to the owning
lane and update `PRD.md` itself, don't quietly implement a workaround
inside your own lane's files. The PRD is the source of truth precisely so
that a fix in one place is visible to all three agents, not just the one
that hit the problem.
