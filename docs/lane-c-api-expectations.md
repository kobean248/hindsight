# What Lane C's UI expects from Lane A (and B)

Lane C's screens read data through `lib/ui/api-client.ts`, which talks to the paths below. With
`NEXT_PUBLIC_LEDGER_SOURCE=live` it calls `/api/*`, Lane A's routes. Otherwise it calls `/api/test-double/*`,
an in-process fake (`lib/test-double/`) that follows the same contract. The TypeScript shapes are in
`lib/ui/contracts.ts`. If a real route returns something different, change that file, not the components. If the
contract itself has to change, raise it with Lane C first (TEAM-SPLIT "Hard rule").

## Routes the UI calls

| Call | Method + path | Request | Response (`lib/ui/contracts.ts`) | PRD |
|---|---|---|---|---|
| lookup | `POST /api/lookup` | JSON `{ domain, task_description, k }` | `LookupResponse` = `{ lessons: RankedLesson[] }` | §07 |
| getRun | `GET /api/get-run?run_id=` | — | `GetRunResponse` | §07 |
| getDashboard | `GET /api/get-dashboard` | — | `GetDashboardResponse` | §07 |
| listLessons | `GET /api/lessons?domain=&status=` | — | `ListLessonsResponse` = `{ lessons, domains }` | §07 (proposed) |
| getLesson | `GET /api/lessons/:id` | — | `GetLessonResponse` = `{ lesson, applications[] }` | §07 (path is Lane C's guess) |
| startDemoRun | `POST /api/start-demo-run`, `GET ?id=` | `{ task_id? }` | `DemoState` | §07, Lane C owns |

Errors: any non-2xx with a JSON body `{ "error": "<message>" }`. The UI shows the message verbatim.

## Contract gaps (proposed additions to PRD §07)

1. **listLessons.** Screen B (§09) needs to filter lessons by domain/status. `lookup` can't do that, since it's a
   similarity search with a floor. It's proposed in the PRD §07 table as a read-only HTTP operation. (`getLesson`,
   which serves the detail page and its application history, is already in §07.) The UI calls it at
   `GET /api/lessons/:id` and expects `{ lesson, applications[] }`. Tell Lane C if your route differs.
2. **getRun extras.** `GetRunResponse` adds `retrieved_lessons` (what that run's lookup returned),
   `applied_lessons`, `created_lesson`, and an optional `paired_run_id` for the baseline/transfer comparison.
3. **getDashboard shape.** `kpis` (counts only; the UI computes the rates), `runs: RunSummary[]` and
   `recent_failures`. `RunSummary.agent_claimed_done` is true when the run's trace contains a `finish` step. The
   false-success KPI is computed from it.
4. **`run_events.event_type` values the UI reads.** `queued`, `vm_ready`, `step` (payload = one §08 trace entry),
   `lookup` (payload `{ k, relevance_floor, returned: [{lesson_id, similarity, rank_score}] }`), `lookup_skipped`
   (baseline round), `evaluator_result` (payload = the §08 evaluator JSON, verbatim), `reflect` (payload =
   Reflect's `{root_cause, lesson_text, success_criteria, risk_warnings}`), `contribute` (`{ lesson_id,
   deduplicated, similarity }`) and `error`. Any other type still renders, as a generic entry.

## PRD contradiction to resolve (Lane A)

§07 says every `failed` run has a non-null `error_code`, and every listed `error_code` is an infrastructure fault.
But `reflect` takes "a `failed` run with `verified_success = false`", which is a run that finished cleanly and was
graded as a failure. Such a run has no infrastructure fault, so no code fits. The test double marks it `failed`
with `error_code = null`. Options: allow null `error_code` when `verified_success = false`, or add
`error_code = "evaluator_failed"`. The UI handles either.

## Extension columns on `lessons` (§05 allows added columns)

`applies_when text`, `handoff_points text[]` and `source_run_id uuid` all come from the pilot's note schema
(graveyard-experiment `src/kb/schema.py`). The pilot found that a note should fire only at the right step
(`applies_when`), and that "stop and hand off" notes (`handoff_points`) save the most wasted tokens on sites that
block bots. The UI shows them when present and hides them when absent.

## What the pilot says Lane A's lookup must do

These come from the 17 Oct pilot (`data/pilot/`, report in airjan-airlines/graveyard-experiment `out/report.md`).
Injecting every note for a site took success **down** from 21% to 12%, and tasks that passed without notes
regressed. So:

- Keep the 0.75 floor and the empty-list rule exactly as in §06. Returning nothing beats returning something
  irrelevant.
- Agents should call lookup with **k = 2** (the demo and the graveyard shim both default to 2).
- Before `contribute` persists Reflect's text, reject anything that leaks an answer: prices, dates, multi-digit
  numbers from the task's answer, form numbers. The pilot's check is `src/kb/writer.py` in the experiment repo.

## Embeddings: all-MiniLM-L6-v2 (team decision, 17 Oct)

PRD §05 now locks `all-MiniLM-L6-v2` (384-dim, normalised), run in-process with transformers.js. Use
`embed()` / `cosine()` from `lib/embeddings/minilm.ts` for both indexing and lookup. Don't add a second
embedding path. The test double already does this. What Lane A needs to do:

- A new migration that changes `lessons.task_embedding` from `vector(1536)` to `vector(384)`. The existing
  migration is already applied to the live project, so don't edit it.
- `embedding_model = 'all-MiniLM-L6-v2'` on every row.
- `next.config.ts` keeps `@huggingface/transformers` and `onnxruntime-node` external. The first call downloads
  the model (~90 MB) into `node_modules`, so warm it up before the demo.

**Calibration.** I scored each of the 24 pilot task instructions against the `task_pattern` of every same-site
pilot note (data: `scripts/calibrate-floor.ts`). MiniLM scores run lower than the OpenAI-era 0.75 floor
assumed. A note written from a task's own failure scores 0.46–0.84, and is the top match for its task in
nearly every case. Notes for other tasks on the same site mostly score below 0.55. At 0.75, only usps_03 and
irs_02 retrieve anything.

## Demo orchestration (what `lib/demo/index.ts` needs from `lib/loop`)

In live mode, `startDemo` returns a 501 until this is wired up. Lane C needs three async calls from Lane A's
orchestrator, which drive Lane B's `ExecutionAdapter`:

```ts
runBaseline(taskId: string): Promise<{ runId: string }>;            // no lookup; records lookup_skipped
reflectAndContribute(runId: string): Promise<{ lessonId: string }>;  // only after verify() = fail
runTransfer(taskId: string, domain: string, taskDescription: string, k: number): Promise<{ runId: string }>;
// lookup → recordApplication per lesson → execute → verify → recordOutcome per application
```

Each call should return its run id as soon as the `agent_runs` row exists, before execution finishes. The demo
panel polls `getRun` to show progress, so it needs the id early. The test-double version of this sequence is
`lib/demo/test-double-loop.ts`.

## Final live-site test (graveyard harness)

`integrations/graveyard/ledger_retrieve.py` is a drop-in for the experiment's `retrieve()` that calls
`POST /api/lookup` with k = 2. To run the with-product condition:

1. Seed the ledger with the frozen notes (`npx tsx scripts/pilot-notes-to-lessons.ts`, then embed and insert
   through Lane A's path).
2. Freeze the ledger: no `contribute` calls until the run ends.
3. Run the baseline and the with-product condition on the same day, with the same model and config, 3+ reps each.

Tested against the test double: for usps_03 it injects only the matching note. For usps_02, a pilot regression, it
injects nothing.
