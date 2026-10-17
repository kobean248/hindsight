import { describe, expect, it } from "vitest";

import { describeAction, executeTool, parseToolArguments, toolSchemas, TOOL_NAMES } from "../tools";
import { makeFakePage } from "./helpers";

describe("tool schemas", () => {
  it("declares exactly the six tools in OpenAI function format", () => {
    expect(toolSchemas.map((t) => t.function.name)).toEqual([...TOOL_NAMES]);
    for (const t of toolSchemas) {
      expect(t.type).toBe("function");
      expect(t.function.parameters.type).toBe("object");
    }
    const byName = Object.fromEntries(toolSchemas.map((t) => [t.function.name, t.function.parameters.required]));
    expect(byName).toEqual({
      navigate: ["url"],
      click: ["selector"],
      fill: ["selector", "value"],
      select: ["selector", "value"],
      screenshot: [],
      finish: ["summary"],
    });
  });
});

describe("executeTool", () => {
  it("navigate goes to an http(s) URL and reports URL/title", async () => {
    const fake = makeFakePage();
    const res = await executeTool(fake.page, "navigate", { url: "http://localhost:7770/" });
    expect(res.ok).toBe(true);
    expect(fake.calls).toEqual(["goto http://localhost:7770/"]);
    expect(res.ok && res.output).toContain("URL: http://localhost:7770/");
  });

  it.each(["file:///etc/passwd", "javascript:alert(1)", "data:text/html,hi", "not a url", "ftp://x.test/"])(
    "navigate rejects %s without touching the page",
    async (url) => {
      const fake = makeFakePage();
      const res = await executeTool(fake.page, "navigate", { url });
      expect(res.ok).toBe(false);
      expect(fake.calls).toEqual([]);
    },
  );

  it("click, fill and select act on the first match with the action timeout", async () => {
    const fake = makeFakePage();
    expect((await executeTool(fake.page, "click", { selector: "#go" }, { actionTimeoutMs: 1234 })).ok).toBe(true);
    expect((await executeTool(fake.page, "fill", { selector: "#q", value: "shorts" })).ok).toBe(true);
    expect((await executeTool(fake.page, "select", { selector: "#size", value: "M" })).ok).toBe(true);
    expect(fake.calls).toEqual(["click #go timeout=1234", "fill #q shorts", "select #size M"]);
  });

  it("fill allows an empty value (to clear a field)", async () => {
    const fake = makeFakePage();
    expect((await executeTool(fake.page, "fill", { selector: "#q", value: "" })).ok).toBe(true);
  });

  it("rejects missing or non-string args", async () => {
    const fake = makeFakePage();
    const cases: Array<[string, Record<string, unknown>]> = [
      ["navigate", {}],
      ["navigate", { url: 5 }],
      ["click", {}],
      ["click", { selector: ["a"] }],
      ["click", { selector: "   " }],
      ["fill", { selector: "#q" }],
      ["fill", { selector: "#q", value: 3 }],
      ["select", { selector: "#s" }],
      ["select", { selector: "#s", value: null }],
      ["finish", {}],
      ["finish", { summary: 1 }],
    ];
    for (const [name, args] of cases) {
      const res = await executeTool(fake.page, name, args);
      expect(res.ok, `${name} ${JSON.stringify(args)}`).toBe(false);
    }
    expect(fake.calls).toEqual([]);
  });

  it("rejects unknown tools and non-object arguments", async () => {
    const fake = makeFakePage();
    const unknown = await executeTool(fake.page, "evaluate", { js: "1" });
    expect(unknown.ok).toBe(false);
    expect(!unknown.ok && unknown.error).toContain("unknown tool");
    expect((await executeTool(fake.page, "click", parseToolArguments("[1]"))).ok).toBe(false);
    expect((await executeTool(fake.page, "click", parseToolArguments("{oops"))).ok).toBe(false);
  });

  it("screenshot returns URL, title and a truncated aria snapshot as text", async () => {
    const fake = makeFakePage({ ariaSnapshot: async () => "- text: " + "x".repeat(20_000) });
    fake.setUrl("http://shop.test/p");
    const res = await executeTool(fake.page, "screenshot", {}, { snapshotMaxChars: 6000 });
    expect(res.ok).toBe(true);
    const out = res.ok ? res.output : "";
    expect(out).toContain("URL: http://shop.test/p");
    expect(out).toContain("Title:");
    expect(out).toContain("Accessibility snapshot:");
    expect(out).toContain("[snapshot truncated]");
    expect(out.length).toBeLessThan(6300);
    expect(fake.calls).toEqual(["aria body"]);
  });

  it("finish validates and succeeds without touching the page", async () => {
    const fake = makeFakePage();
    expect((await executeTool(fake.page, "finish", { summary: "done" })).ok).toBe(true);
    expect(fake.calls).toEqual([]);
  });

  it("returns an error result (never throws) when Playwright throws", async () => {
    const fake = makeFakePage({
      click: async () => {
        throw new Error("Timeout 10000ms exceeded.\nCall log:\n  - waiting for locator('#nope')");
      },
    });
    const res = await executeTool(fake.page, "click", { selector: "#nope" });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toBe("Timeout 10000ms exceeded.");
  });

  it("enforces a per-action timeout even if the page hangs", async () => {
    const fake = makeFakePage({ click: () => new Promise<void>(() => undefined) });
    const started = Date.now();
    const res = await executeTool(fake.page, "click", { selector: "#hang" }, { actionTimeoutMs: 20 });
    expect(res.ok).toBe(false);
    expect(!res.ok && res.error).toContain("timed out");
    expect(Date.now() - started).toBeLessThan(3000);
  });
});

describe("describeAction (trace field mapping)", () => {
  it("maps each tool onto selector/value", () => {
    expect(describeAction("navigate", { url: "http://a/" })).toEqual({ type: "navigate", selector: null, value: "http://a/" });
    expect(describeAction("click", { selector: "#x" })).toEqual({ type: "click", selector: "#x", value: null });
    expect(describeAction("fill", { selector: "#q", value: "v" })).toEqual({ type: "fill", selector: "#q", value: "v" });
    expect(describeAction("select", { selector: "#s", value: "M" })).toEqual({ type: "select", selector: "#s", value: "M" });
    expect(describeAction("screenshot", {})).toEqual({ type: "screenshot", selector: null, value: null });
    expect(describeAction("finish", { summary: "ok" })).toEqual({ type: "finish", selector: null, value: "ok" });
    expect(describeAction("bogus", {})).toEqual({ type: "error", selector: null, value: "bogus" });
    expect(describeAction("click", null)).toEqual({ type: "click", selector: null, value: null });
  });
});
