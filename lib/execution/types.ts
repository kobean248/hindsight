/**
 * Lane B execution contract (PRD section 08). Lanes A and C compile
 * against this file; change it only after raising it with the team.
 */

/** Run lifecycle, PRD section 07: queued -> running -> terminal. */
export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out";

export type TerminalRunStatus = Extract<
  RunStatus,
  "succeeded" | "failed" | "cancelled" | "timed_out"
>;

/**
 * PRD section 08 failure codes, plus `task_failed` (proposed, pending team
 * ack — see "Lane B contract notes" in PRD.md): the run executed cleanly
 * but the evaluator returned `passed: false`.
 */
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

/**
 * One entry of `agent_runs.trace` (PRD section 08). For `navigate` the URL
 * is in `value`; for `finish` the summary is in `value`.
 */
export interface TraceEvent {
  seq: number;
  ts: string;
  type: TraceEventType;
  selector: string | null;
  value: string | null;
  result: "ok" | "error";
  error: string | null;
  /** May be null: `screenshot()` returns an accessibility snapshot (PRD contract note 2). */
  screenshot_ref: string | null;
  duration_ms: number;
}

export type EvaluatorEvidenceType = "program_html" | "string_match" | "url_match";

/** The evaluator's stdout JSON (PRD section 08). */
export interface EvaluatorResult {
  passed: boolean;
  score: number;
  evidence: {
    type: EvaluatorEvidenceType;
    detail: string;
  };
}

/**
 * The subset of a lesson the adapter needs. `src/lessons.ts`'s `Lesson`
 * (and Lane A's row type) is structurally assignable to this.
 */
export interface Lesson {
  id: string;
  lesson_text: string | null;
  risk_warnings: string[];
  domain?: string;
  task_pattern?: string;
  root_cause?: string | null;
  success_criteria?: string | null;
  confidence?: number;
}

/** PRD section 08, verbatim. */
export interface ExecutionAdapter {
  startRun(taskId: string, lesson?: Lesson): Promise<{ runId: string }>;
  getRunStatus(runId: string): Promise<RunStatus>;
  // resolves once the VM has executed the task AND the evaluator has run
  awaitResult(runId: string): Promise<{ trace: TraceEvent[]; evaluator: EvaluatorResult }>;
}

/** `run_events.event_type` values the adapters emit (PRD section 05). */
export type RunEventType = "queued" | "vm_ready" | "step" | "evaluator_result" | "error";

export interface RunEventPayloads {
  queued: { task_id: string; lesson_id: string | null };
  vm_ready: { vm_id: string };
  step: TraceEvent;
  evaluator_result: EvaluatorResult;
  error: { error_code: ErrorCode; message: string };
}

export interface CreateRunInput {
  taskId: string;
  agentId: string;
  lessonId: string | null;
}

export interface SetStatusOptions {
  /** Required when `status` is `failed` or `timed_out`. */
  errorCode?: ErrorCode;
}

/**
 * Persistence injected into adapter constructors (PRD contract note 3).
 * Lane A implements this over `lib/db`; `MemoryRunStore` is the in-memory
 * version. Implementations must reject transitions out of terminal states
 * and `failed`/`timed_out` without an error code. Adapters never write
 * `verified_success`; only `verify()` does.
 */
export interface RunStore {
  /** Creates an `agent_runs` row in status `queued`. */
  createRun(input: CreateRunInput): Promise<{ runId: string }>;
  appendEvent<T extends RunEventType>(
    runId: string,
    eventType: T,
    payload: RunEventPayloads[T],
  ): Promise<void>;
  setStatus(runId: string, status: RunStatus, options?: SetStatusOptions): Promise<void>;
  saveTrace(runId: string, trace: TraceEvent[]): Promise<void>;
}

/** Rejection type for `awaitResult` when a run ends without an evaluator result. */
export class ExecutionError extends Error {
  readonly code: ErrorCode;
  readonly runId: string;

  constructor(code: ErrorCode, runId: string, message: string) {
    super(message);
    this.name = "ExecutionError";
    this.code = code;
    this.runId = runId;
  }
}
