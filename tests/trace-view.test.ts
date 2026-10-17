import { describe, expect, it } from "vitest";
import type { RunSummary, TraceEvent } from "@/lib/ui/contracts";
import { describeStep, groupByAgent, replayDelay, summarizeTrace } from "@/lib/ui/trace-view";

function ev(over: Partial<TraceEvent> = {}): TraceEvent {
  return {
    seq: 1,
    ts: "2026-10-17T00:00:00.000Z",
    type: "click",
    selector: null,
    value: null,
    result: "ok",
    error: null,
    screenshot_ref: null,
    duration_ms: 420,
    ...over,
  };
}

function run(over: Partial<RunSummary> = {}): RunSummary {
  return {
    id: "r1",
    task_id: "t1",
    agent_id: "agent-a",
    status: "succeeded",
    verified_success: null,
    started_at: "2026-10-17T00:00:00.000Z",
    completed_at: null,
    error_code: null,
    steps: 3,
    agent_claimed_done: false,
    lessons_applied: 0,
    ...over,
  };
}

describe("describeStep", () => {
  it("navigate uses value, then selector, then empty", () => {
    expect(describeStep(ev({ type: "navigate", value: "https://x.test", selector: "#a" }))).toEqual({
      seq: 1,
      command: "navigate https://x.test",
      running: "Navigating…",
      done: "Loaded · ok · 420 ms",
      tone: "ok",
    });
    expect(describeStep(ev({ type: "navigate", selector: "#a" })).command).toBe("navigate #a");
    expect(describeStep(ev({ type: "navigate" })).command).toBe("navigate");
  });

  it("click", () => {
    expect(describeStep(ev({ seq: 2, type: "click", selector: "#go" }))).toEqual({
      seq: 2,
      command: "click #go",
      running: "Clicking #go…",
      done: "Clicked · ok · 420 ms",
      tone: "ok",
    });
  });

  it("errored click is bad with the error text", () => {
    const s = describeStep(ev({ type: "click", selector: "#go", result: "error", error: "not found", duration_ms: 90 }));
    expect(s.done).toBe("Failed · not found · 90 ms");
    expect(s.tone).toBe("bad");
    expect(s.command).toBe("click #go");
  });

  it("errored step without an error message says unknown error", () => {
    expect(describeStep(ev({ type: "click", selector: "#go", result: "error" })).done).toBe(
      "Failed · unknown error · 420 ms",
    );
  });

  it("fill", () => {
    expect(describeStep(ev({ type: "fill", selector: "#zip", value: "94107" }))).toMatchObject({
      command: 'fill #zip "94107"',
      running: "Typing into #zip…",
      done: "Filled · ok · 420 ms",
      tone: "ok",
    });
  });

  it("select", () => {
    expect(describeStep(ev({ type: "select", selector: "#day", value: "Saturday" }))).toMatchObject({
      command: 'select #day "Saturday"',
      running: "Selecting in #day…",
      done: "Selected · ok · 420 ms",
      tone: "ok",
    });
  });

  it("screenshot reads as snapshot", () => {
    expect(describeStep(ev({ type: "screenshot" }))).toMatchObject({
      command: "snapshot",
      running: "Reading page…",
      done: "Captured · ok · 420 ms",
      tone: "ok",
    });
  });

  it("finish is info", () => {
    expect(describeStep(ev({ type: "finish", value: "all done" }))).toMatchObject({
      command: 'finish "all done"',
      running: "Agent reports done…",
      done: "Reported done · ok · 420 ms",
      tone: "info",
    });
  });

  it("error type is bad", () => {
    expect(describeStep(ev({ type: "error", result: "error", error: "boom" }))).toMatchObject({
      command: "error",
      running: "Step failed…",
      done: "Failed · boom · 420 ms",
      tone: "bad",
    });
  });

  it("missing selector/value leave no stray double spaces", () => {
    expect(describeStep(ev({ type: "click" })).command).toBe("click");
    expect(describeStep(ev({ type: "click" })).running).toBe("Clicking…");
    expect(describeStep(ev({ type: "fill", value: "x" })).command).toBe('fill "x"');
    expect(describeStep(ev({ type: "fill", selector: "#a" })).command).toBe('fill #a ""');
  });

  it("truncates values longer than 80 chars with an ellipsis", () => {
    const long = "a".repeat(81);
    expect(describeStep(ev({ type: "fill", selector: "#a", value: long })).command).toBe(`fill #a "${"a".repeat(80)}…"`);
    const exact = "b".repeat(80);
    expect(describeStep(ev({ type: "fill", selector: "#a", value: exact })).command).toBe(`fill #a "${exact}"`);
    expect(describeStep(ev({ type: "navigate", value: long })).command).toBe(`navigate ${"a".repeat(80)}…`);
  });
});

describe("summarizeTrace", () => {
  it("handles an empty trace", () => {
    expect(summarizeTrace([])).toEqual({
      steps: 0,
      errors: 0,
      total_ms: 0,
      first_error_seq: null,
      claimed_done: false,
      by_type: {},
    });
  });

  it("counts errors, finish, durations and types", () => {
    const trace = [
      ev({ seq: 1, type: "navigate", duration_ms: 100 }),
      ev({ seq: 2, type: "click", result: "error", error: "x", duration_ms: 50 }),
      ev({ seq: 3, type: "click", duration_ms: 25 }),
      ev({ seq: 4, type: "finish", duration_ms: 5 }),
    ];
    expect(summarizeTrace(trace)).toEqual({
      steps: 4,
      errors: 1,
      total_ms: 180,
      first_error_seq: 2,
      claimed_done: true,
      by_type: { navigate: 1, click: 2, finish: 1 },
    });
  });
});

describe("groupByAgent", () => {
  it("sorts agents ascending and runs newest first with null started_at last", () => {
    const runs = [
      run({ id: "b1", agent_id: "agent-b", started_at: "2026-10-17T01:00:00.000Z", steps: 2 }),
      run({ id: "a-null", agent_id: "agent-a", started_at: null, steps: 1 }),
      run({ id: "a-old", agent_id: "agent-a", started_at: "2026-10-17T00:00:00.000Z", steps: 4 }),
      run({ id: "a-new", agent_id: "agent-a", started_at: "2026-10-17T02:00:00.000Z", steps: 5 }),
    ];
    const groups = groupByAgent(runs);
    expect(groups.map((g) => g.agent_id)).toEqual(["agent-a", "agent-b"]);
    expect(groups[0].runs.map((r) => r.id)).toEqual(["a-new", "a-old", "a-null"]);
    expect(groups[0].latest.id).toBe("a-new");
    expect(groups[0].total_steps).toBe(10);
    expect(groups[1].latest.id).toBe("b1");
    expect(groups[1].total_steps).toBe(2);
  });

  it("returns an empty list for no runs", () => {
    expect(groupByAgent([])).toEqual([]);
  });
});

describe("replayDelay", () => {
  it("clamps low, high, and passes through in range", () => {
    expect(replayDelay(ev({ duration_ms: 10 }))).toBe(250);
    expect(replayDelay(ev({ duration_ms: 5000 }))).toBe(1200);
    expect(replayDelay(ev({ duration_ms: 600 }))).toBe(600);
  });

  it("falls back to 400 for non-finite durations", () => {
    expect(replayDelay(ev({ duration_ms: Number.NaN }))).toBe(400);
    expect(replayDelay(ev({ duration_ms: Number.POSITIVE_INFINITY }))).toBe(400);
  });
});
