/**
 * Test-double similarity: cosine over binary bags of content words. Lexical,
 * not semantic — it stands in for text-embedding-3-small (§05) only so the UI
 * and demo flow run without an OpenAI key. Lane A's lookup is the real one.
 */

const STOP = new Set(
  "a an and are as at be by for from in into is it its of on or that the this to with use using via your their".split(" "),
);

export function tokens(text: string): Set<string> {
  const out = new Set<string>();
  for (const raw of text.toLowerCase().split(/[^a-z0-9]+/)) {
    if (!raw || STOP.has(raw)) continue;
    // crude plural folding so "hours"/"hour" and "boxes"/"box" meet
    out.add(raw.length > 3 && raw.endsWith("s") && !raw.endsWith("ss") ? raw.slice(0, -1) : raw);
  }
  return out;
}

export function similarity(a: string, b: string): number {
  const ta = tokens(a);
  const tb = tokens(b);
  if (ta.size === 0 || tb.size === 0) return 0;
  let shared = 0;
  for (const t of ta) if (tb.has(t)) shared++;
  return shared / Math.sqrt(ta.size * tb.size);
}
