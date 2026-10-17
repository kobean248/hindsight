/**
 * The demo port app/api/start-demo-run calls. Test-double mode drives the
 * scripted loop. Live mode starts the Freestyle adapter and keeps round
 * state in memory for the panel poll.
 */
import type { DemoState } from "@/lib/ui/contracts";
import { DATA_SOURCE } from "@/lib/ui/config";
import { DEFAULT_SCENARIO, SCENARIOS } from "@/lib/test-double/scenarios";
import { getDemo as getTestDoubleDemo } from "@/lib/test-double/store";
import { getLiveDemo, liveDemoTasks, startLiveDemo } from "./live-loop";
import { startTestDoubleDemo } from "./test-double-loop";

export class DemoUnavailable extends Error {}

export function demoTasks(): { task_id: string; domain: string; instruction: string; start_url?: string; success_url_includes?: string | null }[] {
  if (DATA_SOURCE === "live") return liveDemoTasks();
  return Object.values(SCENARIOS).map(({ task_id, domain, instruction }) => ({ task_id, domain, instruction }));
}

export async function startDemo(taskId?: string, startUrl?: string): Promise<DemoState> {
  if (DATA_SOURCE === "live") return startLiveDemo(taskId, startUrl);
  return startTestDoubleDemo(taskId ?? DEFAULT_SCENARIO).demo;
}

export function getDemo(id: string): DemoState | null {
  if (DATA_SOURCE === "live") return getLiveDemo(id);
  return getTestDoubleDemo(id);
}
