import type { RunEvent, TraceEvent } from "@/lib/ui/contracts";
import { when } from "@/lib/ui/format";
import { Badge, EmptyState } from "@/components/ui";

const LABEL: Record<string, string> = {
  queued: "Queued",
  vm_ready: "VM ready",
  lookup: "Lookup",
  lookup_skipped: "Lookup skipped",
  evaluator_result: "Evaluator result",
  reflect: "Reflect",
  contribute: "Contribute",
  error: "Error",
};

function StepRow({ t }: { t: TraceEvent }) {
  return (
    <div className="flex flex-wrap items-baseline gap-x-2">
      <span className="font-mono text-xs text-muted">#{t.seq}</span>
      <Badge tone={t.result === "error" ? "bad" : t.type === "finish" ? "info" : "neutral"}>{t.type}</Badge>
      {t.selector && <code className="break-all font-mono text-xs">{t.selector}</code>}
      {t.value && <span className="break-words text-sm">{t.type === "finish" ? `“${t.value}”` : t.value}</span>}
      {t.error && <span className="text-sm text-bad">{t.error}</span>}
      <span className="ml-auto text-xs text-muted">{t.duration_ms} ms</span>
    </div>
  );
}

function summary(e: RunEvent): string | null {
  const p = e.payload;
  switch (e.event_type) {
    case "lookup": {
      const n = Array.isArray(p.returned) ? p.returned.length : 0;
      return `${n} lesson${n === 1 ? "" : "s"} returned (k=${p.k}, floor ${p.relevance_floor})`;
    }
    case "lookup_skipped":
      return String(p.reason ?? "");
    case "evaluator_result":
      return `${p.passed ? "passed" : "failed"} · score ${p.score}`;
    case "contribute":
      return p.deduplicated ? "matched an existing lesson (≥ 0.92 similarity), no new row" : "new lesson created";
    case "reflect":
      return String(p.root_cause ?? "");
    case "error":
      return String(p.message ?? p.error_code ?? "");
    default:
      return null;
  }
}

export function Timeline({ events }: { events: RunEvent[] }) {
  if (events.length === 0) return <EmptyState title="No events recorded yet" />;
  return (
    <ol className="relative space-y-3 border-l border-border pl-4">
      {events.map((e) => (
        <li key={e.id} className="relative">
          <span
            className={`absolute -left-[21px] top-1.5 h-2 w-2 rounded-full ${
              e.event_type === "error" ? "bg-bad" : e.event_type === "evaluator_result" ? "bg-accent" : "bg-muted"
            }`}
          />
          {e.event_type === "step" ? (
            <StepRow t={e.payload as unknown as TraceEvent} />
          ) : (
            <div className="flex flex-wrap items-baseline gap-x-2">
              <span className="text-sm font-medium">{LABEL[e.event_type] ?? e.event_type}</span>
              {summary(e) && <span className="text-sm text-muted">{summary(e)}</span>}
            </div>
          )}
          <div className="text-xs text-muted">{when(e.created_at)}</div>
        </li>
      ))}
    </ol>
  );
}
