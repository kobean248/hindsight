import { countsFromStatuses, wilsonLowerBound } from "../scoring/confidence";
import { aggregateDashboard } from "./dashboard";
import type {
  AgentRun,
  DashboardFilter,
  Lesson,
  LessonApplication,
  LessonScore,
  NewAgentRun,
  NewLesson,
  RunEvent,
  RunStatus,
  TerminalVerification,
  TraceEvent,
} from "./types";

function now(): string {
  return new Date().toISOString();
}

const TERMINAL: ReadonlySet<RunStatus> = new Set([
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
]);

export class MemoryStore {
  lessons = new Map<string, Lesson>();
  runs = new Map<string, AgentRun>();
  applications = new Map<string, LessonApplication>();
  events: RunEvent[] = [];

  reset(): void {
    this.lessons.clear();
    this.runs.clear();
    this.applications.clear();
    this.events = [];
  }

  async getLessonById(id: string): Promise<Lesson | null> {
    return this.lessons.get(id) ?? null;
  }

  async insertLesson(input: NewLesson): Promise<Lesson> {
    const timestamp = now();
    const lesson: Lesson = {
      id: crypto.randomUUID(),
      domain: input.domain,
      task_pattern: input.task_pattern,
      task_embedding: [...input.task_embedding],
      embedding_model: input.embedding_model,
      lesson_text: input.lesson_text ?? null,
      root_cause: input.root_cause ?? null,
      success_criteria: input.success_criteria ?? null,
      risk_warnings: input.risk_warnings ?? [],
      status: "active",
      times_applied: 0,
      times_succeeded: 0,
      confidence: 0,
      created_at: timestamp,
      updated_at: timestamp,
      last_validated_at: null,
    };
    this.lessons.set(lesson.id, lesson);
    return lesson;
  }

  async listActiveLessons(domain: string): Promise<Lesson[]> {
    return [...this.lessons.values()].filter(
      (lesson) => lesson.domain === domain && lesson.status === "active"
    );
  }

  async getLessonsByIds(ids: readonly string[]): Promise<Lesson[]> {
    return ids.flatMap((id) => {
      const lesson = this.lessons.get(id);
      return lesson ? [lesson] : [];
    });
  }

  async listLessons(): Promise<Lesson[]> {
    return [...this.lessons.values()];
  }

  async updateLessonConfidence(id: string, score: LessonScore): Promise<Lesson> {
    const lesson = this.requireLesson(id);
    lesson.times_applied = score.times_applied;
    lesson.times_succeeded = score.times_succeeded;
    lesson.confidence = score.confidence;
    lesson.last_validated_at = now();
    lesson.updated_at = now();
    return lesson;
  }

  async insertAgentRun(input: NewAgentRun): Promise<AgentRun> {
    const status = input.status ?? "queued";
    if ((status === "failed" || status === "timed_out") && !input.error_code) {
      throw new Error(`status ${status} requires error_code`);
    }
    const timestamp = now();
    const run: AgentRun = {
      id: crypto.randomUUID(),
      task_id: input.task_id,
      agent_id: input.agent_id,
      status,
      trace: input.trace ?? [],
      started_at: input.started_at ?? timestamp,
      completed_at: input.completed_at ?? (TERMINAL.has(status) ? timestamp : null),
      verified_success: null,
      error_code: input.error_code ?? null,
      retrieved_lesson_ids: [],
      created_lesson_id: null,
    };
    this.runs.set(run.id, run);
    return run;
  }

  async getAgentRunById(id: string): Promise<AgentRun | null> {
    return this.runs.get(id) ?? null;
  }

  async updateRunStatus(
    id: string,
    status: RunStatus,
    patch: { error_code?: string | null; completed_at?: string | null; trace?: TraceEvent[] } = {}
  ): Promise<AgentRun> {
    const run = this.requireRun(id);
    if (TERMINAL.has(run.status)) {
      throw new Error(`run ${id} is already ${run.status}`);
    }
    if (run.status === "queued" && status === "queued") {
      throw new Error("run is already queued");
    }
    if (run.status === "running" && status === "queued") {
      throw new Error("running run cannot return to queued");
    }
    if ((status === "failed" || status === "timed_out") && !(patch.error_code ?? run.error_code)) {
      throw new Error(`status ${status} requires error_code`);
    }
    run.status = status;
    if (patch.error_code !== undefined) run.error_code = patch.error_code;
    if (patch.trace) run.trace = patch.trace;
    if (TERMINAL.has(status)) run.completed_at = patch.completed_at ?? now();
    return run;
  }

  async saveRunTrace(id: string, trace: TraceEvent[]): Promise<AgentRun> {
    const run = this.requireRun(id);
    run.trace = trace;
    return run;
  }

  async setVerifiedSuccess(id: string, verifiedSuccess: boolean): Promise<AgentRun> {
    const run = this.requireRun(id);
    run.verified_success = verifiedSuccess;
    return run;
  }

  async setRetrievedLessonIds(id: string, lessonIds: readonly string[]): Promise<AgentRun> {
    const run = this.requireRun(id);
    run.retrieved_lesson_ids = [...lessonIds];
    return run;
  }

  async setCreatedLessonId(id: string, lessonId: string): Promise<AgentRun> {
    const run = this.requireRun(id);
    run.created_lesson_id = lessonId;
    return run;
  }

  async listRuns(): Promise<AgentRun[]> {
    return [...this.runs.values()];
  }

  async insertLessonApplication(input: {
    lesson_id: string;
    run_id: string;
  }): Promise<LessonApplication> {
    this.requireLesson(input.lesson_id);
    this.requireRun(input.run_id);
    const application: LessonApplication = {
      id: crypto.randomUUID(),
      lesson_id: input.lesson_id,
      run_id: input.run_id,
      applied_at: now(),
      verification_status: "pending",
      outcome_key: null,
    };
    this.applications.set(application.id, application);
    return application;
  }

  async getLessonApplicationById(id: string): Promise<LessonApplication | null> {
    return this.applications.get(id) ?? null;
  }

  async listApplicationsForLesson(lessonId: string): Promise<LessonApplication[]> {
    return [...this.applications.values()].filter((row) => row.lesson_id === lessonId);
  }

  async listApplicationsForRun(runId: string): Promise<LessonApplication[]> {
    return [...this.applications.values()].filter((row) => row.run_id === runId);
  }

  async recordLessonOutcome(
    applicationId: string,
    verifiedResult: TerminalVerification
  ): Promise<LessonScore> {
    const application = this.applications.get(applicationId);
    if (!application) throw new Error(`unknown application_id: ${applicationId}`);
    if (application.verification_status === "pending") {
      if (application.outcome_key != null) {
        throw new Error("outcome_key already set");
      }
      application.verification_status = verifiedResult;
      application.outcome_key = application.id;
      const statuses = [...this.applications.values()]
        .filter((row) => row.lesson_id === application.lesson_id)
        .map((row) => row.verification_status);
      const { s, n } = countsFromStatuses(statuses);
      await this.updateLessonConfidence(application.lesson_id, {
        times_applied: n,
        times_succeeded: s,
        confidence: wilsonLowerBound(s, n),
      });
    }
    const lesson = this.requireLesson(application.lesson_id);
    return {
      times_applied: lesson.times_applied,
      times_succeeded: lesson.times_succeeded,
      confidence: lesson.confidence,
    };
  }

  async insertRunEvent(input: {
    run_id: string;
    event_type: string;
    payload: unknown;
  }): Promise<RunEvent> {
    this.requireRun(input.run_id);
    const event: RunEvent = {
      id: crypto.randomUUID(),
      run_id: input.run_id,
      event_type: input.event_type,
      payload: input.payload,
      created_at: now(),
    };
    this.events.push(event);
    return event;
  }

  async listRunEvents(runId: string): Promise<RunEvent[]> {
    return this.events.filter((event) => event.run_id === runId);
  }

  async dashboard(filter?: DashboardFilter) {
    return aggregateDashboard(await this.listLessons(), await this.listRuns(), filter);
  }

  private requireLesson(id: string): Lesson {
    const lesson = this.lessons.get(id);
    if (!lesson) throw new Error(`unknown lesson: ${id}`);
    return lesson;
  }

  private requireRun(id: string): AgentRun {
    const run = this.runs.get(id);
    if (!run) throw new Error(`unknown run: ${id}`);
    return run;
  }
}

export const memoryStore = new MemoryStore();
