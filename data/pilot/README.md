# Pilot snapshot (17 Oct 2026)

Copied from [airjan-airlines/graveyard-experiment](https://github.com/airjan-airlines/graveyard-experiment)
at commit `842b762` ("Add pilot results: baseline + KB rerun on Groq gpt-oss-120b").

- `kb_notes.json` — the 17 frozen KB notes (`out/kb_notes.json`), written automatically from baseline
  failures. Seed set for the ledger's lessons; the test double loads them, and
  `scripts/pilot-notes-to-lessons.ts` maps them to the PRD §05 `lessons` shape.
- `tasks.json` — id, site and instruction of the 24 pilot tasks (`tasks/tasks.yaml`), for `scripts/calibrate-floor.ts`.
- `results.json` — the `baseline`, `failures`, `waste`, `kb_effect`, `judge_validation` and `kb` sections
  of `out/results.json`. Read by the Overview screen's "Pilot benchmark" panel.

Agent and judge were both `openai/gpt-oss-120b` on Groq, text-only. The judge was not hand-validated.
Do not edit these files by hand; re-copy them from the experiment repo and update the commit above.
