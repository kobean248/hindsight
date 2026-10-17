/**
 * The ledger's embedding model (PRD §05): all-MiniLM-L6-v2, 384 dimensions,
 * run in-process via transformers.js — no API key, no network after the
 * first model download. Used for both indexing task_pattern and embedding
 * lookup queries; vectors are L2-normalised, so cosine similarity = dot.
 *
 * Same model as the pilot (graveyard-experiment's sentence-transformers
 * all-MiniLM-L6-v2), so scores are comparable with its analysis.
 * Server-only: never import this from a client component.
 */
import type { FeatureExtractionPipeline } from "@huggingface/transformers";

export const EMBEDDING_MODEL = "all-MiniLM-L6-v2";
export const EMBEDDING_DIM = 384;
const HF_REPO = "Xenova/all-MiniLM-L6-v2";

const g = globalThis as unknown as { __ledgerEmbedder?: Promise<FeatureExtractionPipeline> };

function embedder(): Promise<FeatureExtractionPipeline> {
  g.__ledgerEmbedder ??= import("@huggingface/transformers").then(
    ({ pipeline }) => pipeline("feature-extraction", HF_REPO, { dtype: "fp32" }) as Promise<FeatureExtractionPipeline>,
  );
  // a failed load (e.g. no network on first download) must not poison later calls
  g.__ledgerEmbedder.catch(() => (g.__ledgerEmbedder = undefined));
  return g.__ledgerEmbedder;
}

export async function embed(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  const out = await (await embedder())(texts, { pooling: "mean", normalize: true });
  return out.tolist() as number[][];
}

export function cosine(a: number[], b: number[]): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * b[i];
  return s;
}
