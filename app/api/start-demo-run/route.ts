/**
 * startDemoRun (§07/§09): POST starts Round 1 → 2 → 3 and returns the demo's
 * state; GET ?id= returns its current round for the 2-second poll.
 */
import { badRequest, json, notFound, readJson } from "@/lib/http/respond";
import { DemoUnavailable, demoTasks, getDemo, startDemo } from "@/lib/demo";

function unavailable(e: unknown) {
  if (e instanceof DemoUnavailable) return json({ error: e.message }, 501);
  const message = e instanceof Error ? e.message : "demo failed";
  return json({ error: message }, 400);
}

export async function POST(req: Request) {
  const body = (await readJson(req)) ?? {};
  const taskId = body.task_id;
  const startUrl = body.start_url;
  const instruction = body.instruction;
  const success = body.success_url_includes;
  if (taskId !== undefined && taskId !== null && typeof taskId !== "string") return badRequest("task_id must be a string");
  if (startUrl !== undefined && startUrl !== null && typeof startUrl !== "string") return badRequest("start_url must be a string");
  if (instruction !== undefined && instruction !== null && typeof instruction !== "string") return badRequest("instruction must be a string");
  if (typeof instruction === "string" && instruction.trim().length > 2000) return badRequest("instruction must be 2000 characters or fewer");
  if (success !== undefined && success !== null && typeof success !== "string") return badRequest("success_url_includes must be a string");
  try {
    if (taskId && !demoTasks().some((t) => t.task_id === taskId)) return badRequest(`no demo scenario for task ${taskId}`);
    return json(
      await startDemo(taskId ?? undefined, typeof startUrl === "string" ? startUrl.trim() || undefined : undefined, {
        instruction: typeof instruction === "string" ? instruction : undefined,
        successUrlIncludes: success === undefined ? undefined : typeof success === "string" ? success : null,
      }),
      202,
    );
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
