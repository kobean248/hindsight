import type {
  AgentRun,
  Dashboard,
  DashboardFilter,
  Lesson,
  LessonStatus,
  RunStatus,
} from "./types";

const LESSON_STATUSES: LessonStatus[] = ["active", "decayed", "retired"];
const RUN_STATUSES: RunStatus[] = [
  "queued",
  "running",
  "succeeded",
  "failed",
  "cancelled",
  "timed_out",
];

export function aggregateDashboard(
  lessons: readonly Lesson[],
  runs: readonly AgentRun[],
  filter: DashboardFilter = {}
): Dashboard {
  const filteredLessons = filter.domain
    ? lessons.filter((lesson) => lesson.domain === filter.domain)
    : lessons;
  const filteredRuns = filter.run_status
    ? runs.filter((run) => run.status === filter.run_status)
    : runs;

  const lessonsByStatus = Object.fromEntries(
    LESSON_STATUSES.map((status) => [status, 0])
  ) as Record<LessonStatus, number>;
  for (const lesson of filteredLessons) {
    lessonsByStatus[lesson.status] += 1;
  }

  const runsByStatus = Object.fromEntries(
    RUN_STATUSES.map((status) => [status, 0])
  ) as Record<RunStatus, number>;
  for (const run of filteredRuns) {
    runsByStatus[run.status] += 1;
  }

  const verified = filteredRuns.filter((run) => run.verified_success != null);
  const verifiedSuccesses = verified.filter((run) => run.verified_success === true).length;
  const actionCounts = filteredRuns.map((run) => run.trace.length);
  const actionTotal = actionCounts.reduce((sum, count) => sum + count, 0);

  const recentRuns = [...filteredRuns]
    .sort((a, b) => stamp(b).localeCompare(stamp(a)))
    .slice(0, 10);
  const recentFailures = [...filteredRuns]
    .filter((run) => run.status === "failed" || run.verified_success === false)
    .sort((a, b) => stamp(b).localeCompare(stamp(a)))
    .slice(0, 10);

  return {
    lessons: { total: filteredLessons.length, by_status: lessonsByStatus },
    runs: {
      total: filteredRuns.length,
      by_status: runsByStatus,
      verified_success_rate: verified.length === 0 ? null : verifiedSuccesses / verified.length,
      average_action_count:
        filteredRuns.length === 0 ? null : actionTotal / filteredRuns.length,
    },
    recent_runs: recentRuns,
    recent_failures: recentFailures,
  };
}

function stamp(run: AgentRun): string {
  return run.completed_at ?? run.started_at ?? "";
}
