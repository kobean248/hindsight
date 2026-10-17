-- Switch lessons.task_embedding from OpenAI text-embedding-3-small (1536)
-- to in-process all-MiniLM-L6-v2 (384). Existing vectors are a different
-- model, so they are cleared rather than reused. Relevance floor is 0.55.

drop function if exists lookup_lessons(text, vector(1536), text, integer);
drop function if exists contribute_lesson(text, text, vector(1536), text, text, text, text, text[]);

update lessons
set task_embedding = null,
    embedding_model = null
where task_embedding is not null
   or embedding_model is not null;

alter table lessons
  alter column task_embedding type vector(384)
  using null::vector(384);

create function lookup_lessons(
  p_domain text,
  p_query_embedding vector(384),
  p_embedding_model text,
  p_limit integer default 5
)
returns table (
  id uuid,
  domain text,
  task_pattern text,
  task_embedding vector(384),
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
    and sim.similarity >= 0.55
  order by rank_score desc
  limit p_limit;
$$;

create function contribute_lesson(
  p_domain text,
  p_task_pattern text,
  p_task_embedding vector(384),
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
