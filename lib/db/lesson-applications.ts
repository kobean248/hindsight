import { getStore } from "./store";
import type { LessonApplication, LessonScore, TerminalVerification } from "./types";

export async function insertLessonApplication(input: {
  lesson_id: string;
  run_id: string;
}): Promise<LessonApplication> {
  return getStore().insertLessonApplication(input);
}

export async function getLessonApplicationById(id: string): Promise<LessonApplication | null> {
  return getStore().getLessonApplicationById(id);
}

export async function listApplicationsForLesson(lessonId: string): Promise<LessonApplication[]> {
  return getStore().listApplicationsForLesson(lessonId);
}

export async function listApplicationsForRun(runId: string): Promise<LessonApplication[]> {
  return getStore().listApplicationsForRun(runId);
}

/**
 * Postgres path calls `record_lesson_outcome`, which no-ops when
 * `outcome_key` is already set. The memory path uses the same pending check.
 */
export async function recordLessonOutcome(
  applicationId: string,
  verifiedResult: TerminalVerification
): Promise<LessonScore> {
  return getStore().recordLessonOutcome(applicationId, verifiedResult);
}
