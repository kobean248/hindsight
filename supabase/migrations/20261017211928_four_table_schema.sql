-- Evolve the applied two-table ledger to the PRD §05 four-table schema.
-- Existing migration files are left untouched. This file only adds objects
-- and alters tables that are already in the remote database.

create table agent_runs (
  id uuid primary key default gen_random_uuid(),
  task_id text not null,
  agent_id text not null,
  status text not null default 'queued'
    check (status in ('queued', 'running', 'succeeded', 'failed', 'cancelled', 'timed_out')),
  trace jsonb not null default '[]'::jsonb,
  started_at timestamptz,
  completed_at timestamptz,
  verified_success boolean,
  error_code text,
  -- Added columns (PRD §05 allows columns, not a new relationship):
  -- which lessons a lookup attached to this run, and which lesson contribute created.
  retrieved_lesson_ids uuid[] not null default '{}',
  created_lesson_id uuid,
  -- §07: failed and timed_out runs always carry an error_code.
  -- 'task_failed' is the contribute-path code for a finished task that did not
  -- pass. It sits beside the §08 infrastructure codes.
  constraint agent_runs_error_code_check check (
    status not in ('failed', 'timed_out') or error_code is not null
  )
);

create table run_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references agent_runs (id),
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index run_events_run_id_idx on run_events (run_id);

-- Match the existing lockdown: service role bypasses RLS, no anon policies.
alter table agent_runs enable row level security;
alter table run_events enable row level security;

-- Old signatures write columns this migration drops, and CREATE OR REPLACE
-- cannot change an argument list. Drop them before the reshape.
drop function record_lesson_application(uuid, text, text, text, jsonb);
drop function lookup_lessons(text, text, integer);
drop function contribute_lesson(text, text, text, text, text, text[]);

alter table lesson_applications rename column created_at to applied_at;

alter table lesson_applications
  add column run_id uuid,
  add column verification_status text,
  -- Idempotency key for recordOutcome (§07). Null while pending; set to the
  -- application id once a terminal status is written. Unique so a second
  -- recorded outcome cannot insert another receipt for the same application.
  add column outcome_key uuid;

update lesson_applications
set run_id = gen_random_uuid();

insert into agent_runs (
  id, task_id, agent_id, status, trace,
  started_at, completed_at, verified_success, error_code
)
select
  run_id,
  'unmigrated',
  agent_id,
  case when outcome = 'success' then 'succeeded' else 'failed' end,
  coalesce(trace, '[]'::jsonb),
  applied_at,
  applied_at,
  outcome = 'success',
  case when outcome = 'success' then null else 'task_failed' end
from lesson_applications;

update lesson_applications
set
  verification_status = case
    when outcome = 'success' then 'verified_success'
    else 'verified_failure'
  end,
  outcome_key = id;

alter table lesson_applications
  alter column run_id set not null,
  add constraint lesson_applications_run_id_fkey
    foreign key (run_id) references agent_runs (id),
  alter column verification_status set not null,
  alter column verification_status set default 'pending',
  add constraint lesson_applications_verification_status_check
    check (verification_status in (
      'pending', 'verified_success', 'verified_failure', 'unrelated_failure'
    )),
  add constraint lesson_applications_outcome_key_unique unique (outcome_key),
  add constraint lesson_applications_outcome_key_check check (
    (verification_status = 'pending' and outcome_key is null)
    or (verification_status <> 'pending' and outcome_key is not null)
  );

create index lesson_applications_run_id_idx on lesson_applications (run_id);

alter table lesson_applications
  drop column agent_id,
  drop column task_description,
  drop column outcome,
  drop column trace;

alter table lessons
  add column embedding_model text;

alter table agent_runs
  add constraint agent_runs_created_lesson_id_fkey
    foreign key (created_lesson_id) references lessons (id);

-- Pending application only. Does not move confidence counters.
create function record_lesson_application(
  p_lesson_id uuid,
  p_run_id uuid
)
returns uuid
language plpgsql
as $$
declare
  new_id uuid;
begin
  insert into lesson_applications (lesson_id, run_id, verification_status)
  values (p_lesson_id, p_run_id, 'pending')
  returning id into new_id;

  return new_id;
end;
$$;

-- Second call for the same application_id updates nothing and returns the
-- counters already stored. Counters are recomputed from verified rows.
create function record_lesson_outcome(
  p_application_id uuid,
  p_verified_result text
)
returns table (
  times_applied integer,
  times_succeeded integer,
  confidence numeric
)
language plpgsql
as $$
declare
  lesson uuid;
  updated_rows integer;
begin
  if p_verified_result not in (
    'verified_success', 'verified_failure', 'unrelated_failure'
  ) then
    raise exception 'invalid verified_result: %', p_verified_result;
  end if;

  update lesson_applications
  set
    verification_status = p_verified_result,
    outcome_key = id
  where id = p_application_id
    and verification_status = 'pending';

  get diagnostics updated_rows = row_count;

  select lesson_id into lesson
  from lesson_applications
  where id = p_application_id;

  if lesson is null then
    raise exception 'unknown application_id: %', p_application_id;
  end if;

  if updated_rows = 1 then
    update lessons l
    set
      times_applied = counts.n,
      times_succeeded = counts.s,
      confidence = wilson_lower_bound(counts.s, counts.n),
      last_validated_at = now(),
      updated_at = now()
    from (
      select
        count(*) filter (where verification_status = 'verified_success')::integer as s,
        count(*) filter (
          where verification_status in ('verified_success', 'verified_failure')
        )::integer as n
      from lesson_applications
      where lesson_id = lesson
    ) counts
    where l.id = lesson;
  end if;

  return query
  select l.times_applied, l.times_succeeded, l.confidence
  from lessons l
  where l.id = lesson;
end;
$$;

-- Ranking mirror of lib/scoring. The application path ranks in TypeScript
-- with the same constants so the unit tests cover the code that serves
-- lookup. This function keeps a SQL entry point with the §06 rule.
create function lookup_lessons(
  p_domain text,
  p_query_embedding vector(1536),
  p_embedding_model text,
  p_limit integer default 5
)
returns table (
  id uuid,
  domain text,
  task_pattern text,
  task_embedding vector(1536),
  embedding_model text,
  lesson_text text,
  root_cause text,
  success_criteria text,
  risk_warnings text[],
  status text,
  times_applied integer,
  times_succeeded integer,
  confidence numeric,
  created_at timestamptz,
  updated_at timestamptz,
  last_validated_at timestamptz,
  similarity double precision,
  rank_score double precision
)
language sql
stable
as $$
  select
    l.id, l.domain, l.task_pattern, l.task_embedding, l.embedding_model,
    l.lesson_text, l.root_cause, l.success_criteria, l.risk_warnings,
    l.status, l.times_applied, l.times_succeeded, l.confidence,
    l.created_at, l.updated_at, l.last_validated_at,
    sim.similarity,
    (0.7 * sim.similarity) + (0.3 * l.confidence::double precision) as rank_score
  from lessons l
  cross join lateral (
    select (1 - (l.task_embedding <=> p_query_embedding))::double precision as similarity
  ) sim
  where l.domain = p_domain
    and l.status = 'active'
    and l.embedding_model = p_embedding_model
    and l.task_embedding is not null
    and sim.similarity >= 0.75
  order by rank_score desc
  limit p_limit;
$$;

create function contribute_lesson(
  p_domain text,
  p_task_pattern text,
  p_task_embedding vector(1536),
  p_embedding_model text,
  p_lesson_text text default null,
  p_root_cause text default null,
  p_success_criteria text default null,
  p_risk_warnings text[] default '{}'
)
returns lessons
language plpgsql
as $$
declare
  created lessons;
begin
  insert into lessons (
    domain, task_pattern, task_embedding, embedding_model,
    lesson_text, root_cause, success_criteria, risk_warnings
  )
  values (
    p_domain, p_task_pattern, p_task_embedding, p_embedding_model,
    p_lesson_text, p_root_cause, p_success_criteria, p_risk_warnings
  )
  returning * into created;

  return created;
end;
$$;
