import type {
  AgentRun,
  Dashboard,
  DashboardFilter,
  Lesson,
  LessonApplication,
  RunSummary,
} from "./types";

export function aggregateDashboard(
  lessons: readonly Lesson[],
  runs: readonly AgentRun[],
  applications: readonly LessonApplication[] = [],
  filter: DashboardFilter = {}
): Dashboard {
  const filteredLessons = filter.domain
    ? lessons.filter((lesson) => lesson.domain === filter.domain)
    : lessons;
  const filteredRuns = filter.run_status
    ? runs.filter((run) => run.status === filter.run_status)
    : runs;
  const lessonIds = new Set(filteredLessons.map((lesson) => lesson.id));
  const runIds = new Set(filteredRuns.map((run) => run.id));
  const filteredApplications = applications.filter(
    (application) => lessonIds.has(application.lesson_id) && runIds.has(application.run_id)
  );
  const appliedByRun = new Map<string, number>();
  for (const application of filteredApplications) {
    appliedByRun.set(application.run_id, (appliedByRun.get(application.run_id) ?? 0) + 1);
  }

  const summaries = filteredRuns
    .map((run) => summarizeRun(run, appliedByRun.get(run.id) ?? 0))
    .sort((a, b) => (b.started_at ?? "").localeCompare(a.started_at ?? ""));

  const verified = summaries.filter((run) => run.verified_success !== null);
  const claimed = verified.filter((run) => run.agent_claimed_done);
  const active = filteredLessons.filter((lesson) => lesson.status === "active");
  const verifiedApplications = filteredApplications.filter(
    (application) =>
      application.verification_status === "verified_success" ||
      application.verification_status === "verified_failure"
  );

  return {
    kpis: {
      total_runs: summaries.length,
      verified_runs: verified.length,
      verified_successes: verified.filter((run) => run.verified_success === true).length,
      false_successes: claimed.filter((run) => run.verified_success === false).length,
      claimed_done_runs: claimed.length,
      active_lessons: active.length,
      verified_applications: verifiedApplications.length,
      mean_confidence:
        active.length === 0 ? 0 : active.reduce((total, lesson) => total + lesson.confidence, 0) / active.length,
    },
    runs: summaries,
    recent_failures: summaries
      .filter((run) => run.verified_success === false || run.error_code !== null)
      .slice(0, 10),
  };
}

function summarizeRun(run: AgentRun, lessonsApplied: number): RunSummary {
  return {
    id: run.id,
    task_id: run.task_id,
    agent_id: run.agent_id,
    status: run.status,
    verified_success: run.verified_success,
    started_at: run.started_at,
    completed_at: run.completed_at,
    error_code: run.error_code,
    steps: run.trace.filter((event) => event.type !== "screenshot").length,
    agent_claimed_done: run.trace.some((event) => event.type === "finish"),
    lessons_applied: lessonsApplied,
  };
}
