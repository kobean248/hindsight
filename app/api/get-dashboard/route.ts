import { httpError } from "../../../lib/loop/errors";
import { getDashboard } from "../../../lib/loop/operations";

export async function GET(request: Request): Promise<Response> {
  try {
    const url = new URL(request.url);
    return Response.json(
      await getDashboard({
        domain: url.searchParams.get("domain") ?? undefined,
        run_status: url.searchParams.get("run_status") ?? undefined,
      })
    );
  } catch (error) {
    return httpError(error);
  }
}
