"""Thread-safe card-keyed finding ledger for tracking batch anomalies and self-corrections.

Maintains a dataset-consistent status per card in data/batch_findings.json.
When cards are re-extracted or self-corrected, their status is updated to resolved.
"""

from __future__ import annotations
from datetime import datetime
import json
from pathlib import Path
import threading
from typing import Any, Dict, List, Optional

FINDINGS_FILE = Path(__file__).resolve().parent.parent.parent / "data" / "batch_findings.json"
_LOCK = threading.Lock()


def log_finding(
    card_name: str,
    issue_type: str,
    details: str,
    resolved: bool = False,
    raw_ability: str = "",
    card_identifier: str = ""
) -> None:
    """Records or updates a finding for a specific card thread-safely."""
    with _LOCK:
        findings: Dict[str, Any] = {}
        if FINDINGS_FILE.exists():
            try:
                content = json.loads(FINDINGS_FILE.read_text(encoding="utf-8"))
                if isinstance(content, dict):
                    findings = content
                elif isinstance(content, list):
                    for it in content:
                        if "card_name" in it:
                            findings[it["card_name"]] = it
            except Exception:
                findings = {}

        key = card_name
        history = findings.get(key, {}).get("history", [])
        history.append({
            "timestamp": datetime.now().isoformat(),
            "issue_type": issue_type,
            "details": details,
            "resolved": resolved
        })

        findings[key] = {
            "card_name": card_name,
            "card_identifier": card_identifier or findings.get(key, {}).get("card_identifier", ""),
            "issue_type": issue_type,
            "details": details,
            "resolved": resolved,
            "raw_ability": raw_ability or findings.get(key, {}).get("raw_ability", ""),
            "last_updated": datetime.now().isoformat(),
            "history": history
        }

        FINDINGS_FILE.parent.mkdir(parents=True, exist_ok=True)
        FINDINGS_FILE.write_text(json.dumps(findings, indent=2, ensure_ascii=False), encoding="utf-8")


def resolve_card_findings(card_name: str) -> None:
    """Marks any existing findings for a card as resolved upon successful extraction."""
    with _LOCK:
        if not FINDINGS_FILE.exists():
            return
        try:
            findings = json.loads(FINDINGS_FILE.read_text(encoding="utf-8"))
            if not isinstance(findings, dict):
                return
            if card_name in findings and not findings[card_name].get("resolved", False):
                findings[card_name]["resolved"] = True
                findings[card_name]["last_updated"] = datetime.now().isoformat()
                findings[card_name]["details"] += " (Resolved in subsequent run)"
                FINDINGS_FILE.write_text(json.dumps(findings, indent=2, ensure_ascii=False), encoding="utf-8")
        except Exception:
            pass


def get_findings_summary() -> Dict[str, Any]:
    """Generates a dataset-consistent summary of all recorded findings."""
    with _LOCK:
        if not FINDINGS_FILE.exists():
            return {"total": 0, "unresolved": 0, "by_type": {}, "unresolved_items": []}
        try:
            content = json.loads(FINDINGS_FILE.read_text(encoding="utf-8"))
            items: List[Dict[str, Any]] = list(content.values()) if isinstance(content, dict) else content
        except Exception:
            return {"total": 0, "unresolved": 0, "by_type": {}, "unresolved_items": []}

        unresolved = [it for it in items if not it.get("resolved", False)]
        by_type: Dict[str, int] = {}
        for it in items:
            t = it.get("issue_type", "UNKNOWN")
            by_type[t] = by_type.get(t, 0) + 1

        return {
            "total": len(items),
            "unresolved": len(unresolved),
            "by_type": by_type,
            "unresolved_items": unresolved
        }
