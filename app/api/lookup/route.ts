import { httpError } from "../../../lib/loop/errors";
import { lookup } from "../../../lib/loop/operations";

export async function POST(request: Request): Promise<Response> {
  try {
    const body = await readJson(request);
    return Response.json(await lookup(body));
  } catch (error) {
    return httpError(error);
  }
}

async function readJson(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}
