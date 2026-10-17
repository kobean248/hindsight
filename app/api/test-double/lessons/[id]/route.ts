import { json, notFound } from "@/lib/http/respond";
import { testDoubleDisabled } from "@/lib/test-double/guard";
import { NotFound, getLesson } from "@/lib/test-double/store";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  const off = testDoubleDisabled();
  if (off) return off;
  const { id } = await ctx.params;
  try {
    return json(getLesson(id));
  } catch (e) {
    if (e instanceof NotFound) return notFound(e.message);
    throw e;
  }
}
