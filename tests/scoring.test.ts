import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { countsFromStatuses, wilsonLowerBound } from "../lib/scoring/confidence";
import { findDuplicate } from "../lib/scoring/dedup";
import { localHashEmbedding } from "../lib/scoring/embed";
import { cosineSimilarity, rankLessons } from "../lib/scoring/ranking";
import type { VerificationStatus } from "../lib/db/types";

function vectorAt(cosine: number): number[] {
  const orthogonal = Math.sqrt(Math.max(0, 1 - cosine * cosine));
  const values = new Array<number>(1536).fill(0);
  values[0] = cosine;
  values[1] = orthogonal;
  return values;
}

const QUERY = vectorAt(1);

function lesson(id: string, cosine: number, confidence = 0) {
  return {
    id,
    domain: "webarena.shopping",
    status: "active",
    embedding_model: "text-embedding-3-small",
    task_embedding: vectorAt(cosine),
    confidence,
    task_pattern: id,
  };
}

describe("wilson confidence", () => {
  it("returns 0 when n is 0", () => {
    assert.equal(wilsonLowerBound(0, 0), 0);
    assert.equal(countsFromStatuses([]).n, 0);
  });

  it("gives a high but not certain bound when every verified application succeeded", () => {
    const statuses = Array.from({ length: 100 }, () => "verified_success" as const);
    const { s, n } = countsFromStatuses(statuses);
    const confidence = wilsonLowerBound(s, n);
    assert.ok(confidence > 0.9);
    assert.ok(confidence < 1);
  });

  it("ignores pending and unrelated_failure", () => {
    const before: VerificationStatus[] = ["verified_success", "verified_failure"];
    const after: VerificationStatus[] = [
      ...before,
      "pending",
      "unrelated_failure",
    ];
    assert.deepEqual(countsFromStatuses(before), countsFromStatuses(after));
    const { s, n } = countsFromStatuses(after);
    assert.equal(wilsonLowerBound(s, n), wilsonLowerBound(1, 2));
  });
});

describe("ranking", () => {
  it("drops similarity 0.74 and keeps 0.76", () => {
    const ranked = rankLessons(
      [lesson("low", 0.74, 1), lesson("high", 0.76, 0)],
      "webarena.shopping",
      QUERY,
      "text-embedding-3-small",
      5
    );
    assert.deepEqual(
      ranked.map((entry) => entry.lesson.id),
      ["high"]
    );
  });

  it("returns an empty list when nothing clears 0.75", () => {
    const ranked = rankLessons(
      [lesson("low", 0.74, 1)],
      "webarena.shopping",
      QUERY,
      "text-embedding-3-small",
      5
    );
    assert.deepEqual(ranked, []);
  });

  it("orders survivors by 0.7 * similarity + 0.3 * confidence", () => {
    const ranked = rankLessons(
      [lesson("similar", 0.8, 0), lesson("proven", 0.76, 1)],
      "webarena.shopping",
      QUERY,
      "text-embedding-3-small",
      5
    );
    assert.equal(ranked[0]?.lesson.id, "proven");
    assert.ok(Math.abs((ranked[0]?.rank_score ?? 0) - (0.7 * 0.76 + 0.3)) < 1e-9);
  });
});

describe("dedup", () => {
  it("returns the existing lesson at similarity 0.93 and inserts below that", () => {
    const lessons = [lesson("first", 0.93), lesson("other", 0.5)];
    const duplicate = findDuplicate("webarena.shopping", QUERY, lessons);
    assert.equal(duplicate?.id, "first");
    assert.equal(findDuplicate("webarena.shopping", QUERY, [lesson("far", 0.5)]), null);
  });
});

describe("local embedding", () => {
  it("matches a paraphrase and rejects an unrelated sentence", () => {
    const left = localHashEmbedding(
      "choose the medium size before adding the shirt to the cart"
    );
    const close = localHashEmbedding("choose medium size before adding shirt to cart");
    const far = localHashEmbedding("weather forecast for seattle tomorrow");
    assert.ok(cosineSimilarity(left, close) >= 0.75);
    assert.ok(cosineSimilarity(left, far) < 0.75);
  });
});
