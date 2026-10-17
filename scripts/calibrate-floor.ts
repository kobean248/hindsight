/**
 * How well does a relevance floor separate useful lessons from irrelevant ones
 * under all-MiniLM-L6-v2? Scores each pilot task against every same-site pilot
 * note and counts, per floor at k (default 2, override with K=1), how many tasks get the note written from
 * their own failure ("own") and how many irrelevant notes get through.
 *
 *   npx tsx scripts/calibrate-floor.ts
 *
 * In-sample (the notes came from these tasks' failures), so it is the
 * optimistic case. "Own" = the note's source_run_ids include the task.
 */
import { cosine, embed } from "../lib/embeddings/minilm";
import { PILOT_NOTES } from "../lib/pilot/notes";
import tasks from "../data/pilot/tasks.json";

const K = Number(process.env.K ?? 2);
const FLOORS = [0.45, 0.5, 0.55, 0.6, 0.65, 0.7, 0.75];

const T = await embed(tasks.map((t) => t.instruction));
const N = await embed(PILOT_NOTES.map((n) => n.task_pattern));

const rows = tasks
  .map((t, i) => ({
    task: t.id,
    scored: PILOT_NOTES.map((n, j) => ({
      id: n.id,
      sim: cosine(T[i], N[j]),
      own: n.source_run_ids.some((r) => r.includes(`__${t.id}__`)),
      site: n.site,
    }))
      .filter((x) => x.site === t.site)
      .sort((a, b) => b.sim - a.sim),
  }))
  .filter((r) => r.scored.length > 0);

for (const r of rows) {
  console.log(r.task.padEnd(14), r.scored.map((x) => `${x.id.slice(-2)}${x.own ? "*" : ""}:${x.sim.toFixed(2)}`).join("  "));
}
const withOwn = rows.filter((r) => r.scored.some((x) => x.own)).length;
console.log(`\nk=${K}; ${withOwn} tasks have an own note; * = own note`);
console.log("floor  tasks-get-own-note  irrelevant-notes-injected  tasks-with-any-irrelevant");
for (const f of FLOORS) {
  let own = 0, irrelevant = 0, tasksIrr = 0;
  for (const r of rows) {
    const got = r.scored.filter((x) => x.sim >= f).slice(0, K);
    if (got.some((x) => x.own)) own++;
    const bad = got.filter((x) => !x.own).length;
    irrelevant += bad;
    if (bad) tasksIrr++;
  }
  console.log(`${f.toFixed(2)}   ${String(own).padStart(2)}/${withOwn}                ${String(irrelevant).padStart(2)}                         ${tasksIrr}`);
}
