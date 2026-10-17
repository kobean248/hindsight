import { Freestyle } from "freestyle";
import { chromium, type Browser, type Page } from "playwright-core";
import type { Env, ResolvedTask } from "./freestyle-task";

/** Guest DevTools proxy. The snapshot must already serve /json/version here. */
export const DEFAULT_CDP_PORT = 9333;
/** PRD §08: destroy the VM after 10 minutes even if the run hangs. */
export const VM_TTL_SECONDS = 600;
const EVALUATOR_TIMEOUT_MS = 60_000;
const DEFAULT_EVALUATOR_COMMAND = "python3 /opt/webarena/evaluate.py /tmp/agent-ledger-task.json";
const LEDGER_GRADE_PATH = "/tmp/agent-ledger-grade.py";

/** Grades a live demo by reading the open page URL from Chrome's CDP list. */
const LEDGER_GRADE_PY = `import json, urllib.request
try:
    task = json.load(open("/tmp/agent-ledger-task.json"))
    needle = ((task.get("ledger_check") or {}).get("must_include") or "")
    with urllib.request.urlopen("http://127.0.0.1:9222/json/list", timeout=5) as res:
        pages = json.load(res)
    urls = [p.get("url") or "" for p in pages if isinstance(p, dict)]
    matched = next((u for u in urls if needle and needle in u), "")
    passed = bool(matched)
    detail = matched or ("; ".join(urls) or "no open page")
except Exception as exc:
    passed = False
    detail = str(exc)
print(json.dumps({"passed": passed, "score": 1 if passed else 0, "evidence": {"type": "url_match", "detail": detail[:500]}}))
`;

export function evaluatorPlan(task: ResolvedTask, env: Env): { command: string; scriptPath?: string; script?: string } {
  const config = task.config;
  const check = config && typeof config === "object" ? (config as { ledger_check?: { must_include?: unknown } }).ledger_check : undefined;
  if (check && typeof check.must_include === "string" && check.must_include.trim()) {
    return { command: `python3 ${LEDGER_GRADE_PATH}`, scriptPath: LEDGER_GRADE_PATH, script: LEDGER_GRADE_PY };
  }
  return { command: env.WEBARENA_EVALUATOR_COMMAND?.trim() || DEFAULT_EVALUATOR_COMMAND };
}

export interface GuestExecResult {
  stdout: string;
  stderr: string;
  statusCode: number | null;
}

export interface ProvisionedBrowser {
  vmId: string;
  page: Page;
  evaluate(task: ResolvedTask): Promise<GuestExecResult>;
  destroy(): Promise<void>;
}

export interface ProvisionInput {
  runId: string;
  attempt: number;
  env: Env;
}

/**
 * Boot one VM from `WEBARENA_SNAPSHOT_SLUG`, publish its CDP proxy, and
 * connect Playwright. The snapshot must already contain Chromium (CDP on
 * `WEBARENA_CDP_PORT`, default 9333) and the WebArena evaluator.
 * Caller destroys the VM, including after a failed connect.
 */
export async function provisionFreestyleBrowser(input: ProvisionInput): Promise<ProvisionedBrowser> {
  const apiKey = input.env.FREESTYLE_API_KEY?.trim();
  const snapshotId = input.env.WEBARENA_SNAPSHOT_SLUG?.trim();
  if (!apiKey) throw new Error("FREESTYLE_API_KEY is not set");
  if (!snapshotId) throw new Error("WEBARENA_SNAPSHOT_SLUG is not set");

  const port = cdpPort(input.env.WEBARENA_CDP_PORT);
  const slug = vmSlug(input.runId, input.attempt);
  const cdpDomain = `${slug}.style.dev`;
  const freestyle = new Freestyle({ apiKey });
  const { vm, vmId } = await freestyle.vms.create({
    snapshotId,
    slug,
    displayName: `agent-ledger ${input.runId.slice(0, 8)}`,
    ttlSeconds: VM_TTL_SECONDS,
    maxRunSeconds: VM_TTL_SECONDS,
    automaticRestart: false,
    firewall: {
      rules: [{ action: "allow", source: {}, destination: { public: true } }],
    },
    tls: {
      rules: [
        {
          action: "allow",
          domain: cdpDomain,
          source: { public: true },
          destination: { port },
        },
      ],
    },
    metadata: { run_id: input.runId.slice(0, 63) },
  });

  let browser: Browser | null = null;
  const destroy = async () => {
    await browser?.close().catch(() => undefined);
    browser = null;
    await vm.delete().catch(() => undefined);
  };

  try {
    const ready = await vm.exec({
      command: `for i in $(seq 1 30); do curl -fsS http://127.0.0.1:${port}/json/version && exit 0; sleep 1; done; exit 1`,
      timeoutMs: 45_000,
    });
    if (ready.statusCode !== 0) {
      throw new Error(`CDP proxy on port ${port} did not come up: ${ready.stderr ?? ready.stdout ?? ""}`);
    }
    const connected = await connectOverPublicCdp(cdpDomain);
    browser = connected.browser;
    const page = connected.page;
    return {
      vmId,
      page,
      evaluate: (task) => evaluateInVm(vm, task, input.env),
      destroy,
    };
  } catch (error) {
    await destroy();
    throw error;
  }
}

export function vmSlug(runId: string, attempt: number): string {
  const hex = runId.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 12);
  const suffix = attempt === 0 ? "" : String(attempt);
  return `ledger${hex}${suffix}`;
}

async function evaluateInVm(
  vm: { fs: { writeTextFile(path: string, content: string): Promise<void> }; exec(options: { command: string; timeoutMs: number }): Promise<{ stdout?: string | null; stderr?: string | null; statusCode?: number | null }> },
  task: ResolvedTask,
  env: Env,
): Promise<GuestExecResult> {
  await vm.fs.writeTextFile("/tmp/agent-ledger-task.json", JSON.stringify(task.config));
  const plan = evaluatorPlan(task, env);
  if (plan.script && plan.scriptPath) await vm.fs.writeTextFile(plan.scriptPath, plan.script);
  const result = await vm.exec({ command: plan.command, timeoutMs: EVALUATOR_TIMEOUT_MS });
  return {
    stdout: result.stdout ?? "",
    stderr: result.stderr ?? "",
    statusCode: result.statusCode ?? null,
  };
}

async function connectOverPublicCdp(cdpDomain: string): Promise<{ browser: Browser; page: Page }> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 15; attempt += 1) {
    try {
      const response = await fetch(`https://${cdpDomain}/json/version`);
      if (!response.ok) throw new Error(`CDP discovery failed: ${response.status}`);
      const version = (await response.json()) as { webSocketDebuggerUrl?: string };
      if (!version.webSocketDebuggerUrl) throw new Error("CDP discovery returned no webSocketDebuggerUrl");
      const wsUrl = version.webSocketDebuggerUrl.replace("ws://127.0.0.1:9222", `wss://${cdpDomain}`);
      const browser = await chromium.connectOverCDP(wsUrl);
      const context = browser.contexts()[0];
      if (!context) throw new Error("Chromium has no default context");
      const page = context.pages()[0] ?? (await context.newPage());
      return { browser, page };
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  throw new Error(`Could not connect Playwright to https://${cdpDomain}: ${lastError instanceof Error ? lastError.message : String(lastError)}`);
}

function cdpPort(value: string | undefined): number {
  const port = Number(value ?? DEFAULT_CDP_PORT);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`WEBARENA_CDP_PORT is not a port: ${value}`);
  }
  return port;
}
