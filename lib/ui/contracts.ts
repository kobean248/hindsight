/**
 * Response shapes the UI reads, transcribed from PRD §05/§07/§08.
 *
 * Lane A owns the real route handlers; these types are Lane C's reading of the
 * contract so the screens can be built before those routes exist. Anything
 * marked "extension" is not in the PRD tables yet and is listed in
 * docs/lane-c-api-expectations.md for Lane A to confirm or reject.
 */

export type LessonStatus = "active" | "decayed" | "retired";

export type RunStatus = "queued" | "running" | "succeeded" | "failed" | "cancelled" | "timed_out";

export type VerificationStatus =
  | "pending"
  | "verified_success"
  | "verified_failure"
  | "unrelated_failure";

export type ErrorCode =
  | "vm_provision_error"
  | "llm_timeout"
  | "llm_error"
  | "evaluator_unavailable"
  | "db_error";

export interface Lesson {
  id: string;
  domain: string;
  task_pattern: string;
  embedding_model: string;
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
  /** extension: the moment in the flow the lesson matters (pilot schema `applies_when`). */
  applies_when?: string | null;
  /** extension: places a human must take over, e.g. CAPTCHA (pilot schema `handoff_points`). */
  handoff_points?: string[];
  /** extension: the failed run Reflect read to write this lesson. */
  source_run_id?: string | null;
}

/** One entry of `lookup`'s result (§07: each with similarity, confidence, rank_score). */
export interface RankedLesson extends Lesson {
  similarity: number;
  rank_score: number;
}

export interface LookupResponse {
  lessons: RankedLesson[];
}

/** §08 trace format. */
export type TraceEventType = "navigate" | "click" | "fill" | "select" | "screenshot" | "finish" | "error";

export interface TraceEvent {
  seq: number;
  ts: string;
  type: TraceEventType;
  selector: string | null;
  value: string | null;
  result: "ok" | "error";
  error: string | null;
  screenshot_ref: string | null;
  duration_ms: number;
}

/** §08 evaluator stdout contract. */
export interface EvaluatorResult {
  passed: boolean;
  score: number;
  evidence: { type: string; detail: string; [k: string]: unknown };
}

export interface AgentRun {
  id: string;
  task_id: string;
  agent_id: string;
  status: RunStatus;
  trace: TraceEvent[];
  started_at: string | null;
  completed_at: string | null;
  verified_success: boolean | null;
  error_code: ErrorCode | null;
}

export interface RunEvent {
  id: string;
  run_id: string;
  event_type: string;
  payload: Record<string, unknown>;
  created_at: string;
}

export interface LessonApplication {
  id: string;
  lesson_id: string;
  run_id: string;
  applied_at: string;
  verification_status: VerificationStatus;
}

/** §07 getRun: full run row + its run_events, retrieved lessons, applied lessons. */
export interface GetRunResponse {
  run: AgentRun;
  events: RunEvent[];
  /** what this run's lookup returned before execution (empty = nothing cleared the floor). */
  retrieved_lessons: RankedLesson[];
  applied_lessons: (LessonApplication & { lesson: Lesson })[];
  /** lesson Reflect wrote from this run's failure, if any. */
  created_lesson: Lesson | null;
  /** extension: the baseline/transfer run this one is paired with in a demo. */
  paired_run_id?: string | null;
}

export interface RunSummary {
  id: string;
  task_id: string;
  agent_id: string;
  status: RunStatus;
  verified_success: boolean | null;
  started_at: string | null;
  completed_at: string | null;
  error_code: ErrorCode | null;
  steps: number;
  /** did the agent call finish() — i.e. claim it was done. */
  agent_claimed_done: boolean;
  lessons_applied: number;
}

/** §07 getDashboard: aggregated, actually queried metrics. */
export interface GetDashboardResponse {
  kpis: {
    total_runs: number;
    verified_runs: number;
    verified_successes: number;
    /** runs where the agent called finish() but the evaluator said no. */
    false_successes: number;
    claimed_done_runs: number;
    active_lessons: number;
    verified_applications: number;
    mean_confidence: number;
  };
  runs: RunSummary[];
  recent_failures: RunSummary[];
}

/** proposed §07 listLessons (Screen B): list lessons by domain/status. */
export interface ListLessonsResponse {
  lessons: Lesson[];
  domains: string[];
}

/** §07 getLesson (Screen B): lesson detail + application history. */
export interface GetLessonResponse {
  lesson: Lesson;
  applications: (LessonApplication & {
    task_id: string;
    agent_id: string;
    run_status: RunStatus;
  })[];
}

/** Lane C: startDemoRun round tracking (§09 per-round status indicator). */
export type DemoPhase = "baseline" | "reflecting" | "transfer" | "done" | "error";

export interface DemoState {
  id: string;
  task_id: string;
  domain: string;
  phase: DemoPhase;
  started_at: string;
  baseline_run_id: string | null;
  lesson_id: string | null;
  transfer_run_id: string | null;
  error: string | null;
  source: "test_double" | "live";
}
