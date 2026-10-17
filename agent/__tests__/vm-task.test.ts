/**
 * Validates vm/task.json structurally. Deliberately generic about WHICH
 * WebArena task it is (the demo task is not confirmed yet).
 */
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { validateHttpUrl } from "../tools";

const TASK_PATH = fileURLToPath(new URL("../../vm/task.json", import.meta.url));

type Json = Record<string, unknown>;
const isObject = (v: unknown): v is Json => typeof v === "object" && v !== null && !Array.isArray(v);

function loadTask(): Json {
  const parsed: unknown = JSON.parse(readFileSync(TASK_PATH, "utf8"));
  if (!isObject(parsed)) throw new Error("vm/task.json must be a JSON object");
  return parsed;
}

describe("vm/task.json", () => {
  it("parses as a JSON object", () => {
    expect(() => loadTask()).not.toThrow();
  });

  it("has a task_id and a non-empty intent", () => {
    const task = loadTask();
    expect(["number", "string"]).toContain(typeof task.task_id);
    expect(String(task.task_id)).not.toBe("");
    expect(typeof task.intent).toBe("string");
    expect((task.intent as string).trim().length).toBeGreaterThan(0);
  });

  it("start_url is a __SITE__ placeholder that can be substituted with a real http(s) URL", () => {
    const task = loadTask();
    expect(typeof task.start_url).toBe("string");
    const startUrl = task.start_url as string;
    expect(startUrl).toMatch(/^__[A-Z_]+__(\/.*)?$/);

    const placeholder = startUrl.match(/__[A-Z_]+__/)![0];
    const substituted = startUrl.replace(placeholder, "http://localhost:7770");
    expect(substituted).not.toContain("__");
    const checked = validateHttpUrl(substituted);
    expect(checked.ok).toBe(true);
    expect(new URL(substituted).protocol).toBe("http:");

    // The shopping site is the one the PRD demo targets, so the generic check also pins its placeholder.
    if (Array.isArray(task.sites) && task.sites.includes("shopping")) {
      expect(placeholder).toBe("__SHOPPING__");
    }
  });

  it("eval.eval_types includes program_html, and each program_html reference has url/locator/required_contents", () => {
    const task = loadTask();
    expect(isObject(task.eval)).toBe(true);
    const evaluation = task.eval as Json;

    expect(Array.isArray(evaluation.eval_types)).toBe(true);
    expect(evaluation.eval_types as unknown[]).toContain("program_html");

    const refs = evaluation.program_html;
    expect(Array.isArray(refs)).toBe(true);
    expect((refs as unknown[]).length).toBeGreaterThan(0);
    for (const ref of refs as unknown[]) {
      expect(isObject(ref)).toBe(true);
      const r = ref as Json;
      expect(typeof r.url).toBe("string");
      expect((r.url as string).length).toBeGreaterThan(0);
      expect(typeof r.locator).toBe("string");
      expect(isObject(r.required_contents)).toBe(true);
      const required = r.required_contents as Json;
      expect(Object.keys(required).length).toBeGreaterThan(0);
      // WebArena shapes: must_include (string[]) or exact_match / must_exclude.
      for (const value of Object.values(required)) {
        expect(["string", "object"]).toContain(typeof value);
      }
    }
  });
});
