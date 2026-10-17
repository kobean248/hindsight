import { getStore } from "./store";
import type { Lesson, LessonScore, NewLesson } from "./types";

export async function getLessonById(id: string): Promise<Lesson | null> {
  return getStore().getLessonById(id);
}

export async function insertLesson(input: NewLesson): Promise<Lesson> {
  return getStore().insertLesson(input);
}

export async function listActiveLessons(domain: string): Promise<Lesson[]> {
  return getStore().listActiveLessons(domain);
}

export async function getLessonsByIds(ids: readonly string[]): Promise<Lesson[]> {
  return getStore().getLessonsByIds(ids);
}

export async function updateLessonConfidence(id: string, score: LessonScore): Promise<Lesson> {
  return getStore().updateLessonConfidence(id, score);
}
