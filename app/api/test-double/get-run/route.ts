import { badRequest, json, notFound } from "@/lib/http/respond";
import { testDoubleDisabled } from "@/lib/test-double/guard";
import { NotFound, getRun } from "@/lib/test-double/store";

export async function GET(req: Request) {
  const off = testDoubleDisabled();
  if (off) return off;
  const id = new URL(req.url).searchParams.get("run_id");
  if (!id) return badRequest("run_id is required");
  try {
    return json(getRun(id));
  } catch (e) {
    if (e instanceof NotFound) return notFound(e.message);
    throw e;
  }
}
