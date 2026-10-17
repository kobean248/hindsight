import { runAgent as defaultRunAgent, type RunAgentResult } from "../../agent/loop";
import { mapEvaluatorResult, mapStopReason } from "./outcome";
import {
  assertFreestyleConfig,
  parseEvaluatorStdout,
  resolveTask,
  type Env,
  type ResolvedTask,
} from "./freestyle-task";
import { provisionFreestyleBrowser, type ProvisionedBrowser, type ProvisionInput } from "./freestyle-runtime";
import {
  ExecutionError,
  type ErrorCode,
  type ExecutionAdapter,
  type Lesson,
  type RunStatus,
  type RunStore,
} from "./types";

export interface FreestyleExecutionAdapterOptions {
  /** Defaults to `process.env`. Tests pass an explicit map. */
  env?: Env;
  agentId?: string;
  /** Defaults to a real Freestyle VM. Tests inject a fake. */
  provision?: (input: ProvisionInput) => Promise<ProvisionedBrowser>;
  /** Defaults to the Groq agent loop. */
  runAgent?: (options: Parameters<typeof defaultRunAgent>[0]) => Promise<RunAgentResult>;
}

/**
 * Real ExecutionAdapter (PRD §08): one Freestyle VM per run, Playwright over
 * CDP, `runAgent`, then the WebArena evaluator subprocess inside the guest.
 * The VM is deleted when the run ends. `verified_success` is not written here.
 */
export class FreestyleExecutionAdapter implements ExecutionAdapter {
  private readonly statuses = new Map<string, RunStatus>();
  private readonly results = new Map<string, Promise<{ trace: RunAgentResult["trace"]; evaluator: import("./types").EvaluatorResult }>>();
  private readonly env: Env;
  private readonly agentId: string;
  private readonly provision: (input: ProvisionInput) => Promise<ProvisionedBrowser>;
  private readonly runAgent: (options: Parameters<typeof defaultRunAgent>[0]) => Promise<RunAgentResult>;

  constructor(
    private readonly store: RunStore,
    options: FreestyleExecutionAdapterOptions = {},
  ) {
    this.env = options.env ?? process.env;
    this.agentId = options.agentId ?? "freestyle-agent";
    this.provision = options.provision ?? provisionFreestyleBrowser;
    this.runAgent = options.runAgent ?? defaultRunAgent;
  }

  async startRun(taskId: string, lesson?: Lesson): Promise<{ runId: string }> {
    assertFreestyleConfig(this.env);
    return this.launch(resolveTask(taskId, this.env), lesson);
  }

  /** Starts a run from an already resolved task, including a caller-chosen start URL. */
  async startResolvedRun(task: ResolvedTask, lesson?: Lesson): Promise<{ runId: string }> {
    assertFreestyleConfig(this.env);
    return this.launch(task, lesson);
  }

  private async launch(task: ResolvedTask, lesson?: Lesson): Promise<{ runId: string }> {
    const taskId = task.taskId;
    const lessonId = lesson?.id ?? null;
    const { runId } = await this.store.createRun({ taskId, agentId: this.agentId, lessonId });
    await this.store.appendEvent(runId, "queued", { task_id: taskId, lesson_id: lessonId });
    this.statuses.set(runId, "queued");
    const result = this.execute(runId, task, lesson);
    result.catch(() => undefined);
    this.results.set(runId, result);
    return { runId };
  }

  async getRunStatus(runId: string): Promise<RunStatus> {
    const status = this.statuses.get(runId);
    if (!status) throw new Error(`Unknown run ${runId}`);
    return status;
  }

  async awaitResult(runId: string) {
    const result = this.results.get(runId);
    if (!result) throw new Error(`Unknown run ${runId}`);
    return result;
  }

  private async execute(runId: string, task: ResolvedTask, lesson: Lesson | undefined) {
    let guest: ProvisionedBrowser | null = null;
    try {
      await this.transition(runId, "running");
      guest = await this.provisionWithRetry(runId);
      await this.store.appendEvent(runId, "vm_ready", { vm_id: guest.vmId });

      const agent = await this.runAgent({
        page: guest.page,
        taskIntent: task.intent,
        startUrl: task.startUrl,
        lesson,
        runId,
        store: this.store,
      });
      await this.store.saveTrace(runId, agent.trace);

      const stop = mapStopReason(agent.stopReason);
      if (stop.kind === "terminal") {
        return await this.fail(runId, stop.errorCode, stop.status, agent.stopDetail ?? stop.errorCode);
      }

      const exec = await guest.evaluate(task);
      let evaluator;
      try {
        evaluator = parseEvaluatorStdout(exec.stdout);
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const stderr = exec.stderr.trim();
        return await this.fail(
          runId,
          "evaluator_unavailable",
          "failed",
          stderr ? `${detail}: ${stderr}` : detail,
        );
      }
      await this.store.appendEvent(runId, "evaluator_result", evaluator);
      const verdict = mapEvaluatorResult(evaluator);
      if (verdict.status === "succeeded") await this.transition(runId, "succeeded");
      else await this.transition(runId, "failed", verdict.errorCode);
      return { trace: agent.trace, evaluator };
    } catch (error) {
      if (error instanceof ExecutionError) throw error;
      const message = error instanceof Error ? error.message : String(error);
      const code = guest ? "llm_error" : "vm_provision_error";
      return await this.fail(runId, code, "failed", message);
    } finally {
      await guest?.destroy();
    }
  }

  private async provisionWithRetry(runId: string): Promise<ProvisionedBrowser> {
    let last: unknown;
    for (let attempt = 0; attempt < 2; attempt += 1) {
      try {
        return await this.provision({ runId, attempt, env: this.env });
      } catch (error) {
        last = error;
      }
    }
    throw last instanceof Error ? last : new Error(String(last));
  }

  private async fail(
    runId: string,
    code: ErrorCode,
    status: "failed" | "timed_out",
    message: string,
  ): Promise<never> {
    await this.store.appendEvent(runId, "error", { error_code: code, message });
    await this.transition(runId, status, code);
    throw new ExecutionError(code, runId, message);
  }

  private async transition(runId: string, status: RunStatus, errorCode?: ErrorCode): Promise<void> {
    await this.store.setStatus(runId, status, errorCode ? { errorCode } : undefined);
    this.statuses.set(runId, status);
  }
}
