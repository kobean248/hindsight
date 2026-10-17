# agent-db

Shared lesson ledger for AI agents, backed by Supabase. One Next.js app
serves the HTTP routes, the MCP server, and the dashboard. All three call
`lib/`.

## Setup

1. Copy `.env.example` to `.env` and fill in the Supabase URL and service
   role key. `OPENAI_API_KEY` turns on `text-embedding-3-small`. Without it
   the process uses a local 1536-d hash and stores `embedding_model` as
   `local-hash-1536`. `MCP_ACCESS_TOKEN` is required for `/api/mcp`.
2. Install dependencies: `npm install`
3. Apply migrations: `supabase link --project-ref <ref>` then `supabase db push`
4. For a process-local store with no database, set `LEDGER_STORE=memory`.

`supabase start` runs the stack locally via Docker; `supabase db reset`
replays all migrations against it.

## Scripts

- `npm run dev` — Next.js dev server
- `npm run build` / `npm start` — production
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — ledger scoring tests, then the agent, execution, and UI suites
- `npm run agent:smoke` — live agent loop (needs `GROQ_API_KEY` and a browser)
- `npm run capture-pair` — save a baseline/transfer pair for the recorded fallback

## HTTP

- `POST /api/lookup` — `{ domain, task_description, k? }`
- `POST /api/contribute` — `{ domain, task_pattern, outcome, trace, lesson? }`
- `GET /api/get-lesson?lesson_id=`
- `GET /api/get-run?run_id=`
- `GET /api/get-dashboard`

## MCP

`POST /api/mcp` with `Authorization: Bearer $MCP_ACCESS_TOKEN`.
Tools: `lookup_lessons`, `contribute_lesson`, `get_lesson`, `record_outcome`.
`record_outcome` accepts only `application_id` and `run_id`. The handler
calls the evaluator through `ExecutionAdapter` and records that result.

## Web app

`NEXT_PUBLIC_LEDGER_SOURCE` picks where the UI reads data:

- unset / `test_double` (default): an in-process fake under `/api/test-double/*` (`lib/test-double/`), seeded with the 17 notes from the 17 Oct pilot (`data/pilot/`). It uses all-MiniLM-L6-v2 embeddings (`lib/embeddings/minilm.ts`; downloaded on first use, ~90 MB), and every run is scripted. A banner on every page says so.
- `live`: reads the ledger routes under `/api/*`. What the UI expects from them is in `docs/lane-c-api-expectations.md`.

Screens: **Overview** (`/`): KPIs, Run Demo with Round 1/2/3 status, runs chart, recent runs/failures, and the pilot benchmark. **Lessons** (`/lessons`, `/lessons/:id`). **Run Inspector** (`/runs/:id`, plus `/runs/compare?baseline=&transfer=`). Everything polls every 2 s.

### Demo procedure

1. Overview → **Run demo**. Round 1 runs the baseline with no lessons, Round 2 has Reflect write a lesson from the evaluator-confirmed failure, and Round 3 runs a fresh agent with only what `lookup` returns.
2. Click **Compare baseline vs transfer** to see both traces, the transferred lesson, the agent's claims and the raw evaluator evidence side by side.
3. During rehearsal, record a fallback pair:
   `npm run capture-pair -- --name usps-03-rehearsal-1 --baseline <run_id> --transfer <run_id> --api http://localhost:3000/api`.
   It appears under "Recorded fallback" on the Overview and plays at `/runs/recorded/<name>`, labelled as recorded.

`integrations/graveyard/ledger_retrieve.py` plugs the ledger's `lookup` into the graveyard-experiment harness. See the last section of `docs/lane-c-api-expectations.md`.
