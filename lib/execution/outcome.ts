/**
 * Pure mapping from how an agent run ended to the run lifecycle (PRD
 * sections 07 and 08). Adapters use these instead of re-deciding statuses
 * and error codes ad hoc. Nothing here ever produces `verified_success`.
 */
import type { ErrorCode, EvaluatorResult, TerminalRunStatus } from "./types";

/** Why `runAgent` stopped (agent/loop.ts re-exports this). */
export type StopReason = "finish" | "step_budget" | "run_timeout" | "llm_timeout" | "llm_error";

export type StopOutcome =
  /** The agent ended on its own terms (or hit the step budget): run the evaluator. */
  | { kind: "evaluate" }
  /** The run cannot be evaluated: end it now with this status and error code. */
  | { kind: "terminal"; status: "failed" | "timed_out"; errorCode: ErrorCode };

/**
 * - finish       -> evaluate (the agent saying "done" proves nothing; the evaluator decides)
 * - step_budget  -> evaluate (PRD: evaluator runs after finish() OR the step budget)
 * - llm_timeout  -> timed_out / llm_timeout
 * - llm_error    -> failed / llm_error
 * - run_timeout  -> timed_out / llm_timeout. PRD names a 5-minute wall-clock run timeout but no
 *   error code for it; llm_timeout is the closest locked code. PROPOSED: team to confirm or add
 *   a dedicated `run_timeout` code.
 */
export function mapStopReason(reason: StopReason): StopOutcome {
  switch (reason) {
    case "finish":
    case "step_budget":
      return { kind: "evaluate" };
    case "llm_timeout":
    case "run_timeout":
      return { kind: "terminal", status: "timed_out", errorCode: "llm_timeout" };
    case "llm_error":
      return { kind: "terminal", status: "failed", errorCode: "llm_error" };
    default: {
      const unreachable: never = reason;
      throw new Error(`Unknown stop reason: ${String(unreachable)}`);
    }
  }
}

export type EvaluatedOutcome =
  | { status: Extract<TerminalRunStatus, "succeeded"> }
  | { status: Extract<TerminalRunStatus, "failed">; errorCode: "task_failed" };

/** Evaluator verdict -> run status (`passed: false` is `failed` / `task_failed`, contract note 5). */
export function mapEvaluatorResult(evaluator: Pick<EvaluatorResult, "passed">): EvaluatedOutcome {
  return evaluator.passed ? { status: "succeeded" } : { status: "failed", errorCode: "task_failed" };
}
