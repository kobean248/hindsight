import { beforeEach, describe, expect, it } from "vitest";
import { startTestDoubleDemo } from "@/lib/demo/test-double-loop";
import { SCENARIOS } from "@/lib/test-double/scenarios";
import { countVerified, rankScore, wilsonLowerBound } from "@/lib/test-double/scoring";
import { similarity } from "@/lib/test-double/similarity";
import {
  contributeLesson,
  createRun,
  getDashboard,
  getLesson,
  getRun,
  listLessons,
  lookup,
  recordApplication,
  recordOutcome,
  resetStore,
  setRunStatus,
} from "@/lib/test-double/store";

beforeEach(() => resetStore());

describe("§06 confidence", () => {
  it("is 0 when n = 0", () => expect(wilsonLowerBound(0, 0)).toBe(0));
  it("matches the Wilson lower bound", () => {
    expect(wilsonLowerBound(1, 1)).toBeCloseTo(0.2065, 4);
    expect(wilsonLowerBound(8, 10)).toBeCloseTo(0.4902, 4);
  });
  it("ignores pending and unrelated_failure rows", () => {
    expect(
      countVerified([
        { verification_status: "verified_success" },
        { verification_status: "verified_failure" },
        { verification_status: "pending" },
        { verification_status: "unrelated_failure" },
      ]),
    ).toEqual({ s: 1, n: 2 });
  });
  it("ranks 0.7 × similarity + 0.3 × confidence", () => expect(rankScore(0.8, 0.5)).toBeCloseTo(0.71));
});

describe("lookup", () => {
  it("is seeded with the 17 pilot notes", () => {
    expect(listLessons({}).lessons).toHaveLength(17);
    expect(listLessons({ domain: "usps.com" }).lessons).toHaveLength(3);
  });
  it("returns nothing rather than something below the 0.75 floor", () => {
    expect(lookup("usps.com", "price of a flat rate box")).toEqual([]);
    expect(lookup("nowhere.example", "anything")).toEqual([]);
  });
  it("returns only the matching note for a site, not every note", () => {
    const hits = lookup("usps.com", "find the nearest post office and its Saturday retail hours");
    expect(hits.map((h) => h.id)).toEqual(["kb_000015"]);
    expect(hits[0].similarity).toBeGreaterThanOrEqual(0.75);
  });
});

describe("contribute", () => {
  const draft = {
    domain: "usps.com",
    task_pattern: "Look up a ZIP Code for a street address",
    lesson_text: "x",
    root_cause: "y",
    success_criteria: "z",
    risk_warnings: [],
    source_run_id: "r1",
  };
  it("creates a new lesson below the 0.92 dedup threshold", () => {
    const r = contributeLesson(draft);
    expect(r.deduplicated).toBe(false);
    expect(listLessons({ domain: "usps.com" }).lessons).toHaveLength(4);
  });
  it("returns the existing lesson at ≥ 0.92 similarity", () => {
    const first = contributeLesson(draft);
    const second = contributeLesson({ ...draft, source_run_id: "r2" });
    expect(second.deduplicated).toBe(true);
    expect(second.lesson.id).toBe(first.lesson.id);
  });
});

describe("recordOutcome", () => {
  it("is a no-op the second time for the same application_id", () => {
    const run = createRun("t", "agent-b");
    const app = recordApplication("kb_000015", run.id);
    const once = recordOutcome(app.id, "verified_success");
    const twice = recordOutcome(app.id, "verified_success");
    expect(once).toEqual({ times_applied: 1, times_succeeded: 1, confidence: wilsonLowerBound(1, 1) });
    expect(twice).toEqual(once);
  });
  it("does not move confidence for unrelated failures", () => {
    const run = createRun("t", "agent-b");
    const app = recordApplication("kb_000015", run.id);
    expect(recordOutcome(app.id, "unrelated_failure")).toEqual({ times_applied: 0, times_succeeded: 0, confidence: 0 });
  });
});

describe("run lifecycle", () => {
  it("never transitions out of a terminal state", () => {
    const run = createRun("t", "agent-a");
    setRunStatus(run.id, "running");
    setRunStatus(run.id, "failed");
    expect(() => setRunStatus(run.id, "succeeded")).toThrow(/illegal/);
  });
});

describe("scripted usps_03 scenario", () => {
  const sc = SCENARIOS.usps_03;
  it("Reflect's lesson is retrievable for the task but distinct from the pilot note", () => {
    expect(similarity(sc.instruction, sc.reflect.task_pattern)).toBeGreaterThanOrEqual(0.75);
    const pilot = listLessons({ domain: "usps.com" }).lessons.find((l) => l.id === "kb_000015")!;
    expect(similarity(sc.reflect.task_pattern, pilot.task_pattern)).toBeLessThan(0.92);
  });

  it("runs baseline → reflect → transfer with evaluator-only verdicts", async () => {
    const { demo, done } = startTestDoubleDemo("usps_03", 0);
    expect(demo.phase).toBe("baseline");
    const end = await done;
    expect(end.phase).toBe("done");
    expect(end.error).toBeNull();

    const base = getRun(end.baseline_run_id!);
    expect(base.run.verified_success).toBe(false);
    expect(base.run.trace.at(-1)?.type).toBe("finish"); // claimed done, evaluator said no
    expect(base.retrieved_lessons).toEqual([]);
    expect(base.created_lesson?.id).toBe(end.lesson_id);
    expect(base.paired_run_id).toBe(end.transfer_run_id);

    const tr = getRun(end.transfer_run_id!);
    expect(tr.run.verified_success).toBe(true);
    expect(tr.retrieved_lessons.length).toBeGreaterThan(0);
    expect(tr.retrieved_lessons.length).toBeLessThanOrEqual(2);
    expect(tr.applied_lessons.every((a) => a.verification_status === "verified_success")).toBe(true);

    const lesson = getLesson(end.lesson_id!);
    expect(lesson.lesson.times_applied).toBe(1);
    expect(lesson.applications).toHaveLength(1);

    const k = getDashboard().kpis;
    expect(k).toMatchObject({ total_runs: 2, verified_runs: 2, verified_successes: 1, false_successes: 1, claimed_done_runs: 2 });
  });
});
