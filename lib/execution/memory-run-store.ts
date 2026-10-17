import { randomUUID } from "node:crypto";

import { assertTransition, isTerminal } from "./state-machine";
import type {
  CreateRunInput,
  ErrorCode,
  RunEventPayloads,
  RunEventType,
  RunStatus,
  RunStore,
  SetStatusOptions,
  TraceEvent,
} from "./types";

/** Mirrors an `agent_runs` row (PRD section 05). */
export interface MemoryRunRow {
  id: string;
  task_id: string;
  agent_id: string;
  lesson_id: string | null;
  status: RunStatus;
  trace: TraceEvent[];
  started_at: string | null;
  completed_at: string | null;
  verified_success: boolean | null;
  error_code: ErrorCode | null;
}

/** Mirrors a `run_events` row (PRD section 05). */
export interface MemoryRunEvent<T extends RunEventType = RunEventType> {
  id: string;
  run_id: string;
  event_type: T;
  payload: RunEventPayloads[T];
  created_at: string;
}

export class MemoryRunStore implements RunStore {
  private readonly runs = new Map<string, MemoryRunRow>();
  private readonly events: MemoryRunEvent[] = [];

  constructor(private readonly now: () => Date = () => new Date()) {}

  async createRun(input: CreateRunInput): Promise<{ runId: string }> {
    const id = randomUUID();
    this.runs.set(id, {
      id,
      task_id: input.taskId,
      agent_id: input.agentId,
      lesson_id: input.lessonId,
      status: "queued",
      trace: [],
      started_at: null,
      completed_at: null,
      verified_success: null,
      error_code: null,
    });
    return { runId: id };
  }

  async appendEvent<T extends RunEventType>(
    runId: string,
    eventType: T,
    payload: RunEventPayloads[T],
  ): Promise<void> {
    this.require(runId);
    this.events.push({
      id: randomUUID(),
      run_id: runId,
      event_type: eventType,
      payload: structuredClone(payload),
      created_at: this.now().toISOString(),
    } as MemoryRunEvent);
  }

  async setStatus(runId: string, status: RunStatus, options: SetStatusOptions = {}): Promise<void> {
    const run = this.require(runId);
    assertTransition(runId, run.status, status, options.errorCode);
    const ts = this.now().toISOString();
    run.status = status;
    if (status === "running") run.started_at = ts;
    if (isTerminal(status)) run.completed_at = ts;
    if (options.errorCode) run.error_code = options.errorCode;
  }

  async saveTrace(runId: string, trace: TraceEvent[]): Promise<void> {
    this.require(runId).trace = structuredClone(trace);
  }

  getRun(runId: string): MemoryRunRow | undefined {
    const run = this.runs.get(runId);
    return run && structuredClone(run);
  }

  getEvents(runId: string): MemoryRunEvent[] {
    return structuredClone(this.events.filter((e) => e.run_id === runId));
  }

  private require(runId: string): MemoryRunRow {
    const run = this.runs.get(runId);
    if (!run) throw new Error(`Unknown run ${runId}`);
    return run;
  }
}
