import { httpError } from "../../../../lib/loop/errors";
import { getLessonPage } from "../../../../lib/loop/operations";

export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }): Promise<Response> {
  try {
    const { id } = await ctx.params;
    return Response.json(await getLessonPage(decodeURIComponent(id)));
  } catch (error) {
    return httpError(error);
  }
}
