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

export function resolveLiveTask(taskId: string, startUrl: string | undefined, env: Env = process.env): ResolvedTask {
  const task = liveDemoTasks(env).find((item) => item.task_id === taskId);
  if (!task) throw new Error(`no live task ${taskId}`);
  const resolvedUrl = resolveStartUrl(startUrl?.trim() || task.start_url, env);
  const config: Record<string, unknown> = {
    task_id: task.task_id,
    intent: task.instruction,
    start_url: resolvedUrl,
  };
  if (task.success_url_includes) config.ledger_check = { must_include: task.success_url_includes };
  return { taskId: task.task_id, intent: task.instruction, startUrl: resolvedUrl, config };
}
