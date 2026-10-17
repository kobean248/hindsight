/** Plays a scripted step list into a run, one step per `stepDelayMs`, so polling shows it live. */
import type { EvaluatorResult } from "@/lib/ui/contracts";
import type { Scenario } from "./scenarios";
import { addEvent, appendTrace, recordVerification, setRunStatus } from "./store";

const sleep = (ms: number) => (ms > 0 ? new Promise((r) => setTimeout(r, ms)) : Promise.resolve());

export async function executeScripted(
  runId: string,
  script: Scenario["baseline"],
  stepDelayMs: number,
): Promise<EvaluatorResult> {
  setRunStatus(runId, "running");
  addEvent(runId, "vm_ready", { executor: "test_double" });
  for (const [i, s] of script.steps.entries()) {
    await sleep(stepDelayMs);
    appendTrace(runId, {
      seq: i + 1,
      ts: new Date().toISOString(),
      type: s.type,
      selector: s.selector,
      value: s.value,
      result: s.result ?? "ok",
      error: s.error ?? null,
      screenshot_ref: null,
      duration_ms: stepDelayMs,
    });
  }
  await sleep(stepDelayMs);
  // verify(): the evaluator's result, never the agent's finish() text, decides the verdict.
  recordVerification(runId, script.evaluator);
  setRunStatus(runId, script.evaluator.passed ? "succeeded" : "failed");
  return script.evaluator;
}
