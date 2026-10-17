-- DB-level implementation of the PRD's lookup()/contribute() API (AL-001, section 4).
-- Keeping the query logic here lets both the backend and the SQL editor call the
-- same path, and keeps ranking consistent regardless of caller.

-- Lookup: ranks active lessons in a domain by trigram similarity to the task
-- description. Swap the order-by for pgvector distance once task_embedding
-- is populated from a real embedding model.
create or replace function lookup_lessons(
  p_domain text,
  p_task_description text,
  p_limit integer default 5
)
returns setof lessons
language sql
stable
as $$
  select *
  from lessons
  where domain = p_domain
    and status = 'active'
  order by similarity(task_pattern, p_task_description) desc
  limit p_limit;
$$;

-- Contribute: called by the Reflect stage after a failure (lesson_text set)
-- or by Execute after an uneventful success (lesson_text null, just logs the
-- pattern so future failures have something to diff against).
create or replace function contribute_lesson(
  p_domain text,
  p_task_pattern text,
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
  insert into lessons (domain, task_pattern, lesson_text, root_cause, success_criteria, risk_warnings)
  values (p_domain, p_task_pattern, p_lesson_text, p_root_cause, p_success_criteria, p_risk_warnings)
  returning * into created;

  return created;
end;
$$;
