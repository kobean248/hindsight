# Agent Ledger

**PRD · AL-002 · Draft — implementation-ready, supersedes AL-001**
Status: Draft — hackathon scope
Date: 2026-10-17
Horizon: Single hackathon build
Stack (locked): Next.js (web + API routes + MCP server) · Supabase/Postgres + pgvector · OpenAI `text-embedding-3-small` (1536-dim) · Anthropic Claude (agent runtime + Reflect) · Playwright · Freestyle VM · WebArena evaluator · MCP (Streamable HTTP, `/api/mcp`)

A shared memory layer so that when one AI agent learns something the hard
way, every other agent that hits the same task starts from the lesson
instead of the mistake.

> **Reading this doc:** everything under a *Locked* heading is a decision,
> not a suggestion — a coding agent should implement it as written, not
> re-derive it. Anything marked **TBD** is a genuine open item with an
> owner and a deadline (before the block that depends on it), not a gap to
> silently fill in.

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
- A confidence score per lesson, driven by *verified* observed outcomes, not author intent or self-report.
- Proof, on stage, that a fresh agent with no memory of the failure succeeds using someone else's lesson, with evaluator evidence shown alongside the claim.

**Out of scope (for now)**
- Multi-tenant auth, org boundaries, lesson privacy controls.
- A general-purpose agent framework — we instrument existing agents, not replace them.
- A graph database for lessons/tasks; a flat domain + task-pattern index over a vector store is enough for the MVP (decision and rationale in section 05).
- Automated rollback of risky actions — we warn, we don't intervene. (Safe to hold because every run is sandboxed in its own disposable VM — see section 08.)
- Lesson versioning/supersession chains — duplicates are merged (section 06), not forked into version histories.
- Deterministic, byte-for-byte replay of a run (section 10) — replay re-executes the same task configuration in a fresh VM; it is not guaranteed to retrace the original's exact DOM/selector path.

## 03 · The core loop

Six stages, repeated by every agent on every task. The loop is the product
— everything after this section exists to make one of these six steps
unambiguous enough to implement without guessing.

1. **Lookup — Search.** Agent calls `lookup(domain, task_description)` before acting; gets back zero or more ranked lessons (section 06/07).
2. **Execute — Act.** A Claude-driven agent drives a real browser via Playwright inside an ephemeral Freestyle VM (section 08), producing a structured trace. This creates an `agent_run` row (section 05).
3. **Reflect — Diagnose.** On a failed, evaluator-confirmed run, `reflect(run_id)` inspects the trace and returns a structured diagnosis: root cause + proposed lesson.
4. **Contribute — Write up.** `contribute(...)` persists the lesson (or merges it into an existing near-duplicate — section 06).
5. **Verify — Check.** A later run applies a lesson (`recordApplication`); `verify(run_id, task_id)` calls the WebArena evaluator — never the agent's own "done" claim — and the result is persisted via `recordOutcome`.
6. **Rank — Re-score.** `recordOutcome` updates `times_applied`/`times_succeeded` and recomputes confidence exactly once per application (idempotency rule, section 07).

**Critical architectural boundary:** the browser agent *proposes* actions; only the WebArena evaluator *determines* whether the task succeeded. Nothing in this system ever treats the agent's own "I completed the task" output as verified success.

## 04 · Architecture

One web application, one database, one execution boundary. No second
backend language unless named explicitly below.

```
┌───────────────────────────────────────────────────────────────┐
│ Next.js web app — Screens: Overview/Demo · Lessons · Run Inspector │
└───────────────────────────────┬─────────────────────────────────┘
                                 │ same process, same deploy
            ┌────────────────────┴────────────────────┐
┌───────────┴────────────┐                  ┌──────────┴─────────────────┐
│ HTTP API routes         │                  │ MCP server (/api/mcp,      │
│  dashboard + any app    │                  │  Streamable HTTP)          │
│  integration            │                  │  tools: lookup_lessons ·   │
│                         │                  │  contribute_lesson ·       │
│                         │                  │  get_lesson ·               │
│                         │                  │  record_outcome            │
└───────────┬─────────────┘                  └──────────┬─────────────────┘
            │        both call the SAME service layer — no duplicated logic
            └────────────────────┬────────────────────┘
                                  │
                   ┌──────────────┴───────────────┐
                   │ lib/ (orchestration)           │
                   │  lookup · contribute · reflect │
                   │  recordApplication · verify ·  │
                   │  recordOutcome · getRun ·      │
                   │  getDashboard · run lifecycle   │
                   └──────┬───────────────────┬─────┘
                          │                   │
            ┌──────────────┴──────┐   ┌────────┴────────────────────┐
            │ Supabase / Postgres  │   │ ExecutionAdapter (interface) │
            │  lessons, agent_runs,│   │  real: Freestyle VM          │
            │  lesson_applications,│   │    + Playwright + WebArena   │
            │  run_events, pgvector│   │  test: in-process fake       │
            └───────────────────────┘   └──────────────┬───────────────┘
                                                        │
                                         ┌──────────────┴───────────────┐
                                         │ LLM + benchmark integrations  │
                                         │  Claude: agent actions,       │
                                         │  Claude: Reflect diagnosis,   │
                                         │  WebArena: evaluator (Python, │
                                         │  invoked once per run inside  │
                                         │  the VM — not a service)      │
                                         └────────────────────────────────┘
```

**Locked: no standalone Python service.** The orchestration layer, the DB
access layer, and all API/MCP handlers are TypeScript inside the one
Next.js app. The single, explicit exception is WebArena's own evaluator,
which is Python because WebArena ships it that way — reimplementing its
grading logic in TS would be wasted, risky effort. That evaluator runs as
a **one-shot subprocess inside the Freestyle VM** (the VM already has
Python + WebArena installed for the task environment), invoked once at
the end of a run, and returns a single JSON object over stdout (contract
in section 08). It is never a long-running service the Next.js app has to
keep configured and healthy — it's invoked, it answers, it exits.

**Embedding calls are server-side, inside `lib/`**, called by both the
HTTP routes and the MCP tool handlers below — not a separate embedding
microservice, and not duplicated between the two entry points. See
section 05 for the exact model.

### Agent integration: MCP + HTTPS

**Decision: Agent Ledger is useless to an external agent without a
discoverable tool interface, so MCP is MVP, not stretch.** Two entry
points exist over the one service layer: a remote **MCP server** for
agent-native tool discovery, and the **HTTP API routes** (§07) for the
dashboard and any non-MCP integration. Neither duplicates the other's
logic — both call straight into `lib/`.

**Transport (locked): Streamable HTTP**, the MCP transport built for
remote servers, served at `/api/mcp` inside the same Next.js app — not a
separate deploy, not a separate process to keep healthy.

**MCP tools exposed (locked, four):**

| Tool | Input | Maps to |
|---|---|---|
| `lookup_lessons` | `domain, task_description, k?` | `lookup` (§07) |
| `contribute_lesson` | `domain, task_description, outcome, trace, lesson_text?` | `contribute` (§07) |
| `get_lesson` | `lesson_id` | new public read — full lesson row, success criteria, risk warnings, application history |
| `record_outcome` | `application_id, run_id` | `verify` + `recordOutcome` (§07), chained |

**`record_outcome` is intentionally narrower than "submit a verdict."**
Its input is just `application_id` and `run_id` — it does **not** accept
a client-supplied `success`/`verification_status` value. The handler
calls the real `verify()` (the WebArena evaluator, §08) itself and
records *that* result. An agent calling this tool cannot award itself a
verified success by passing `success: true`; the only way `confidence`
moves is through evidence the tool itself fetched. This is the same rule
as §03's core-loop boundary, just enforced again at the MCP surface where
an agent is the direct caller.

`reflect`, `recordApplication`, and the raw `verify` call stay internal —
callable by the orchestrator, not exposed as agent-facing tools. Exposing
them directly would let an agent skip straight to claiming a verified
outcome without ever having gone through `lookup`/`contribute`/execution.

**Agent workflow (what calling the tools in sequence looks like):**
1. Before acting, the agent calls `lookup_lessons`. An empty list is a valid, common response — the agent proceeds without a lesson, not with a forced irrelevant one (§06).
2. The agent's execution harness drives the task (Playwright in a Freestyle VM, §08) and records the real trace.
3. On failure, the harness calls `contribute_lesson` with the trace; the backend runs Reflect and persists the lesson — the agent never writes its own postmortem.
4. A later agent calls `lookup_lessons`, gets the lesson, and the harness records a `lesson_applications` row (`recordApplication`, internal) when it decides to use it.
5. The harness runs the task; the WebArena evaluator independently determines pass/fail.
6. The harness (not the agent) calls `record_outcome` with just `application_id`/`run_id`; the backend fetches the evaluator result itself and updates confidence exactly once.
7. MCP gives the agent *access* to these tools — it does not make the agent use them. The execution harness is responsible for enforcing "look up before acting, contribute after failing, record the outcome after verifying" as a hard sequence, not a suggestion left to the agent's judgment.

**Trust boundaries (binding, restates and extends §03/§06/§08's rules at the MCP surface):**
- Agent-submitted outcomes are claims, not evidence — only a real evaluator result (fetched server-side, never client-supplied) can move `verified_success`/`confidence`.
- Tool inputs and trace contents are untrusted data (§08's prompt-injection rule applies identically here).
- Remote MCP access requires authentication — this is not optional for the MVP, even on a hackathon timeline.
- Neither the MCP server nor the HTTP routes ever expose the Supabase service-role key, or any internal-only operation (`reflect`, `recordApplication`, raw `verify`), to a caller.

**Reference client for the demo:** the project's own Playwright-driven
agent (§08) connects as an MCP client against this same server. That's
what makes the three-round demo (§10) not depend on a third-party agent
choosing to cooperate with the workflow — the harness enforces the
sequence in step 7 above regardless of what any given agent would do left
to its own judgment.

**Operational note (flag, don't silently decide for the team):** if the
Next.js app deploys to serverless infrastructure, confirm the host's
request-duration and streaming limits are compatible with the MCP SDK and
a long-running `startDemoRun` before the live demo — the VM run itself
belongs behind `ExecutionAdapter` (§08), never inside a single held-open
HTTP/MCP request.

## 05 · Data model

**Locked: Supabase/Postgres + pgvector only.** SQLite and `sqlite-vss`
(mentioned in the original draft) are removed from the plan entirely —
not a fallback, not a "swap later." One database, one connection string,
everywhere.

**Locked: embedding model.** `text-embedding-3-small` (OpenAI), 1536
dimensions, called server-side with the same model for both indexing a
stored `task_pattern` and embedding an incoming `lookup` query — a lookup
embedded with a different model or dimension than the stored vectors isn't
a worse match, it's a type error, so this is a hard rule, not a
preference. The `embedding_model` column below exists specifically so a
future model change can't silently mix incompatible vectors in one index.

### Four tables — the coding agent may add columns, not a different relationship model

**`lessons`** — reusable knowledge, independent of any single run.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `domain` | text | e.g. `"webarena.shopping"` |
| `task_pattern` | text | normalized task description |
| `task_embedding` | vector(1536) | from `text-embedding-3-small` |
| `embedding_model` | text | `"text-embedding-3-small"` — guards against silent model drift |
| `lesson_text` | text, nullable | the fix, written by Reflect |
| `root_cause` | text, nullable | why the originating run failed |
| `success_criteria` | text, nullable | human-readable restatement of what the evaluator checks |
| `risk_warnings` | text[] | irreversible/approval-gated steps |
| `status` | text | `active` \| `decayed` \| `retired` |
| `times_applied` | int, default 0 | verified applications only (section 06) |
| `times_succeeded` | int, default 0 | verified successes only |
| `confidence` | numeric, default 0 | Wilson lower bound (section 06) |
| `created_at`, `updated_at`, `last_validated_at` | timestamptz | |

**`agent_runs`** — one execution attempt. This is the row the whole rest
of the system hangs off; a lesson is not a run, and this table is why.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `task_id` | text | WebArena task identifier (section 08) |
| `agent_id` | text | logical identifier, e.g. `"agent-a"` / `"agent-b"` — not a person |
| `status` | text | `queued` \| `running` \| `succeeded` \| `failed` \| `cancelled` \| `timed_out` |
| `trace` | jsonb | structured action log (format in section 08) |
| `started_at`, `completed_at` | timestamptz, nullable | |
| `verified_success` | boolean, nullable | **only** ever set from an evaluator result via `verify()`; null until verified |
| `error_code` | text, nullable | set on `failed`/`timed_out` (section 08) |

**`lesson_applications`** — records a lesson being tried in a specific run.
One lesson may be applied across many runs; one run may apply multiple
lessons (each gets its own row).

| Field | Type | Notes |
|---|---|---|
| `id` | uuid pk | this is the idempotency key, see section 07 |
| `lesson_id` | uuid fk → lessons | |
| `run_id` | uuid fk → agent_runs | |
| `applied_at` | timestamptz | |
| `verification_status` | text | `pending` \| `verified_success` \| `verified_failure` \| `unrelated_failure` |

`unrelated_failure` exists so a run that failed for a reason unconnected
to the lesson (e.g. the VM crashed) doesn't get counted as evidence the
lesson is wrong — see the confidence rules in section 06.

**`run_events`** — the live dashboard timeline; append-only.

| Field | Type | Notes |
|---|---|---|
| `id` | uuid pk | |
| `run_id` | uuid fk → agent_runs | |
| `event_type` | text | `queued` \| `vm_ready` \| `step` \| `evaluator_result` \| `error` \| … |
| `payload` | jsonb | event-specific detail (e.g. one trace entry, one evaluator field) |
| `created_at` | timestamptz | |

### Three rules that matter (unchanged from the review, now binding)

- A lesson is not a run. One lesson may be applied across many runs, and each run may use multiple lessons.
- An attempt is not a success. An agent saying "done" must never count as verified success without evaluator evidence (`agent_runs.verified_success` is only ever written by `verify()`).
- A failed run isn't automatically a bad lesson. The failure, the diagnosis, and each later application's outcome are recorded separately (`agent_runs` vs. `lessons` vs. `lesson_applications`).

### Vector, not graph (decision, restated)

`lookup()`'s query shape is single-hop nearest-neighbor over
`task_embedding`, including for cross-agent transfer — Agent B just calls
`lookup()` cold, no lineage walk required. A graph DB would only earn its
keep for multi-hop reasoning (lesson lineage, task-dependency chains),
which is explicitly out of scope (section 02). pgvector inside the
existing Postgres instance is the whole storage layer; no second database.

### Duplicate lessons

**Locked rule:** within the same `domain`, if a new candidate lesson's
`task_embedding` has cosine similarity ≥ **0.92** to an existing `active`
lesson, do not insert a new row — `contribute()` returns the existing
`lesson_id` instead, and the new run's evidence is still recorded (the
`agent_runs` row and, if applicable, a `lesson_applications` row pointing
at the existing lesson). Below that threshold, a new lesson is created.
No merge of `lesson_text` content, no version chains — this is
intentionally the simplest rule that avoids uncontrolled duplication.

## 06 · Confidence & ranking — exact math

**Inputs.** Only *verified* applications count. For a lesson with
\(s\) = count of `lesson_applications` rows with
`verification_status = 'verified_success'` and
\(n\) = count of rows with `verification_status` in
(`verified_success`, `verified_failure`) — i.e. `pending` and
`unrelated_failure` rows are excluded from both \(s\) and \(n\).

**Wilson lower bound** (95% CI, \(z = 1.96\)), \(\hat p = s / n\):

```
confidence = ( p̂ + z²/(2n) − z·√( p̂(1−p̂)/n + z²/(4n²) ) ) / (1 + z²/n)
```

**Binding rules:**
- An unverified (`pending`) application does not count as success, and does not change \(n\).
- A `verified_failure` counts as an unsuccessful application — it changes \(n\) but not \(s\).
- `unrelated_failure` changes neither \(n\) nor \(s\) — it's recorded for the audit trail (section 05) but doesn't move the score either way.
- \(n = 0\) → `confidence = 0`, by definition, not by division error.
- A brand-new lesson starts at `times_applied = 0`, `times_succeeded = 0`, `confidence = 0`.
- The run that originally produced a lesson (the failure Reflect diagnosed) is never itself recorded as an application of that lesson — it's the `agent_runs` row Reflect read, not a `lesson_applications` row.

**Ranking (locked formula).** `lookup(domain, task_description, k)`:
1. Embed `task_description` with `text-embedding-3-small`.
2. Compute cosine similarity against `task_embedding` for all `active` lessons in `domain`.
3. **Relevance threshold: discard any lesson with similarity < 0.75** — regardless of confidence. A highly confident but semantically unrelated lesson must never be forced into context.
4. Among the survivors, `rank_score = 0.7 × similarity + 0.3 × confidence`.
5. Return the top `k` by `rank_score`. If zero lessons clear the threshold, **return an empty list** — never backfill with the "closest" irrelevant match.

(0.75 / 0.7–0.3 / 0.92 are the MVP defaults, tunable post-hackathon — but
fixed and implemented as written for this build, not left to the coding
agent's judgment.)

## 07 · API contracts

| Operation | Exposed as | Input | Output |
|---|---|---|---|
| `lookup` | HTTP + MCP (`lookup_lessons`) | `domain, task_description, k` | ranked lessons, each with `similarity`, `confidence`, `rank_score` |
| `contribute` | HTTP + MCP (`contribute_lesson`) | `domain, task_pattern, outcome, trace, lesson?` | `{ run_id, lesson_id? }` |
| `getLesson` | HTTP + MCP (`get_lesson`) | `lesson_id` | full lesson row, success criteria, risk warnings, application history |
| `reflect` | internal | `run_id` (must reference a `failed` run with `verified_success = false`) | `{ root_cause, lesson_text, success_criteria, risk_warnings }` |
| `recordApplication` | internal | `lesson_id, run_id` | `{ application_id }` |
| `verify` | internal | `run_id, task_id` | `{ passed: boolean, evidence }` — calls the WebArena evaluator, never the agent |
| `recordOutcome` | internal | `application_id, verified_result` | updated `{ times_applied, times_succeeded, confidence }` — `verified_result` is only ever a value the orchestrator itself got back from calling `verify`, never a caller-supplied value |
| `getRun` | HTTP only | `run_id` | full run row + its `run_events`, retrieved lessons, applied lessons |
| `getDashboard` | HTTP only | optional filters | aggregated, **actually queried** metrics — never fabricated/placeholder numbers |

`reflect`, `recordApplication`, and the raw `verify` call are internal
orchestrator functions, never exposed to the frontend or to any MCP
caller directly. The MCP `record_outcome` tool (§04) is a chained wrapper
— `run_id`/`application_id` in, `verify()` called server-side, then
`recordOutcome()` with that real result — not a re-exposure of
`recordOutcome`'s raw internal signature. `getRun`/`getDashboard` stay
HTTP-only for the MVP: they're for the dashboard, not something an agent
mid-task needs to call.

**Run lifecycle (binding state machine):**
`queued → running → (succeeded | failed | cancelled | timed_out)`.
Only `queued`/`running` may transition forward; terminal states don't
transition again. Every `failed`/`timed_out` run has a non-null
`error_code`.

**Idempotency (binding):** `recordApplication` always creates a new
`application_id` — that id is the idempotency key for `recordOutcome`.
`recordOutcome` is guarded by a unique constraint so that calling it twice
for the same `application_id` is a no-op on the second call (it returns
the already-recorded state, it does not increment counters again).
Retrying an HTTP request must never double-count a confidence update.

**Timeouts:** every call to the agent LLM, the Reflect LLM, the VM
provisioning step, and the evaluator has an explicit timeout (defaults in
section 08) and, on expiry, writes a `failed`/`timed_out` run with a
specific `error_code` — never a silent hang.

## 08 · Execution & benchmark stack

Five moving pieces — Playwright, Freestyle, the agent LLM, Reflect, and
the WebArena evaluator — sit behind one `ExecutionAdapter` interface so
application logic never imports a provider SDK directly.

```ts
interface ExecutionAdapter {
  startRun(taskId: string, lesson?: Lesson): Promise<{ runId: string }>;
  getRunStatus(runId: string): Promise<RunStatus>;
  // resolves once the VM has executed the task AND the evaluator has run
  awaitResult(runId: string): Promise<{ trace: TraceEvent[]; evaluator: EvaluatorResult }>;
}
```

Two implementations: a **real** adapter (Freestyle + Playwright + WebArena,
below) and a **test** adapter (in-process fake with scripted traces/results)
used for all UI and core-loop development and tests. The production
integration still needs at least one real end-to-end run before the demo.

**Agent runtime (locked).** Claude drives the browser via tool-use: tools
are `navigate(url)`, `click(selector)`, `fill(selector, value)`,
`select(selector, value)`, `screenshot()`, `finish(summary)`. System
prompt = task instructions + (if Round 3) the retrieved lesson's
`lesson_text`/`risk_warnings`. **Action budget: 40 steps**, hard stop.
Reflect uses the same provider with a structured tool call constrained to
`{ root_cause, lesson_text, success_criteria, risk_warnings }`.

**VM lifecycle (locked).** Freestyle provisions one VM per run from a
pre-baked template (Playwright + WebArena + Python preinstalled — built
once in build block 1, not per run). The VM receives only the credentials
for a **disposable WebArena benchmark account** via environment variables
at start — never a privileged/shared secret. On provisioning failure: one
automatic retry, then the run is marked `failed` with
`error_code = "vm_provision_error"`. **Max VM lifetime: 10 minutes**
(auto-destroyed even if the run hangs). The VM is always destroyed after
the run completes, succeeds or fails — there is no reuse across runs.

**Task definition.** Locked shape: a WebArena shopping-site task where
checkout requires selecting a non-default product option (size/variant)
before "add to cart" succeeds — a well-documented, easy-to-miss step that
gives Round 1 a diagnosable, specific failure rather than a vague one.
**TBD, owner: whoever builds block 1, due before block 3 starts:** the
literal WebArena `task_id` and its exact config JSON must be confirmed
against WebArena's own task config files before building against it —
this PRD intentionally does not assert a specific task number it hasn't
verified, to avoid handing the coding agent a fact that turns out to be
wrong.

**Evaluator interface (locked).** WebArena's evaluator runs once, inside
the VM, as a subprocess after the agent calls `finish()` or hits the step
budget. Contract: it reads the task config + final page/DOM state and
writes one JSON object to stdout:
```json
{ "passed": true, "score": 1.0, "evidence": { "type": "program_html", "detail": "…" } }
```
The orchestrator reads this over the VM's control channel and that JSON
*is* the return value of `verify()` — it is never re-derived from the
agent's own `finish(summary)` text.

**Trace format (locked).** `agent_runs.trace` is a JSON array:
```json
{ "seq": 3, "ts": "2026-10-17T20:15:23Z", "type": "click",
  "selector": "#size-M", "value": null,
  "result": "ok", "error": null, "screenshot_ref": "s3://…/3.png",
  "duration_ms": 420 }
```
`type` ∈ `navigate | click | fill | select | screenshot | finish | error`.

**Cost/time limits (locked):** 40 agent steps max, 5-minute wall-clock run
timeout, 10-minute max VM lifetime, one Reflect LLM call per failed run.

**Failure handling (locked):** if the evaluator, LLM provider, database,
or VM service is unavailable, the run ends in `failed`/`timed_out` with
one of `error_code ∈ {vm_provision_error, llm_timeout, llm_error,
evaluator_unavailable, db_error}` — surfaced verbatim in the Run Inspector
(section 09), never swallowed.

**Security (locked, not optional):**
- The VM only ever holds a disposable WebArena benchmark account's credentials — no privileged or shared secrets reach agent-controlled code.
- Page content, trace content, and retrieved `lesson_text` are **untrusted input** — they are never concatenated into a system prompt in a way that could override instructions or authorize an action the task didn't ask for (basic prompt-injection hygiene for anything scraped from a live page).
- A disposable VM bounds *resource* blast radius; it does not bound what a malicious page could do to the benchmark account itself, so benchmark accounts carry no real-world value or access.

### Lane B contract notes (proposed — pending team ack)

Raised by Lane B per the team-split rule (contract changes get recorded
here, not worked around). **None of these is locked until Lanes A and C
ack it**; until then the locked text above still wins on any conflict.

1. **Groq replaces Anthropic Claude for the agent runtime.** The agent
   loop calls Groq tool-use, model set by `GROQ_MODEL` (default
   `openai/gpt-oss-120b`), key in `GROQ_API_KEY`, server-side only — it
   never enters the VM. This changes the stack line at the top of this
   doc. Reflect likely moves to the same provider ("same provider" rule
   above), which affects Lane A.
2. **`screenshot()` returns text, not an image.** Groq models are
   text-only, so the tool returns Playwright's accessibility snapshot of
   the page. A PNG may be saved as an optional artifact, so
   `screenshot_ref` in the trace format **may be `null`** for the MVP.
   The trace shape itself is unchanged.
3. **`RunStore` is injected into adapter constructors.** Both adapters
   take a `RunStore` (`createRun`, `appendEvent`, `setStatus`,
   `saveTrace`) and write `agent_runs` / `run_events` through it. Lane A
   implements it over `lib/db`; Lane B ships an in-memory one for tests.
   The `ExecutionAdapter` interface signature is unchanged.
4. **Repo layout.** Lane B code lives in `lib/execution/*` and `agent/*`.
   `tsconfig.json` drops `rootDir: "src"` and adds `lib` and `agent` to
   `include` (NodeNext, `.js` import suffixes); Lane C's Next.js scaffold
   will touch the same file, so that change needs coordinating with
   Lane C.
5. **A `failed` run with no infrastructure error has no valid
   `error_code`.** Reflect requires a `failed` run with
   `verified_success = false`, and every `failed` run must carry an
   `error_code` — but the locked list only names infrastructure errors.
   Proposed: add `task_failed` for "ran cleanly, evaluator returned
   `passed: false`". The test double uses it today.

## 09 · Frontend specification

Three screens. Live updates via **polling `getRun`/`getDashboard` every 2
seconds** for the MVP (simpler to debug than Realtime under hackathon time
pressure); Supabase Realtime is a stretch upgrade, not a requirement.

**Screen A — Overview / Demo**
- KPI cards sourced from `getDashboard` (real aggregates — never a static number).
- A **Run Demo** button that calls `startDemoRun`, driving Round 1 → 2 → 3 (section 10) with a live per-round status indicator (`baseline` / `reflecting` / `transfer`).
- Success-rate and action-count chart, built from actual `agent_runs` rows.
- Recent runs and recent failures lists, each linking into Run Inspector.

**Screen B — Lessons**
- Search by task description (same embedding + threshold path as `lookup`).
- Filter by `domain` and `status`.
- Lesson detail: `root_cause`, `lesson_text`, `success_criteria`, `risk_warnings`, `confidence`, and the \(s\)/\(n\) counts behind it.
- Application history: every `lesson_applications` row for this lesson, linking to its run.
- Explicit empty state ("no lessons yet for this domain"), loading state, and error state — none of these three may be left unhandled.

**Screen C — Run Inspector**
- Chronological `run_events`/`trace` timeline.
- Failure location + Reflect's diagnosis, when present.
- Lessons retrieved before execution (from that run's `lookup` call) and any lesson created from it.
- Verification result with the evaluator's raw `evidence` payload, not just pass/fail.
- Side-by-side comparison view for a baseline run vs. its paired transfer run.

## 10 · Demo protocol — reproducible, not just impressive

Passing once is not evidence the lesson caused the improvement; the
protocol exists so the demo shows evidence instead of asserting causation.

1. Pick **one** WebArena task (section 08) with a known, diagnosable failure mode.
2. Fix the agent model, system prompt, step budget, and task config identically across both runs — only the presence/absence of the retrieved lesson differs.
3. Run Agent A with no lessons available; persist its trace and evaluator result as-is.
4. Run `reflect` + `contribute` on that failure to produce and persist a lesson.
5. Start Agent B in a **fresh** VM with a fresh context; its only task-specific addition is the retrieved lesson from `lookup`.
6. Run the task; record the evaluator's actual result via `verify`.
7. Show both traces, the retrieved lesson, and the evaluator evidence side by side in Run Inspector (Screen C). State plainly in the UI copy that this is one paired run demonstrating a promising result, not a statistically conclusive improvement.

**Nondeterminism fallback (required, not optional):** because LLM agents
aren't deterministic, rehearse this pair of runs repeatedly before the
hackathon and confirm the baseline reliably fails for the intended reason.
Keep a **recorded fallback run pair** (real traces + real evaluator
results, captured ahead of time) that the UI can play back if the live
run is flaky on stage — presented honestly as a recorded run, not passed
off as live.

**Dev/test path:** build and test the UI and the lookup/contribute/verify
loop against the `ExecutionAdapter` test double first (section 08) — no
VM, no live LLM call, no WebArena install needed to iterate on everything
except the final integration.

## 11 · MVP scope

Everything below ships before anything in section 12 is touched.

| | Feature | Why it's load-bearing |
|---|---|---|
| MVP | Next.js app shell + API routes for all 9 operations | One deploy, one implementation path — the architecture in section 04. |
| MVP | MCP server (`/api/mcp`, Streamable HTTP) exposing `lookup_lessons`/`contribute_lesson`/`get_lesson`/`record_outcome` | Without this, nothing outside the project's own harness can discover or call the ledger — section 04 locks this as MVP specifically because the product's thesis assumes external agents as callers. |
| MVP | 4-table schema + migrations + DB functions | Nothing else can be built correctly on an ambiguous relationship model (section 05). |
| MVP | `ExecutionAdapter` + test double | Lets the rest of the stack be built/tested without live VM/LLM costs on every iteration. |
| MVP | Real adapter: Freestyle + Playwright + WebArena evaluator | The one path that has to work live for the demo. |
| MVP | `reflect` → `contribute` → `recordApplication` → `verify` → `recordOutcome` wired end to end | This *is* the loop; a partial wiring is not a working product. |
| MVP | Confidence + ranking per section 06, with the relevance threshold enforced | Lets `lookup()` return nothing rather than something wrong. |
| MVP | All three UI screens against real persisted data | The only way judges see the loop working without reading logs — no screen may show a placeholder. |

## 12 · Stretch features

Ranked by demo narrative strength per hour spent. Build top to bottom;
stop whenever time runs out.

| | Feature | What it proves |
|---|---|---|
| P0 | Failure replay (re-execution, not deterministic playback — section 10) | Makes the before/after visceral instead of a chart. |
| P1 | Benchmark dashboard trending across many WebArena trials | The quantitative backbone under the demo, beyond the one paired run. |
| P2 | Risk warnings gated behind human approval before auto-applying | Shows the safety story, not just the learning story. |
| P2 | Memory decay for lessons that stop succeeding | Shows the system notices its own staleness. |
| P2 | Supabase Realtime instead of polling | Nicer, not necessary. |
| P2 | MCP tool-level auth scoping (per-agent/per-caller keys, rather than one shared credential) | Tightens the trust boundary in section 04 beyond "authenticated at all." |

## 13 · Risks & open questions

- **Embedding model/dimension drift.** Mitigated by locking the model and storing `embedding_model` per lesson (section 05) — a future change is a visible migration, not a silent corruption.
- **Nondeterministic demo.** Mitigated by the rehearsal + recorded-fallback requirement in section 10 — the live run is the goal, not the only path to a credible demo.
- **Reflect quality.** The failure-analysis LLM call is the most leveraged step in the system; a bad root-cause diagnosis produces a confidently-wrong lesson. Worth a small eval set if time allows.
- **WebArena setup cost.** Known to be heavy and slow to stand up; this is why block 1 (section 14) exists before anything else.
- **Freestyle VM cold starts.** Pre-warm a small VM pool ahead of the live demo rather than provisioning on stage.
- **Prompt injection via page content/lesson text.** Mitigated by treating trace and lesson content as untrusted input (section 08) — never concatenated as instructions.
- **Scope creep into section 12.** Every stretch feature is individually compelling — the discipline is finishing section 11 first.

## 14 · Build order (dependency order — verify each layer before the next)

| Block | Build | Verify before moving on |
|---|---|---|
| 1 | Next.js scaffold, 4-table schema + migrations + DB functions, Freestyle VM template (Playwright + WebArena + Python preinstalled). Confirm the real WebArena `task_id` (section 08 TBD). | Migrations apply clean; VM template boots. |
| 2 | `ExecutionAdapter` test double; `lookup`/`contribute` against it. | Lookup threshold/ranking (section 06) unit-tested against fake data. |
| 2.5 | MCP server at `/api/mcp` wrapping `lookup`/`contribute`/`getLesson` (and `record_outcome` once block 5 lands) — same `lib/` calls as the HTTP routes. | A real MCP client can connect, list the 4 tools, and get the same result `lookup`'s HTTP route returns for an identical query. |
| 3 | `reflect` against a scripted failed trace from the test double. | Reflect output matches the `{root_cause, lesson_text, success_criteria, risk_warnings}` shape. |
| 4 | Real adapter: wire Freestyle + Playwright + the Claude agent loop to the confirmed task. | One real run completes and a trace is persisted. |
| 5 | Wire the real WebArena evaluator subprocess; `verify`/`recordOutcome` with idempotency. | A real run gets a real `passed`/`evidence` result; replaying `recordOutcome` doesn't double-count. |
| 6 | All three UI screens against real persisted data; polling. | Empty/loading/error states all render; no placeholder numbers anywhere. |
| 7 | Rehearse the full demo protocol (section 10) repeatedly; capture the recorded fallback pair. | Baseline fails for the intended reason, transfer succeeds, evidence is real — more than once. |
| 8 | Stretch features (section 12), top to bottom, only if time remains. | — |

---

## Implementation Contract — Agent Ledger

### Source of truth

Treat this PRD and its implementation decisions as authoritative. Do not
introduce alternative databases, embedding models, frameworks, or
execution providers without documenting the conflict and asking for
clarification first.

### Implementation requirements

1. Inspect the existing repository before editing. Preserve working code and conventions where practical.
2. Produce a complete, runnable implementation, not disconnected snippets or pseudocode.
3. Implement database migrations, typed database access, API routes, execution orchestration, lesson retrieval, reflection, verification, confidence scoring, and all three UI screens.
4. Keep provider-specific execution code behind the `ExecutionAdapter` interface (section 08). Use the test adapter so core logic and UI tests do not require live infrastructure.
5. Use actual persisted data for dashboards and run histories. Never fabricate successful runs or benchmark metrics.
6. Validate all external inputs, handle provider errors and timeouts (section 07/08), and keep server-side secrets out of browser code.
7. Treat traces and retrieved lessons as untrusted data. Do not allow their contents to override system instructions or authorize unsafe actions.
8. Include database migrations, automated tests, an environment-variable example without secrets, and a README with exact setup and run commands.
9. Run the available type checks, linting, tests, and production build. Fix failures rather than merely reporting them.
10. Do not mark the project complete while core flows contain TODOs, placeholder API responses, or unimplemented buttons.
11. Implement in the dependency order in section 14, running checks after each block — do not build every integration simultaneously in one unverified pass.

### Definition of done

- [ ] A fresh checkout can be configured using documented environment variables and setup commands.
- [ ] Database migrations create all required tables, indexes, constraints, and functions (section 05).
- [ ] A task description can be embedded and used to retrieve relevant lessons (section 06).
- [ ] A failed run produces a structured diagnosis and a persisted lesson (section 03/07).
- [ ] A lesson application is linked to a specific run and has a recorded verification result (section 05/07).
- [ ] Confidence changes only from verified application outcomes, without duplicate updates (section 06/07).
- [ ] The dashboard, lesson explorer, and run inspector display actual persisted data (section 09).
- [ ] A real MCP client can connect to `/api/mcp`, list `lookup_lessons`/`contribute_lesson`/`get_lesson`/`record_outcome`, and call each one successfully (section 04).
- [ ] `record_outcome` cannot be made to record a verified success from a client-supplied value alone — the handler fetches the evaluator result itself (section 04).
- [ ] The demo can show baseline failure, lesson creation, and fresh-agent transfer (section 10).
- [ ] The system handles empty search results, timeouts, provider failures, and missing environment variables (section 07/08).
- [ ] Automated tests cover retrieval, lesson creation, scoring, verification, and duplicate submissions.
- [ ] A README documents setup, architecture, commands, environment variables, and the live demo procedure.

### Completion report

At the end, report:
- Features implemented and files created or modified.
- Setup commands and required environment variables.
- Tests and build commands actually executed, with their results.
- External services that still require credentials or configuration.
- Any incomplete integrations or known limitations.
- Exact steps to run the three-round demo.

Do not claim a live end-to-end demo succeeded unless it was actually
executed and its evaluator results were observed.
