"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { POLL_INTERVAL_MS } from "./config";

export interface PollState<T> {
  data: T | null;
  error: Error | null;
  loading: boolean;
  refresh: () => void;
}

/**
 * Fetches once, then re-fetches every POLL_INTERVAL_MS (§09) until `stopWhen`
 * returns true for the latest data. `key` changes restart the cycle.
 */
export function usePolling<T>(
  fetcher: (() => Promise<T>) | null,
  key: string,
  opts: { stopWhen?: (data: T) => boolean; intervalMs?: number } = {},
): PollState<T> {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const [loading, setLoading] = useState(fetcher !== null);
  const [tick, setTick] = useState(0);
  const fetcherRef = useRef(fetcher);
  const stopRef = useRef(opts.stopWhen);
  fetcherRef.current = fetcher;
  stopRef.current = opts.stopWhen;
  const interval = opts.intervalMs ?? POLL_INTERVAL_MS;

  useEffect(() => {
    setData(null);
    setError(null);
    setLoading(fetcherRef.current !== null);
  }, [key]);

  useEffect(() => {
    if (!fetcherRef.current) return;
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const run = async () => {
      const f = fetcherRef.current;
      if (!f) return;
      try {
        const next = await f();
        if (cancelled) return;
        setData(next);
        setError(null);
        setLoading(false);
        if (stopRef.current?.(next)) return;
      } catch (e) {
        if (cancelled) return;
        setError(e as Error);
        setLoading(false);
      }
      timer = setTimeout(run, interval);
    };
    run();
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [key, tick, interval]);

  const refresh = useCallback(() => setTick((t) => t + 1), []);
  return { data, error, loading, refresh };
}
