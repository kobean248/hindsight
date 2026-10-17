import type { ErrorCode, RunStatus, TerminalRunStatus } from "./types.js";

export const TERMINAL_STATUSES: readonly TerminalRunStatus[] = [
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
];

const ALLOWED: Record<RunStatus, readonly RunStatus[]> = {
  queued: ["running", "failed", "cancelled", "timed_out"],
  running: TERMINAL_STATUSES,
  succeeded: [],
  failed: [],
  cancelled: [],
  timed_out: [],
};

export function isTerminal(status: RunStatus): status is TerminalRunStatus {
  return (TERMINAL_STATUSES as readonly RunStatus[]).includes(status);
}

export function requiresErrorCode(status: RunStatus): boolean {
  return status === "failed" || status === "timed_out";
}

export function canTransition(from: RunStatus, to: RunStatus): boolean {
  return ALLOWED[from].includes(to);
}

export class InvalidTransitionError extends Error {
  constructor(runId: string, from: RunStatus, to: RunStatus) {
    super(`Run ${runId}: invalid status transition ${from} -> ${to}`);
    this.name = "InvalidTransitionError";
  }
}

export function assertTransition(
  runId: string,
  from: RunStatus,
  to: RunStatus,
  errorCode: ErrorCode | undefined,
): void {
  if (!canTransition(from, to)) {
    throw new InvalidTransitionError(runId, from, to);
  }
  if (requiresErrorCode(to) && !errorCode) {
    throw new Error(`Run ${runId}: status ${to} requires an error_code`);
  }
}
