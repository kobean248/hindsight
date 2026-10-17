import type { VerificationStatus } from "../db/types";
import { WILSON_Z } from "./constants";

/**
 * s = verified_success rows.
 * n = verified_success + verified_failure rows.
 * pending and unrelated_failure contribute to neither.
 */
export function countsFromStatuses(statuses: readonly VerificationStatus[]): {
  s: number;
  n: number;
} {
  let s = 0;
  let n = 0;
  for (const status of statuses) {
    if (status === "verified_success") {
      s += 1;
      n += 1;
    } else if (status === "verified_failure") {
      n += 1;
    }
  }
  return { s, n };
}

/** Wilson score interval lower bound at 95% (z = 1.96). n = 0 returns 0. */
export function wilsonLowerBound(s: number, n: number, z = WILSON_Z): number {
  if (n === 0) return 0;
  const p = s / n;
  const z2 = z * z;
  const centre = p + z2 / (2 * n);
  const margin = z * Math.sqrt((p * (1 - p)) / n + z2 / (4 * n * n));
  return (centre - margin) / (1 + z2 / n);
}

export function confidenceFromStatuses(statuses: readonly VerificationStatus[]): number {
  const { s, n } = countsFromStatuses(statuses);
  return wilsonLowerBound(s, n);
}
