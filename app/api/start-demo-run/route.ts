/**
 * startDemoRun (§07/§09): POST starts Round 1 → 2 → 3 and returns the demo's
 * state; GET ?id= returns its current round for the 2-second poll.
 */
import { badRequest, json, notFound, readJson } from "@/lib/http/respond";
import { DemoUnavailable, demoTasks, getDemo, startDemo } from "@/lib/demo";

function unavailable(e: unknown) {
  if (e instanceof DemoUnavailable) return json({ error: e.message }, 501);
  throw e;
}

export async function POST(req: Request) {
  const body = (await readJson(req)) ?? {};
  const taskId = body.task_id;
  if (taskId !== undefined && taskId !== null && typeof taskId !== "string") return badRequest("task_id must be a string");
  try {
    if (taskId && !demoTasks().some((t) => t.task_id === taskId)) return badRequest(`no demo scenario for task ${taskId}`);
    return json(startDemo(taskId ?? undefined), 202);
  } catch (e) {
    return unavailable(e);
  }
}

export async function GET(req: Request) {
  const id = new URL(req.url).searchParams.get("id");
  try {
    if (!id) return json({ tasks: demoTasks() });
    const demo = getDemo(id);
    return demo ? json(demo) : notFound(`demo ${id} not found`);
  } catch (e) {
    return unavailable(e);
  }
}
