import { badRequest, json, readJson, str } from "@/lib/http/respond";
import { testDoubleDisabled } from "@/lib/test-double/guard";
import { lookup } from "@/lib/test-double/store";

export async function POST(req: Request) {
  const off = testDoubleDisabled();
  if (off) return off;
  const body = await readJson(req);
  if (!body) return badRequest("body must be a JSON object");
  const domain = str(body.domain, 200);
  const task = str(body.task_description);
  const k = body.k === undefined ? 5 : body.k;
  if (!domain) return badRequest("domain is required");
  if (!task) return badRequest("task_description is required (≤ 2000 chars)");
  if (typeof k !== "number" || !Number.isInteger(k) || k < 1 || k > 20) return badRequest("k must be an integer 1–20");
  return json({ lessons: await lookup(domain, task, k) });
}
