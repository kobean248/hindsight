"use client";

import { useEffect, useState } from "react";
import { api } from "@/lib/ui/api-client";
import { RELEVANCE_FLOOR } from "@/lib/ui/config";
import type { Lesson, LessonStatus, RankedLesson } from "@/lib/ui/contracts";
import { EmptyState, ErrorState, LoadingState } from "@/components/ui";
import { LessonCard } from "./lesson-card";

type Result =
  | { kind: "list"; lessons: Lesson[] }
  | { kind: "search"; query: string; lessons: RankedLesson[]; domainsSearched: string[] };

const SEARCH_K = 10;

export function LessonsBrowser() {
  const [domains, setDomains] = useState<string[]>([]);
  const [domain, setDomain] = useState("");
  const [status, setStatus] = useState<LessonStatus | "">("");
  const [draft, setDraft] = useState("");
  const [query, setQuery] = useState("");
  const [result, setResult] = useState<Result | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const listed = await api.listLessons({ domain, status });
        if (cancelled) return;
        setDomains(listed.domains);
        if (!query) {
          setResult({ kind: "list", lessons: listed.lessons });
        } else {
          // lookup is per-domain (§07); with no domain chosen, ask each one and merge.
          const targets = domain ? [domain] : listed.domains;
          const per = await Promise.all(targets.map((d) => api.lookup(d, query, SEARCH_K)));
          if (cancelled) return;
          const merged = per
            .flatMap((r) => r.lessons)
            .filter((l) => !status || l.status === status)
            .sort((a, b) => b.rank_score - a.rank_score)
            .slice(0, SEARCH_K);
          setResult({ kind: "search", query, lessons: merged, domainsSearched: targets });
        }
      } catch (e) {
        if (!cancelled) setError(e as Error);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [domain, status, query, attempt]);

  return (
    <div className="space-y-4">
      <form
        className="flex flex-col gap-2 sm:flex-row"
        onSubmit={(e) => {
          e.preventDefault();
          setQuery(draft.trim());
        }}
      >
        <input
          type="search"
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            if (!e.target.value) setQuery("");
          }}
          placeholder="Search by task description, e.g. find a post office's Saturday hours"
          className="min-w-0 flex-1 rounded-md border border-border bg-surface px-3 py-2 text-sm"
          maxLength={2000}
          aria-label="Search lessons by task description"
        />
        <div className="flex gap-2">
          <select
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            className="min-w-0 flex-1 rounded-md border border-border bg-surface px-2 py-2 text-sm"
            aria-label="Filter by domain"
          >
            <option value="">All domains</option>
            {domains.map((d) => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
          <select
            value={status}
            onChange={(e) => setStatus(e.target.value as LessonStatus | "")}
            className="rounded-md border border-border bg-surface px-2 py-2 text-sm"
            aria-label="Filter by status"
          >
            <option value="">Any status</option>
            <option value="active">Active</option>
            <option value="decayed">Decayed</option>
            <option value="retired">Retired</option>
          </select>
          <button type="submit" className="btn btn-accent">
            Search
          </button>
        </div>
      </form>

      {loading && <LoadingState label="Loading lessons…" />}
      {!loading && error && <ErrorState error={error} onRetry={() => setAttempt((a) => a + 1)} />}
      {!loading && !error && result && <Results result={result} domain={domain} />}
    </div>
  );
}

function Results({ result, domain }: { result: Result; domain: string }) {
  if (result.kind === "search") {
    if (result.lessons.length === 0) {
      return (
        <EmptyState title={`No lesson cleared the ${RELEVANCE_FLOOR} relevance floor`}>
          Nothing is returned rather than something irrelevant: an agent asking this would get an empty list and run
          without injected lessons.
        </EmptyState>
      );
    }
    return (
      <>
        <p className="text-xs text-muted">
          {result.lessons.length} lesson{result.lessons.length > 1 ? "s" : ""} at or above similarity {RELEVANCE_FLOOR}, ranked by
          0.7 × similarity + 0.3 × confidence.
        </p>
        <ul className="space-y-3">
          {result.lessons.map((l) => (
            <LessonCard key={l.id} lesson={l} />
          ))}
        </ul>
      </>
    );
  }
  if (result.lessons.length === 0) {
    return (
      <EmptyState title={domain ? `No lessons yet for ${domain}` : "No lessons yet"}>
        Lessons appear here once Reflect diagnoses a verified failure and contributes one.
      </EmptyState>
    );
  }
  return (
    <ul className="space-y-3">
      {result.lessons.map((l) => (
        <LessonCard key={l.id} lesson={l} />
      ))}
    </ul>
  );
}
