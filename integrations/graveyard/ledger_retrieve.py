"""Drop-in replacement for graveyard-experiment's src/kb/inject.py retrieve().

Copy this file to src/kb/ledger_retrieve.py in the experiment repo and, in
scripts/run_with_kb.py, change

    from src.kb.inject import retrieve
to
    from src.kb.ledger_retrieve import retrieve

Everything else (format_notes, the runner, the judge, make_report.py) stays the
same, so the report measures the ledger's lookup instead of "every note for the
site". Retrieval runs once per task before any with-product run; the ledger must
not receive contributions during the evaluation (freeze it first).

Stdlib only. Config via env:
  LEDGER_API  base URL of the ledger API (default http://localhost:3000/api;
              use .../api/test-double to hit the UI's test double)
  LEDGER_K    max lessons per task (default 2, per the pilot finding)
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request
from typing import Any

DEFAULT_API = "http://localhost:3000/api"
DEFAULT_K = 2
TIMEOUT_S = 20


class LedgerError(RuntimeError):
    """Raised instead of returning [] so an outage can't masquerade as 'no notes'."""


def lookup(site: str, task_description: str, k: int | None = None, api: str | None = None) -> list[dict[str, Any]]:
    api = (api or os.environ.get("LEDGER_API") or DEFAULT_API).rstrip("/")
    k = k or int(os.environ.get("LEDGER_K", DEFAULT_K))
    body = json.dumps({"domain": site, "task_description": task_description, "k": k}).encode()
    req = urllib.request.Request(f"{api}/lookup", data=body, headers={"content-type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=TIMEOUT_S) as res:
            payload = json.load(res)
    except urllib.error.HTTPError as e:
        raise LedgerError(f"lookup {site!r}: HTTP {e.code} {e.read().decode(errors='replace')[:300]}") from e
    except (urllib.error.URLError, TimeoutError) as e:
        raise LedgerError(f"lookup {site!r}: ledger unreachable at {api}: {e}") from e
    lessons = payload.get("lessons")
    if not isinstance(lessons, list):
        raise LedgerError(f"lookup {site!r}: unexpected response {str(payload)[:300]}")
    return lessons


def to_kb_entry(lesson: dict[str, Any]):
    """Ledger lesson (PRD §05) → the experiment's KBEntry, the inverse of lib/pilot/notes.ts."""
    from src.kb.schema import KBEntry

    return KBEntry(
        id=lesson["id"],
        site=lesson["domain"],
        task_pattern=lesson["task_pattern"],
        applies_when=lesson.get("applies_when") or "",
        note=lesson.get("lesson_text") or "",
        success_signal=lesson.get("success_criteria"),
        irreversible_steps=list(lesson.get("risk_warnings") or []),
        handoff_points=list(lesson.get("handoff_points") or []),
        source_run_ids=[lesson["source_run_id"]] if lesson.get("source_run_id") else [],
        source="ledger",
    )


def retrieve(task, entries=None, top_k: int | None = None):
    """Same signature as inject.retrieve; `entries` is ignored — the ledger is the store."""
    k = min(top_k or int(os.environ.get("LEDGER_K", DEFAULT_K)), int(os.environ.get("LEDGER_K", DEFAULT_K)))
    return [to_kb_entry(l) for l in lookup(task.site, task.instruction, k)]
