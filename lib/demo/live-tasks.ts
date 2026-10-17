/**
 * Live demo tasks the Overview can start. Each one has its own start URL.
 * Task 509 is added only when WEBARENA_SHOPPING_URL points at a real site.
 */
import { loadWebArenaTaskFile, resolveStartUrl, type Env, type ResolvedTask } from "@/lib/execution/freestyle-task";

export interface LiveDemoTask {
  task_id: string;
  domain: string;
  instruction: string;
  start_url: string;
  /** Final page URL must contain this. Null means the in-VM WebArena evaluator grades the run. */
  success_url_includes: string | null;
}

const PUBLIC_TASKS: LiveDemoTask[] = [
  {
    task_id: "books_travel",
    domain: "books.toscrape.com",
    instruction: "From the bookstore home page, open the Travel category.",
    start_url: "http://books.toscrape.com/",
    success_url_includes: "travel_2",
  },
  {
    task_id: "wiki_ada",
    domain: "en.wikipedia.org",
    instruction: "From the Wikipedia main page, open the article about Ada Lovelace.",
    start_url: "https://en.wikipedia.org/wiki/Main_Page",
    success_url_includes: "Ada_Lovelace",
  },
  {
    task_id: "mdn_map",
    domain: "developer.mozilla.org",
    instruction: "From the MDN home page, open the documentation for Array.prototype.map.",
    start_url: "https://developer.mozilla.org/en-US/",
    success_url_includes: "/Array/map",
  },
];

export function liveDemoTasks(env: Env = process.env): LiveDemoTask[] {
  const shopping = env.WEBARENA_SHOPPING_URL?.trim();
  if (!shopping) return PUBLIC_TASKS;
  let startUrl = shopping;
  try {
    startUrl = resolveStartUrl(shopping, env);
  } catch {
    return PUBLIC_TASKS;
  }
  const taskFile = loadWebArenaTaskFile();
  return [
    ...PUBLIC_TASKS,
    {
      task_id: String(taskFile.task_id),
      domain: "webarena.shopping",
      instruction: taskFile.intent,
      start_url: startUrl,
      success_url_includes: null,
    },
  ];
}

export interface LiveTaskRequest {
  /** What the agent should do. Blank falls back to the catalog instruction. */
  instruction?: string;
  /**
   * Substring the final page URL must contain.
   * Undefined keeps the catalog rule. Blank grades by the start URL's site.
   */
  successUrlIncludes?: string | null;
}

const MAX_INSTRUCTION = 2000;

export function resolveLiveTask(
  taskId: string,
  startUrl: string | undefined,
  env: Env = process.env,
  request: LiveTaskRequest = {},
): ResolvedTask {
  const task = liveDemoTasks(env).find((item) => item.task_id === taskId);
  if (!task) throw new Error(`no live task ${taskId}`);
  if (request.instruction !== undefined && !request.instruction.trim()) throw new Error("task is required");
  const instruction = (request.instruction?.trim() || task.instruction).slice(0, MAX_INSTRUCTION);
  const resolvedUrl = resolveStartUrl(startUrl?.trim() || task.start_url, env);
  const urlChanged = resolvedUrl !== task.start_url;
  const config: Record<string, unknown> = {
    task_id: task.task_id,
    intent: instruction,
    start_url: resolvedUrl,
  };
  const needle = successNeedle(task, resolvedUrl, urlChanged, request.successUrlIncludes);
  if (needle) config.ledger_check = { must_include: needle };
  return { taskId: task.task_id, intent: instruction, startUrl: resolvedUrl, config };
}

/** Site the lesson is filed under: the host the agent actually opens. */
export function domainForStartUrl(startUrl: string, fallback: string): string {
  try {
    return new URL(startUrl).hostname || fallback;
  } catch {
    return fallback;
  }
}

function successNeedle(
  task: LiveDemoTask,
  startUrl: string,
  urlChanged: boolean,
  override: string | null | undefined,
): string | null {
  if (override === undefined) {
    if (urlChanged) return new URL(startUrl).hostname;
    return task.success_url_includes;
  }
  const typed = override?.trim() ?? "";
  return typed || new URL(startUrl).hostname;
}
