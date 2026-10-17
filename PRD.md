# Agent Ledger

**PRD · AL-001 · Draft**
Status: Draft — hackathon scope
Date: 2026-10-17
Owner: sksfin@gmail.com
Horizon: Single hackathon build
Stack: Supabase/Postgres (ledger) · Playwright (browser control) · WebArena (benchmark tasks) · Freestyle (execution VM)

A shared memory layer so that when one AI agent learns something the hard
way, every other agent that hits the same task starts from the lesson
instead of the mistake.

## 01 · Problem & thesis

Every agent run starts from zero. An agent can fail a task, a human or a
reviewing LLM can diagnose exactly why, and the very next agent to attempt
the same class of task — on the same machine, minutes later — will walk
into the identical wall.

There's no durable layer between "this agent tried something and it didn't
work" and "the next agent that tries this knows better." Postmortems live
in logs nobody re-reads. Prompt fixes live in one agent's context window
and die with the session.

> **Thesis** — treat agent failures the way engineering teams treat
> incidents: analyze once, write up the lesson, and make it retrievable by
> anyone who hits the same shape of problem again. Stack Overflow worked
> because the second person to hit an error didn't have to re-derive the
> fix. Agents need the same exchange.

## 02 · Goals & non-goals

**In scope**
- A lookup/contribute API any agent can call mid-task.
- Automatic lesson generation from a failed run, no human writer required.
- A confidence score per lesson, driven by observed outcomes, not author intent.
- Proof, on stage, that a fresh agent with no memory of the failure succeeds using someone else's lesson.

**Out of scope (for now)**
- Multi-tenant auth, org boundaries, lesson privacy controls.
- A general-purpose agent framework — we instrument existing agents, not replace them.
- A graph database for lessons/tasks; a flat domain + task-pattern index over a vector store is enough for the MVP (decision and rationale in section 04).
- Automated rollback of risky actions — we warn, we don't intervene. (Safe to hold because every run is sandboxed in its own disposable VM — see section 05.)

## 03 · The core loop

Six stages, repeated by every agent on every task. The loop is the product
— everything in section 4 exists to make one of these six steps work.

1. **Lookup — Search.** Agent queries lessons by domain + task description before acting.
2. **Execute — Act.** Agent drives a real browser via Playwright, inside an ephemeral Freestyle VM, informed by whatever lessons it retrieved.
3. **Reflect — Diagnose.** On failure, a judge LLM inspects the transcript and names the root cause.
4. **Contribute — Write up.** The lesson, gotchas, success criteria, and risk warnings are saved.
5. **Verify — Check.** A later agent applies the lesson; an explicit, WebArena-graded check confirms real success.
6. **Rank — Re-score.** Confidence moves up or down based on that outcome, not on claimed success.

## 04 · System & API

Two calls, one store. Everything else in the MVP is logic layered on top of these.

### `lookup(domain, task_description)`

```
lookup(domain: str, task_description: str, k: int = 5) -> list[Lesson]

returns the k highest-confidence lessons whose domain matches
and whose task_pattern is semantically close to task_description,
each tagged with: confidence, times_applied, times_succeeded,
risk_warnings, last_validated_at
```

### `contribute(domain, task_description, outcome, trace, lesson)`

```
contribute(
  domain: str,
  task_description: str,
  outcome: "success" | "failure",
  trace: list[Action],       # the agent's actual Playwright actions
  lesson_text: str | None,   # omit on failure — Reflect fills this in
) -> lesson_id: str
```

`trace` is the literal Playwright action log (goto/click/fill/…) for the
run, not a paraphrase — that's what lets Reflect point at the exact step
that went wrong, and what lets Failure Replay (section 07) play a run back
action-for-action.

### Data model

| Field | Type | Purpose |
|---|---|---|
| `domain` | text | Coarse bucket — e.g. "browser-automation", "api-auth". |
| `task_pattern` | text + embedding | Normalized task description, embedded for semantic lookup. |
| `lesson_text` | text | What to do differently, written by the Reflect step. |
| `root_cause` | text | Why the original attempt failed — distinct from the fix itself. |
| `success_criteria` | text | How a future agent proves the lesson actually worked. |
| `risk_warnings` | text[] | Irreversible or approval-gated steps flagged for human review. |
| `confidence` | float | Wilson lower bound on successes / applications — penalizes small samples. |
| `times_applied` / `times_succeeded` | int | Raw counters the confidence score is computed from. |
| `last_validated_at` | timestamp | Drives memory decay when a lesson goes stale. |

Storage: SQLite for the hackathon build (zero-setup, one file); schema is
Postgres-compatible so it's a one-line swap later. Embeddings live in a
sidecar vector column (sqlite-vss or a flat numpy index) — good enough at
hackathon scale, no managed vector DB required.

> Implementation note: the shipped schema runs on Supabase/Postgres
> directly (`supabase/migrations`) rather than SQLite, with `lookup`/
> `contribute`/verify exposed as Postgres functions and thin TS wrappers in
> `src/lessons.ts`.

### Storage choice: vector, not graph

`lookup()`'s query shape is single-hop nearest-neighbor — find lessons
whose `task_pattern` is semantically close to a `task_description`. That's
a vector-search problem, not a graph-traversal one, and it stays that way
even for cross-agent transfer (section 07's top stretch feature): Agent B
just calls `lookup()` cold, no lineage walk required.

A graph DB (lesson lineage, task-dependency chains, domain taxonomies)
would earn its keep only once queries need genuine multi-hop reasoning —
which section 02 already rules out of the MVP. Running a second database
alongside Supabase for a query shape that doesn't need one would add
sync/ops overhead with nothing to show for it.

**Decision: pgvector, inside the existing Postgres/Supabase instance.**
`task_embedding vector(1536)` and the `vector` extension are already in
migration 1 — no new infra. The one open gap is that `lookup_lessons()`
currently ranks by `pg_trgm` text similarity, not vector distance, because
no embedding model is wired in yet to populate `task_embedding`; swapping
the order-by for `<->` once that's in place is a follow-up, not a reason
to revisit this decision.

## 05 · Execution & benchmark stack

Execute needs a real browser and a real, disposable place to run it; the
demo needs a benchmark that scores "did it actually work" without us
hand-writing graders.

- **Playwright drives the browser**, chosen over Puppeteer because
  WebArena's own reference agent harness is already built on Playwright —
  using the same driver means the `trace` we record in `contribute()` lines
  up action-for-action with what WebArena's evaluators expect, with no
  adapter layer in between. Puppeteer stays a fallback only if Playwright's
  footprint turns out to be too heavy for a given VM.
- **WebArena supplies the tasks and the ground truth.** Instead of
  hand-rolling demo tasks and eyeballing whether an agent "succeeded,"
  WebArena ships a fixed suite of realistic sites (shopping, forums, a CMS,
  maps) with programmatic evaluators per task. That's what `success_criteria`
  (section 04) checks against, and what makes the benchmark dashboard
  (section 06) a measured metric instead of a self-report.
- **Freestyle provisions the VM.** Each agent run gets an ephemeral,
  isolated VM from Freestyle rather than a shared machine. This is what
  makes the non-goal in section 02 safe to hold without building rollback:
  a failed or risky run is never rolled back, the VM it ran in is just
  discarded. It also gives Failure Replay (section 06) a clean boundary —
  replaying a run means handing the same lesson to a fresh VM, not
  resetting shared state other runs depend on.

## 06 · MVP scope

Everything below ships before anything in section 7 is touched. If a
stretch feature starts eating MVP time, it waits.

| | Feature | Why it's load-bearing |
|---|---|---|
| MVP | lookup() / contribute() tools | The only surface agents actually touch — everything else is implementation. |
| MVP | Playwright + Freestyle execution harness | Execute needs a real, disposable browser — this is what makes the loop's actions real instead of simulated. |
| MVP | Postgres store + embedding index | Durable, zero-ops persistence for the demo and beyond. |
| MVP | Automatic failure analysis | Removes the human from the loop — this is what makes it "learns the hard way, automatically." |
| MVP | WebArena task + evaluator for the 3 demo rounds | Gives the Round 1–3 demo (section 07) a graded pass/fail instead of an eyeballed transcript. |
| MVP | Confidence scoring | Lets lookup() rank lessons instead of dumping every match on the agent. |
| MVP | Dashboard: lessons, failures, before/after | The only way judges see the loop working without reading logs. |

## 07 · Stretch features

Ranked by how much they strengthen the demo narrative per hour spent.
Build top to bottom; stop whenever time runs out.

| | Feature | What it proves |
|---|---|---|
| P0 | Cross-agent transfer | Agent A fails, Agent B — a cold instance with zero shared context — succeeds off A's lesson. This is the whole pitch in one trace. |
| P0 | Failure replay | Side-by-side of the failed run and the corrected run, same WebArena task, replayed in a fresh Freestyle VM. Makes the before/after visceral instead of a chart. |
| P1 | Benchmark dashboard | Success rate, step count, time, and cost trending across many WebArena trials — the quantitative backbone under the demo. |
| P2 | Risk warnings | Irreversible actions surfaced and gated behind human approval before a lesson is allowed to auto-apply them. |
| P2 | Memory decay | Lessons that stop succeeding (environment drift, API changes) get flagged stale instead of silently misleading future agents. |

## 08 · Demo & success metrics

The demo *is* the validation — three live rounds on the same WebArena task,
run in front of judges, not simulated.

- **Round 1 — No memory.** A fresh agent attempts a WebArena task cold and fails — WebArena's own evaluator is the record of that failure, not our judgment.
- **Round 2 — Reflect fires.** The failed trace is analyzed, a lesson is written and saved with an initial low confidence score.
- **Round 3 — Cross-agent transfer.** A different, fresh agent instance, in its own Freestyle VM, looks up the same task, retrieves the lesson, and succeeds — confirmed by WebArena's evaluator, not self-reported.

Close with the benchmark chart: success rate climbing and action/step count
falling across trials, built from the actual WebArena trial data generated
on stage — not a mock-up.

## 09 · Risks & open questions

- **False-positive lessons.** A lesson learned from one flaky run can poison future lookups if confidence scoring doesn't weight sample size — mitigated by the Wilson-score approach in section 4, not a raw success rate.
- **Reflect quality.** The failure-analysis LLM call is doing the most leveraged work in the system; a bad root-cause diagnosis produces a bad lesson that looks authoritative. Worth a dedicated eval set if time allows.
- **Domain granularity.** Too coarse and lookup() returns irrelevant lessons; too fine and nothing ever matches. Start coarse, narrow based on what the demo tasks actually need.
- **WebArena setup cost.** The benchmark is a snapshot of real website clones and is known to be heavy and slow to stand up; budget that setup time before the hackathon, not during it.
- **Freestyle VM cold starts.** If VM spin-up adds visible dead air to Round 3 on stage, pre-warm a small VM pool ahead of the demo rather than provisioning live.
- **Scope creep into section 7.** Every stretch feature is individually compelling — the discipline is finishing section 6 first.

## 10 · Build order

| Block | Build |
|---|---|
| 1 | Stand up a Freestyle VM template with Playwright and the WebArena task set preloaded, so later blocks don't re-pay that setup cost on every run. |
| 2 | Schema + Postgres store + lookup()/contribute() as callable tools. |
| 3 | Reflect: failure-analysis prompt that turns a trace into a structured lesson. |
| 4 | Verify: wire the WebArena evaluator in as the success-criteria check, so "it worked" is measured, not claimed. |
| 5 | Confidence scoring wired into lookup() ranking. |
| 6 | Dashboard: lessons table, failure list, before/after chart. |
| 7 | Rehearse the three-round demo end to end, live in Freestyle VMs, before touching any stretch feature. |
