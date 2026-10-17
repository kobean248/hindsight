import taskFile from "../../vm/task.json" with { type: "json" };
import type { EvaluatorResult } from "./types";

export interface Env {
  [key: string]: string | undefined;
}

/** WebArena `start_url` tokens and the env var that replaces each one. */
const START_URL_TOKENS: Record<string, string> = {
  __SHOPPING__: "WEBARENA_SHOPPING_URL",
  __SHOPPING_ADMIN__: "WEBARENA_SHOPPING_ADMIN_URL",
  __REDDIT__: "WEBARENA_REDDIT_URL",
  __GITLAB__: "WEBARENA_GITLAB_URL",
  __MAP__: "WEBARENA_MAP_URL",
  __WIKIPEDIA__: "WEBARENA_WIKIPEDIA_URL",
};

export interface WebArenaTaskFile {
  task_id: number | string;
  intent: string;
  start_url: string;
}

export interface ResolvedTask {
  taskId: string;
  intent: string;
  startUrl: string;
  /** Written into the VM for the evaluator subprocess. */
  config: unknown;
}

const REQUIRED_ENV = ["FREESTYLE_API_KEY", "WEBARENA_SNAPSHOT_SLUG", "GROQ_API_KEY"] as const;

export function assertFreestyleConfig(env: Env): void {
  for (const key of REQUIRED_ENV) {
    if (!env[key]?.trim()) throw new Error(`${key} is not set`);
  }
}

export function resolveTask(taskId: string, env: Env, file: WebArenaTaskFile = taskFile): ResolvedTask {
  if (String(file.task_id) === taskId) {
    return {
      taskId,
      intent: file.intent,
      startUrl: resolveStartUrl(file.start_url, env),
      config: file,
    };
  }
  const intent = env.WEBARENA_TASK_INTENT?.trim();
  const startUrl = env.WEBARENA_START_URL?.trim();
  if (!intent || !startUrl) {
    throw new Error(
      `No task config for ${taskId}. vm/task.json is task ${file.task_id}; set WEBARENA_TASK_INTENT and WEBARENA_START_URL for a different task.`,
    );
  }
  return { taskId, intent, startUrl: resolveStartUrl(startUrl, env), config: { task_id: taskId, intent, start_url: startUrl } };
}

export function resolveStartUrl(startUrl: string, env: Env): string {
  const token = START_URL_TOKENS[startUrl];
  const resolved = token ? env[token]?.trim() : startUrl;
  if (!resolved) throw new Error(`${token} is required to resolve ${startUrl}`);
  let parsed: URL;
  try {
    parsed = new URL(resolved);
  } catch {
    throw new Error(`start URL is not absolute: ${resolved}`);
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`start URL must be http or https: ${resolved}`);
  }
  return resolved;
}

/** Pull the §08 evaluator object out of a subprocess stdout blob. */
export function parseEvaluatorStdout(stdout: string): EvaluatorResult {
  const trimmed = stdout.trim();
  const start = trimmed.indexOf("{");
  const end = trimmed.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("evaluator stdout was not JSON");
  const body = JSON.parse(trimmed.slice(start, end + 1)) as unknown;
  if (!body || typeof body !== "object") throw new Error("evaluator JSON was not an object");
  const record = body as Record<string, unknown>;
  const evidence = record.evidence;
  if (!evidence || typeof evidence !== "object") throw new Error("evaluator JSON has no evidence object");
  const ev = evidence as Record<string, unknown>;
  const type = ev.type;
  if (typeof record.passed !== "boolean" || typeof record.score !== "number") {
    throw new Error("evaluator JSON is missing passed or score");
  }
  if (type !== "program_html" && type !== "string_match" && type !== "url_match") {
    throw new Error(`evaluator evidence type ${String(type)} is not a §08 type`);
  }
  if (typeof ev.detail !== "string") throw new Error("evaluator evidence.detail must be a string");
  return { passed: record.passed, score: record.score, evidence: { type, detail: ev.detail } };
}
