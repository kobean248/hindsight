/**
 * Site-agnostic browser agent loop (PRD section 08).
 *
 * Drives one task through Groq tool-use against a Playwright `Page`. It
 * records one `TraceEvent` per executed action and mirrors each as a `step`
 * run_event. It never decides success: `verified_success` comes only from
 * the evaluator. Expected failures come back as a `stopReason`, not a throw.
 * (Errors from `store.appendEvent` do propagate: a persistence failure is a
 * `db_error` for the adapter to handle, not something the loop can classify.)
 */
import type { Page } from "playwright-core";

import type { StopReason } from "../lib/execution/outcome";
import type { Lesson, RunStore, TraceEvent } from "../lib/execution/types";
import {
  createGroqClient,
  resolveModel,
  type ChatCompletionRequest,
  type GroqLike,
  type LlmMessage,
  type LlmToolCall,
} from "./groq-client";
import { buildInitialMessages, fenceObservation, NUDGE_MESSAGE } from "./prompt";
import {
  describeAction,
  executeTool,
  parseToolArguments,
  TOOL_NAMES,
  toolSchemas,
  truncate,
  type ToolOptions,
  type ToolResult,
} from "./tools";

export type { StopReason };

function sideChannelTool(name: "commentary" | "json") {
  return {
    type: "function" as const,
    function: {
      name,
      description: "Optional aside. This does not change the page. Follow it with a browser tool.",
      parameters: {
        type: "object" as const,
        properties: { summary: { type: "string" as const, description: "Short note." } },
        additionalProperties: true,
      },
    },
  };
}

const sideChannelTools = [sideChannelTool("commentary"), sideChannelTool("json")];
const sideChannelNames = new Set<string>(sideChannelTools.map((tool) => tool.function.name));

export interface RunAgentOptions {
  page: Page;
  taskIntent: string;
  startUrl?: string;
  lesson?: Lesson;
  runId: string;
  store: RunStore;
  /** Injectable Groq client (tests). Defaults to the real client built from GROQ_API_KEY. */
  groq?: GroqLike;
  /** Default: process.env.GROQ_MODEL ?? 'openai/gpt-oss-120b'. */
  model?: string;
  /** Hard cap on executed actions. Default 40. */
  maxSteps?: number;
  /** Wall-clock cap for the whole loop. Default 300000 (5 min). */
  runTimeoutMs?: number;
  /** Cap per LLM call. Default 60000. */
  llmTimeoutMs?: number;
  /** Clock for trace timestamps and durations. Default `() => new Date()`. */
  now?: () => Date;
  /** Per-action tool timeouts / snapshot size. */
  tools?: ToolOptions;
  /** Base backoff before the single 429/5xx retry (retry-after wins). Default 500. */
  retryBaseDelayMs?: number;
  /** Upper bound on any retry wait. Default 5000. */
  retryMaxDelayMs?: number;
  /** How many most-recent steps keep their full observation in context. Default 3. */
  fullObservationSteps?: number;
  /** How many most-recent steps stay in context at all. Default 14. */
  historySteps?: number;
}

export interface RunAgentResult {
  trace: TraceEvent[];
  /** The `finish` summary (or the agent's final plain-text reply); null otherwise. Never a success claim. */
  finishSummary: string | null;
  stopReason: StopReason;
  /** Human-readable detail for non-finish stops (provider message etc.); null for finish/step_budget. */
  stopDetail: string | null;
}

const DEFAULT_MAX_STEPS = 40;
const DEFAULT_RUN_TIMEOUT_MS = 300_000;
const DEFAULT_LLM_TIMEOUT_MS = 60_000;
const BRIEF_OBSERVATION_CHARS = 200;
const MAX_NO_TOOL_REPLIES = 2; // first reply is nudged, second ends the loop

interface Turn {
  assistant: LlmMessage;
  toolCallId: string;
  tool: string;
  status: "ok" | "error";
  observation: string;
}

type LlmOutcome =
  | { ok: true; content: string | null; toolCall: LlmToolCall | null }
  | { ok: false; stopReason: "run_timeout" | "llm_timeout" | "llm_error"; detail: string };

function statusOf(err: unknown): number | undefined {
  const s = (err as { status?: unknown })?.status;
  return typeof s === "number" ? s : undefined;
}

function retryAfterMs(err: unknown): number | null {
  const headers = (err as { headers?: unknown })?.headers as
    | { get?: (k: string) => string | null }
    | Record<string, string | undefined>
    | undefined;
  if (!headers) return null;
  const raw =
    typeof (headers as { get?: unknown }).get === "function"
      ? (headers as { get: (k: string) => string | null }).get("retry-after")
      : (headers as Record<string, string | undefined>)["retry-after"];
  if (raw == null) return null;
  const seconds = Number.parseFloat(raw);
  return Number.isFinite(seconds) && seconds >= 0 ? seconds * 1000 : null;
}

function isTimeoutError(err: unknown): boolean {
  // groq-sdk's APIConnectionTimeoutError never sets `.name` (it is "Error"), so check the class name too.
  const name = (err as { name?: string })?.name ?? "";
  const className = (err as { constructor?: { name?: string } })?.constructor?.name ?? "";
  return /Timeout/i.test(name) || /Timeout/i.test(className) || statusOf(err) === 408;
}

function errText(err: unknown): string {
  return truncate(err instanceof Error ? err.message : String(err), 400);
}

/**
 * gpt-oss sometimes names the tool `name=finish`. Groq rejects that before
 * the call is returned. If the name is one we already declared, run it.
 */
function recoverMisnamedTool(err: unknown): LlmToolCall | null {
  const text = err instanceof Error ? err.message : String(err);
  const named = text.match(/attempted to call tool '([^']+)'/);
  if (!named) return null;
  const rawName = named[1] ?? "";
  const name = rawName.startsWith("name=") ? rawName.slice("name=".length) : rawName;
  const known = new Set<string>([...TOOL_NAMES, ...sideChannelNames]);
  if (!known.has(name)) return null;
  let args = "{}";
  const encoded = text.match(/"failed_generation"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (encoded?.[1]) {
    try {
      const decoded = JSON.parse(`"${encoded[1]}"`) as unknown;
      const body = typeof decoded === "string" ? (JSON.parse(decoded) as { arguments?: unknown }) : (decoded as { arguments?: unknown });
      if (typeof body.arguments === "string") args = body.arguments;
      else if (body.arguments && typeof body.arguments === "object") args = JSON.stringify(body.arguments);
    } catch {
      args = "{}";
    }
  }
  if (name === "finish" && args === "{}") args = JSON.stringify({ summary: "finished" });
  return { id: `recovered-${name}`, type: "function", function: { name, arguments: args } };
}

/**
 * gpt-oss sometimes writes a sentence instead of a tool call. Groq then
 * returns output_parse_failed and puts that sentence in failed_generation.
 * Hand it back as ordinary text so the loop can nudge and continue.
 */
/**
 * gpt-oss sometimes puts a sentence in `arguments` instead of a JSON object.
 * Groq rejects that as tool_use_failed. Keep the sentence as a note.
 */
function recoverBrokenToolArguments(err: unknown): LlmOutcome | null {
  const text = err instanceof Error ? err.message : String(err);
  if (!/tool_use_failed|parse tool call arguments/i.test(text)) return null;
  const generation = failedGenerationText(text);
  if (!generation) return { ok: true, content: null, toolCall: null };
  const named = generation.match(/"name"\s*:\s*"([^"]+)"/);
  const rawName = named?.[1] ?? "";
  const name = rawName.startsWith("name=") ? rawName.slice("name=".length) : rawName;
  const known = new Set<string>([...TOOL_NAMES, ...sideChannelNames]);
  const prose = argumentProse(generation);
  if (!known.has(name) || sideChannelNames.has(name)) {
    return {
      ok: true,
      content: null,
      toolCall: {
        id: "recovered-commentary",
        type: "function",
        function: { name: "commentary", arguments: JSON.stringify({ summary: prose || "noted" }) },
      },
    };
  }
  if (name === "finish") {
    return {
      ok: true,
      content: null,
      toolCall: {
        id: "recovered-finish",
        type: "function",
        function: { name: "finish", arguments: JSON.stringify({ summary: prose || "finished" }) },
      },
    };
  }
  return {
    ok: true,
    content: null,
    toolCall: {
      id: "recovered-commentary",
      type: "function",
      function: { name: "commentary", arguments: JSON.stringify({ summary: prose || `${name} arguments were not valid JSON` }) },
    },
  };
}

function failedGenerationText(text: string): string | null {
  const encoded = text.match(/"failed_generation"\s*:\s*"((?:\\.|[^"\\])*)"/);
  if (!encoded?.[1]) return null;
  try {
    const decoded = JSON.parse(`"${encoded[1]}"`) as unknown;
    return typeof decoded === "string" ? decoded : null;
  } catch {
    return encoded[1];
  }
}

function argumentProse(generation: string): string {
  const argsMatch = generation.match(/"arguments"\s*:\s*([\s\S]*)$/);
  if (!argsMatch?.[1]) return generation.trim();
  let raw = argsMatch[1].trim();
  if (raw.endsWith("}")) raw = raw.slice(0, -1).trim();
  if ((raw.startsWith("{") && raw.endsWith("}")) || (raw.startsWith('"') && raw.endsWith('"'))) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (typeof parsed === "string") return parsed.trim();
      if (parsed && typeof parsed === "object") return JSON.stringify(parsed);
    } catch {
      /* the arguments were the prose Groq could not parse */
    }
  }
  return raw.replace(/"\s*$/, "").trim();
}

function recoverUnparsedOutput(err: unknown): LlmOutcome | null {
  const text = err instanceof Error ? err.message : String(err);
  if (!/output_parse_failed|could not be parsed/i.test(text)) return null;
  const encoded = text.match(/"failed_generation"\s*:\s*"((?:\\.|[^"\\])*)"/);
  let content: string | null = null;
  if (encoded?.[1]) {
    try {
      const decoded = JSON.parse(`"${encoded[1]}"`) as unknown;
      content = typeof decoded === "string" ? decoded.trim() : null;
    } catch {
      content = encoded[1].trim();
    }
  }
  return { ok: true, content: content || null, toolCall: null };
}

/** Resolves after `ms`, or early (returning false) if `signal` aborts. */
function sleep(ms: number, signal: AbortSignal): Promise<boolean> {
  return new Promise((resolve) => {
    if (signal.aborted) return resolve(false);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

export async function runAgent(opts: RunAgentOptions): Promise<RunAgentResult> {
  const { page, taskIntent, startUrl, lesson, runId, store } = opts;
  const maxSteps = opts.maxSteps ?? DEFAULT_MAX_STEPS;
  const runTimeoutMs = opts.runTimeoutMs ?? DEFAULT_RUN_TIMEOUT_MS;
  const llmTimeoutMs = opts.llmTimeoutMs ?? DEFAULT_LLM_TIMEOUT_MS;
  const retryBase = opts.retryBaseDelayMs ?? 500;
  const retryMax = opts.retryMaxDelayMs ?? 5_000;
  const fullObs = opts.fullObservationSteps ?? 3;
  const historySteps = Math.max(opts.historySteps ?? 14, fullObs);
  const now = opts.now ?? (() => new Date());
  const model = opts.model ?? resolveModel();

  const trace: TraceEvent[] = [];
  const result = (
    stopReason: StopReason,
    finishSummary: string | null = null,
    stopDetail: string | null = null,
  ): RunAgentResult => ({ trace, finishSummary, stopReason, stopDetail });

  let groq: GroqLike;
  try {
    groq = opts.groq ?? createGroqClient();
  } catch (err) {
    return result("llm_error", null, errText(err));
  }

  const runCtl = new AbortController();
  const runTimer = setTimeout(() => runCtl.abort(), runTimeoutMs);
  const runSignal = runCtl.signal;

  const head = buildInitialMessages({ taskIntent, startUrl, lesson, maxSteps });
  const turns: Turn[] = [];
  /** Nudge messages sit between turns; track them by the turn index they precede. */
  const nudgesBefore = new Map<number, string>();
  let sendParallelFlag = true;

  const buildMessages = (): LlmMessage[] => {
    const messages: LlmMessage[] = head.map((m) => ({ role: m.role, content: m.content }));
    const start = Math.max(0, turns.length - historySteps);
    if (start > 0) {
      messages.push({
        role: "user",
        content: `(${start} earlier step(s) omitted from this conversation to save space; the browser state is unchanged.)`,
      });
    }
    for (let i = start; i <= turns.length; i++) {
      const nudge = nudgesBefore.get(i);
      if (nudge) messages.push({ role: "user", content: nudge });
      const t = turns[i];
      if (!t) continue;
      const full = i >= turns.length - fullObs;
      const body = full ? t.observation : truncate(t.observation, BRIEF_OBSERVATION_CHARS);
      messages.push(t.assistant, {
        role: "tool",
        tool_call_id: t.toolCallId,
        content: fenceObservation(t.tool, t.status, body),
      });
    }
    return messages;
  };

  const callOnce = async (messages: LlmMessage[]): Promise<LlmOutcome> => {
    const ctl = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      ctl.abort();
    }, llmTimeoutMs);
    const onRunAbort = () => ctl.abort();
    runSignal.addEventListener("abort", onRunAbort, { once: true });
    if (runSignal.aborted) ctl.abort();
    // Race the call against our own abort so a client that ignores the signal cannot hang the run.
    let onCtlAbort: (() => void) | undefined;
    const abortedPromise = new Promise<never>((_, reject) => {
      const fail = () => reject(new Error("LLM call aborted"));
      if (ctl.signal.aborted) return fail();
      onCtlAbort = fail;
      ctl.signal.addEventListener("abort", fail, { once: true });
    });
    try {
      const body: ChatCompletionRequest = {
        model,
        messages,
        // gpt-oss emits commentary and json calls. Groq rejects a name that was not declared.
        tools: [...toolSchemas, ...sideChannelTools],
        tool_choice: "auto",
        temperature: 0,
        ...(sendParallelFlag ? { parallel_tool_calls: false as const } : {}),
      };
      const response = await Promise.race([
        groq.chat.completions.create(body, { signal: ctl.signal }),
        abortedPromise,
      ]);
      const message = response.choices?.[0]?.message;
      return { ok: true, content: message?.content ?? null, toolCall: message?.tool_calls?.[0] ?? null };
    } catch (err) {
      if (runSignal.aborted) return { ok: false, stopReason: "run_timeout", detail: "run timeout reached during LLM call" };
      if (timedOut || isTimeoutError(err)) {
        return { ok: false, stopReason: "llm_timeout", detail: `LLM call timed out after ${llmTimeoutMs}ms` };
      }
      throw err;
    } finally {
      clearTimeout(timer);
      runSignal.removeEventListener("abort", onRunAbort);
      if (onCtlAbort) ctl.signal.removeEventListener("abort", onCtlAbort);
    }
  };

  /** One call with at most one retry on 429/5xx (and one parameter fallback). */
  const callLlm = async (messages: LlmMessage[]): Promise<LlmOutcome> => {
    let retried = false;
    for (;;) {
      try {
        return await callOnce(messages);
      } catch (err) {
        const status = statusOf(err);
        if (status === 400 && sendParallelFlag && /parallel_tool_calls/i.test(errText(err))) {
          sendParallelFlag = false; // provider doesn't support it: handle only the first call instead
          continue;
        }
        const recovered = status === 400 ? recoverMisnamedTool(err) : null;
        if (recovered) return { ok: true, content: null, toolCall: recovered };
        const broken = status === 400 ? recoverBrokenToolArguments(err) : null;
        if (broken) return broken;
        const prose = status === 400 ? recoverUnparsedOutput(err) : null;
        if (prose) return prose;
        const retryable = status === 429 || (status !== undefined && status >= 500);
        if (retryable && !retried) {
          retried = true;
          const wait = Math.min(retryAfterMs(err) ?? retryBase, retryMax);
          if (!(await sleep(wait, runSignal))) {
            return { ok: false, stopReason: "run_timeout", detail: "run timeout reached while waiting to retry LLM call" };
          }
          continue;
        }
        return { ok: false, stopReason: "llm_error", detail: `${status ? `HTTP ${status}: ` : ""}${errText(err)}` };
      }
    }
  };

  try {
    let noToolReplies = 0;

    for (;;) {
      if (runSignal.aborted) return result("run_timeout", null, `run exceeded ${runTimeoutMs}ms`);
      if (trace.length >= maxSteps) return result("step_budget", null, `reached ${maxSteps} actions without finish`);

      const llm = await callLlm(buildMessages());
      if (!llm.ok) return result(llm.stopReason, null, llm.detail);

      const call = llm.toolCall;
      if (!call) {
        noToolReplies += 1;
        const text = llm.content?.trim() ? truncate(llm.content.trim(), 2_000) : null;
        if (noToolReplies >= MAX_NO_TOOL_REPLIES) return result("finish", text);
        nudgesBefore.set(turns.length, NUDGE_MESSAGE);
        continue;
      }
      noToolReplies = 0;

      const toolName = call.function?.name ?? "";
      if (sideChannelNames.has(toolName)) {
        turns.push({
          assistant: { role: "assistant", content: llm.content ?? null, tool_calls: [call] },
          toolCallId: call.id,
          tool: toolName,
          status: "ok",
          observation: "Noted. Continue with a browser tool.",
        });
        continue;
      }
      const args = parseToolArguments(call.function?.arguments);
      const action = describeAction(toolName, args);

      const startedAt = now();
      let outcome: ToolResult | "aborted";
      outcome = await Promise.race([
        executeTool(page, toolName, args, opts.tools),
        new Promise<"aborted">((resolve) => {
          if (runSignal.aborted) resolve("aborted");
          else runSignal.addEventListener("abort", () => resolve("aborted"), { once: true });
        }),
      ]);
      const finishedAt = now();
      const toolResult: ToolResult =
        outcome === "aborted" ? { ok: false, error: "aborted: run timeout reached during action" } : outcome;

      const event: TraceEvent = {
        seq: trace.length + 1,
        ts: startedAt.toISOString(),
        type: action.type,
        selector: action.selector,
        value: action.value,
        result: toolResult.ok ? "ok" : "error",
        error: toolResult.ok ? null : toolResult.error,
        screenshot_ref: null,
        duration_ms: Math.max(0, finishedAt.getTime() - startedAt.getTime()),
      };
      trace.push(event);
      await store.appendEvent(runId, "step", event);

      if (outcome === "aborted") return result("run_timeout", null, `run exceeded ${runTimeoutMs}ms`);
      if (action.type === "finish" && toolResult.ok) return result("finish", action.value);

      // Only the first tool call is executed; the assistant message is trimmed to match.
      turns.push({
        assistant: { role: "assistant", content: llm.content ?? null, tool_calls: [call] },
        toolCallId: call.id,
        tool: toolName,
        status: toolResult.ok ? "ok" : "error",
        observation: toolResult.ok ? toolResult.output : `ERROR: ${toolResult.error}`,
      });
    }
  } finally {
    clearTimeout(runTimer);
  }
}
