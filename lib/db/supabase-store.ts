import { supabase } from "./client";
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
  VerificationStatus,
} from "./types";
import { asNumber, parseVector, toVectorLiteral } from "./vectors";

type Row = Record<string, unknown>;

function lessonFromRow(row: Row): Lesson {
  return {
    id: String(row.id),
    domain: String(row.domain),
    task_pattern: String(row.task_pattern),
    task_embedding: parseVector(row.task_embedding),
    embedding_model: row.embedding_model == null ? null : String(row.embedding_model),
    lesson_text: row.lesson_text == null ? null : String(row.lesson_text),
    root_cause: row.root_cause == null ? null : String(row.root_cause),
    success_criteria: row.success_criteria == null ? null : String(row.success_criteria),
    risk_warnings: Array.isArray(row.risk_warnings) ? row.risk_warnings.map(String) : [],
    status: row.status as Lesson["status"],
    times_applied: asNumber(row.times_applied),
    times_succeeded: asNumber(row.times_succeeded),
    confidence: asNumber(row.confidence),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
    last_validated_at: row.last_validated_at == null ? null : String(row.last_validated_at),
  };
}

function runFromRow(row: Row): AgentRun {
  return {
    id: String(row.id),
    task_id: String(row.task_id),
    agent_id: String(row.agent_id),
    status: row.status as RunStatus,
    trace: Array.isArray(row.trace) ? (row.trace as TraceEvent[]) : [],
    started_at: row.started_at == null ? null : String(row.started_at),
    completed_at: row.completed_at == null ? null : String(row.completed_at),
    verified_success:
      row.verified_success == null ? null : Boolean(row.verified_success),
    error_code: row.error_code == null ? null : String(row.error_code),
    retrieved_lesson_ids: Array.isArray(row.retrieved_lesson_ids)
      ? row.retrieved_lesson_ids.map(String)
      : [],
    created_lesson_id: row.created_lesson_id == null ? null : String(row.created_lesson_id),
  };
}

function applicationFromRow(row: Row): LessonApplication {
  return {
    id: String(row.id),
    lesson_id: String(row.lesson_id),
    run_id: String(row.run_id),
    applied_at: String(row.applied_at),
    verification_status: row.verification_status as VerificationStatus,
    outcome_key: row.outcome_key == null ? null : String(row.outcome_key),
  };
}

function eventFromRow(row: Row): RunEvent {
  return {
    id: String(row.id),
    run_id: String(row.run_id),
    event_type: String(row.event_type),
    payload: row.payload,
    created_at: String(row.created_at),
  };
}

async function expect<T>(
  result: { data: T; error: { message: string } | null }
): Promise<T> {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

export const supabaseStore = {
  async getLessonById(id: string): Promise<Lesson | null> {
    const data = await expect(
      await supabase().from("lessons").select("*").eq("id", id).maybeSingle()
    );
    return data ? lessonFromRow(data as Row) : null;
  },

  async insertLesson(input: NewLesson): Promise<Lesson> {
    const data = await expect(
      await supabase()
        .from("lessons")
        .insert({
          domain: input.domain,
          task_pattern: input.task_pattern,
          task_embedding: toVectorLiteral(input.task_embedding),
          embedding_model: input.embedding_model,
          lesson_text: input.lesson_text ?? null,
          root_cause: input.root_cause ?? null,
          success_criteria: input.success_criteria ?? null,
          risk_warnings: input.risk_warnings ?? [],
        })
        .select("*")
        .single()
    );
    return lessonFromRow(data as Row);
  },

  async listActiveLessons(domain: string): Promise<Lesson[]> {
    const data = await expect(
      await supabase()
        .from("lessons")
        .select("*")
        .eq("domain", domain)
        .eq("status", "active")
    );
    return ((data ?? []) as Row[]).map(lessonFromRow);
  },

  async getLessonsByIds(ids: readonly string[]): Promise<Lesson[]> {
    if (ids.length === 0) return [];
    const data = await expect(
      await supabase().from("lessons").select("*").in("id", [...ids])
    );
    return ((data ?? []) as Row[]).map(lessonFromRow);
  },

  async listLessons(): Promise<Lesson[]> {
    const data = await expect(await supabase().from("lessons").select("*"));
    return ((data ?? []) as Row[]).map(lessonFromRow);
  },

  async updateLessonConfidence(id: string, score: LessonScore): Promise<Lesson> {
    const data = await expect(
      await supabase()
        .from("lessons")
        .update({
          times_applied: score.times_applied,
          times_succeeded: score.times_succeeded,
          confidence: score.confidence,
          last_validated_at: new Date().toISOString(),
        })
        .eq("id", id)
        .select("*")
        .single()
    );
    return lessonFromRow(data as Row);
  },

  async insertAgentRun(input: NewAgentRun): Promise<AgentRun> {
    const data = await expect(
      await supabase()
        .from("agent_runs")
        .insert({
          task_id: input.task_id,
          agent_id: input.agent_id,
          status: input.status ?? "queued",
          trace: input.trace ?? [],
          started_at: input.started_at ?? new Date().toISOString(),
          completed_at: input.completed_at ?? null,
          error_code: input.error_code ?? null,
        })
        .select("*")
        .single()
    );
    return runFromRow(data as Row);
  },

  async getAgentRunById(id: string): Promise<AgentRun | null> {
    const data = await expect(
      await supabase().from("agent_runs").select("*").eq("id", id).maybeSingle()
    );
    return data ? runFromRow(data as Row) : null;
  },

  async updateRunStatus(
    id: string,
    status: RunStatus,
    patch: { error_code?: string | null; completed_at?: string | null; trace?: TraceEvent[] } = {}
  ): Promise<AgentRun> {
    const current = await this.getAgentRunById(id);
    if (!current) throw new Error(`unknown run: ${id}`);
    if (["succeeded", "failed", "cancelled", "timed_out"].includes(current.status)) {
      throw new Error(`run ${id} is already ${current.status}`);
    }
    const data = await expect(
      await supabase()
        .from("agent_runs")
        .update({
          status,
          error_code: patch.error_code === undefined ? current.error_code : patch.error_code,
          trace: patch.trace ?? current.trace,
          completed_at:
            patch.completed_at ??
            (["succeeded", "failed", "cancelled", "timed_out"].includes(status)
              ? new Date().toISOString()
              : current.completed_at),
        })
        .eq("id", id)
        .select("*")
        .single()
    );
    return runFromRow(data as Row);
  },

  async setVerifiedSuccess(id: string, verifiedSuccess: boolean): Promise<AgentRun> {
    const data = await expect(
      await supabase()
        .from("agent_runs")
        .update({ verified_success: verifiedSuccess })
        .eq("id", id)
        .select("*")
        .single()
    );
    return runFromRow(data as Row);
  },

  async setRetrievedLessonIds(id: string, lessonIds: readonly string[]): Promise<AgentRun> {
    const data = await expect(
      await supabase()
        .from("agent_runs")
        .update({ retrieved_lesson_ids: [...lessonIds] })
        .eq("id", id)
        .select("*")
        .single()
    );
    return runFromRow(data as Row);
  },

  async setCreatedLessonId(id: string, lessonId: string): Promise<AgentRun> {
    const data = await expect(
      await supabase()
        .from("agent_runs")
        .update({ created_lesson_id: lessonId })
        .eq("id", id)
        .select("*")
        .single()
    );
    return runFromRow(data as Row);
  },

  async listRuns(): Promise<AgentRun[]> {
    const data = await expect(await supabase().from("agent_runs").select("*"));
    return ((data ?? []) as Row[]).map(runFromRow);
  },

  async insertLessonApplication(input: {
    lesson_id: string;
    run_id: string;
  }): Promise<LessonApplication> {
    const id = await expect(
      await supabase().rpc("record_lesson_application", {
        p_lesson_id: input.lesson_id,
        p_run_id: input.run_id,
      })
    );
    const application = await this.getLessonApplicationById(String(id));
    if (!application) throw new Error("application insert did not return a row");
    return application;
  },

  async getLessonApplicationById(id: string): Promise<LessonApplication | null> {
    const data = await expect(
      await supabase().from("lesson_applications").select("*").eq("id", id).maybeSingle()
    );
    return data ? applicationFromRow(data as Row) : null;
  },

  async listApplicationsForLesson(lessonId: string): Promise<LessonApplication[]> {
    const data = await expect(
      await supabase().from("lesson_applications").select("*").eq("lesson_id", lessonId)
    );
    return ((data ?? []) as Row[]).map(applicationFromRow);
  },

  async listApplicationsForRun(runId: string): Promise<LessonApplication[]> {
    const data = await expect(
      await supabase().from("lesson_applications").select("*").eq("run_id", runId)
    );
    return ((data ?? []) as Row[]).map(applicationFromRow);
  },

  async recordLessonOutcome(
    applicationId: string,
    verifiedResult: TerminalVerification
  ): Promise<LessonScore> {
    const data = await expect(
      await supabase().rpc("record_lesson_outcome", {
        p_application_id: applicationId,
        p_verified_result: verifiedResult,
      })
    );
    const row = (Array.isArray(data) ? data[0] : data) as Row | undefined;
    if (!row) throw new Error(`unknown application_id: ${applicationId}`);
    return {
      times_applied: asNumber(row.times_applied),
      times_succeeded: asNumber(row.times_succeeded),
      confidence: asNumber(row.confidence),
    };
  },

  async insertRunEvent(input: {
    run_id: string;
    event_type: string;
    payload: unknown;
  }): Promise<RunEvent> {
    const data = await expect(
      await supabase()
        .from("run_events")
        .insert({
          run_id: input.run_id,
          event_type: input.event_type,
          payload: input.payload ?? {},
        })
        .select("*")
        .single()
    );
    return eventFromRow(data as Row);
  },

  async listRunEvents(runId: string): Promise<RunEvent[]> {
    const data = await expect(
      await supabase()
        .from("run_events")
        .select("*")
        .eq("run_id", runId)
        .order("created_at", { ascending: true })
    );
    return ((data ?? []) as Row[]).map(eventFromRow);
  },

  async dashboard(filter?: DashboardFilter) {
    return aggregateDashboard(await this.listLessons(), await this.listRuns(), filter);
  },
};
