import { httpError } from "../../../lib/loop/errors";
import { contribute } from "../../../lib/loop/operations";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await request.json().catch(() => null);
    return Response.json(await contribute(body), { status: 201 });
  } catch (error) {
    return httpError(error);
  }
}
