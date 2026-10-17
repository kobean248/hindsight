import { getFixture, type FixtureName } from "./fixtures/index";
import { isTerminal } from "./state-machine";
import {
  ExecutionError,
  type ErrorCode,
  type EvaluatorResult,
  type ExecutionAdapter,
  type Lesson,
  type RunStatus,
  type RunStore,
  type TraceEvent,
} from "./types";

export type ErrorScenario = Exclude<ErrorCode, "task_failed">;
export type TestScenario = FixtureName | ErrorScenario;

export interface TestAdapterDelays {
  /** queued -> running */
  queuedMs: number;
  /** running -> vm_ready */
  vmReadyMs: number;
  /** before each trace step */
  stepMs: number;
  /** last step -> evaluator_result */
  evaluatorMs: number;
}

export interface TestExecutionAdapterOptions {
  /** Forces every run into this scenario, ignoring whether a lesson was passed. */
  scenario?: TestScenario;
  delays?: Partial<TestAdapterDelays>;
  agentId?: string;
  now?: () => Date;
}

/** Sized so 2-second UI polling sees each phase (about 7s per run). */
export const DEFAULT_TEST_DELAYS: TestAdapterDelays = {
  queuedMs: 500,
  vmReadyMs: 1500,
  stepMs: 600,
  evaluatorMs: 1000,
};

interface ErrorPlan {
  status: "failed" | "timed_out";
  /** Trace steps emitted before the error; null means the VM never came up. */
  stepsBeforeError: number | null;
  message: string;
  traceEntry: boolean;
}

const ERROR_PLANS: Record<ErrorScenario, ErrorPlan> = {
  vm_provision_error: {
    status: "failed",
    stepsBeforeError: null,
    message: "VM provisioning failed after 1 retry (test double)",
    traceEntry: false,
  },
  llm_timeout: {
    status: "timed_out",
    stepsBeforeError: 2,
    message: "Agent LLM call exceeded its timeout (test double)",
    traceEntry: true,
  },
  llm_error: {
    status: "failed",
    stepsBeforeError: 2,
    message: "Agent LLM provider returned an error (test double)",
    traceEntry: true,
  },
  db_error: {
    status: "failed",
    stepsBeforeError: 3,
    message: "Database write failed (test double)",
    traceEntry: false,
  },
  evaluator_unavailable: {
    status: "failed",
    stepsBeforeError: Number.POSITIVE_INFINITY,
    message: "WebArena evaluator did not return a result (test double)",
    traceEntry: false,
  },
};

export function chooseScenario(lesson: Lesson | undefined, forced?: TestScenario): TestScenario {
  if (forced) return forced;
  return lesson ? "transfer_success" : "baseline_fail";
}

type RunResult = { trace: TraceEvent[]; evaluator: EvaluatorResult };

const delay = (ms: number) =>
  ms > 0 ? new Promise<void>((resolve) => setTimeout(resolve, ms)) : Promise.resolve();

/**
 * In-process fake (PRD section 08): replays scripted fixtures through the
 * run state machine and writes them via the injected RunStore.
 */
export class TestExecutionAdapter implements ExecutionAdapter {
  private readonly statuses = new Map<string, RunStatus>();
  private readonly results = new Map<string, Promise<RunResult>>();
  private readonly delays: TestAdapterDelays;
  private readonly agentId: string;
  private readonly now: () => Date;

  constructor(
    private readonly store: RunStore,
    private readonly options: TestExecutionAdapterOptions = {},
  ) {
    this.delays = { ...DEFAULT_TEST_DELAYS, ...options.delays };
    this.agentId = options.agentId ?? "test-agent";
    this.now = options.now ?? (() => new Date());
  }

  async startRun(taskId: string, lesson?: Lesson): Promise<{ runId: string }> {
    const lessonId = lesson?.id ?? null;
    const { runId } = await this.store.createRun({ taskId, agentId: this.agentId, lessonId });
    await this.store.appendEvent(runId, "queued", { task_id: taskId, lesson_id: lessonId });

    this.statuses.set(runId, "queued");
    const result = this.execute(runId, chooseScenario(lesson, this.options.scenario), lesson);
    result.catch(() => {});
    this.results.set(runId, result);
    return { runId };
  }

  async getRunStatus(runId: string): Promise<RunStatus> {
    const status = this.statuses.get(runId);
    if (!status) throw new Error(`Unknown run ${runId}`);
    return status;
  }

  async awaitResult(runId: string): Promise<RunResult> {
    const result = this.results.get(runId);
    if (!result) throw new Error(`Unknown run ${runId}`);
    return result;
  }

  private async execute(
    runId: string,
    scenario: TestScenario,
    lesson: Lesson | undefined,
  ): Promise<RunResult> {
    const fixtureName: FixtureName =
      scenario === "baseline_fail" || scenario === "transfer_success"
        ? scenario
        : lesson
          ? "transfer_success"
          : "baseline_fail";
    const fixture = getFixture(fixtureName);
    const plan = fixtureName === scenario ? undefined : ERROR_PLANS[scenario as ErrorScenario];
    const trace: TraceEvent[] = [];

    try {
      await delay(this.delays.queuedMs);
      await this.transition(runId, "running");

      if (plan && plan.stepsBeforeError === null) {
        await delay(this.delays.vmReadyMs);
        return await this.fail(runId, scenario as ErrorScenario, plan, trace);
      }

      await delay(this.delays.vmReadyMs);
      await this.store.appendEvent(runId, "vm_ready", { vm_id: `test-vm-${runId.slice(0, 8)}` });

      for (const step of fixture.trace) {
        if (plan && trace.length >= (plan.stepsBeforeError as number)) {
          return await this.fail(runId, scenario as ErrorScenario, plan, trace);
        }
        await delay(this.delays.stepMs);
        const entry: TraceEvent = { ...step, ts: this.now().toISOString() };
        trace.push(entry);
        await this.store.appendEvent(runId, "step", entry);
      }

      await this.store.saveTrace(runId, trace);
      await delay(this.delays.evaluatorMs);

      if (plan) {
        return await this.fail(runId, scenario as ErrorScenario, plan, trace);
      }

      const evaluator = fixture.evaluator;
      await this.store.appendEvent(runId, "evaluator_result", evaluator);
      if (evaluator.passed) {
        await this.transition(runId, "succeeded");
      } else {
        await this.transition(runId, "failed", "task_failed");
      }
      return { trace, evaluator };
    } catch (err) {
      if (err instanceof ExecutionError) throw err;
      return this.failOnStoreError(runId, err);
    }
  }

  private async fail(
    runId: string,
    code: ErrorScenario,
    plan: ErrorPlan,
    trace: TraceEvent[],
  ): Promise<never> {
    if (plan.traceEntry) {
      const entry: TraceEvent = {
        seq: trace.length + 1,
        ts: this.now().toISOString(),
        type: "error",
        selector: null,
        value: null,
        result: "error",
        error: `${code}: ${plan.message}`,
        screenshot_ref: null,
        duration_ms: 0,
      };
      trace.push(entry);
      await this.store.appendEvent(runId, "step", entry);
    }
    await this.store.saveTrace(runId, trace);
    await this.store.appendEvent(runId, "error", { error_code: code, message: plan.message });
    await this.transition(runId, plan.status, code);
    throw new ExecutionError(code, runId, plan.message);
  }

  private async failOnStoreError(runId: string, cause: unknown): Promise<never> {
    const message = `RunStore write failed: ${cause instanceof Error ? cause.message : String(cause)}`;
    const status = this.statuses.get(runId);
    if (status && !isTerminal(status)) {
      try {
        await this.transition(runId, "failed", "db_error");
      } catch {
        this.statuses.set(runId, "failed");
      }
    }
    throw new ExecutionError("db_error", runId, message);
  }

  private async transition(runId: string, status: RunStatus, errorCode?: ErrorCode): Promise<void> {
    await this.store.setStatus(runId, status, errorCode ? { errorCode } : undefined);
    this.statuses.set(runId, status);
  }
}
