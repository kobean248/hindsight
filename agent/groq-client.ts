/**
 * Thin Groq wrapper plus the minimal client interface the loop depends on,
 * so tests inject a fake and never need a key or the network.
 */
import Groq from "groq-sdk";

import type { ToolSchema } from "./tools";

export interface LlmToolCall {
  id: string;
  type?: "function";
  function: { name: string; arguments: string };
}

export interface LlmMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string | null;
  tool_calls?: LlmToolCall[];
  tool_call_id?: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: LlmMessage[];
  tools: ToolSchema[];
  tool_choice: "auto";
  /** Always false; omitted on a retry if the provider rejects the parameter. */
  parallel_tool_calls?: false;
  temperature?: number;
}

export interface ChatCompletionResponse {
  choices: Array<{
    message: {
      role?: string;
      content?: string | null;
      tool_calls?: LlmToolCall[] | null;
    };
  }>;
}

/** The subset of `groq-sdk`'s client the loop uses (same call shape as the SDK). */
export interface GroqLike {
  chat: {
    completions: {
      create(body: ChatCompletionRequest, options?: { signal?: AbortSignal }): Promise<ChatCompletionResponse>;
    };
  };
}

export const DEFAULT_GROQ_MODEL = "openai/gpt-oss-120b";

export function resolveModel(env: NodeJS.ProcessEnv = process.env): string {
  return env.GROQ_MODEL?.trim() || DEFAULT_GROQ_MODEL;
}

/** Builds the real client. Throws a clear error if `GROQ_API_KEY` is missing. */
export function createGroqClient(env: NodeJS.ProcessEnv = process.env): GroqLike {
  const apiKey = env.GROQ_API_KEY?.trim();
  if (!apiKey) {
    throw new Error("GROQ_API_KEY is not set; the agent loop needs it to call Groq.");
  }
  // maxRetries: 0 because the loop owns retry/backoff and per-call timeouts.
  return new Groq({ apiKey, maxRetries: 0 }) as unknown as GroqLike;
}
