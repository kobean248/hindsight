/**
 * §06 rules, re-implemented for the test double. Lane A's lib/scoring is the
 * canonical implementation; tests/test-double.test.ts pins these to the PRD.
 */
import type { LessonApplication } from "@/lib/ui/contracts";

/** Calibrated for all-MiniLM-L6-v2 on the pilot tasks (scripts/calibrate-floor.ts). */
export const RELEVANCE_FLOOR = 0.55;
export const DEDUP_THRESHOLD = 0.92;
export const W_SIMILARITY = 0.7;
export const W_CONFIDENCE = 0.3;

export function wilsonLowerBound(s: number, n: number, z = 1.96): number {
  if (n === 0) return 0;
  const p = s / n;
  const z2 = z * z;
  return (p + z2 / (2 * n) - z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n))) / (1 + z2 / n);
}

/** s and n count only verified rows; pending and unrelated_failure move neither. */
export function countVerified(apps: Pick<LessonApplication, "verification_status">[]): { s: number; n: number } {
  let s = 0;
  let n = 0;
  for (const a of apps) {
    if (a.verification_status === "verified_success") {
      s++;
      n++;
    } else if (a.verification_status === "verified_failure") n++;
  }
  return { s, n };
}

export function rankScore(similarity: number, confidence: number): number {
  return W_SIMILARITY * similarity + W_CONFIDENCE * confidence;
}
