import { DATA_SOURCE } from "@/lib/ui/config";
import { json } from "@/lib/http/respond";

/** The fake routes answer only in test-double mode, so live mode can't silently read fake data. */
export function testDoubleDisabled() {
  return DATA_SOURCE === "live" ? json({ error: "test double is disabled in live mode" }, 404) : null;
}
