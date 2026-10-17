/**
 * The demo port app/api/start-demo-run calls. In test-double mode it drives
 * lib/demo/test-double-loop; in live mode it must call Lane A's loop
 * orchestrator (lib/loop), which is not merged yet — see liveNotWired().
 */
import type { DemoState } from "@/lib/ui/contracts";
import { DATA_SOURCE } from "@/lib/ui/config";
import { DEFAULT_SCENARIO, SCENARIOS } from "@/lib/test-double/scenarios";
import { getDemo as getTestDoubleDemo } from "@/lib/test-double/store";
import { startTestDoubleDemo } from "./test-double-loop";

export class DemoUnavailable extends Error {}

export function demoTasks(): { task_id: string; domain: string; instruction: string }[] {
  if (DATA_SOURCE === "live") return [];
  return Object.values(SCENARIOS).map(({ task_id, domain, instruction }) => ({ task_id, domain, instruction }));
}

function liveNotWired(): never {
  throw new DemoUnavailable(
    "Live demo needs Lane A's loop orchestrator (lib/loop) and Lane B's real ExecutionAdapter, which are not merged into this build yet.",
  );
}

export function startDemo(taskId?: string): DemoState {
  if (DATA_SOURCE === "live") liveNotWired();
  return startTestDoubleDemo(taskId ?? DEFAULT_SCENARIO).demo;
}

export function getDemo(id: string): DemoState | null {
  if (DATA_SOURCE === "live") liveNotWired();
  return getTestDoubleDemo(id);
}
