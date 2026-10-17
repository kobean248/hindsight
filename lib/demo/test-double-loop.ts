/**
 * startDemoRun against the test double: Round 1 baseline (no lessons) →
 * Round 2 reflect + contribute → Round 3 fresh agent with lookup (PRD §10).
 */
import { randomUUID } from "node:crypto";
import type { DemoState } from "@/lib/ui/contracts";
import { executeScripted } from "@/lib/test-double/executor";
import { SCENARIOS, type Scenario } from "@/lib/test-double/scenarios";
import { RELEVANCE_FLOOR } from "@/lib/test-double/scoring";
import {
  addEvent,
  contributeLesson,
  createRun,
  lookup,
  pairRuns,
  recordApplication,
  recordOutcome,
  saveDemo,
  setRetrieved,
} from "@/lib/test-double/store";

/** §07 lookup k for the demo; the pilot showed 1–2 notes beat "everything for the site". */
export const DEMO_LOOKUP_K = 2;

export function startTestDoubleDemo(taskId: string, stepDelayMs = 900): { demo: DemoState; done: Promise<DemoState> } {
  const scenario = SCENARIOS[taskId];
  if (!scenario) throw new Error(`no scripted scenario for task ${taskId}`);
  const demo = saveDemo({
    id: randomUUID(),
    task_id: taskId,
    domain: scenario.domain,
    phase: "baseline",
    started_at: new Date().toISOString(),
    baseline_run_id: null,
    lesson_id: null,
    transfer_run_id: null,
    error: null,
    source: "test_double",
  });
  const done = runRounds(demo, scenario, stepDelayMs).catch((e: Error) => {
    demo.phase = "error";
    demo.error = e.message;
    return demo;
  });
  return { demo: { ...demo }, done };
}

async function runRounds(demo: DemoState, sc: Scenario, delay: number): Promise<DemoState> {
  // Round 1 — baseline: no lookup, no lessons in context.
  const baseline = createRun(sc.task_id, "agent-a");
  demo.baseline_run_id = baseline.id;
  addEvent(baseline.id, "lookup_skipped", { reason: "baseline round runs without lessons (PRD §10.3)" });
  const r1 = await executeScripted(baseline.id, sc.baseline, delay);
  if (r1.passed) {
    demo.phase = "done";
    demo.error = "Baseline passed, so there was no failure to learn from. Rehearse until it fails for the intended reason (PRD §10).";
    return demo;
  }

  // Round 2 — reflect on the evaluator-confirmed failure, contribute the lesson.
  demo.phase = "reflecting";
  await new Promise((r) => setTimeout(r, delay));
  const { lesson, deduplicated, similarity } = await contributeLesson({
    ...sc.reflect,
    domain: sc.domain,
    source_run_id: baseline.id,
  });
  addEvent(baseline.id, "reflect", {
    root_cause: sc.reflect.root_cause,
    lesson_text: sc.reflect.lesson_text,
    success_criteria: sc.reflect.success_criteria,
    risk_warnings: sc.reflect.risk_warnings,
  });
  addEvent(baseline.id, "contribute", { lesson_id: lesson.id, deduplicated, similarity });
  demo.lesson_id = lesson.id;

  // Round 3 — a fresh agent whose only task-specific addition is lookup's result.
  demo.phase = "transfer";
  const transfer = createRun(sc.task_id, "agent-b");
  demo.transfer_run_id = transfer.id;
  pairRuns(baseline.id, transfer.id);
  const retrieved = await lookup(sc.domain, sc.instruction, DEMO_LOOKUP_K);
  setRetrieved(transfer.id, retrieved);
  addEvent(transfer.id, "lookup", {
    domain: sc.domain,
    k: DEMO_LOOKUP_K,
    relevance_floor: RELEVANCE_FLOOR,
    returned: retrieved.map((l) => ({ lesson_id: l.id, similarity: l.similarity, rank_score: l.rank_score })),
  });
  const apps = retrieved.map((l) => recordApplication(l.id, transfer.id));
  const script = sc.fixedBy(retrieved) ? sc.transfer : sc.baseline;
  const r3 = await executeScripted(transfer.id, script, delay);
  for (const a of apps) recordOutcome(a.id, r3.passed ? "verified_success" : "verified_failure");

  demo.phase = "done";
  return demo;
}
