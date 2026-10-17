import { describe, expect, it } from "vitest";

import {
  MemoryRunStore,
  fixtures,
  mapEvaluatorResult,
  mapStopReason,
  type StopReason,
} from "../index";

const ALL_STOP_REASONS: StopReason[] = ["finish", "step_budget", "run_timeout", "llm_timeout", "llm_error"];

describe("mapStopReason", () => {
  it("finish and step_budget run the evaluator; the agent's own claim is never the verdict", () => {
    expect(mapStopReason("finish")).toEqual({ kind: "evaluate" });
    expect(mapStopReason("step_budget")).toEqual({ kind: "evaluate" });
  });

  it("llm_timeout -> timed_out / llm_timeout", () => {
    expect(mapStopReason("llm_timeout")).toEqual({ kind: "terminal", status: "timed_out", errorCode: "llm_timeout" });
  });

  it("llm_error -> failed / llm_error", () => {
    expect(mapStopReason("llm_error")).toEqual({ kind: "terminal", status: "failed", errorCode: "llm_error" });
  });

  it("run_timeout -> timed_out with the closest locked code (proposal, see outcome.ts)", () => {
    expect(mapStopReason("run_timeout")).toEqual({ kind: "terminal", status: "timed_out", errorCode: "llm_timeout" });
  });

  it("every terminal mapping is accepted by the state machine, from running", async () => {
    for (const reason of ALL_STOP_REASONS) {
      const outcome = mapStopReason(reason);
      if (outcome.kind !== "terminal") continue;
      const store = new MemoryRunStore();
      const { runId } = await store.createRun({ taskId: "t", agentId: "a", lessonId: null });
      await store.setStatus(runId, "running");
      await store.setStatus(runId, outcome.status, { errorCode: outcome.errorCode });
      expect(store.getRun(runId)).toMatchObject({ status: outcome.status, error_code: outcome.errorCode });
    }
  });
});

describe("mapEvaluatorResult", () => {
  it("passed -> succeeded, no error code", () => {
    expect(mapEvaluatorResult(fixtures.transfer_success.evaluator)).toEqual({ status: "succeeded" });
  });

  it("not passed -> failed / task_failed", () => {
    expect(mapEvaluatorResult(fixtures.baseline_fail.evaluator)).toEqual({
      status: "failed",
      errorCode: "task_failed",
    });
  });

  it("both outcomes are accepted by the state machine, from running", async () => {
    for (const evaluator of [fixtures.transfer_success.evaluator, fixtures.baseline_fail.evaluator]) {
      const outcome = mapEvaluatorResult(evaluator);
      const store = new MemoryRunStore();
      const { runId } = await store.createRun({ taskId: "t", agentId: "a", lessonId: null });
      await store.setStatus(runId, "running");
      await store.setStatus(runId, outcome.status, "errorCode" in outcome ? { errorCode: outcome.errorCode } : undefined);
      expect(store.getRun(runId)?.verified_success).toBeNull();
    }
  });
});
