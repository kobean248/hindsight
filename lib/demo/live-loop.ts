/**
 * Live demo: Round 1 starts a real Freestyle run immediately, then reflect
 * and transfer continue in the background while the panel polls this state.
 */
import { randomUUID } from "node:crypto";
import { setVerifiedSuccess } from "@/lib/db/agent-runs";
import { dbRunStore } from "@/lib/db/run-store";
import { insertRunEvent } from "@/lib/db/run-events";
import { FreestyleExecutionAdapter } from "@/lib/execution/freestyle-adapter";
import { ExecutionError } from "@/lib/execution/types";
import { learnFromFailure, lookup, recordApplication, recordOutcome, setExecutionAdapter } from "@/lib/loop/operations";
import type { DemoState } from "@/lib/ui/contracts";
import { diagnoseWithGroq } from "./diagnose-groq";
import { liveDemoTasks, resolveLiveTask } from "./live-tasks";

const demos = new Map<string, DemoState>();
const startUrls = new Map<string, string>();
let adapter: FreestyleExecutionAdapter | null = null;

function liveAdapter(): FreestyleExecutionAdapter {
  if (!adapter) {
    adapter = new FreestyleExecutionAdapter(dbRunStore);
    setExecutionAdapter(adapter);
  }
  return adapter;
}

export { liveDemoTasks };

export function getLiveDemo(id: string): DemoState | null {
  const demo = demos.get(id);
  return demo ? { ...demo } : null;
}

export async function startLiveDemo(taskId?: string, startUrl?: string): Promise<DemoState> {
  const chosenId = taskId ?? liveDemoTasks()[0]?.task_id;
  if (!chosenId) throw new Error("no live task configured");
  const task = resolveLiveTask(chosenId, startUrl);
  const demo: DemoState = {
    id: randomUUID(),
    task_id: task.taskId,
    domain: liveDemoTasks().find((item) => item.task_id === task.taskId)?.domain ?? "live",
    phase: "baseline",
    started_at: new Date().toISOString(),
    baseline_run_id: null,
    lesson_id: null,
    transfer_run_id: null,
    error: null,
    source: "live",
  };
  const { runId } = await liveAdapter().startResolvedRun(task);
  demo.baseline_run_id = runId;
  demos.set(demo.id, demo);
  startUrls.set(demo.id, task.startUrl);
  await insertRunEvent({
    run_id: runId,
    event_type: "lookup_skipped",
    payload: { reason: "baseline round runs without lessons" },
  });
  void continueLiveDemo(demo).catch((error: unknown) => {
    demo.phase = "error";
    demo.error = error instanceof Error ? error.message : "live demo failed";
  });
  return { ...demo };
}

async function continueLiveDemo(demo: DemoState): Promise<void> {
  const runId = demo.baseline_run_id;
  if (!runId) return;
  let passed = false;
  try {
    const result = await liveAdapter().awaitResult(runId);
    passed = result.evaluator.passed;
    await setVerifiedSuccess(runId, passed);
  } catch (error) {
    demo.phase = "error";
    demo.error = error instanceof ExecutionError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : "baseline run failed";
    return;
  }
  if (passed) {
    demo.phase = "done";
    demo.error = "Baseline passed, so there was no failure to learn from.";
    return;
  }
  demo.phase = "reflecting";
  let learned: Awaited<ReturnType<typeof learnFromFailure>> | undefined;
  try {
    learned = await learnFromFailure(
      {
        runId,
        domain: demo.domain,
        task_pattern: demo.task_id,
      },
      process.env.ANTHROPIC_API_KEY?.trim() ? undefined : diagnoseWithGroq,
    );
  } catch (error) {
    demo.phase = "error";
    demo.error = error instanceof Error ? error.message : "reflect failed";
    return;
  }
  if (!learned?.lesson_id) {
    demo.phase = "error";
    demo.error = "Reflect finished without a lesson id.";
    return;
  }
  demo.lesson_id = learned.lesson_id;
  demo.phase = "transfer";
  const catalog = liveDemoTasks().find((item) => item.task_id === demo.task_id);
  const retrieved = await lookup({
    domain: demo.domain,
    task_description: catalog?.instruction ?? demo.task_id,
    k: 1,
  });
  const applied = retrieved[0];
  const transferTask = resolveLiveTask(demo.task_id, startUrls.get(demo.id));
  const transfer = await liveAdapter().startResolvedRun(
    transferTask,
    applied
      ? {
          id: applied.id,
          lesson_text: applied.lesson_text,
          risk_warnings: applied.risk_warnings,
          domain: applied.domain,
          root_cause: applied.root_cause,
          success_criteria: applied.success_criteria,
          confidence: applied.confidence,
        }
      : undefined,
  );
  demo.transfer_run_id = transfer.runId;
  const application = applied ? await recordApplication(applied.id, transfer.runId) : null;
  try {
    const result = await liveAdapter().awaitResult(transfer.runId);
    await setVerifiedSuccess(transfer.runId, result.evaluator.passed);
    if (application) {
      await recordOutcome(application.application_id, result.evaluator.passed ? "verified_success" : "verified_failure");
    }
    demo.phase = "done";
  } catch (error) {
    demo.phase = "error";
    demo.error = error instanceof ExecutionError ? `${error.code}: ${error.message}` : error instanceof Error ? error.message : "transfer run failed";
  }
}
