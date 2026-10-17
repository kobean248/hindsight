-- Agent Ledger: core schema
-- Lessons are the shared memory agents read from (lookup) and write to (contribute).
-- lesson_applications is the audit trail that drives verification and confidence scoring.

create extension if not exists vector;
create extension if not exists pg_trgm;

create table if not exists lessons (
  id uuid primary key default gen_random_uuid(),
  domain text not null,
  task_pattern text not null,
  task_embedding vector(1536),
  lesson_text text,
  root_cause text,
  success_criteria text,
  risk_warnings text[] not null default '{}',
  status text not null default 'active' check (status in ('active', 'decayed', 'retired')),
  times_applied integer not null default 0,
  times_succeeded integer not null default 0,
  confidence numeric not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_validated_at timestamptz
);

create index if not exists lessons_domain_idx on lessons (domain);
create index if not exists lessons_task_pattern_trgm_idx on lessons using gin (task_pattern gin_trgm_ops);
create index if not exists lessons_status_idx on lessons (status);

create table if not exists lesson_applications (
  id uuid primary key default gen_random_uuid(),
  lesson_id uuid not null references lessons (id) on delete cascade,
  agent_id text not null,
  task_description text not null,
  outcome text not null check (outcome in ('success', 'failure')),
  trace jsonb,
  created_at timestamptz not null default now()
);

create index if not exists lesson_applications_lesson_id_idx on lesson_applications (lesson_id);

-- Wilson lower bound: penalizes low sample counts so one lucky run can't
-- outrank a lesson with a longer, slightly messier track record.
create or replace function wilson_lower_bound(successes integer, total integer, z numeric default 1.96)
returns numeric
language sql
immutable
as $$
  select case
    when total = 0 then 0
    else (
      (successes::numeric / total + z * z / (2 * total)
        - z * sqrt((successes::numeric / total * (1 - successes::numeric / total) + z * z / (4 * total)) / total))
      / (1 + z * z / total)
    )
  end;
$$;

-- Single entry point for the Verify/Rank stages: logs the application,
-- updates the raw counters, and recomputes confidence in one transaction.
create or replace function record_lesson_application(
  p_lesson_id uuid,
  p_agent_id text,
  p_task_description text,
  p_outcome text,
  p_trace jsonb default null
)
returns lessons
language plpgsql
as $$
declare
  updated lessons;
  new_applied integer;
  new_succeeded integer;
begin
  insert into lesson_applications (lesson_id, agent_id, task_description, outcome, trace)
  values (p_lesson_id, p_agent_id, p_task_description, p_outcome, p_trace);

  select times_applied + 1, times_succeeded + case when p_outcome = 'success' then 1 else 0 end
  into new_applied, new_succeeded
  from lessons
  where id = p_lesson_id;

  update lessons
  set
    times_applied = new_applied,
    times_succeeded = new_succeeded,
    confidence = wilson_lower_bound(new_succeeded, new_applied),
    last_validated_at = now(),
    updated_at = now()
  where id = p_lesson_id
  returning * into updated;

  return updated;
end;
$$;

create or replace function set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger lessons_set_updated_at
  before update on lessons
  for each row
  execute function set_updated_at();

-- Locked down by default: the backend talks to this table with the
-- service role, which bypasses RLS. No policies are defined for anon/authenticated.
alter table lessons enable row level security;
alter table lesson_applications enable row level security;
