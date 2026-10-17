import {
  CONFIDENCE_WEIGHT,
  RELEVANCE_THRESHOLD,
  SIMILARITY_WEIGHT,
} from "./constants";

export function cosineSimilarity(left: readonly number[], right: readonly number[]): number {
  const length = Math.min(left.length, right.length);
  let dot = 0;
  let leftNorm = 0;
  let rightNorm = 0;
  for (let i = 0; i < length; i += 1) {
    const a = left[i] ?? 0;
    const b = right[i] ?? 0;
    dot += a * b;
    leftNorm += a * a;
    rightNorm += b * b;
  }
  if (leftNorm === 0 || rightNorm === 0) return 0;
  return dot / (Math.sqrt(leftNorm) * Math.sqrt(rightNorm));
}

export function rankScore(similarity: number, confidence: number): number {
  return SIMILARITY_WEIGHT * similarity + CONFIDENCE_WEIGHT * confidence;
}

export interface RankableLesson {
  domain: string;
  status: string;
  embedding_model: string | null;
  task_embedding: readonly number[] | null;
  confidence: number;
}

export interface Ranked<T> {
  lesson: T;
  similarity: number;
  confidence: number;
  rank_score: number;
}

/**
 * Active lessons in `domain`, embedded with `embeddingModel`, similarity >= 0.55,
 * ordered by 0.7 * similarity + 0.3 * confidence. Empty when nothing clears the floor.
 */
export function rankLessons<T extends RankableLesson>(
  lessons: readonly T[],
  domain: string,
  queryEmbedding: readonly number[],
  embeddingModel: string,
  k: number
): Ranked<T>[] {
  const ranked: Ranked<T>[] = [];
  for (const lesson of lessons) {
    if (lesson.domain !== domain || lesson.status !== "active") continue;
    if (lesson.embedding_model !== embeddingModel || lesson.task_embedding == null) continue;
    const similarity = cosineSimilarity(queryEmbedding, lesson.task_embedding);
    if (similarity < RELEVANCE_THRESHOLD) continue;
    ranked.push({
      lesson,
      similarity,
      confidence: lesson.confidence,
      rank_score: rankScore(similarity, lesson.confidence),
    });
  }
  ranked.sort((a, b) => b.rank_score - a.rank_score);
  return ranked.slice(0, k);
}
