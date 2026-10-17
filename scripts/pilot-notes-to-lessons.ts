/**
 * Prints the 17 pilot notes as PRD §05 lessons rows (JSON, no embeddings), for
 * Lane A to seed the real database through its own embedding path:
 *
 *   npx tsx scripts/pilot-notes-to-lessons.ts > /tmp/pilot-lessons.json
 */
import { EMBEDDING_MODEL } from "../lib/embeddings/minilm";
import { PILOT_NOTES, noteToLesson } from "../lib/pilot/notes";

const rows = PILOT_NOTES.map((n) => {
  // ids are the DB's to assign; keep the pilot id for traceability instead.
  const { id, ...lesson } = noteToLesson(n, EMBEDDING_MODEL);
  return { ...lesson, pilot_note_id: id };
});
process.stdout.write(JSON.stringify(rows, null, 2) + "\n");
