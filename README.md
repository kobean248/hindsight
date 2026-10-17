# agent-db

Shared lesson ledger for AI agents, backed by Supabase. Agents call `lookup()`
before acting and `contribute()` after a failure is diagnosed; a later agent's
outcome is recorded through `recordApplication()`, which recomputes the
lesson's confidence score. See `supabase/migrations` for the schema and
`src/lessons.ts` for the API.

## Setup

1. Copy `.env.example` to `.env` and fill in your Supabase project's URL and
   service role key.
2. Install dependencies: `npm install`
3. Apply the schema to your Supabase project: `supabase link --project-ref <ref>`
   then `supabase db push`
4. Use the API:

   ```ts
   import { lookup, contribute, recordApplication } from "./src/lessons.js";

   const lessons = await lookup("browser-automation", "log into the admin dashboard");

   const lesson = await contribute({
     domain: "browser-automation",
     taskPattern: "log into the admin dashboard",
     lessonText: "Wait for the SSO redirect before clicking Submit.",
     rootCause: "Clicked Submit before the SSO iframe finished loading.",
     successCriteria: "Dashboard URL contains /home after submit.",
   });

   await recordApplication({
     lessonId: lesson.id,
     agentId: "agent-b",
     taskDescription: "log into the admin dashboard",
     outcome: "success",
   });
   ```

## Local development

`supabase start` runs the stack locally via Docker; `supabase db reset`
replays all migrations against it. Run scripts with environment variables
loaded via `tsx --env-file=.env <script>`.

## Web app (Lane C: dashboard, lessons, run inspector, demo)

```bash
npm install
npm run dev            # http://localhost:3000
npm test               # vitest: §06 rules, lifecycle, idempotency, demo flow
npm run typecheck
npm run build
```

`NEXT_PUBLIC_LEDGER_SOURCE` picks where the UI reads data:

- unset / `test_double` (default): an in-process fake under `/api/test-double/*` (`lib/test-double/`), seeded
  with the 17 notes from the 17 Oct pilot (`data/pilot/`). It enforces the PRD §06 rules, but similarity is
  lexical and every run is scripted. A banner on every page says so.
- `live`: reads Lane A's routes under `/api/*`. What the UI expects from them is in
  `docs/lane-c-api-expectations.md`. The live demo returns 501 until Lane A's `lib/loop` is wired into
  `lib/demo/index.ts`.

Screens: **Overview** (`/`): KPIs, Run Demo with Round 1/2/3 status, runs chart, recent runs/failures, and
the pilot benchmark. **Lessons** (`/lessons`, `/lessons/:id`). **Run Inspector** (`/runs/:id`, plus
`/runs/compare?baseline=&transfer=`). Everything polls every 2 s (§09).

### Demo procedure (PRD §10)

1. Overview → **Run demo**. Round 1 runs the baseline with no lessons, Round 2 has Reflect write a lesson from
   the evaluator-confirmed failure, and Round 3 runs a fresh agent with only what `lookup` returns (k = 2).
2. Click **Compare baseline vs transfer** to see both traces, the transferred lesson, the agent's claims and
   the raw evaluator evidence side by side.
3. During rehearsal, record a fallback pair:
   `npm run capture-pair -- --name usps-03-rehearsal-1 --baseline <run_id> --transfer <run_id> --api http://localhost:3000/api`.
   It appears under "Recorded fallback" on the Overview and plays at `/runs/recorded/<name>`, labelled as
   recorded.

### Final live-site test

`integrations/graveyard/ledger_retrieve.py` plugs the ledger's `lookup` into the graveyard-experiment
harness. See the last section of `docs/lane-c-api-expectations.md`.
