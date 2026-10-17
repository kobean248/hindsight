/** Typed view of the pilot's results.json sections the Overview reads (see data/pilot/README.md). */
import raw from "@/data/pilot/results.json";

export interface Prop {
  p: number;
  lo: number;
  hi: number;
  k: number;
  n: number;
}

interface PilotResults {
  baseline: { runs: number; success: Prop; false_success: Prop };
  failures: { n: number; fixable: { yes: Prop; no: Prop; handoff: Prop } };
  waste: { tokens: { wasted: number; total: number; share: number } };
  kb_effect: {
    a: { success: Prop };
    b: { success: Prop };
    regressions: { task_id: string; baseline: number; with_kb: number }[];
    recovered: { tasks: string[] };
    tokens: { a_per_success: number; b_per_success: number };
  };
  judge_validation: { status: string };
  kb: { entries_frozen: number };
}

export const PILOT = raw as unknown as PilotResults;
export const PILOT_SOURCE = "graveyard-experiment @ 842b762 · 17 Oct 2026 · gpt-oss-120b (Groq), 24 tasks on 10 live sites";
