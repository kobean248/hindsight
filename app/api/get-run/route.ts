import { httpError } from "../../../lib/loop/errors";
import { getRun } from "../../../lib/loop/operations";

export async function GET(request: Request): Promise<Response> {
  try {
    const runId = new URL(request.url).searchParams.get("run_id");
    return Response.json(await getRun({ run_id: runId }));
  } catch (error) {
    return httpError(error);
  }
}
