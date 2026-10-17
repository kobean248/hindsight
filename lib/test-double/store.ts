/**
 * In-process fake of Lane A's data layer, used when NEXT_PUBLIC_LEDGER_SOURCE
 * is not "live". State lives in memory (one per server process) and is seeded
 * with the 17 pilot notes. Every number the dashboard shows is computed from
 * these rows — nothing is hard-coded.
 */
import { randomUUID } from "node:crypto";
import type {
  AgentRun,
  DemoState,
  ErrorCode,
  EvaluatorResult,
  GetDashboardResponse,
  GetLessonResponse,
  GetRunResponse,
  Lesson,
  LessonApplication,
  LessonStatus,
  ListLessonsResponse,
  RankedLesson,
  RunEvent,
  RunStatus,
  RunSummary,
  TraceEvent,
  VerificationStatus,
} from "@/lib/ui/contracts";
import { PILOT_NOTES, noteToLesson } from "@/lib/pilot/notes";
import { EMBEDDING_MODEL, cosine, embed } from "@/lib/embeddings/minilm";
import { DEDUP_THRESHOLD, RELEVANCE_FLOOR, countVerified, rankScore, wilsonLowerBound } from "./scoring";

interface State {
  lessons: Map<string, Lesson>;
  /** task_pattern embeddings, keyed by lesson id (the test double's stand-in for task_embedding). */
  vectors: Map<string, number[]>;
  runs: Map<string, AgentRun>;
  events: RunEvent[];
  applications: Map<string, LessonApplication>;
  /** application ids whose outcome has been recorded (§07 idempotency key). */
  outcomes: Set<string>;
  retrieved: Map<string, RankedLesson[]>;
  createdLesson: Map<string, string>;
  pairs: Map<string, string>;
  demos: Map<string, DemoState>;
}

function seed(): State {
  return {
    lessons: new Map(PILOT_NOTES.map((n) => [n.id, noteToLesson(n, EMBEDDING_MODEL)])),
    vectors: new Map(),
    runs: new Map(),
    events: [],
    applications: new Map(),
    outcomes: new Set(),
    retrieved: new Map(),
    createdLesson: new Map(),
    pairs: new Map(),
    demos: new Map(),
  };
}

// Survive Next.js dev-server module reloads.
const g = globalThis as unknown as { __ledgerTestDouble?: State };

export function state(): State {
  return (g.__ledgerTestDouble ??= seed());
}

export function resetStore(): void {
  g.__ledgerTestDouble = seed();
}

const now = () => new Date().toISOString();

// ---------- lookup / contribute (§06, §07) ----------

/** Embeds any active lessons in `domain` that don't have a vector yet. */
async function activeWithVectors(domain: string): Promise<{ lesson: Lesson; vec: number[] }[]> {
  const s = state();
  const pool = [...s.lessons.values()].filter((l) => l.domain === domain && l.status === "active");
  const missing = pool.filter((l) => !s.vectors.has(l.id));
  const vecs = await embed(missing.map((l) => l.task_pattern));
  missing.forEach((l, i) => s.vectors.set(l.id, vecs[i]));
  return pool.map((lesson) => ({ lesson, vec: s.vectors.get(lesson.id)! }));
}

export async function lookup(domain: string, taskDescription: string, k = 5): Promise<RankedLesson[]> {
  const pool = await activeWithVectors(domain);
  if (pool.length === 0) return [];
  const [q] = await embed([taskDescription]);
  const ranked: RankedLesson[] = [];
  for (const { lesson: l, vec } of pool) {
    const sim = cosine(q, vec);
    if (sim < RELEVANCE_FLOOR) continue;
    ranked.push({ ...l, similarity: sim, rank_score: rankScore(sim, l.confidence) });
  }
  ranked.sort((a, b) => b.rank_score - a.rank_score);
  return ranked.slice(0, k);
}

export interface LessonDraft {
  domain: string;
  task_pattern: string;
  lesson_text: string;
  root_cause: string;
  success_criteria: string;
  risk_warnings: string[];
  applies_when?: string;
  handoff_points?: string[];
  source_run_id: string;
}

/** Returns the new lesson, or the existing one when similarity ≥ 0.92 (§05 dedup). */
export async function contributeLesson(
  d: LessonDraft,
): Promise<{ lesson: Lesson; deduplicated: boolean; similarity: number | null }> {
  const pool = await activeWithVectors(d.domain);
  const [vec] = await embed([d.task_pattern]);
  let best: { lesson: Lesson; sim: number } | null = null;
  for (const { lesson: l, vec: other } of pool) {
    const sim = cosine(vec, other);
    if (!best || sim > best.sim) best = { lesson: l, sim };
  }
  if (best && best.sim >= DEDUP_THRESHOLD) {
    state().createdLesson.set(d.source_run_id, best.lesson.id);
    return { lesson: best.lesson, deduplicated: true, similarity: best.sim };
  }
  const t = now();
  const lesson: Lesson = {
    id: randomUUID(),
    domain: d.domain,
    task_pattern: d.task_pattern,
    embedding_model: EMBEDDING_MODEL,
    lesson_text: d.lesson_text,
    root_cause: d.root_cause,
    success_criteria: d.success_criteria,
    risk_warnings: d.risk_warnings,
    status: "active",
    times_applied: 0,
    times_succeeded: 0,
    confidence: 0,
    created_at: t,
    updated_at: t,
    last_validated_at: null,
    applies_when: d.applies_when ?? null,
    handoff_points: d.handoff_points ?? [],
    source_run_id: d.source_run_id,
  };
  state().lessons.set(lesson.id, lesson);
  state().vectors.set(lesson.id, vec);
  state().createdLesson.set(d.source_run_id, lesson.id);
  return { lesson, deduplicated: false, similarity: best?.sim ?? null };
}

// ---------- runs ----------

export function createRun(taskId: string, agentId: string): AgentRun {
  const run: AgentRun = {
    id: randomUUID(),
    task_id: taskId,
    agent_id: agentId,
    status: "queued",
    trace: [],
    started_at: null,
    completed_at: null,
    verified_success: null,
    error_code: null,
  };
  state().runs.set(run.id, run);
  addEvent(run.id, "queued", { task_id: taskId, agent_id: agentId });
  return run;
}

export function addEvent(runId: string, eventType: string, payload: Record<string, unknown>): void {
  state().events.push({ id: randomUUID(), run_id: runId, event_type: eventType, payload, created_at: now() });
}

const FORWARD: Record<RunStatus, RunStatus[]> = {
  queued: ["running", "cancelled", "failed", "timed_out"],
  running: ["succeeded", "failed", "cancelled", "timed_out"],
  succeeded: [],
  failed: [],
  cancelled: [],
  timed_out: [],
};

/** §07 lifecycle: only queued/running move forward; terminal states never change. */
export function setRunStatus(runId: string, next: RunStatus, errorCode: ErrorCode | null = null): AgentRun {
  const run = mustRun(runId);
  if (!FORWARD[run.status].includes(next)) {
    throw new Error(`illegal run transition ${run.status} → ${next}`);
  }
  run.status = next;
  if (next === "running") run.started_at = now();
  else run.completed_at = now();
  if (errorCode) run.error_code = errorCode;
  return run;
}

export function appendTrace(runId: string, ev: TraceEvent): void {
  mustRun(runId).trace.push(ev);
  addEvent(runId, "step", { ...ev });
}

export function setRetrieved(runId: string, lessons: RankedLesson[]): void {
  state().retrieved.set(runId, lessons);
}

export function pairRuns(baselineId: string, transferId: string): void {
  state().pairs.set(baselineId, transferId);
  state().pairs.set(transferId, baselineId);
}

/** verify(): the evaluator result is the only writer of verified_success (§05). */
export function recordVerification(runId: string, result: EvaluatorResult): void {
  const run = mustRun(runId);
  run.verified_success = result.passed;
  addEvent(runId, "evaluator_result", { ...result });
}

// ---------- applications (§06, §07) ----------

export function recordApplication(lessonId: string, runId: string): LessonApplication {
  if (!state().lessons.has(lessonId)) throw new Error(`unknown lesson ${lessonId}`);
  mustRun(runId);
  const app: LessonApplication = {
    id: randomUUID(),
    lesson_id: lessonId,
    run_id: runId,
    applied_at: now(),
    verification_status: "pending",
  };
  state().applications.set(app.id, app);
  return app;
}

/** Idempotent on application_id: a second call returns the recorded state unchanged. */
export function recordOutcome(
  applicationId: string,
  result: Exclude<VerificationStatus, "pending">,
): Pick<Lesson, "times_applied" | "times_succeeded" | "confidence"> {
  const app = state().applications.get(applicationId);
  if (!app) throw new Error(`unknown application ${applicationId}`);
  const lesson = state().lessons.get(app.lesson_id)!;
  if (!state().outcomes.has(applicationId)) {
    state().outcomes.add(applicationId);
    app.verification_status = result;
    const { s, n } = countVerified([...state().applications.values()].filter((a) => a.lesson_id === lesson.id));
    lesson.times_applied = n;
    lesson.times_succeeded = s;
    lesson.confidence = wilsonLowerBound(s, n);
    lesson.updated_at = now();
    if (result !== "unrelated_failure") lesson.last_validated_at = lesson.updated_at;
  }
  return { times_applied: lesson.times_applied, times_succeeded: lesson.times_succeeded, confidence: lesson.confidence };
}

// ---------- reads (§07 getRun / getDashboard + Screen B) ----------

function mustRun(id: string): AgentRun {
  const run = state().runs.get(id);
  if (!run) throw new NotFound(`run ${id} not found`);
  return run;
}

export class NotFound extends Error {}

export function getRun(id: string): GetRunResponse {
  const s = state();
  const run = mustRun(id);
  const created = s.createdLesson.get(id);
  return {
    run: structuredClone(run),
    events: s.events.filter((e) => e.run_id === id),
    retrieved_lessons: s.retrieved.get(id) ?? [],
    applied_lessons: [...s.applications.values()]
      .filter((a) => a.run_id === id)
      .map((a) => ({ ...a, lesson: s.lessons.get(a.lesson_id)! })),
    created_lesson: created ? (s.lessons.get(created) ?? null) : null,
    paired_run_id: s.pairs.get(id) ?? null,
  };
}

function summarize(run: AgentRun): RunSummary {
  return {
    id: run.id,
    task_id: run.task_id,
    agent_id: run.agent_id,
    status: run.status,
    verified_success: run.verified_success,
    started_at: run.started_at,
    completed_at: run.completed_at,
    error_code: run.error_code,
    steps: run.trace.filter((t) => t.type !== "screenshot").length,
    agent_claimed_done: run.trace.some((t) => t.type === "finish"),
    lessons_applied: [...state().applications.values()].filter((a) => a.run_id === run.id).length,
  };
}

export function getDashboard(): GetDashboardResponse {
  const s = state();
  const runs = [...s.runs.values()].map(summarize).sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""));
  const verified = runs.filter((r) => r.verified_success !== null);
  const claimed = verified.filter((r) => r.agent_claimed_done);
  const active = [...s.lessons.values()].filter((l) => l.status === "active");
  const verifiedApps = [...s.applications.values()].filter(
    (a) => a.verification_status === "verified_success" || a.verification_status === "verified_failure",
  );
  return {
    kpis: {
      total_runs: runs.length,
      verified_runs: verified.length,
      verified_successes: verified.filter((r) => r.verified_success).length,
      false_successes: claimed.filter((r) => !r.verified_success).length,
      claimed_done_runs: claimed.length,
      active_lessons: active.length,
      verified_applications: verifiedApps.length,
      mean_confidence: active.length ? active.reduce((t, l) => t + l.confidence, 0) / active.length : 0,
    },
    runs,
    recent_failures: runs.filter((r) => r.verified_success === false || r.error_code !== null).slice(0, 10),
  };
}

export function listLessons(filters: { domain?: string; status?: LessonStatus }): ListLessonsResponse {
  const all = [...state().lessons.values()];
  const lessons = all
    .filter((l) => (!filters.domain || l.domain === filters.domain) && (!filters.status || l.status === filters.status))
    .sort((a, b) => b.confidence - a.confidence || b.updated_at.localeCompare(a.updated_at));
  return { lessons, domains: [...new Set(all.map((l) => l.domain))].sort() };
}

export function getLesson(id: string): GetLessonResponse {
  const s = state();
  const lesson = s.lessons.get(id);
  if (!lesson) throw new NotFound(`lesson ${id} not found`);
  const applications = [...s.applications.values()]
    .filter((a) => a.lesson_id === id)
    .map((a) => {
      const run = s.runs.get(a.run_id)!;
      return { ...a, task_id: run.task_id, agent_id: run.agent_id, run_status: run.status };
    });
  return { lesson, applications };
}

// ---------- demo bookkeeping ----------

export function saveDemo(d: DemoState): DemoState {
  state().demos.set(d.id, d);
  return d;
}

export function getDemo(id: string): DemoState | null {
  return state().demos.get(id) ?? null;
}
