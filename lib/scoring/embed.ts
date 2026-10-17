import { EMBEDDING_DIMENSIONS, OPENAI_EMBEDDING_MODEL } from "./constants";

/** Dev-only stand-in used when OPENAI_API_KEY is absent. Never labeled as the OpenAI model. */
export const LOCAL_EMBEDDING_MODEL = "local-hash-1536";

export interface Embedding {
  embedding: number[];
  embedding_model: string;
}

export function activeEmbeddingModel(): string {
  return process.env.OPENAI_API_KEY ? OPENAI_EMBEDDING_MODEL : LOCAL_EMBEDDING_MODEL;
}

export async function embedTaskText(text: string): Promise<Embedding> {
  if (process.env.OPENAI_API_KEY) {
    return embedWithOpenAI(text);
  }
  return { embedding: localHashEmbedding(text), embedding_model: LOCAL_EMBEDDING_MODEL };
}

const LOCAL_STOPWORDS = new Set([
  "a",
  "an",
  "the",
  "to",
  "of",
  "for",
  "and",
  "before",
  "after",
  "with",
  "into",
]);

export function localHashEmbedding(text: string): number[] {
  const vector = new Array<number>(EMBEDDING_DIMENSIONS).fill(0);
  const tokens = text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length > 1 && !LOCAL_STOPWORDS.has(token));
  const features = [...tokens];
  for (let i = 0; i < tokens.length - 1; i += 1) {
    features.push(`${tokens[i]}_${tokens[i + 1]}`);
  }
  for (const feature of features) {
    const hash = fnv1a(feature);
    const index = hash % EMBEDDING_DIMENSIONS;
    const sign = (hash & 1) === 0 ? 1 : -1;
    vector[index] = (vector[index] ?? 0) + sign;
  }
  let norm = 0;
  for (const value of vector) norm += value * value;
  norm = Math.sqrt(norm);
  if (norm === 0) return vector;
  return vector.map((value) => value / norm);
}

async function embedWithOpenAI(text: string): Promise<Embedding> {
  const response = await fetch("https://api.openai.com/v1/embeddings", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: OPENAI_EMBEDDING_MODEL,
      input: text,
    }),
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(`OpenAI embeddings request failed (${response.status})`);
  }
  const body = (await response.json()) as {
    data?: Array<{ embedding?: number[] }>;
  };
  const embedding = body.data?.[0]?.embedding;
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `OpenAI embeddings returned ${embedding?.length ?? 0} dimensions, expected ${EMBEDDING_DIMENSIONS}`
    );
  }
  return { embedding, embedding_model: OPENAI_EMBEDDING_MODEL };
}

function fnv1a(text: string): number {
  let hash = 2166136261;
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
