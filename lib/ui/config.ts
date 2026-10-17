/**
 * Where the UI reads data from. `test_double` serves an in-process fake
 * (app/api/test-double/*) so the screens work before Lane A's routes exist;
 * `live` reads Lane A's real routes under /api. NEXT_PUBLIC_ so the server
 * and the browser agree on the same value.
 */
export type DataSource = "test_double" | "live";

export const DATA_SOURCE: DataSource =
  process.env.NEXT_PUBLIC_LEDGER_SOURCE === "live" ? "live" : "test_double";

export const API_BASE = DATA_SOURCE === "live" ? "/api" : "/api/test-double";

/** §09: poll getRun/getDashboard every 2 seconds. */
export const POLL_INTERVAL_MS = 2000;

/** §06 relevance floor (0.55 for all-MiniLM-L6-v2, see scripts/calibrate-floor.ts), shown in the UI next to every similarity score. */
export const RELEVANCE_FLOOR = 0.55;
