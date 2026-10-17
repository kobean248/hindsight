import { assertTransition } from "../execution/state-machine";
import type {
  CreateRunInput,
  RunEventPayloads,
  RunEventType,
  RunStatus,
  RunStore,
  SetStatusOptions,
  TraceEvent,
} from "../execution/types";
import { getAgentRunById, insertAgentRun, saveRunTrace, updateRunStatus } from "./agent-runs";
import { insertRunEvent } from "./run-events";

/** Lane B's RunStore over the ledger tables. */
export const dbRunStore: RunStore = {
  async createRun(input: CreateRunInput): Promise<{ runId: string }> {
    const run = await insertAgentRun({
      task_id: input.taskId,
      agent_id: input.agentId,
      status: "queued",
    });
    return { runId: run.id };
  },

  async appendEvent<T extends RunEventType>(
    runId: string,
    eventType: T,
    payload: RunEventPayloads[T]
  ): Promise<void> {
    await insertRunEvent({ run_id: runId, event_type: eventType, payload });
  },

  async setStatus(runId: string, status: RunStatus, options: SetStatusOptions = {}): Promise<void> {
    const current = await getAgentRunById(runId);
    if (!current) throw new Error(`Unknown run ${runId}`);
    assertTransition(runId, current.status, status, options.errorCode);
    await updateRunStatus(runId, status, {
      error_code: options.errorCode,
      ...(status === "running" ? { completed_at: null } : {}),
    });
  },

  async saveTrace(runId: string, trace: TraceEvent[]): Promise<void> {
    const current = await getAgentRunById(runId);
    if (!current) throw new Error(`Unknown run ${runId}`);
    await saveRunTrace(runId, trace);
  },
};
