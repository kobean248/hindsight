import Link from "next/link";
import type { Lesson, RankedLesson } from "@/lib/ui/contracts";
import { RELEVANCE_FLOOR } from "@/lib/ui/config";
import { num } from "@/lib/ui/format";
import { Badge } from "@/components/ui";

export function ConfidenceLabel({ lesson }: { lesson: Lesson }) {
  return (
    <span className="tabular-nums" title="Wilson lower bound (95%) over verified applications">
      confidence {num(lesson.confidence)}{" "}
      <span className="text-muted">
        ({lesson.times_succeeded}/{lesson.times_applied} verified)
      </span>
    </span>
  );
}

export function LessonCard({ lesson }: { lesson: Lesson | RankedLesson }) {
  const ranked = "similarity" in lesson ? lesson : null;
  return (
    <li className="rounded-lg border border-border bg-surface p-4">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <Badge>{lesson.domain}</Badge>
        {lesson.status !== "active" && <Badge tone="warn">{lesson.status}</Badge>}
        {(lesson.handoff_points?.length ?? 0) > 0 && <Badge tone="warn">human handoff</Badge>}
        {lesson.risk_warnings.length > 0 && <Badge tone="bad">irreversible steps</Badge>}
        <span className="ml-auto text-muted">
          <ConfidenceLabel lesson={lesson} />
        </span>
      </div>
      <Link href={`/lessons/${encodeURIComponent(lesson.id)}`} className="mt-2 block font-medium hover:underline">
        {lesson.task_pattern}
      </Link>
      {lesson.applies_when && <p className="mt-1 text-xs text-muted">When: {lesson.applies_when}</p>}
      {lesson.lesson_text && <p className="mt-2 line-clamp-2 text-sm text-muted">{lesson.lesson_text}</p>}
      {ranked && (
        <p className="mt-2 font-mono text-xs text-muted">
          similarity {num(ranked.similarity)} (floor {RELEVANCE_FLOOR}) · rank score {num(ranked.rank_score)}
        </p>
      )}
    </li>
  );
}
