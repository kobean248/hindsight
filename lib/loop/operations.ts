import { getAgentRunById, insertAgentRun, setCreatedLessonId, setRetrievedLessonIds, setVerifiedSuccess } from "../db/agent-runs";
import {
  getLessonApplicationById,
  insertLessonApplication,
  listApplicationsForLesson,
  listApplicationsForRun,
  recordLessonOutcome,
} from "../db/lesson-applications";
import { getLessonById, getLessonsByIds, insertLesson, listActiveLessons } from "../db/lessons";
import { getDashboard as queryDashboard } from "../db/read-model";
import { insertRunEvent, listRunEvents } from "../db/run-events";
import type { AgentRun, Dashboard, DashboardFilter, Lesson, LessonApplication, LessonScore, RankedLesson, TerminalVerification, TraceEvent } from "../db/types";
import { dbRunStore } from "../db/run-store";
import { createExecutionAdapter } from "../execution/factory";
import type { ExecutionAdapter } from "../execution/types";
import { findDuplicate } from "../scoring/dedup";
import { embedTaskText } from "../scoring/embed";
import { rankLessons } from "../scoring/ranking";
import { DEFAULT_K } from "../scoring/constants";
import { LedgerError } from "./errors";
import { contributeSchema, dashboardSchema, lessonIdSchema, lookupSchema, parseWith, recordOutcomeSchema, runIdSchema } from "./schemas";
import { reflect, type Diagnosis, type Diagnoser } from "./reflect";

export interface LookupInput {
  domain: string;
  task_description: string;
  k?: number;
  run_id?: string;
}

export async function lookup(raw: unknown): Promise<RankedLesson[]> {
  const input = parseWith(lookupSchema, raw) as LookupInput;
  const embedded = await embedTaskText(input.task_description);
  const lessons = await listActiveLessons(input.domain);
  const ranked = rankLessons(
    lessons,
    input.domain,
    embedded.embedding,
    embedded.embedding_model,
    input.k ?? DEFAULT_K
  );
  if (input.run_id) {
    const run = await getAgentRunById(input.run_id);
    if (!run) throw new LedgerError(404, "run not found");
    await setRetrievedLessonIds(
      input.run_id,
      ranked.map((entry) => entry.lesson.id)
    );
  }
  return ranked.map((entry) => ({
    ...entry.lesson,
    similarity: entry.similarity,
    confidence: entry.confidence,
    rank_score: entry.rank_score,
  }));
}

export interface ContributeInput {
  domain: string;
  task_pattern: string;
  outcome: "success" | "failure";
  trace: unknown[];
  lesson?: {
    lesson_text?: string | null;
    root_cause?: string | null;
    success_criteria?: string | null;
    risk_warnings?: string[];
  };
  task_id?: string;
  agent_id?: string;
  existing_run_id?: string;
}

export async function contribute(
  raw: unknown,
  diagnose?: Diagnoser
): Promise<{ run_id: string; lesson_id?: string }> {
  const input = parseWith(contributeSchema, raw) as ContributeInput;
  const trace = input.trace as TraceEvent[];
  const run = input.existing_run_id
    ? await requireRun(input.existing_run_id)
    : await insertAgentRun({
        task_id: input.task_id ?? "unspecified",
        agent_id: input.agent_id ?? "harness",
        status: input.outcome === "success" ? "succeeded" : "failed",
        trace,
        error_code: input.outcome === "failure" ? "task_failed" : null,
      });

  let draft = input.lesson;
  if (!draft?.lesson_text && input.outcome === "failure") {
    if (run.verified_success !== false) {
      throw new LedgerError(
        400,
        "contribute without a lesson requires a failed run with verified_success = false so reflect can run"
      );
    }
    draft = await reflect(run.id, diagnose);
  }
  if (!draft?.lesson_text && !draft?.root_cause) {
    return { run_id: run.id };
  }

  const embedded = await embedTaskText(input.task_pattern);
  const existing = await listActiveLessons(input.domain);
  const duplicate = findDuplicate(input.domain, embedded.embedding, existing);
  if (duplicate) return { run_id: run.id, lesson_id: duplicate.id };

  const lesson = await insertLesson({
    domain: input.domain,
    task_pattern: input.task_pattern,
    task_embedding: embedded.embedding,
    embedding_model: embedded.embedding_model,
    lesson_text: draft?.lesson_text ?? null,
    root_cause: draft?.root_cause ?? null,
    success_criteria: draft?.success_criteria ?? null,
    risk_warnings: draft?.risk_warnings ?? [],
  });
  await setCreatedLessonId(run.id, lesson.id);
  return { run_id: run.id, lesson_id: lesson.id };
}

export interface LessonDetail {
  lesson: Lesson;
  success_criteria: string | null;
  risk_warnings: string[];
  application_history: LessonApplication[];
}

export async function getLesson(raw: unknown): Promise<LessonDetail> {
  const input = parseWith(lessonIdSchema, raw);
  const lesson = await getLessonById(input.lesson_id);
  if (!lesson) throw new LedgerError(404, "lesson not found");
  const applicationHistory = await listApplicationsForLesson(lesson.id);
  return {
    lesson,
    success_criteria: lesson.success_criteria,
    risk_warnings: lesson.risk_warnings,
    application_history: applicationHistory,
  };
}

export interface RunDetail {
  run: AgentRun;
  run_events: Awaited<ReturnType<typeof listRunEvents>>;
  retrieved_lessons: Lesson[];
  created_lesson: Lesson | null;
  applied_lessons: LessonApplication[];
}

export async function getRun(raw: unknown): Promise<RunDetail> {
  const input = parseWith(runIdSchema, raw);
  const run = await getAgentRunById(input.run_id);
  if (!run) throw new LedgerError(404, "run not found");
  const [events, retrieved, created, applied] = await Promise.all([
    listRunEvents(run.id),
    getLessonsByIds(run.retrieved_lesson_ids),
    run.created_lesson_id ? getLessonById(run.created_lesson_id) : Promise.resolve(null),
    listApplicationsForRun(run.id),
  ]);
  return {
    run,
    run_events: events,
    retrieved_lessons: retrieved,
    created_lesson: created,
    applied_lessons: applied,
  };
}

export async function getDashboard(raw: unknown = {}): Promise<Dashboard> {
  const filter = parseWith(dashboardSchema, raw) as DashboardFilter;
  return queryDashboard(filter);
}

export async function recordApplication(
  lessonId: string,
  runId: string
): Promise<{ application_id: string }> {
  const lesson = await getLessonById(lessonId);
  if (!lesson) throw new LedgerError(404, "lesson not found");
  const run = await requireRun(runId);
  if (run.created_lesson_id === lessonId) {
    throw new LedgerError(400, "the run that produced a lesson is not an application of that lesson");
  }
  const application = await insertLessonApplication({ lesson_id: lessonId, run_id: runId });
  return { application_id: application.id };
}

export async function verify(
  runId: string,
  taskId: string,
  adapter: ExecutionAdapter
): Promise<{ passed: boolean; evidence: { type: string; detail: string } }> {
  const run = await requireRun(runId);
  if (run.task_id !== taskId) throw new LedgerError(400, "task_id does not match run");
  let result: Awaited<ReturnType<ExecutionAdapter["awaitResult"]>>;
  try {
    result = await adapter.awaitResult(runId);
  } catch {
    throw new LedgerError(503, "evaluator_unavailable");
  }
  await setVerifiedSuccess(runId, result.evaluator.passed);
  await insertRunEvent({
    run_id: runId,
    event_type: "evaluator_result",
    payload: result.evaluator,
  });
  return { passed: result.evaluator.passed, evidence: result.evaluator.evidence };
}

export async function recordOutcome(
  applicationId: string,
  verifiedResult: TerminalVerification
): Promise<LessonScore> {
  return recordLessonOutcome(applicationId, verifiedResult);
}

let executionAdapter: ExecutionAdapter | null = null;

export function setExecutionAdapter(adapter: ExecutionAdapter | null): void {
  executionAdapter = adapter;
}

export function getExecutionAdapter(): ExecutionAdapter {
  if (!executionAdapter) {
    executionAdapter = createExecutionAdapter({ store: dbRunStore });
  }
  return executionAdapter;
}

/**
 * MCP record_outcome entry. Reads only application_id and run_id.
 * verify() supplies the status that recordOutcome persists.
 */
export async function recordOutcomeFromCaller(raw: unknown): Promise<LessonScore> {
  const input = parseWith(recordOutcomeSchema, raw);
  const application = await getLessonApplicationById(input.application_id);
  if (!application) throw new LedgerError(404, "application not found");
  if (application.run_id !== input.run_id) {
    throw new LedgerError(400, "application does not belong to run");
  }
  const run = await requireRun(input.run_id);
  let verifiedResult: TerminalVerification;
  try {
    const verified = await verify(run.id, run.task_id, getExecutionAdapter());
    verifiedResult = verified.passed ? "verified_success" : "verified_failure";
  } catch (error) {
    if (error instanceof LedgerError && error.message === "evaluator_unavailable") {
      verifiedResult = "unrelated_failure";
    } else {
      throw error;
    }
  }
  return recordOutcome(application.id, verifiedResult);
}

export async function learnFromFailure(
  input: { runId: string; domain: string; task_pattern: string },
  diagnose?: Diagnoser
): Promise<{ run_id: string; lesson_id?: string; diagnosis: Diagnosis }> {
  const diagnosis = await reflect(input.runId, diagnose);
  const run = await requireRun(input.runId);
  const saved = await contribute(
    {
      domain: input.domain,
      task_pattern: input.task_pattern,
      outcome: "failure",
      trace: run.trace,
      lesson: diagnosis,
      existing_run_id: run.id,
      task_id: run.task_id,
      agent_id: run.agent_id,
    },
    diagnose
  );
  return { ...saved, diagnosis };
}

async function requireRun(id: string): Promise<AgentRun> {
  const run = await getAgentRunById(id);
  if (!run) throw new LedgerError(404, "run not found");
  return run;
}
