import { DEDUP_THRESHOLD } from "./constants";
import { cosineSimilarity } from "./ranking";

export interface DedupCandidate {
  id: string;
  domain: string;
  status: string;
  task_embedding: readonly number[] | null;
}

/** Active lesson in the same domain whose embedding cosine is >= 0.92, if any. */
export function findDuplicate<T extends DedupCandidate>(
  domain: string,
  embedding: readonly number[],
  lessons: readonly T[]
): T | null {
  let best: T | null = null;
  let bestSimilarity = DEDUP_THRESHOLD;
  for (const lesson of lessons) {
    if (lesson.domain !== domain || lesson.status !== "active" || lesson.task_embedding == null) {
      continue;
    }
    const similarity = cosineSimilarity(embedding, lesson.task_embedding);
    if (similarity >= bestSimilarity) {
      best = lesson;
      bestSimilarity = similarity;
    }
  }
  return best;
}
