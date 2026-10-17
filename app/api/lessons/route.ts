import { httpError } from "../../../lib/loop/errors";
import { listLessons } from "../../../lib/loop/operations";

export async function GET(request: Request): Promise<Response> {
  try {
    const params = new URL(request.url).searchParams;
    return Response.json(
      await listLessons({
        domain: params.get("domain") ?? undefined,
        status: params.get("status") ?? undefined,
      }),
    );
  } catch (error) {
    return httpError(error);
  }
}
