import { embed } from "../embeddings/minilm";
import { EMBEDDING_DIMENSIONS, EMBEDDING_MODEL } from "./constants";

export interface Embedding {
  embedding: number[];
  embedding_model: string;
}

export function activeEmbeddingModel(): string {
  return EMBEDDING_MODEL;
}

/** Embeds with all-MiniLM-L6-v2 in-process. No API key. */
export async function embedTaskText(text: string): Promise<Embedding> {
  const [embedding] = await embed([text]);
  if (!embedding || embedding.length !== EMBEDDING_DIMENSIONS) {
    throw new Error(
      `MiniLM embeddings returned ${embedding?.length ?? 0} dimensions, expected ${EMBEDDING_DIMENSIONS}`
    );
  }
  return { embedding, embedding_model: EMBEDDING_MODEL };
}
