import type { Page } from "playwright-core";

import type {
  ChatCompletionRequest,
  ChatCompletionResponse,
  GroqLike,
  LlmToolCall,
} from "../groq-client";

export interface FakePageHooks {
  click?: (selector: string) => Promise<void>;
  goto?: (url: string) => Promise<void>;
  ariaSnapshot?: () => Promise<string>;
}

export interface FakePage {
  page: Page;
  calls: string[];
  setUrl(url: string): void;
}

export function makeFakePage(hooks: FakePageHooks = {}): FakePage {
  const calls: string[] = [];
  let url = "about:blank";
  let title = "Blank";

  const locator = (selector: string) => {
    const loc = {
      first: () => loc,
      click: async (o?: { timeout?: number }) => {
        calls.push(`click ${selector} timeout=${o?.timeout}`);
        await hooks.click?.(selector);
      },
      fill: async (value: string) => {
        calls.push(`fill ${selector} ${value}`);
      },
      selectOption: async (value: string) => {
        calls.push(`select ${selector} ${value}`);
      },
      ariaSnapshot: async () => {
        calls.push(`aria ${selector}`);
        return hooks.ariaSnapshot ? hooks.ariaSnapshot() : '- heading "Hello" [level=1]';
      },
    };
    return loc;
  };

  const page = {
    url: () => url,
    title: async () => title,
    goto: async (target: string) => {
      calls.push(`goto ${target}`);
      await hooks.goto?.(target);
      url = target;
      title = `Title of ${target}`;
    },
    waitForLoadState: async () => undefined,
    locator,
  };

  return { page: page as unknown as Page, calls, setUrl: (u) => void (url = u) };
}

export function toolCall(name: string, args: unknown, id = `call_${name}`): LlmToolCall {
  return {
    id,
    type: "function",
    function: { name, arguments: typeof args === "string" ? args : JSON.stringify(args) },
  };
}

export function reply(toolCalls: LlmToolCall[] | null, content: string | null = null): ChatCompletionResponse {
  return { choices: [{ message: { role: "assistant", content, tool_calls: toolCalls } }] };
}

export type ScriptStep =
  | ChatCompletionResponse
  | Error
  | ((req: ChatCompletionRequest, signal: AbortSignal | undefined) => Promise<ChatCompletionResponse>);

export interface ScriptedGroq extends GroqLike {
  requests: ChatCompletionRequest[];
}

/** Returns/throws each step in order; repeats the last step if the script runs out. */
export function scriptedGroq(steps: ScriptStep[]): ScriptedGroq {
  const requests: ChatCompletionRequest[] = [];
  let i = 0;
  return {
    requests,
    chat: {
      completions: {
        async create(body, options) {
          requests.push(structuredClone(body));
          const step = steps[Math.min(i++, steps.length - 1)]!;
          if (step instanceof Error) throw step;
          if (typeof step === "function") return step(body, options?.signal);
          return step;
        },
      },
    },
  };
}

export function httpError(status: number, headers: Record<string, string> = {}): Error {
  const err = new Error(`HTTP ${status} from provider`) as Error & { status: number; headers: Headers };
  err.status = status;
  err.headers = new Headers(headers);
  return err;
}

/** Never resolves until aborted, then rejects like an SDK abort. */
export function hangUntilAborted(): ScriptStep {
  return (_req, signal) =>
    new Promise((_, reject) => {
      signal?.addEventListener("abort", () => reject(new Error("Request was aborted.")), { once: true });
    });
}
