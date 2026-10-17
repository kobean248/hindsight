import { getStore } from "./store";
import type { AgentRun, NewAgentRun, RunStatus, TraceEvent } from "./types";

export async function insertAgentRun(input: NewAgentRun): Promise<AgentRun> {
  return getStore().insertAgentRun(input);
}

export async function getAgentRunById(id: string): Promise<AgentRun | null> {
  return getStore().getAgentRunById(id);
}

export async function updateRunStatus(
  id: string,
  status: RunStatus,
  patch: { error_code?: string | null; completed_at?: string | null; trace?: TraceEvent[] } = {}
): Promise<AgentRun> {
  return getStore().updateRunStatus(id, status, patch);
}

export async function setVerifiedSuccess(id: string, verifiedSuccess: boolean): Promise<AgentRun> {
  return getStore().setVerifiedSuccess(id, verifiedSuccess);
}

export async function setRetrievedLessonIds(
  id: string,
  lessonIds: readonly string[]
): Promise<AgentRun> {
  return getStore().setRetrievedLessonIds(id, lessonIds);
}

export async function setCreatedLessonId(id: string, lessonId: string): Promise<AgentRun> {
  return getStore().setCreatedLessonId(id, lessonId);
}

export async function listRuns(): Promise<AgentRun[]> {
  return getStore().listRuns();
}
