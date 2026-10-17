# Agent Ledger

**PRD · AL-001 · Draft**
Status: Draft — hackathon scope
Date: 2026-10-17
Owner: sksfin@gmail.com
Horizon: Single hackathon build

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
- Full semantic graph of tasks; a flat domain + task-pattern index is enough for the MVP.
- Automated rollback of risky actions — we warn, we don't intervene.

## 03 · The core loop

Six stages, repeated by every agent on every task. The loop is the product
— everything in section 4 exists to make one of these six steps work.

1. **Lookup — Search.** Agent queries lessons by domain + task description before acting.
2. **Execute — Act.** Agent performs the task, informed by whatever lessons it retrieved.
3. **Reflect — Diagnose.** On failure, a judge LLM inspects the transcript and names the root cause.
4. **Contribute — Write up.** The lesson, gotchas, success criteria, and risk warnings are saved.
5. **Verify — Check.** A later agent applies the lesson; an explicit check confirms real success.
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
  trace: list[Action],       # the agent's actual steps
  lesson_text: str | None,   # omit on failure — Reflect fills this in
) -> lesson_id: str
```

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

## 05 · MVP scope

Everything below ships before anything in section 6 is touched. If a
stretch feature starts eating MVP time, it waits.

| | Feature | Why it's load-bearing |
|---|---|---|
| MVP | lookup() / contribute() tools | The only surface agents actually touch — everything else is implementation. |
| MVP | SQLite store + embedding index | Durable, zero-ops persistence for the demo and beyond. |
| MVP | Automatic failure analysis | Removes the human from the loop — this is what makes it "learns the hard way, automatically." |
| MVP | Explicit success verification | Without this, "lesson worked" is just an agent's self-report — the exact failure mode we're fixing. |
| MVP | Confidence scoring | Lets lookup() rank lessons instead of dumping every match on the agent. |
| MVP | Dashboard: lessons, failures, before/after | The only way judges see the loop working without reading logs. |

## 06 · Stretch features

Ranked by how much they strengthen the demo narrative per hour spent.
Build top to bottom; stop whenever time runs out.

| | Feature | What it proves |
|---|---|---|
| P0 | Cross-agent transfer | Agent A fails, Agent B — a cold instance with zero shared context — succeeds off A's lesson. This is the whole pitch in one trace. |
| P0 | Failure replay | Side-by-side of the failed run and the corrected run, same task. Makes the before/after visceral instead of a chart. |
| P1 | Benchmark dashboard | Success rate, step count, time, and cost trending across trials — the quantitative backbone under the demo. |
| P2 | Risk warnings | Irreversible actions surfaced and gated behind human approval before a lesson is allowed to auto-apply them. |
| P2 | Memory decay | Lessons that stop succeeding (environment drift, API changes) get flagged stale instead of silently misleading future agents. |

## 07 · Demo & success metrics

The demo *is* the validation — three live rounds on the same task family,
run in front of judges, not simulated.

- **Round 1 — No memory.** A fresh agent attempts the task cold and fails — the baseline every later round is measured against.
- **Round 2 — Reflect fires.** The failed trace is analyzed, a lesson is written and saved with an initial low confidence score.
- **Round 3 — Cross-agent transfer.** A different, fresh agent instance looks up the same task, retrieves the lesson, and succeeds — verified, not self-reported.

Close with the benchmark chart: success rate climbing and action/step count
falling across trials, built from the actual trial data generated on
stage — not a mock-up.

## 08 · Risks & open questions

- **False-positive lessons.** A lesson learned from one flaky run can poison future lookups if confidence scoring doesn't weight sample size — mitigated by the Wilson-score approach in section 4, not a raw success rate.
- **Reflect quality.** The failure-analysis LLM call is doing the most leveraged work in the system; a bad root-cause diagnosis produces a bad lesson that looks authoritative. Worth a dedicated eval set if time allows.
- **Domain granularity.** Too coarse and lookup() returns irrelevant lessons; too fine and nothing ever matches. Start coarse, narrow based on what the demo tasks actually need.
- **Scope creep into section 6.** Every stretch feature is individually compelling — the discipline is finishing section 5 first.

## 09 · Build order

| Block | Build |
|---|---|
| 1 | Schema + SQLite store + lookup()/contribute() as callable tools. |
| 2 | Reflect: failure-analysis prompt that turns a trace into a structured lesson. |
| 3 | Verify: success-criteria check so "it worked" is measured, not claimed. |
| 4 | Confidence scoring wired into lookup() ranking. |
| 5 | Dashboard: lessons table, failure list, before/after chart. |
| 6 | Rehearse the three-round demo end to end before touching any stretch feature. |
