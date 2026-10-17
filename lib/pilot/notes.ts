/**
 * Maps the pilot's KB notes (graveyard-experiment src/kb/schema.py) onto the
 * PRD §05 lessons shape. note → lesson_text, success_signal →
 * success_criteria, irreversible_steps → risk_warnings; applies_when and
 * handoff_points ride along as extension columns.
 */
import type { Lesson } from "@/lib/ui/contracts";
import rawNotes from "@/data/pilot/kb_notes.json";

export interface PilotNote {
  id: string;
  site: string;
  task_pattern: string;
  applies_when: string;
  note: string;
  success_signal: string | null;
  irreversible_steps: string[];
  handoff_points: string[];
  source_run_ids: string[];
  source_failure_categories: string[];
  created_at: string;
}

export const PILOT_NOTES = rawNotes as PilotNote[];

export function noteToLesson(n: PilotNote, embeddingModel: string): Lesson {
  return {
    id: n.id,
    domain: n.site,
    task_pattern: n.task_pattern,
    embedding_model: embeddingModel,
    lesson_text: n.note,
    root_cause: null,
    success_criteria: n.success_signal,
    risk_warnings: n.irreversible_steps,
    status: "active",
    times_applied: 0,
    times_succeeded: 0,
    confidence: 0,
    created_at: n.created_at,
    updated_at: n.created_at,
    last_validated_at: null,
    applies_when: n.applies_when,
    handoff_points: n.handoff_points,
    source_run_id: n.source_run_ids[0] ?? null,
  };
}
