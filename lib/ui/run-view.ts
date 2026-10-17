/** Derived views over a getRun response; pure so they can be unit-tested. */
import type { EvaluatorResult, GetRunResponse, RunEvent } from "./contracts";
import { finishEvent, isTerminal } from "./format";

function lastEvent(events: RunEvent[], type: string): RunEvent | null {
  for (let i = events.length - 1; i >= 0; i--) if (events[i].event_type === type) return events[i];
  return null;
}

export function evaluatorOf(r: GetRunResponse): EvaluatorResult | null {
  const e = lastEvent(r.events, "evaluator_result");
  return e ? (e.payload as unknown as EvaluatorResult) : null;
}

export interface Diagnosis {
  root_cause: string | null;
  lesson_text: string | null;
  success_criteria: string | null;
  risk_warnings: string[];
}

/** Reflect's output: its run_event if recorded, else the lesson it produced. */
export function diagnosisOf(r: GetRunResponse): Diagnosis | null {
  const e = lastEvent(r.events, "reflect");
  if (e) {
    const p = e.payload as Partial<Diagnosis>;
    return {
      root_cause: p.root_cause ?? null,
      lesson_text: p.lesson_text ?? null,
      success_criteria: p.success_criteria ?? null,
      risk_warnings: p.risk_warnings ?? [],
    };
  }
  const l = r.created_lesson;
  return l ? { root_cause: l.root_cause, lesson_text: l.lesson_text, success_criteria: l.success_criteria, risk_warnings: l.risk_warnings } : null;
}

export function contributeOf(r: GetRunResponse): { deduplicated: boolean; similarity: number | null } | null {
  const e = lastEvent(r.events, "contribute");
  if (!e) return null;
  return { deduplicated: Boolean(e.payload.deduplicated), similarity: (e.payload.similarity as number | null) ?? null };
}

export type LookupState = "skipped" | "empty" | "returned" | "unknown";

export function lookupStateOf(r: GetRunResponse): LookupState {
  if (lastEvent(r.events, "lookup_skipped")) return "skipped";
  if (r.retrieved_lessons.length > 0) return "returned";
  if (lastEvent(r.events, "lookup")) return "empty";
  return "unknown";
}

/** First step that errored, else null — the "failure location" in §09. */
export function failureStep(r: GetRunResponse) {
  return r.run.trace.find((t) => t.result === "error") ?? null;
}

export function claimOf(r: GetRunResponse) {
  const f = finishEvent(r.run.trace);
  return f ? { summary: f.value ?? "" } : null;
}

export function isFalseSuccess(r: GetRunResponse): boolean {
  return claimOf(r) !== null && r.run.verified_success === false;
}

/** Keep polling until the run is terminal and (if it ran) graded. */
export function isSettled(r: GetRunResponse): boolean {
  if (!isTerminal(r.run.status)) return false;
  return r.run.verified_success !== null || r.run.error_code !== null || r.run.status === "cancelled";
}
