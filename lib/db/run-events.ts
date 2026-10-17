import { getStore } from "./store";
import type { RunEvent } from "./types";

export async function insertRunEvent(input: {
  run_id: string;
  event_type: string;
  payload: unknown;
}): Promise<RunEvent> {
  return getStore().insertRunEvent(input);
}

export async function listRunEvents(runId: string): Promise<RunEvent[]> {
  return getStore().listRunEvents(runId);
}
