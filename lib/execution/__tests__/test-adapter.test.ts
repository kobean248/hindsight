import { describe, expect, it } from "vitest";

import {
  ExecutionError,
  MemoryRunStore,
  TERMINAL_STATUSES,
  TestExecutionAdapter,
  canTransition,
  createExecutionAdapter,
  fixtures,
  isTerminal,
  type ErrorScenario,
  type Lesson,
  type RunStatus,
  type TestScenario,
  type TraceEvent,
} from "../index.js";

const ZERO_DELAYS = { queuedMs: 0, vmReadyMs: 0, stepMs: 0, evaluatorMs: 0 };
const TASK_ID = "webarena.shopping.TBD";
const LESSON: Lesson = {
  id: "lesson-1",
  lesson_text: "Select the required Size option before clicking Add to Cart.",
  risk_warnings: [],
};

const ALL_STATUSES: RunStatus[] = ["queued", "running", ...TERMINAL_STATUSES];
const ERROR_SCENARIOS: ErrorScenario[] = [
  "vm_provision_error",
  "llm_timeout",
  "llm_error",
  "evaluator_unavailable",
  "db_error",
];
const TRACE_KEYS = [
  "duration_ms",
  "error",
  "result",
  "screenshot_ref",
  "selector",
  "seq",
  "ts",
  "type",
  "value",
];
const TRACE_TYPES = ["navigate", "click", "fill", "select", "screenshot", "finish", "error"];

function setup(scenario?: TestScenario) {
  const store = new MemoryRunStore();
  const adapter = new TestExecutionAdapter(store, { scenario, delays: ZERO_DELAYS });
  return { store, adapter };
}

async function settle(adapter: TestExecutionAdapter, runId: string) {
  return adapter.awaitResult(runId).then(
    (value) => ({ ok: true as const, value }),
    (error: unknown) => ({ ok: false as const, error }),
  );
}

function expectTraceShape(entry: TraceEvent) {
  expect(Object.keys(entry).sort()).toEqual(TRACE_KEYS);
  expect(Number.isInteger(entry.seq)).toBe(true);
  expect(Number.isNaN(Date.parse(entry.ts))).toBe(false);
  expect(TRACE_TYPES).toContain(entry.type);
  expect(entry.selector === null || typeof entry.selector === "string").toBe(true);
  expect(entry.value === null || typeof entry.value === "string").toBe(true);
  expect(["ok", "error"]).toContain(entry.result);
  expect(entry.error === null || typeof entry.error === "string").toBe(true);
  expect(entry.screenshot_ref === null || typeof entry.screenshot_ref === "string").toBe(true);
  expect(typeof entry.duration_ms).toBe("number");
}

describe("state machine", () => {
  it("never transitions out of a terminal state", () => {
    for (const from of TERMINAL_STATUSES) {
      for (const to of ALL_STATUSES) {
        expect(canTransition(from, to)).toBe(false);
      }
    }
  });

  it("MemoryRunStore rejects transitions out of terminal states", async () => {
    const store = new MemoryRunStore();
    for (const terminal of TERMINAL_STATUSES) {
      const { runId } = await store.createRun({ taskId: TASK_ID, agentId: "a", lessonId: null });
      await store.setStatus(runId, "running");
      await store.setStatus(runId, terminal, { errorCode: "llm_error" });
      for (const to of ALL_STATUSES) {
        await expect(store.setStatus(runId, to, { errorCode: "llm_error" })).rejects.toThrow();
      }
      expect(store.getRun(runId)?.status).toBe(terminal);
    }
  });

  it("MemoryRunStore rejects failed/timed_out without an error_code", async () => {
    const store = new MemoryRunStore();
    for (const status of ["failed", "timed_out"] as const) {
      const { runId } = await store.createRun({ taskId: TASK_ID, agentId: "a", lessonId: null });
      await store.setStatus(runId, "running");
      await expect(store.setStatus(runId, status)).rejects.toThrow(/error_code/);
    }
  });
});

describe("TestExecutionAdapter scenarios", () => {
  it("no lesson -> baseline_fail: failed run, evaluator passed=false", async () => {
    const { store, adapter } = setup();
    const { runId } = await adapter.startRun(TASK_ID);
    expect(await adapter.getRunStatus(runId)).toBe("queued");

    const result = await adapter.awaitResult(runId);
    expect(result.evaluator).toEqual(fixtures.baseline_fail.evaluator);
    expect(await adapter.getRunStatus(runId)).toBe("failed");

    const run = store.getRun(runId)!;
    expect(run.status).toBe("failed");
    expect(run.error_code).toBe("task_failed");
    expect(run.verified_success).toBeNull();
    expect(run.trace).toEqual(result.trace);
  });

  it("lesson -> transfer_success: succeeded run, evaluator passed=true", async () => {
    const { store, adapter } = setup();
    const { runId } = await adapter.startRun(TASK_ID, LESSON);
    const result = await adapter.awaitResult(runId);

    expect(result.evaluator).toEqual(fixtures.transfer_success.evaluator);
    expect(await adapter.getRunStatus(runId)).toBe("succeeded");
    const run = store.getRun(runId)!;
    expect(run.lesson_id).toBe(LESSON.id);
    expect(run.error_code).toBeNull();
    expect(run.started_at).not.toBeNull();
    expect(run.completed_at).not.toBeNull();
  });

  it("forced scenario overrides lesson presence", async () => {
    const { adapter } = setup("baseline_fail");
    const { runId } = await adapter.startRun(TASK_ID, LESSON);
    const result = await adapter.awaitResult(runId);
    expect(result.evaluator).toEqual(fixtures.baseline_fail.evaluator);
  });

  it("trace entries match the PRD section 08 shape and the fixture steps", async () => {
    for (const lesson of [undefined, LESSON]) {
      const { adapter } = setup();
      const { runId } = await adapter.startRun(TASK_ID, lesson);
      const { trace } = await adapter.awaitResult(runId);
      const fixture = lesson ? fixtures.transfer_success : fixtures.baseline_fail;

      expect(trace).toHaveLength(fixture.trace.length);
      trace.forEach((entry, i) => {
        expectTraceShape(entry);
        expect({ ...entry, ts: "" }).toEqual({ ...fixture.trace[i], ts: "" });
      });
    }
  });

  it("fixture traces themselves match the shape", () => {
    for (const fixture of Object.values(fixtures)) {
      fixture.trace.forEach(expectTraceShape);
      expect(Object.keys(fixture.evaluator).sort()).toEqual(["evidence", "passed", "score"]);
      expect(Object.keys(fixture.evaluator.evidence).sort()).toEqual(["detail", "type"]);
    }
  });

  it("emits queued, vm_ready, step and evaluator_result events in order", async () => {
    const { store, adapter } = setup();
    const { runId } = await adapter.startRun(TASK_ID, LESSON);
    const { trace } = await adapter.awaitResult(runId);

    const types = store.getEvents(runId).map((e) => e.event_type);
    expect(types).toEqual([
      "queued",
      "vm_ready",
      ...trace.map(() => "step"),
      "evaluator_result",
    ]);
  });

  it.each(ERROR_SCENARIOS)("%s: run ends failed/timed_out with that error_code", async (code) => {
    const { store, adapter } = setup(code);
    const { runId } = await adapter.startRun(TASK_ID);
    const outcome = await settle(adapter, runId);

    expect(outcome.ok).toBe(false);
    if (outcome.ok) return;
    expect(outcome.error).toBeInstanceOf(ExecutionError);
    expect((outcome.error as ExecutionError).code).toBe(code);

    const run = store.getRun(runId)!;
    expect(["failed", "timed_out"]).toContain(run.status);
    expect(run.error_code).toBe(code);
    expect(await adapter.getRunStatus(runId)).toBe(run.status);

    const events = store.getEvents(runId);
    expect(events.at(-1)?.event_type).toBe("error");
    expect(events.some((e) => e.event_type === "evaluator_result")).toBe(false);
    expect(events.some((e) => e.event_type === "vm_ready")).toBe(code !== "vm_provision_error");
    run.trace.forEach(expectTraceShape);
  });

  it("llm_timeout ends timed_out", async () => {
    const { store, adapter } = setup("llm_timeout");
    const { runId } = await adapter.startRun(TASK_ID);
    await settle(adapter, runId);
    expect(store.getRun(runId)?.status).toBe("timed_out");
  });

  it("every failed/timed_out run across all scenarios has an error_code", async () => {
    const scenarios: (TestScenario | undefined)[] = [undefined, ...ERROR_SCENARIOS];
    for (const scenario of scenarios) {
      const { store, adapter } = setup(scenario);
      const { runId } = await adapter.startRun(TASK_ID);
      await settle(adapter, runId);
      const run = store.getRun(runId)!;
      expect(isTerminal(run.status)).toBe(true);
      if (run.status === "failed" || run.status === "timed_out") {
        expect(run.error_code).not.toBeNull();
      }
    }
  });

  it("a RunStore that throws ends the run with db_error", async () => {
    const store = new MemoryRunStore();
    store.saveTrace = async () => {
      throw new Error("connection refused");
    };
    const adapter = new TestExecutionAdapter(store, { delays: ZERO_DELAYS });
    const { runId } = await adapter.startRun(TASK_ID);
    const outcome = await settle(adapter, runId);

    expect(outcome.ok).toBe(false);
    if (!outcome.ok) expect((outcome.error as ExecutionError).code).toBe("db_error");
    expect(store.getRun(runId)?.status).toBe("failed");
    expect(store.getRun(runId)?.error_code).toBe("db_error");
  });

  it("passes through running with real delays", async () => {
    const store = new MemoryRunStore();
    const adapter = new TestExecutionAdapter(store, {
      delays: { queuedMs: 5, vmReadyMs: 20, stepMs: 1, evaluatorMs: 1 },
    });
    const { runId } = await adapter.startRun(TASK_ID);
    await new Promise((r) => setTimeout(r, 15));
    expect(await adapter.getRunStatus(runId)).toBe("running");
    await adapter.awaitResult(runId);
  });
});

describe("createExecutionAdapter", () => {
  it("defaults to the test adapter", () => {
    const adapter = createExecutionAdapter({ store: new MemoryRunStore(), env: {} });
    expect(adapter).toBeInstanceOf(TestExecutionAdapter);
  });

  it("freestyle throws not yet implemented", () => {
    expect(() =>
      createExecutionAdapter({ store: new MemoryRunStore(), env: { EXECUTION_ADAPTER: "freestyle" } }),
    ).toThrow(/not yet implemented/);
  });

  it("rejects unknown values", () => {
    expect(() =>
      createExecutionAdapter({ store: new MemoryRunStore(), env: { EXECUTION_ADAPTER: "nope" } }),
    ).toThrow(/Invalid EXECUTION_ADAPTER/);
  });
});
