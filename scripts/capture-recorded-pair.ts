/**
 * Captures a baseline/transfer pair as a recorded fallback (PRD §10).
 *
 *   npx tsx scripts/capture-recorded-pair.ts --name usps-03-rehearsal-1 \
 *     --baseline <run_id> --transfer <run_id> [--api http://localhost:3000/api] [--note "..."]
 *
 * Reads both runs through getRun exactly as the UI does and writes
 * data/recorded/<name>.json. It refuses unfinished or ungraded runs, and
 * refuses the test double unless --allow-test-double is passed (such pairs
 * are labelled as test-double in playback, never as live).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseArgs } from "node:util";
import type { GetRunResponse } from "../lib/ui/contracts";

const { values: a } = parseArgs({
  options: {
    name: { type: "string" },
    baseline: { type: "string" },
    transfer: { type: "string" },
    api: { type: "string", default: "http://localhost:3000/api" },
    note: { type: "string" },
    "allow-test-double": { type: "boolean", default: false },
  },
});

function die(msg: string): never {
  console.error(`capture-recorded-pair: ${msg}`);
  process.exit(1);
}

if (!a.name || !/^[a-z0-9][a-z0-9_-]{0,63}$/.test(a.name)) die("--name is required: lowercase letters, digits, - and _");
if (!a.baseline || !a.transfer) die("--baseline and --transfer run ids are required");
const testDouble = a.api!.replace(/\/$/, "").endsWith("/test-double");
if (testDouble && !a["allow-test-double"]) die("refusing to record test-double runs without --allow-test-double");

async function getRun(id: string): Promise<GetRunResponse> {
  const res = await fetch(`${a.api!.replace(/\/$/, "")}/get-run?run_id=${encodeURIComponent(id)}`);
  if (!res.ok) die(`getRun ${id}: HTTP ${res.status} ${await res.text()}`);
  const r = (await res.json()) as GetRunResponse;
  if (r.run.verified_success === null) die(`run ${id} has no evaluator verdict yet`);
  return r;
}

const [baseline, transfer] = await Promise.all([getRun(a.baseline), getRun(a.transfer)]);
if (baseline.run.task_id !== transfer.run.task_id) die("baseline and transfer ran different tasks");
if (baseline.run.verified_success) console.warn("warning: the baseline passed, so this pair does not show a fixed failure");

const out = path.join(process.cwd(), "data", "recorded", `${a.name}.json`);
await mkdir(path.dirname(out), { recursive: true });
await writeFile(
  out,
  JSON.stringify(
    {
      name: a.name,
      captured_at: new Date().toISOString(),
      source: testDouble ? "test_double" : "live",
      api_base: a.api,
      note: a.note ?? null,
      baseline,
      transfer,
    },
    null,
    1,
  ) + "\n",
);
console.log(`wrote ${path.relative(process.cwd(), out)}`);
