import { describe, expect, it, vi } from "vitest";
import type { Page } from "playwright-core";

import { FreestyleExecutionAdapter } from "../freestyle-adapter";
import { parseEvaluatorStdout, resolveTask } from "../freestyle-task";
import { vmSlug, type ProvisionedBrowser } from "../freestyle-runtime";
import { ExecutionError, MemoryRunStore, type Lesson } from "../index";

const ENV = {
  FREESTYLE_API_KEY: "test-key",
  WEBARENA_SNAPSHOT_SLUG: "agent-ledger-webarena",
  GROQ_API_KEY: "test-groq",
  WEBARENA_SHOPPING_URL: "https://shopping.example",
};

const LESSON: Lesson = { id: "lesson-1", lesson_text: "Open the detail page.", risk_warnings: [] };

function guest(evaluate: ProvisionedBrowser["evaluate"]): ProvisionedBrowser & { destroyed: boolean } {
  const record = {
    vmId: "vm-1",
    page: {} as Page,
    destroyed: false,
    evaluate,
    destroy: async () => {
      record.destroyed = true;
    },
  };
  return record;
}

function adapter(
  store: MemoryRunStore,
  provision: (input: { runId: string; attempt: number }) => Promise<ProvisionedBrowser>,
  runAgent: FreestyleExecutionAdapter extends never ? never : (options: { lesson?: Lesson; startUrl?: string }) => Promise<{
    trace: [];
    finishSummary: null;
    stopReason: "finish" | "llm_timeout";
    stopDetail: string | null;
  }>,
) {
  return new FreestyleExecutionAdapter(store, {
    env: ENV,
    provision: async (input) => provision(input),
    runAgent: async (options) => runAgent(options),
  });
}

describe("resolveTask", () => {
  it("replaces the shopping token with the site URL", () => {
    const task = resolveTask("509", ENV);
    expect(task.intent).toMatch(/Men's shoe/);
    expect(task.startUrl).toBe("https://shopping.example");
  });

  it("refuses a placeholder with no site URL", () => {
    expect(() => resolveTask("509", { ...ENV, WEBARENA_SHOPPING_URL: "" })).toThrow(/WEBARENA_SHOPPING_URL/);
  });
});

describe("parseEvaluatorStdout", () => {
  it("reads the last JSON object", () => {
    const parsed = parseEvaluatorStdout('log line\n{"passed":false,"score":0,"evidence":{"type":"program_html","detail":"missing size"}}\n');
    expect(parsed).toEqual({ passed: false, score: 0, evidence: { type: "program_html", detail: "missing size" } });
  });
});

describe("FreestyleExecutionAdapter", () => {
  it("refuses to start when the Freestyle key is missing", async () => {
    const store = new MemoryRunStore();
    const execution = new FreestyleExecutionAdapter(store, { env: {} });
    await expect(execution.startRun("509")).rejects.toThrow(/FREESTYLE_API_KEY/);
  });

  it("marks the run failed and does not keep a VM when provisioning fails twice", async () => {
    const store = new MemoryRunStore();
    const provision = vi.fn(async () => {
      throw new Error("snapshot missing");
    });
    const execution = new FreestyleExecutionAdapter(store, {
      env: ENV,
      provision,
      runAgent: async () => {
        throw new Error("agent should not run");
      },
    });
    const { runId } = await execution.startRun("509");
    await expect(execution.awaitResult(runId)).rejects.toBeInstanceOf(ExecutionError);
    expect(provision).toHaveBeenCalledTimes(2);
    expect(await execution.getRunStatus(runId)).toBe("failed");
    expect(store.getRun(runId)?.error_code).toBe("vm_provision_error");
    expect(store.getEvents(runId).some((event) => event.event_type === "vm_ready")).toBe(false);
  });

  it("runs the agent, records the evaluator, and destroys the VM", async () => {
    const store = new MemoryRunStore();
    const live = guest(async () => ({
      stdout: '{"passed":false,"score":0,"evidence":{"type":"program_html","detail":"size was not selected"}}',
      stderr: "",
      statusCode: 0,
    }));
    const execution = adapter(
      store,
      async () => live,
      async (options) => {
        expect(options.startUrl).toBe("https://shopping.example");
        expect(options.lesson?.id).toBe("lesson-1");
        return { trace: [], finishSummary: null, stopReason: "finish", stopDetail: null };
      },
    );
    const { runId } = await execution.startRun("509", LESSON);
    const result = await execution.awaitResult(runId);
    expect(result.evaluator.passed).toBe(false);
    expect(await execution.getRunStatus(runId)).toBe("failed");
    expect(store.getRun(runId)?.error_code).toBe("task_failed");
    expect(live.destroyed).toBe(true);
    expect(store.getEvents(runId).map((event) => event.event_type)).toEqual([
      "queued",
      "vm_ready",
      "evaluator_result",
    ]);
  });

  it("skips the evaluator when the agent loop times out, and still destroys the VM", async () => {
    const store = new MemoryRunStore();
    const evaluate = vi.fn(async () => ({ stdout: "", stderr: "", statusCode: 0 }));
    const live = guest(evaluate);
    const execution = new FreestyleExecutionAdapter(store, {
      env: ENV,
      provision: async () => live,
      runAgent: async () => ({ trace: [], finishSummary: null, stopReason: "llm_timeout", stopDetail: "timed out" }),
    });
    const { runId } = await execution.startRun("509");
    await expect(execution.awaitResult(runId)).rejects.toMatchObject({ code: "llm_timeout" });
    expect(evaluate).not.toHaveBeenCalled();
    expect(live.destroyed).toBe(true);
    expect(await execution.getRunStatus(runId)).toBe("timed_out");
  });

  it("records evaluator_unavailable when stdout is not the contract", async () => {
    const store = new MemoryRunStore();
    const live = guest(async () => ({ stdout: "not json", stderr: "boom", statusCode: 1 }));
    const execution = new FreestyleExecutionAdapter(store, {
      env: ENV,
      provision: async () => live,
      runAgent: async () => ({ trace: [], finishSummary: null, stopReason: "finish", stopDetail: null }),
    });
    const { runId } = await execution.startRun("509");
    await expect(execution.awaitResult(runId)).rejects.toMatchObject({ code: "evaluator_unavailable" });
    expect(live.destroyed).toBe(true);
  });
});

describe("vmSlug", () => {
  it("stays a freestyle slug and changes on retry", () => {
    expect(vmSlug("550e8400-e29b-41d4-a716-446655440000", 0)).toBe("ledger550e8400e29b");
    expect(vmSlug("550e8400-e29b-41d4-a716-446655440000", 1)).toBe("ledger550e8400e29b1");
  });
});
