import { beforeEach, describe, expect, it } from "vitest";
import { isValidName } from "@/lib/recorded";
import { startTestDoubleDemo } from "@/lib/demo/test-double-loop";
import { getRun, resetStore } from "@/lib/test-double/store";
import { claimOf, contributeOf, diagnosisOf, evaluatorOf, isFalseSuccess, isSettled, lookupStateOf } from "@/lib/ui/run-view";

beforeEach(() => resetStore());

describe("run-view over a finished demo", () => {
  it("separates the agent's claim from the evaluator's verdict", async () => {
    const end = await startTestDoubleDemo("usps_03", 0).done;
    const base = getRun(end.baseline_run_id!);
    const tr = getRun(end.transfer_run_id!);

    expect(claimOf(base)?.summary).toMatch(/Saturday/);
    expect(evaluatorOf(base)?.passed).toBe(false);
    expect(isFalseSuccess(base)).toBe(true);
    expect(isFalseSuccess(tr)).toBe(false);

    expect(lookupStateOf(base)).toBe("skipped");
    expect(lookupStateOf(tr)).toBe("returned");

    expect(diagnosisOf(base)?.root_cause).toMatch(/results list/);
    expect(contributeOf(base)).toMatchObject({ deduplicated: false });
    expect(isSettled(base) && isSettled(tr)).toBe(true);
  });

  it("is not settled while a run is still executing", () => {
    const { demo } = startTestDoubleDemo("usps_03", 50);
    expect(isSettled(getRun(demo.baseline_run_id!))).toBe(false);
  });
});

describe("recorded pair names", () => {
  it("rejects path traversal", () => {
    expect(isValidName("usps-03-rehearsal_1")).toBe(true);
    expect(isValidName("../pilot")).toBe(false);
    expect(isValidName("")).toBe(false);
  });
});
