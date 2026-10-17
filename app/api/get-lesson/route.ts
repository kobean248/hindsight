import { httpError } from "../../../lib/loop/errors";
import { getLesson } from "../../../lib/loop/operations";

export async function GET(request: Request): Promise<Response> {
  try {
    const lessonId = new URL(request.url).searchParams.get("lesson_id");
    return Response.json(await getLesson({ lesson_id: lessonId }));
  } catch (error) {
    return httpError(error);
  }
}
