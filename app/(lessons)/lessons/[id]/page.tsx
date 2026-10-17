import { LessonDetail } from "@/components/lessons/lesson-detail";

export default async function LessonPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <LessonDetail id={decodeURIComponent(id)} />;
}
