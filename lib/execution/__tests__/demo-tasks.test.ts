import { describe, expect, it } from "vitest";
import { resolveLiveTask, liveDemoTasks } from "../../demo/live-tasks";
import { evaluatorPlan } from "../freestyle-runtime";

describe("live demo tasks", () => {
  it("lists a different start URL for each public task", () => {
    const tasks = liveDemoTasks({});
    expect(tasks.map((task) => task.start_url)).toEqual([
      "http://books.toscrape.com/",
      "https://en.wikipedia.org/wiki/Main_Page",
      "https://developer.mozilla.org/en-US/",
    ]);
    expect(new Set(tasks.map((task) => task.start_url)).size).toBe(tasks.length);
  });

  it("adds the shopping task only when that site URL is set", () => {
    expect(liveDemoTasks({}).some((task) => task.task_id === "509")).toBe(false);
    const withSite = liveDemoTasks({ WEBARENA_SHOPPING_URL: "https://shop.example" });
    expect(withSite.find((task) => task.task_id === "509")?.start_url).toBe("https://shop.example");
  });

  it("uses the caller's start URL and grades public tasks by final URL", () => {
    const task = resolveLiveTask("wiki_ada", "https://en.wikipedia.org/wiki/Special:Search");
    expect(task.startUrl).toBe("https://en.wikipedia.org/wiki/Special:Search");
    expect(task.intent).toMatch(/Ada Lovelace/);
    const plan = evaluatorPlan(task, {});
    expect(plan.command).toBe("python3 /tmp/agent-ledger-grade.py");
    expect(plan.script).toContain("must_include");
  });

  it("rejects a start URL that is not http(s)", () => {
    expect(() => resolveLiveTask("wiki_ada", "file:///tmp/page")).toThrow(/http or https/);
  });

  it("uses a caller-written task for a start URL they typed", () => {
    const task = resolveLiveTask("books_travel", "https://nileshs-portfolio.vercel.app/", {}, {
      instruction: "Open the bookstore link on this portfolio.",
      successUrlIncludes: "/bookstore",
    });
    expect(task.intent).toBe("Open the bookstore link on this portfolio.");
    expect(task.startUrl).toBe("https://nileshs-portfolio.vercel.app/");
    expect(task.config).toMatchObject({ ledger_check: { must_include: "/bookstore" } });
  });

  it("grades a custom URL by its site when no pass text is given", () => {
    const task = resolveLiveTask("books_travel", "https://example.com/docs", {});
    expect(task.intent).toMatch(/Travel/);
    expect(task.config).toMatchObject({ ledger_check: { must_include: "example.com" } });
  });

  it("rejects a blank task", () => {
    expect(() => resolveLiveTask("wiki_ada", undefined, {}, { instruction: "  " })).toThrow(/task is required/);
  });
});
