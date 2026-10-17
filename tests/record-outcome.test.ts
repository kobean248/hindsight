import assert from "node:assert/strict";
import { beforeEach, describe, it } from "node:test";
import { insertAgentRun, setCreatedLessonId } from "../lib/db/agent-runs";
import { insertLesson } from "../lib/db/lessons";
import { resetMemoryStore } from "../lib/db/store";
import type { ExecutionAdapter } from "../lib/execution/types";
import {
  recordApplication,
  recordOutcome,
  recordOutcomeFromCaller,
  setExecutionAdapter,
} from "../lib/loop/operations";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "../lib/scoring/constants";

process.env.LEDGER_STORE = "memory";

const embedding = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
embedding[0] = 1;

beforeEach(() => {
  resetMemoryStore();
  setExecutionAdapter(null);
});

async function seedApplication() {
  const origin = await insertAgentRun({
    task_id: "shopping",
    agent_id: "agent-a",
    status: "failed",
    error_code: "task_failed",
    trace: [],
  });
  const lesson = await insertLesson({
    domain: "webarena.shopping",
    task_pattern: "select a size before add to cart",
    task_embedding: embedding,
    embedding_model: EMBEDDING_MODEL,
  });
  await setCreatedLessonId(origin.id, lesson.id);
  const later = await insertAgentRun({
    task_id: "shopping",
    agent_id: "agent-b",
    status: "running",
    trace: [],
  });
  const { application_id } = await recordApplication(lesson.id, later.id);
  return { lesson, later, application_id };
}

describe("recordOutcome idempotency", () => {
  it("does not change counters when the same application is recorded twice", async () => {
    const { application_id } = await seedApplication();
    const first = await recordOutcome(application_id, "verified_success");
    const second = await recordOutcome(application_id, "verified_failure");
    assert.deepEqual(second, first);
    assert.equal(second.times_applied, 1);
    assert.equal(second.times_succeeded, 1);
    assert.ok(second.confidence > 0);
  });
});

describe("MCP record_outcome", () => {
  it("records the evaluator result and ignores a client-supplied success value", async () => {
    const { later, application_id } = await seedApplication();
    const adapter: ExecutionAdapter = {
      async startRun() {
        return { runId: later.id };
      },
      async getRunStatus() {
        return "running";
      },
      async awaitResult() {
        return {
          trace: [],
          evaluator: {
            passed: false,
            score: 0,
            evidence: { type: "program_html", detail: "size was not selected" },
          },
        };
      },
    };
    setExecutionAdapter(adapter);

    const score = await recordOutcomeFromCaller({
      application_id,
      run_id: later.id,
      success: true,
      verification_status: "verified_success",
    });

    assert.equal(score.times_applied, 1);
    assert.equal(score.times_succeeded, 0);
    assert.equal(score.confidence, 0);
  });
});
