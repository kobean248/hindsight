/**
 * Recorded fallback run pairs (PRD §10): real getRun payloads captured during
 * rehearsal by scripts/capture-recorded-pair.ts, played back read-only and
 * always labelled as recorded. Server-only (reads the filesystem).
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { GetRunResponse } from "@/lib/ui/contracts";

export const RECORDED_DIR = path.join(process.cwd(), "data", "recorded");

export interface RecordedPair {
  name: string;
  captured_at: string;
  /** where the runs came from; only "live" pairs belong on stage. */
  source: "live" | "test_double";
  api_base: string;
  note: string | null;
  baseline: GetRunResponse;
  transfer: GetRunResponse;
}

const NAME = /^[a-z0-9][a-z0-9_-]{0,63}$/;

export function isValidName(name: string): boolean {
  return NAME.test(name);
}

export async function listRecorded(): Promise<Pick<RecordedPair, "name" | "captured_at" | "source" | "note">[]> {
  let files: string[];
  try {
    files = await readdir(RECORDED_DIR);
  } catch {
    return [];
  }
  const out = [];
  for (const f of files.filter((f) => f.endsWith(".json")).sort()) {
    const pair = await loadRecorded(f.slice(0, -5));
    if (pair) out.push({ name: pair.name, captured_at: pair.captured_at, source: pair.source, note: pair.note });
  }
  return out;
}

export async function loadRecorded(name: string): Promise<RecordedPair | null> {
  if (!isValidName(name)) return null;
  try {
    const pair = JSON.parse(await readFile(path.join(RECORDED_DIR, `${name}.json`), "utf8")) as RecordedPair;
    return pair.baseline?.run && pair.transfer?.run ? { ...pair, name } : null;
  } catch {
    return null;
  }
}
