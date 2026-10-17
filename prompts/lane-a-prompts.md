# Lane A prompts — Data & Core Loop

Feed these to your coding agent **one at a time, in order**. Each one ends
with "stop and show me the plan" or "stop and show me the result" — don't
chain them together unattended; that's what the dependency-ordered build
in PRD §14 and the Implementation Contract's rule 11 are for.

Every prompt below assumes the agent has shell + repo access and can read
`PRD.md` and `TEAM-SPLIT.md` directly — it's told to, rather than having
the content pasted in, so it's always reading the current version.

---

## Prompt 1 — Orientation (no code yet)

```
You're working Lane A ("Data & Core Loop") of the Agent Ledger project.
Before writing anything, do this:

1. Read PRD.md in full, especially §03 (core loop), §05 (data model),
   §06 (confidence & ranking), §07 (API contracts), and the Implementation
   Contract at the bottom.
2. Read TEAM-SPLIT.md, specifically the "Lane A — Data & Core Loop"
   section, and the "Working mechanics" section above it.
3. Inspect the actual repo state: `git log --oneline`, the contents of
   `supabase/migrations/`, `src/client.ts`, `src/lessons.ts`, and
   `package.json`. Do not assume the repo matches the PRD yet — it
   doesn't, in at least two known ways:
   a. The two existing migrations implement an OLDER two-table schema
      (a flat `lesson_applications` with no `run_id`/`verification_status`,
      no `agent_runs`, no `run_events`, no `embedding_model` on `lessons`).
      Those migrations are already applied to the live Supabase project —
      you will evolve the schema with NEW migrations in a later prompt,
      you will not edit or delete the existing migration files.
   b. There is no Next.js app yet — just a plain TypeScript library
      (`src/client.ts`, `src/lessons.ts`). PRD §04 locks Next.js as the
      architecture. Scaffolding it is in scope for you (a later prompt),
      scoped to routing only — no pages/UI, that's Lane C's.

4. Report back, in writing, before touching any files:
   - Your understanding of Lane A's exact scope and directory ownership
     (`supabase/migrations/*`, `lib/db/*`, `lib/scoring/*`, `lib/loop/*`,
     `app/api/lookup`, `app/api/contribute`, `app/api/get-run`,
     `app/api/get-dashboard`).
   - A plain-English restatement of the confidence formula and the
     ranking formula from §06, in your own words, so I can check you
     read them correctly before you implement them.
   - Any place where PRD.md or TEAM-SPLIT.md is ambiguous or seems to
     contradict the actual repo state, beyond the two I already named
     above. Do not guess past an ambiguity — list it and stop.

Do not write or edit any files in this step. Just report back.
```

---

## Prompt 2 — Schema migration (evolve, don't rewrite)

```
Now plan the migration from the old two-table schema to the PRD §05
four-table schema (`lessons`, `agent_runs`, `lesson_applications`,
`run_events`). Write out the plan in full before running anything:

- Exactly which new migration file(s) you'll create with
  `supabase migration new <name>` (one migration, or several logically
  separated — your call, state which and why).
- The exact DDL for the new `agent_runs` and `run_events` tables, field
  for field, matching PRD §05 names and types exactly — flag it rather
  than silently renaming anything if you think a field should differ.
- The exact ALTER TABLE statements for `lesson_applications`: add
  `run_id uuid references agent_runs(id)` and `verification_status text`
  with the check constraint from §05 (`pending | verified_success |
  verified_failure | unrelated_failure`). State explicitly what you're
  doing with the OLD columns on that table (`agent_id`, `task_description`,
  `outcome`, `trace`, `created_at`) — keep, drop, or migrate data into the
  new `agent_runs` table — and justify the choice against §05's "a lesson
  application is not a run" rule.
- The exact ALTER TABLE for `lessons`: add `embedding_model text`.
- Whether `wilson_lower_bound()` and `record_lesson_application()` (from
  the existing migrations) need new signatures now that confidence only
  counts `verified_success`/`verified_failure` rows per §06, and whether
  `lookup_lessons()` needs to change now that §06 requires a 0.75
  relevance floor and a `0.7×similarity + 0.3×confidence` ranking score
  instead of plain `pg_trgm` ordering. (It currently ranks by `pg_trgm`
  similarity alone with no threshold — that's the known gap PRD §05
  already flags.)

Stop after writing this plan. Do not create the migration file yet.
```

```
Plan approved [or: here's what to change — paste feedback]. Now implement
exactly that plan as new migration file(s). After writing them, run
`supabase db push --dry-run` and show me the output before pushing for
real. Do not run the real push until I say so.
```

```
Dry run looks right. Run the real `supabase db push`, then run
`supabase migration list` and paste the output so I can confirm local and
remote are in sync.
```

---

## Prompt 3 — Minimal Next.js scaffold

```
Scaffold a minimal Next.js app (TypeScript, App Router) so that
`app/api/*/route.ts` handlers have somewhere to live. Scope this strictly:

- No pages, no UI components, no styling setup — that's Lane C's
  responsibility per TEAM-SPLIT.md, and building it now would create
  merge conflicts with their work later.
- Do create the `app/` directory structure, `next.config`, and whatever
  bare root layout Next.js requires to build — the smallest amount that
  makes `next build` succeed with zero routes defined yet.
- Move `src/client.ts` into `lib/db/client.ts` (same content — the
  Supabase client init itself doesn't need to change) and update any
  import paths. Leave `src/lessons.ts`'s logic where I'll ask you to
  port it in the next prompt, don't delete it yet.
- Add whatever Next.js-related dependencies and scripts package.json
  needs; don't remove the existing `@supabase/supabase-js` dependency or
  the `typecheck` script.

Before making changes, tell me the exact `create-next-app` command (or
manual file list, if you're doing it by hand) you're about to run, and
wait for me to confirm.
```

---

## Prompt 4 — Typed DB access layer (`lib/db`)

```
Build out lib/db/ as the only place in the codebase that touches the
database directly — no raw SQL strings or direct Supabase calls anywhere
else in Lane A's code (route handlers and the loop orchestrator call into
this layer, not into `supabase-js` directly).

Plan first:
- One typed module per table/concern: lessons, agent_runs,
  lesson_applications, run_events — list the exact functions each module
  exports (e.g. `getLessonById`, `insertAgentRun`, `updateRunStatus`,
  `insertRunEvent`, ...) and their TypeScript signatures, matching the
  field names from PRD §05 exactly.
- How much of the existing src/lessons.ts logic is still valid vs. needs
  rewriting now that the schema changed — port what's still correct,
  don't blindly regenerate everything from scratch.
- Where RPC calls to the Postgres functions from the migrations
  (`lookup_lessons`, `contribute_lesson`, `record_lesson_application`)
  live vs. where plain table reads/writes are more appropriate — your
  call, but state the reasoning.

Show me this plan, then implement it, then run `npx tsc --noEmit` and
paste the result.
```

---

## Prompt 5 — Confidence & ranking (`lib/scoring`)

```
Implement lib/scoring/ exactly to PRD §06 — this is the part of the
system most likely to be subtly wrong, so it gets unit tests before
anything else is allowed to depend on it.

Plan first:
- The Wilson lower-bound function's exact signature and inputs (s, n —
  state explicitly how you're computing n and s from
  lesson_applications.verification_status, per §06's rule that `pending`
  and `unrelated_failure` rows count toward neither).
- The ranking function: embed → cosine similarity → 0.75 floor → exclude
  below it → `0.7×similarity + 0.3×confidence` → top k. State what it
  returns when zero lessons clear the threshold (must be an empty list,
  per §06 — not a fallback to the closest match).
- The duplicate-detection check for `contribute()`: cosine similarity
  ≥ 0.92 within the same domain → return existing lesson_id instead of
  inserting. Where does this check live — in lib/scoring or lib/db? Your
  call, state it.
- Your test plan: list the specific fixtures/cases you'll write before
  writing them (e.g. "n=0 → confidence 0", "all verified_success → high
  confidence narrow interval", "one unrelated_failure doesn't move
  confidence", "similarity 0.74 excluded, 0.76 included", "two lessons at
  0.93 similarity → second one dedups into the first").

Show me the plan, then implement it with the tests, then run the test
suite and paste the output. All listed cases must be green before you
move on.
```

---

## Prompt 6 — `lookup` / `contribute` route handlers

```
Implement app/api/lookup and app/api/contribute as thin Next.js route
handlers — request validation and HTTP concerns only, all actual logic
delegated to lib/db and lib/scoring from the last two prompts.

Plan first:
- Request/response shapes for both routes, matching PRD §07's table
  exactly (lookup: domain, task_description, k → ranked lessons with
  similarity/confidence/rank_score; contribute: domain, task_pattern,
  outcome, trace, optional lesson → { run_id, lesson_id? }).
- Input validation: what makes a request to each route invalid, and what
  HTTP status/error body that produces. (PRD §07 requires every external
  input validated — this is where that applies for these two routes.)
- Where the embedding call (text-embedding-3-small, per PRD §05) actually
  happens for an incoming lookup query — state the exact function and
  confirm it's server-side only, never exposed to a client.

Show me the plan, implement it, then show me a curl/fetch example
exercising both routes against a local dev server with at least one
seeded lesson, including the empty-result case (a query with nothing
above the 0.75 threshold).
```

---

## Prompt 7 — Loop orchestrator + `get-run` / `get-dashboard`

```
Implement lib/loop/ — the orchestrator that sequences reflect →
contribute → recordApplication → verify → recordOutcome (PRD §03/§07) —
plus the app/api/get-run and app/api/get-dashboard route handlers.

Important: `verify` calls into Lane B's `ExecutionAdapter` interface
(PRD §08). If `lib/execution/` doesn't exist yet in this repo (check
first), transcribe the interface from PRD §08 verbatim into
lib/execution/types.ts yourself so this code compiles, and write a
one-line TODO pointing at Lane B owning the real file — do not invent a
different interface shape, and do not implement an adapter yourself.

Plan first:
- The orchestrator's public entry point(s) and exact call sequence,
  including which steps are synchronous vs. which wait on the
  ExecutionAdapter's async result.
- How `recordOutcome`'s idempotency actually gets enforced at the DB
  level (the unique constraint from your migration in Prompt 2) vs. at
  the application level — confirm both layers agree, don't rely on only
  one.
- `getRun`'s exact response shape: the run row, its `run_events`, the
  lessons retrieved before execution, and any lesson created from it —
  per PRD §07's description, not a bare run row.
- `getDashboard`'s aggregates: list the exact queries/aggregates it
  returns and confirm every number is a real query result — PRD §07 and
  the Implementation Contract both explicitly forbid placeholder/
  fabricated metrics here.

Show me the plan, implement it, then write and run a test that calls
recordOutcome twice with the same application_id and asserts the second
call doesn't change the counters — paste the result.
```

---

## Final check for this lane

```
Before calling Lane A done, go through PRD.md's Definition of done
checklist and tell me, item by item, which ones your work satisfies and
which ones are explicitly out of Lane A's scope (belong to Lane B or C).
Run typecheck, lint, and the full test suite one more time and paste the
results. Do not mark anything done that still has a TODO, a placeholder
response, or an unimplemented path.
```
