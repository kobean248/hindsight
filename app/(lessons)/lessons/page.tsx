import { LessonsBrowser } from "@/components/lessons/lessons-browser";
import { PageHeader } from "@/components/ui";

export default function LessonsPage() {
  return (
    <>
      <PageHeader
        title="Lessons"
        subtitle="What earlier agents learned the hard way, keyed by site and task pattern. Confidence moves only on evaluator-verified applications."
      />
      <LessonsBrowser />
    </>
  );
}
