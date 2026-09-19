"""Pipeline Stage 11: Semantic Ability Audit & Round-Trip Validator

Combines local semantic embeddings (SentenceTransformer) with a generic
fact-matrix invariant check to evaluate card AST fidelity completely offline.
"""

from __future__ import annotations
import json
from pathlib import Path
import re
import sys
from typing import Any, Dict, List, Set, Tuple
from sentence_transformers import SentenceTransformer

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.extend([str(Path(__file__).resolve().parent), str(BASE_DIR)])

from models.logic.card_logic import CardSideLogic
from ability_decompiler import decompile_card_side

AI_OUTPUT_FILE = BASE_DIR / "data" / "ai_generated_abilities.json"
REPORT_FILE = BASE_DIR / "data" / "semantic_audit_report.md"

# Load local embedding model once (cached in memory)
EMBED_MODEL = SentenceTransformer("all-MiniLM-L6-v2")


from fact_matrix import extract_ast_facts, verify_fact_matrix


def _build_id_lookup() -> Dict[str, str]:
    """Builds a lookup mapping card keys and names to 32-bit Coliseum IDs."""
    cards_file = BASE_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"
    if not cards_file.exists():
        return {}
    try:
        cards_data = json.loads(cards_file.read_text(encoding="utf-8"))
        lookup: Dict[str, str] = {}
        for c in cards_data.get("cards", []):
            cid = str(c.get("Id", ""))
            ident = c.get("Identifier", "")
            for sname, side in c.get("CardSides", {}).items():
                if not side:
                    continue
                name = side.get("Name", "")
                if name:
                    lookup[f"{ident}_{name}_{sname}"] = cid
                    lookup[f"{name}_{sname}"] = cid
                    lookup[name] = cid
        return lookup
    except Exception:
        return {}


def audit_cards() -> None:
    """Performs semantic embedding comparison and fact-matrix audit on all ASTs."""
    if not AI_OUTPUT_FILE.exists():
        print(f"File not found: {AI_OUTPUT_FILE}")
        return

    data: Dict[str, Any] = json.loads(AI_OUTPUT_FILE.read_text(encoding="utf-8"))
    id_map = _build_id_lookup()
    print(f"Running offline Hybrid-Audit on {len(data)} AI-generated card ASTs...")

    raw_texts: List[str] = []
    decomp_texts: List[str] = []
    cards_info: List[Dict[str, Any]] = []

    # First pass: decompile and extract facts
    for key, entry in data.items():
        name = entry.get("card_name", key)
        raw = entry.get("raw_ability", "")
        ast_dict = entry.get("ast", {})

        try:
            side_logic = CardSideLogic.model_validate(ast_dict)
            decomp = decompile_card_side(side_logic)
            ast_facts = extract_ast_facts(side_logic)
            passed_facts, fact_issues = verify_fact_matrix(raw, ast_facts)
        except Exception as e:
            decomp = f"PARSE_ERROR: {e}"
            passed_facts, fact_issues = False, [str(e)]

        raw_texts.append(raw)
        decomp_texts.append(decomp)
        cards_info.append({
            "key": key, "name": name, "raw": raw, "decomp": decomp,
            "id": entry.get("card_id") or id_map.get(key, id_map.get(name, "N/A")),
            "passed_facts": passed_facts, "issues": fact_issues
        })

    # Second pass: Batch compute local semantic embeddings (extremely fast)
    print("Computing local semantic embeddings via all-MiniLM-L6-v2...")
    raw_embeds = EMBED_MODEL.encode(raw_texts, normalize_embeddings=True, show_progress_bar=False)
    decomp_embeds = EMBED_MODEL.encode(decomp_texts, normalize_embeddings=True, show_progress_bar=False)

    import numpy as np
    sims = np.sum(raw_embeds * decomp_embeds, axis=1)

    high_fidelity: List[Dict[str, Any]] = []
    moderate_fidelity: List[Dict[str, Any]] = []
    review_required: List[Dict[str, Any]] = []

    for idx, info in enumerate(cards_info):
        score = float(sims[idx])
        passed_facts = info["passed_facts"]
        item = {**info, "score": round(score, 3)}

        if passed_facts and score >= 0.82:
            high_fidelity.append(item)
        elif passed_facts and score >= 0.68:
            moderate_fidelity.append(item)
        else:
            review_required.append(item)

    review_required.sort(key=lambda x: x["score"])
    high_fidelity.sort(key=lambda x: x["score"], reverse=True)
    moderate_fidelity.sort(key=lambda x: x["score"], reverse=True)

    total = len(cards_info)
    pct_high = (len(high_fidelity) / total * 100) if total else 0
    pct_mod = (len(moderate_fidelity) / total * 100) if total else 0
    pct_rev = (len(review_required) / total * 100) if total else 0

    lines: List[str] = [
        "# Hybrid Semantic Ability Audit Report",
        "",
        "Evaluated via offline sentence embeddings (`all-MiniLM-L6-v2`) and factual game-mechanic matrix.",
        "",
        "## Summary Metrics",
        f"- **Total Cards Audited:** {total}",
        f"- **High Fidelity (>= 0.82):** {len(high_fidelity)} ({pct_high:.1f}%)",
        f"- **Moderate Fidelity (0.68 - 0.81):** {len(moderate_fidelity)} ({pct_mod:.1f}%)",
        f"- **Review Required (< 0.68 or Fact Invariant Failure):** {len(review_required)} ({pct_rev:.1f}%)",
        "",
        "---",
        "## Review Required Cards (Prioritized for Inspection)",
        ""
    ]

    for it in review_required:
        lines.append(f"### {it['name']} [ID: {it['id']}] (Score: {it['score']})")
        lines.append(f"- **Key:** `{it['key']}`")
        lines.append(f"- **Original:** *\"{it['raw']}\"*")
        lines.append(f"- **Decompiled:** *\"{it['decomp']}\"*")
        if it["issues"]:
            lines.append(f"- **Fact Violations:** {', '.join(it['issues'])}")
        lines.append("")

    lines.extend(["---", "## High Fidelity Samples (Top Mechanical Alignment)", ""])
    for it in high_fidelity[:15]:
        lines.append(f"- **{it['name']} [ID: {it['id']}]** (Score: {it['score']}):")
        lines.append(f"  - *Key:* `{it['key']}`")
        lines.append(f"  - *Orig:* \"{it['raw']}\"")
        lines.append(f"  - *AST:*  \"{it['decomp']}\"")

    lines.extend(["", "---", "## Moderate Fidelity Samples", ""])
    for it in moderate_fidelity[:10]:
        lines.append(f"- **{it['name']} [ID: {it['id']}]** (Score: {it['score']}):")
        lines.append(f"  - *Key:* `{it['key']}`")
        lines.append(f"  - *Orig:* \"{it['raw']}\"")
        lines.append(f"  - *AST:*  \"{it['decomp']}\"")

    REPORT_FILE.write_text("\n".join(lines), encoding="utf-8")
    print(f"\nAudit complete! Report written to {REPORT_FILE}")


if __name__ == "__main__":
    audit_cards()
