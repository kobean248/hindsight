import { badRequest, json } from "@/lib/http/respond";
import type { LessonStatus } from "@/lib/ui/contracts";
import { testDoubleDisabled } from "@/lib/test-double/guard";
import { listLessons } from "@/lib/test-double/store";

const STATUSES: LessonStatus[] = ["active", "decayed", "retired"];

export async function GET(req: Request) {
  const off = testDoubleDisabled();
  if (off) return off;
  const p = new URL(req.url).searchParams;
  const status = p.get("status");
  if (status && !STATUSES.includes(status as LessonStatus)) return badRequest(`status must be one of ${STATUSES.join(", ")}`);
  return json(listLessons({ domain: p.get("domain") ?? undefined, status: (status as LessonStatus) || undefined }));
}
