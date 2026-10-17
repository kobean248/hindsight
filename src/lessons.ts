import { supabase } from "./client.js";

export type LessonStatus = "active" | "decayed" | "retired";
export type Outcome = "success" | "failure";

export interface Lesson {
  id: string;
  domain: string;
  task_pattern: string;
  lesson_text: string | null;
  root_cause: string | null;
  success_criteria: string | null;
  risk_warnings: string[];
  status: LessonStatus;
  times_applied: number;
  times_succeeded: number;
  confidence: number;
  created_at: string;
  updated_at: string;
  last_validated_at: string | null;
}

/** Stage 1 (Lookup): ranked lessons for a domain + task before an agent acts. */
export async function lookup(
  domain: string,
  taskDescription: string,
  k = 5
): Promise<Lesson[]> {
  const { data, error } = await supabase.rpc("lookup_lessons", {
    p_domain: domain,
    p_task_description: taskDescription,
    p_limit: k,
  });

  if (error) throw error;
  return data ?? [];
}

/** Stage 4 (Contribute): saves a lesson produced by the Reflect step. */
export async function contribute(params: {
  domain: string;
  taskPattern: string;
  lessonText?: string;
  rootCause?: string;
  successCriteria?: string;
  riskWarnings?: string[];
}): Promise<Lesson> {
  const { data, error } = await supabase.rpc("contribute_lesson", {
    p_domain: params.domain,
    p_task_pattern: params.taskPattern,
    p_lesson_text: params.lessonText ?? null,
    p_root_cause: params.rootCause ?? null,
    p_success_criteria: params.successCriteria ?? null,
    p_risk_warnings: params.riskWarnings ?? [],
  });

  if (error) throw error;
  return data;
}

/**
 * Stages 5-6 (Verify/Rank): records whether applying a lesson actually
 * worked and recomputes its confidence score from the updated counters.
 */
export async function recordApplication(params: {
  lessonId: string;
  agentId: string;
  taskDescription: string;
  outcome: Outcome;
  trace?: unknown;
}): Promise<Lesson> {
  const { data, error } = await supabase.rpc("record_lesson_application", {
    p_lesson_id: params.lessonId,
    p_agent_id: params.agentId,
    p_task_description: params.taskDescription,
    p_outcome: params.outcome,
    p_trace: params.trace ?? null,
  });

  if (error) throw error;
  return data;
}
