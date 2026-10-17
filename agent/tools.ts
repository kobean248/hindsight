/**
 * The six browser tools (PRD section 08): schemas in Groq/OpenAI tool-call
 * format plus executors that drive a Playwright `Page`.
 *
 * Executors never throw: every failure comes back as `{ ok: false, error }`
 * so the loop can record it in the trace and let the model recover.
 */
import type { Page } from "playwright-core";

import type { TraceEventType } from "../lib/execution/types";

export const TOOL_NAMES = ["navigate", "click", "fill", "select", "screenshot", "finish"] as const;
export type ToolName = (typeof TOOL_NAMES)[number];

export interface ToolSchema {
  type: "function";
  function: {
    name: ToolName;
    description: string;
    parameters: {
      type: "object";
      properties: Record<string, { type: "string"; description: string }>;
      required: string[];
      additionalProperties: false;
    };
  };
}

function schema(
  name: ToolName,
  description: string,
  properties: Record<string, string>,
  required: string[],
): ToolSchema {
  return {
    type: "function",
    function: {
      name,
      description,
      parameters: {
        type: "object",
        properties: Object.fromEntries(
          Object.entries(properties).map(([k, d]) => [k, { type: "string" as const, description: d }]),
        ),
        required,
        additionalProperties: false,
      },
    },
  };
}

export const toolSchemas: ToolSchema[] = [
  schema("navigate", "Load an http(s) URL in the browser.", { url: "Absolute http:// or https:// URL." }, ["url"]),
  schema(
    "click",
    "Click the first element matching a Playwright selector (CSS, text=..., role=...).",
    { selector: "Playwright selector of the element to click." },
    ["selector"],
  ),
  schema(
    "fill",
    "Type text into the first input matching a Playwright selector, replacing its content.",
    { selector: "Playwright selector of the input.", value: "Text to enter." },
    ["selector", "value"],
  ),
  schema(
    "select",
    "Choose an option in a native <select> element, by option value or visible label.",
    { selector: "Playwright selector of the <select>.", value: "Option value or label to choose." },
    ["selector", "value"],
  ),
  schema(
    "screenshot",
    "Observe the page: returns the current URL, title and the page's accessibility snapshot as text.",
    {},
    [],
  ),
  schema(
    "finish",
    "End the task. Call once you believe the task is done (or cannot be done) with a short factual summary.",
    { summary: "What you did and the final state you observed." },
    ["summary"],
  ),
];

export type ToolResult = { ok: true; output: string } | { ok: false; error: string };

export interface ToolOptions {
  /** Per-action timeout. Default 10 s. */
  actionTimeoutMs?: number;
  /** Timeout for `navigate`. Default 30 s. */
  navigationTimeoutMs?: number;
  /** Max chars of aria snapshot returned by `screenshot`. Default 6000. */
  snapshotMaxChars?: number;
}

export const DEFAULT_ACTION_TIMEOUT_MS = 10_000;
export const DEFAULT_NAVIGATION_TIMEOUT_MS = 30_000;
export const DEFAULT_SNAPSHOT_MAX_CHARS = 6_000;
const ERROR_MAX_CHARS = 400;
/** Outer guard so a hung Page can never block the loop past the Playwright timeout. */
const OUTER_TIMEOUT_GRACE_MS = 1_000;

export function truncate(text: string, max: number, note = "…[truncated]"): string {
  return text.length <= max ? text : text.slice(0, max) + note;
}

function errorMessage(err: unknown): string {
  const raw = err instanceof Error ? err.message : String(err);
  // Playwright errors carry a long multi-line call log; keep the head only.
  const firstBlock = raw.split(/\n\s*Call log:/)[0] ?? raw;
  return truncate(firstBlock.trim() || "unknown error", ERROR_MAX_CHARS);
}

async function withTimeout<T>(work: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} timed out after ${ms}ms`)), ms);
  });
  try {
    return await Promise.race([work, timeout]);
  } finally {
    clearTimeout(timer);
  }
}

// ---------------------------------------------------------------------------
// Argument handling

export type ParsedArgs = Record<string, unknown>;

/** Parses the model's raw `arguments` JSON string. Returns null when unusable. */
export function parseToolArguments(raw: string | null | undefined): ParsedArgs | null {
  const text = raw == null || raw.trim() === "" ? "{}" : raw;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as ParsedArgs;
    return null;
  } catch {
    return null;
  }
}

type Validated<T> = { ok: true; value: T } | { ok: false; error: string };

function requireString(args: ParsedArgs, key: string, allowEmpty = false): Validated<string> {
  const v = args[key];
  if (v === undefined || v === null) return { ok: false, error: `missing required argument "${key}"` };
  if (typeof v !== "string") return { ok: false, error: `argument "${key}" must be a string` };
  if (!allowEmpty && v.trim() === "") return { ok: false, error: `argument "${key}" must not be empty` };
  return { ok: true, value: v };
}

export function validateHttpUrl(url: string): Validated<string> {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { ok: false, error: `"${truncate(url, 100)}" is not a valid absolute URL` };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: `only http(s) URLs are allowed, got "${parsed.protocol}"` };
  }
  return { ok: true, value: parsed.toString() };
}

export function isToolName(name: string): name is ToolName {
  return (TOOL_NAMES as readonly string[]).includes(name);
}

/**
 * Maps a tool call onto the PRD trace fields (see `TraceEvent` in
 * lib/execution/types.ts):
 *   navigate   -> value = url
 *   click      -> selector
 *   fill       -> selector, value
 *   select     -> selector, value
 *   screenshot -> (none)
 *   finish     -> value = summary
 *   <unknown>  -> type "error", value = the attempted tool name
 * Non-string / missing args map to null. Values are recorded as given (before
 * URL normalisation) so the trace reflects what the model actually asked for.
 */
export function describeAction(
  name: string,
  args: ParsedArgs | null,
): { type: TraceEventType; selector: string | null; value: string | null } {
  const str = (k: string): string | null => (typeof args?.[k] === "string" ? (args[k] as string) : null);
  switch (name) {
    case "navigate":
      return { type: "navigate", selector: null, value: str("url") };
    case "click":
      return { type: "click", selector: str("selector"), value: null };
    case "fill":
    case "select":
      return { type: name, selector: str("selector"), value: str("value") };
    case "screenshot":
      return { type: "screenshot", selector: null, value: null };
    case "finish":
      return { type: "finish", selector: null, value: str("summary") };
    default:
      return { type: "error", selector: null, value: name };
  }
}

// ---------------------------------------------------------------------------
// Executors

async function pageHeader(page: Page): Promise<string> {
  let title = "";
  try {
    title = await page.title();
  } catch {
    /* page mid-navigation; URL alone is still useful */
  }
  return `URL: ${page.url()}\nTitle: ${title}`;
}

async function settle(page: Page, timeout: number): Promise<void> {
  try {
    await page.waitForLoadState("domcontentloaded", { timeout: Math.min(timeout, 3_000) });
  } catch {
    /* no navigation, or slow page: the next observation will show the state */
  }
}

/** Runs one tool call. Never throws. */
export async function executeTool(
  page: Page,
  name: string,
  args: ParsedArgs | null,
  options: ToolOptions = {},
): Promise<ToolResult> {
  const actionTimeout = options.actionTimeoutMs ?? DEFAULT_ACTION_TIMEOUT_MS;
  const navTimeout = options.navigationTimeoutMs ?? DEFAULT_NAVIGATION_TIMEOUT_MS;
  const snapshotMax = options.snapshotMaxChars ?? DEFAULT_SNAPSHOT_MAX_CHARS;

  if (!isToolName(name)) {
    return { ok: false, error: `unknown tool "${truncate(name, 60)}"; use one of: ${TOOL_NAMES.join(", ")}` };
  }
  if (args === null) {
    return { ok: false, error: "tool arguments must be a JSON object" };
  }

  const run = async <T>(ms: number, fn: () => Promise<T>): Promise<T> =>
    withTimeout(fn(), ms + OUTER_TIMEOUT_GRACE_MS, name);

  try {
    switch (name) {
      case "navigate": {
        const u = requireString(args, "url");
        if (!u.ok) return u;
        const url = validateHttpUrl(u.value);
        if (!url.ok) return url;
        return await run(navTimeout, async () => {
          await page.goto(url.value, { timeout: navTimeout, waitUntil: "domcontentloaded" });
          return { ok: true as const, output: `Navigated.\n${await pageHeader(page)}` };
        });
      }
      case "click": {
        const s = requireString(args, "selector");
        if (!s.ok) return s;
        return await run(actionTimeout, async () => {
          await page.locator(s.value).first().click({ timeout: actionTimeout });
          await settle(page, actionTimeout);
          return { ok: true as const, output: `Clicked.\n${await pageHeader(page)}` };
        });
      }
      case "fill": {
        const s = requireString(args, "selector");
        if (!s.ok) return s;
        const v = requireString(args, "value", true);
        if (!v.ok) return v;
        return await run(actionTimeout, async () => {
          await page.locator(s.value).first().fill(v.value, { timeout: actionTimeout });
          return { ok: true as const, output: "Filled." };
        });
      }
      case "select": {
        const s = requireString(args, "selector");
        if (!s.ok) return s;
        const v = requireString(args, "value");
        if (!v.ok) return v;
        return await run(actionTimeout, async () => {
          await page.locator(s.value).first().selectOption(v.value, { timeout: actionTimeout });
          return { ok: true as const, output: "Selected." };
        });
      }
      case "screenshot": {
        return await run(actionTimeout, async () => {
          const aria = await page.locator("body").ariaSnapshot({ timeout: actionTimeout });
          const header = await pageHeader(page);
          return {
            ok: true as const,
            output: `${header}\n\nAccessibility snapshot:\n${truncate(aria, snapshotMax, "\n…[snapshot truncated]")}`,
          };
        });
      }
      case "finish": {
        const s = requireString(args, "summary");
        if (!s.ok) return s;
        return { ok: true, output: "Finished." };
      }
    }
  } catch (err) {
    return { ok: false, error: errorMessage(err) };
  }
}
