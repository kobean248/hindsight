# Agent Ledger — 90-second pitch plan (3 speakers)

**Dependency, stated plainly:** this script requires Lane B's real
execution adapter and Lane C's Run Inspector screen (PRD §09 Screen C,
specifically the baseline-vs-transfer side-by-side view) to exist and to
have produced one real, evaluator-graded run pair before you walk on
stage. As of now, neither is built — Lane A's data/scoring/MCP layer is
done, Lane B/C aren't. Don't schedule this pitch before both land and
you've rehearsed the pair at least twice (PRD §10).

## Why no live execution during the 90 seconds

A live Freestyle VM + agent + WebArena round trip can itself run minutes,
and that's before either of you say a word (PRD §13's cold-start risk).
Spending the slot on a live run risks losing the whole pitch to a spinner.
Instead: **run the baseline-fail → lesson → transfer-success pair for
real, that morning**, load the resulting run pair into the Run Inspector,
and present that — real persisted evidence, just not computed live. This
is honest (it's a real run, real evaluator result) without betting the
pitch on infra timing.

If your format has a longer demo table/booth round afterward, that's the
place to run it live for real — not the 90-second stage slot.

## Speaker roles

Map to whichever lane fits your team's actual comfort on stage, not
necessarily 1:1 to who built it — but this is the default:

| Speaker | Default lane | Carries |
|---|---|---|
| **P1** | Lane B or whoever opens strongest | Hook + thesis (0:00–0:20) |
| **P2** | Lane C (owns the UI, knows it cold) | Drives the laptop and narrates the demo (0:20–0:55) |
| **P3** | Lane A (owns scoring/MCP, knows the rigor story) | Verification rigor + architecture + close (0:55–1:30) |

One person's hands are on the keyboard the entire time (P2) — don't pass
the laptop mid-pitch.

## The script

Timestamps are cumulative; read it once with a stopwatch before trusting
the timing. ~195 words total, including pauses while pointing at the
screen.

**0:00–0:20 — P1, problem + thesis (off the laptop, facing the room)**

> "Every AI agent run starts from zero. An agent fails a task, someone
> figures out why — and the next agent, seconds later, walks into the
> exact same wall.
>
> Agent Ledger is Stack Overflow for AI agents: when one agent learns
> something the hard way, every other agent gets to skip the mistake."

**0:20–0:55 — P2, live on the Run Inspector screen (pre-loaded to the rehearsed run pair)**

> "Watch. Agent A tries this task cold — fails, right here, missing this
> step. *(point at the baseline trace/evaluator evidence)*
>
> Our system watched that failure, diagnosed the root cause, and wrote
> this lesson automatically — no human postmortem. *(point at the lesson
> card: root cause / lesson text)*
>
> Now Agent B — fresh, never saw Agent A run — looks that lesson up, and
> succeeds. *(point at the transfer run's pass result)*
>
> And that's not Agent B's word for it — an independent evaluator checked
> the actual page state and confirmed it." *(point at the raw evaluator
> evidence, not just a green checkmark)*

**0:55–1:10 — P3, off the laptop**

> "Confidence only ever moves from a verified outcome — never from an
> agent just claiming success. That's the trust problem with
> self-improving agents, solved."

**1:10–1:22 — P3, continues**

> "It's one Postgres ledger behind an MCP server, so literally any agent
> — Claude, GPT, your own — can plug in and start learning from it."

**1:22–1:30 — P1 or P3, whoever closes strongest, direct to the room**

> "When one agent learns the hard way, every other agent benefits.
> That's Agent Ledger."

## Demo staging checklist (do this before you're called up)

- [ ] The rehearsed baseline-fail/lesson/transfer-success run pair exists in the database — real evaluator evidence on both runs, not seeded/fake rows (Implementation Contract rule 5).
- [ ] The Run Inspector is already open to that exact run pair's side-by-side view — P2 should need **zero clicks** to get there once on stage; any search/filter step eats seconds you don't have.
- [ ] Browser zoom/font size checked on the actual presentation display beforehand — nothing is more common than evidence text being too small for the back of the room.
- [ ] A screen recording of this exact walkthrough exists as a backup, labeled as a recording if it ever has to be shown (PRD §10's honesty rule — never pass a recording off as live if you don't have to use it).
- [ ] Wi-Fi/VPN at the venue confirmed to reach your Supabase project and deployed app beforehand — if the venue network is hostile, the backup recording is not optional.
- [ ] Rehearsed twice, out loud, with a stopwatch, by all three speakers together — not just read silently. The handoffs between speakers are where pitches actually lose time.

## If you're over time in rehearsal

Cut from the middle out, not the ends — the opening hook and the closing
line are what judges remember; the demo narration (0:20–0:55) is where
there's slack. Drop the "evaluator confirmed it" line before you drop
anything else — if you only have time to point at one thing, point at
the pass/fail evidence, not the UI chrome around it.
