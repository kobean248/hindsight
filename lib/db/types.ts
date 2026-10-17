export type LessonStatus = "active" | "decayed" | "retired";

export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out";

export type VerificationStatus =
  | "pending"
  | "verified_success"
  | "verified_failure"
  | "unrelated_failure";

export type TerminalVerification = Exclude<VerificationStatus, "pending">;

export type ErrorCode =
  | "vm_provision_error"
  | "llm_timeout"
  | "llm_error"
  | "evaluator_unavailable"
  | "db_error"
  | "task_failed";

export type TraceEventType =
  | "navigate"
  | "click"
  | "fill"
  | "select"
  | "screenshot"
  | "finish"
  | "error";

export interface TraceEvent {
  seq: number;
  ts: string;
  type: TraceEventType;
  selector: string | null;
  value: string | null;
  result: string | null;
  error: string | null;
  screenshot_ref: string | null;
  duration_ms: number | null;
}

export interface Lesson {
  id: string;
  domain: string;
  task_pattern: string;
  task_embedding: number[] | null;
  embedding_model: string | null;
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

export interface NewLesson {
  domain: string;
  task_pattern: string;
  task_embedding: number[];
  embedding_model: string;
  lesson_text?: string | null;
  root_cause?: string | null;
  success_criteria?: string | null;
  risk_warnings?: string[];
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
  error_code: string | null;
  retrieved_lesson_ids: string[];
  created_lesson_id: string | null;
}

export interface NewAgentRun {
  task_id: string;
  agent_id: string;
  status?: RunStatus;
  trace?: TraceEvent[];
  started_at?: string | null;
  completed_at?: string | null;
  error_code?: string | null;
}

export interface LessonApplication {
  id: string;
  lesson_id: string;
  run_id: string;
  applied_at: string;
  verification_status: VerificationStatus;
  outcome_key: string | null;
}

export interface RunEvent {
  id: string;
  run_id: string;
  event_type: string;
  payload: unknown;
  created_at: string;
}

export interface LessonScore {
  times_applied: number;
  times_succeeded: number;
  confidence: number;
}

export interface RankedLesson extends Lesson {
  similarity: number;
  rank_score: number;
}

export interface DashboardFilter {
  domain?: string;
  run_status?: RunStatus;
}

export interface Dashboard {
  lessons: {
    total: number;
    by_status: Record<LessonStatus, number>;
  };
  runs: {
    total: number;
    by_status: Record<RunStatus, number>;
    verified_success_rate: number | null;
    average_action_count: number | null;
  };
  recent_runs: AgentRun[];
  recent_failures: AgentRun[];
}
