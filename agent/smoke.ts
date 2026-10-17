/**
 * Live smoke run for the agent loop. Not part of the test suite.
 *
 *   npm run agent:smoke -- --cdp <ws/http url> --intent "<task>" \
 *     --start-url <url> [--lesson-file lesson.json] [--out trace.json]
 *
 * Needs GROQ_API_KEY in the environment (e.g. `node --env-file=.env`).
 * The lesson file is JSON: { "id", "lesson_text", "risk_warnings": [] }.
 */
import { readFileSync, writeFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { chromium } from "playwright-core";

import { MemoryRunStore } from "../lib/execution/memory-run-store.js";
import type { Lesson } from "../lib/execution/types.js";
import { runAgent } from "./loop.js";

function usage(): never {
  console.error(
    "Usage: agent:smoke --cdp <url> --intent <text> --start-url <url> [--lesson-file path] [--out trace.json]",
  );
  process.exit(2);
}

function pad(value: string, width: number): string {
  return value.length >= width ? value.slice(0, width - 1) + "…" : value.padEnd(width);
}

async function main(): Promise<void> {
  const { values } = parseArgs({
    options: {
      cdp: { type: "string" },
      intent: { type: "string" },
      "start-url": { type: "string" },
      "lesson-file": { type: "string" },
      out: { type: "string" },
    },
  });
  if (!values.cdp || !values.intent) usage();

  const lesson = values["lesson-file"]
    ? (JSON.parse(readFileSync(values["lesson-file"], "utf8")) as Lesson)
    : undefined;

  const browser = await chromium.connectOverCDP(values.cdp);
  try {
    const context = browser.contexts()[0] ?? (await browser.newContext());
    const page = context.pages()[0] ?? (await context.newPage());

    const store = new MemoryRunStore();
    const { runId } = await store.createRun({ taskId: "smoke", agentId: "smoke", lessonId: lesson?.id ?? null });

    const result = await runAgent({
      page,
      taskIntent: values.intent,
      startUrl: values["start-url"],
      lesson,
      runId,
      store,
    });

    console.log(`${pad("seq", 4)} ${pad("type", 10)} ${pad("selector", 32)} ${pad("value", 40)} ${pad("result", 6)} ms`);
    for (const e of result.trace) {
      console.log(
        `${pad(String(e.seq), 4)} ${pad(e.type, 10)} ${pad(e.selector ?? "-", 32)} ${pad(e.value ?? "-", 40)} ${pad(e.result, 6)} ${e.duration_ms}` +
          (e.error ? `  !! ${e.error}` : ""),
      );
    }
    console.log(`\nstopReason: ${result.stopReason}${result.stopDetail ? ` (${result.stopDetail})` : ""}`);
    console.log(`finishSummary: ${result.finishSummary ?? "(none)"}`);
    console.log("note: success is decided by the evaluator, not by this run.");

    if (values.out) {
      writeFileSync(values.out, JSON.stringify(result, null, 2));
      console.log(`wrote ${values.out}`);
    }
  } finally {
    await browser.close().catch(() => undefined);
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
