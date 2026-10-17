import { API_BASE } from "./config";
import type {
  DemoState,
  GetDashboardResponse,
  GetLessonResponse,
  GetRunResponse,
  LessonStatus,
  ListLessonsResponse,
  LookupResponse,
} from "./contracts";

export class ApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
  ) {
    super(message);
  }
}

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, { cache: "no-store", ...init });
  } catch (e) {
    throw new ApiError(`Network error: ${(e as Error).message}`, 0);
  }
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    const msg = (body && typeof body.error === "string" && body.error) || res.statusText;
    throw new ApiError(msg, res.status);
  }
  return body as T;
}

function post<T>(url: string, body: unknown): Promise<T> {
  return request<T>(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

function qs(params: Record<string, string | undefined>): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v) p.set(k, v);
  const s = p.toString();
  return s ? `?${s}` : "";
}

export const api = {
  lookup: (domain: string, task_description: string, k = 5) =>
    post<LookupResponse>(`${API_BASE}/lookup`, { domain, task_description, k }),
  getRun: (runId: string) => request<GetRunResponse>(`${API_BASE}/get-run${qs({ run_id: runId })}`),
  getDashboard: () => request<GetDashboardResponse>(`${API_BASE}/get-dashboard`),
  listLessons: (filters: { domain?: string; status?: LessonStatus | "" }) =>
    request<ListLessonsResponse>(
      `${API_BASE}/lessons${qs({ domain: filters.domain, status: filters.status || undefined })}`,
    ),
  getLesson: (id: string) => request<GetLessonResponse>(`${API_BASE}/lessons/${encodeURIComponent(id)}`),
  startDemoRun: (task_id?: string) => post<DemoState>("/api/start-demo-run", { task_id }),
  getDemo: (id: string) => request<DemoState>(`/api/start-demo-run${qs({ id })}`),
};
