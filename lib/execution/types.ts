import type { Lesson } from "../db/types";

export type RunStatus =
  | "queued"
  | "running"
  | "succeeded"
  | "failed"
  | "cancelled"
  | "timed_out";

export interface TraceEvent {
  seq: number;
  ts: string;
  type: "navigate" | "click" | "fill" | "select" | "screenshot" | "finish" | "error";
  selector?: string | null;
  value?: string | null;
  result?: string | null;
  error?: string | null;
  screenshot_ref?: string | null;
  duration_ms?: number | null;
}

export interface EvaluatorResult {
  passed: boolean;
  score: number;
  evidence: { type: string; detail: string };
}

// TODO: Lane B owns lib/execution. This file transcribes the PRD §08 interface so Lane A compiles; reconcile and delete the duplicate when Lane B publishes it.
export interface ExecutionAdapter {
  startRun(taskId: string, lesson?: Lesson): Promise<{ runId: string }>;
  getRunStatus(runId: string): Promise<RunStatus>;
  awaitResult(runId: string): Promise<{ trace: TraceEvent[]; evaluator: EvaluatorResult }>;
}
