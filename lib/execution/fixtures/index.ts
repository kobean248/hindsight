import type { EvaluatorResult, TraceEvent } from "../types.js";

import baselineFailEvaluator from "./baseline_fail.evaluator.json" with { type: "json" };
import baselineFailTrace from "./baseline_fail.trace.json" with { type: "json" };
import transferSuccessEvaluator from "./transfer_success.evaluator.json" with { type: "json" };
import transferSuccessTrace from "./transfer_success.trace.json" with { type: "json" };

export type FixtureName = "baseline_fail" | "transfer_success";

export interface RunFixture {
  trace: TraceEvent[];
  evaluator: EvaluatorResult;
}

export const fixtures: Record<FixtureName, RunFixture> = {
  baseline_fail: {
    trace: baselineFailTrace as TraceEvent[],
    evaluator: baselineFailEvaluator as EvaluatorResult,
  },
  transfer_success: {
    trace: transferSuccessTrace as TraceEvent[],
    evaluator: transferSuccessEvaluator as EvaluatorResult,
  },
};

/** Deep copy, so callers can't mutate the shared fixture. */
export function getFixture(name: FixtureName): RunFixture {
  return structuredClone(fixtures[name]);
}
