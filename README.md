# agent-db

Shared lesson ledger for AI agents, backed by Supabase. One Next.js app
serves the HTTP routes and the MCP server. Both call `lib/`.

## Setup

1. Copy `.env.example` to `.env` and fill in the Supabase URL and service
   role key. `OPENAI_API_KEY` turns on `text-embedding-3-small`. Without it
   the process uses a local 1536-d hash and stores `embedding_model` as
   `local-hash-1536`. `MCP_ACCESS_TOKEN` is required for `/api/mcp`.
2. Install dependencies: `npm install`
3. Apply migrations: `supabase link --project-ref <ref>` then `supabase db push`
4. For a process-local store with no database, set `LEDGER_STORE=memory`.

## Scripts

- `npm run dev` — Next.js dev server
- `npm run build` / `npm start` — production
- `npm run typecheck` — `tsc --noEmit`
- `npm test` — scoring, dedup, and record-outcome tests

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

Lane B owns the real `ExecutionAdapter`. Until that file lands,
`lib/execution/types.ts` is the PRD §08 interface and `record_outcome`
returns 503 when no adapter has been registered.
