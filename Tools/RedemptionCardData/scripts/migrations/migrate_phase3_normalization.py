"""Idempotent Phase 3 normalization migration for AI-generated ability ASTs.

Cleans verb/clause/zone noise from ``target.identifiers`` (``"block"`` and
non-whitelist ``automatic_self`` fragments), repairs Isaiah's false Star
prefix, enforces ``triggered`` / ``star_phase`` on all genuine Star abilities,
and normalizes plain entry/play ``manually_triggered`` abilities to
``immediate`` while preserving genuine costed, limited, placed, phase-gated,
and permanent-card abilities.
"""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))

from models.enums import ActivationMode, ModifierType, SelectionMode
from models.logic.card_logic import CardSideLogic
from models.logic.target_selector import (
    AUTOMATIC_SELF_IDENTIFIER_WHITELIST,
    TargetSelector,
    VERB_ACTION_IDENTIFIER_NOISE,
)
from scripts.fact_matrix import extract_ast_facts, verify_fact_matrix
from scripts.utils.card_helpers import get_card_name, get_side_field

EXT_PATH = BASE_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"
AI_PATH = BASE_DIR / "data" / "ai_generated_abilities.json"

_PERMANENT_TYPE_TOKENS = (
    "artifact",
    "site",
    "fortress",
    "city",
    "covenant",
    "curse",
    "lost soul",
)

# Genuine recurring/activation limit text patterns (unlike draw/stat X caps such as "limit 3").
_GENUINE_LIMIT_SA_RE = re.compile(
    r"\b(?:once|twice|three\s+times)\s+per\b"
    r"|\bmay\s+be\s+used\s+(?:once|twice|each\s+turn)\b"
    r"|\beach\s+(?:turn|round|upkeep)\b"
    r"|\blimit\s+(?:once|twice)\s+per\b"
    r"|\bper\s+(?:turn|game|round)\b",
    re.IGNORECASE,
)

# Clauses that represent ongoing territory/placed, phase-specific, or per-turn/game activations.
_MANUAL_CLAUSE_KEEP_IDS = frozenset({
    "place_in_territory",
    "place_on_hero_prevent_enhancements",
    "place_on_lost_soul",
    "place_on_lost_soul_site",
    "place_chariots_on_temple",
    "fear_of_danger_place_and_prevent",
    "discard_top_of_deck_each_upkeep",
    "return_any_cards_to_top_of_deck_during_discard_phase",
    "play_cloud_enhancement",
    "play_genesis_enhancement",
    "abraham_blocked_play_enhancement",
    "search_and_convert_saul",
    "providing_angel_heal",
})

_MANUAL_PHASE_SA_RE = re.compile(
    r"\b(?:during\s+(?:upkeep|discard\s+phase|preparation\s+phase|draw\s+phase)|"
    r"each\s+upkeep|at\s+any\s+time|any\s+time\s+during)\b",
    re.IGNORECASE,
)


def _resolve_card_type(card: Dict[str, Any], side: str) -> str:
    """Resolves the canonical Card Type for an AI entry side key."""
    base_side = "top" if side in ("shared", "star") else side
    ctype = (get_side_field(card, base_side, "Type") or "").strip()
    if not ctype:
        ctype = (get_side_field(card, "top", "Type") or card.get("Type") or "").strip()
    return ctype


def _sanitize_selector_dict(
    sel_dict: Optional[Dict[str, Any]],
    entry_key: str,
    counts: Counter,
    enforce_self_whitelist: bool = False,
) -> None:
    """Cleans verb/clause fragments out of a TargetSelector dictionary in-place.

    Args:
        sel_dict: Raw target or condition selector dictionary.
        entry_key: Source AI entry key for targeted structural repairs.
        counts: Migration statistics counter.
        enforce_self_whitelist: True for effect/cost targets where non-whitelist
            ``automatic_self`` identifiers must be stripped.
    """
    if not isinstance(sel_dict, dict):
        return

    # Targeted fix for Headquarters at Riblah cost referring to Fortress via Artifact type.
    if (
        entry_key == "-569251240_top"
        and sel_dict.get("selection_mode") == SelectionMode.AUTOMATIC_SELF.value
        and sel_dict.get("target_type") == "artifact"
        and "this Fortress" in (sel_dict.get("identifiers") or [])
    ):
        sel_dict["target_type"] = "fortress"
        counts["headquarters_target_type_fixed"] += 1

    raw_idents = list(sel_dict.get("identifiers") or [])
    block_hits = sum(1 for ident in raw_idents if str(ident).strip().lower() in VERB_ACTION_IDENTIFIER_NOISE)
    if block_hits:
        counts["removed_block_identifier"] += block_hits

    # Run TargetSelector attribute extraction first (also drops VERB_ACTION_IDENTIFIER_NOISE).
    normalized = TargetSelector.model_validate(sel_dict).model_dump(exclude_none=True, mode="json")
    for field in ("identifiers", "target_type"):
        if field in normalized:
            sel_dict[field] = normalized[field]
        elif field in sel_dict and normalized.get(field) is None:
            sel_dict.pop(field, None)

    if enforce_self_whitelist and sel_dict.get("selection_mode") == SelectionMode.AUTOMATIC_SELF.value:
        post_idents = list(sel_dict.get("identifiers") or [])
        if post_idents:
            kept: List[str] = []
            for ident in post_idents:
                if str(ident).strip().lower() in AUTOMATIC_SELF_IDENTIFIER_WHITELIST:
                    kept.append(ident)
                else:
                    counts["removed_autoself_noise"] += 1
            if len(kept) != len(post_idents):
                sel_dict["identifiers"] = kept


def _should_keep_manually_triggered(
    ability: Dict[str, Any],
    card_type: str,
    raw_sa: str,
) -> bool:
    """Returns True if a non-star ability has genuine manual, permanent, cost, or limit gating."""
    if any(perm in card_type.lower() for perm in _PERMANENT_TYPE_TOKENS):
        return True
    if ability.get("trigger_event"):
        return True
    if ability.get("costs"):
        return True

    ab_id = str(ability.get("ability_id") or "")
    if ab_id in _MANUAL_CLAUSE_KEEP_IDS:
        return True

    mods = ability.get("modifiers") or []
    has_genuine_limit = any(m.get("modifier_type") == ModifierType.LIMIT.value for m in mods)
    if has_genuine_limit:
        return True

    # Preserve single-clause / whole-card genuine frequency or phase-gated manual abilities.
    if _GENUINE_LIMIT_SA_RE.search(raw_sa) and "may band to shechem" not in ab_id.lower():
        if ab_id != "band_to_shechem":
            return True

    if _MANUAL_PHASE_SA_RE.search(raw_sa):
        # Do not hold unrelated immediate clauses if a separate clause handles the phase trigger,
        # except when no specific clause-level id excluded it.
        if ab_id not in ("",):
            sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+", raw_sa) if s.strip()]
            if len(sentences) <= 1:
                return True
    return False


def _strip_spurious_limit_modifiers(
    ability: Dict[str, Any],
    raw_sa: str,
    counts: Counter,
) -> None:
    """Removes spurious limit modifiers generated from X-value caps (e.g. 'draw X (limit 3)')."""
    mods = ability.get("modifiers")
    if not isinstance(mods, list) or not mods:
        return
    if _GENUINE_LIMIT_SA_RE.search(raw_sa):
        return
    filtered = [m for m in mods if m.get("modifier_type") != ModifierType.LIMIT.value]
    if len(filtered) != len(mods):
        ability["modifiers"] = filtered
        counts["removed_spurious_limit_modifier"] += len(mods) - len(filtered)


def migrate_ai_data(
    ai_data: Dict[str, Any],
    ext_by_id: Dict[str, Dict[str, Any]],
) -> Tuple[Dict[str, Any], Counter, List[str]]:
    """Applies Phase 3 deterministic normalization over a deep copy of AI ability data.

    Args:
        ai_data: Parsed ``data/ai_generated_abilities.json`` dictionary.
        ext_by_id: Mapping of string card IDs to ``cards_extended`` records.

    Returns:
        Tuple of ``(migrated_data, change_counts, validation_errors)``.
    """
    migrated = copy.deepcopy(ai_data)
    counts: Counter = Counter()
    errors: List[str] = []

    for key, entry in migrated.items():
        if not isinstance(entry, dict):
            continue
        ast = entry.get("ast")
        if not isinstance(ast, dict) or not isinstance(ast.get("abilities"), list):
            continue

        cid = str(entry.get("card_id") or (key.rsplit("_", 1)[0] if "_" in key else key))
        side = str(entry.get("side") or (key.rsplit("_", 1)[1] if "_" in key else "top"))
        card = ext_by_id.get(cid, {})
        raw_sa = str(entry.get("raw_ability") or get_side_field(card, side if side != "star" else "top", "SpecialAbility") or "")
        card_type = _resolve_card_type(card, side)
        is_star_side = side == "star" or bool(entry.get("is_star")) and raw_sa.strip().upper().startswith("STAR:")
        entry_modified = False

        for ab in ast["abilities"]:
            if not isinstance(ab, dict):
                continue

            # 1. Fix Isaiah's false star_* prefix on regular static ability.
            if key == "139226334_top" and ab.get("ability_id") == "star_cards_cannot_be_negated":
                ab["ability_id"] = "marked_star_cards_cannot_be_negated"
                ab["is_star"] = False
                ab.pop("trigger_event", None)
                ab["activation_mode"] = ActivationMode.STATIC.value
                counts["fixed_isaiah_false_star"] += 1
                entry_modified = True

            # 2. Clean target identifiers across effects, costs (self whitelist), and conditions ('block' only).
            for eff in ab.get("effects") or []:
                before_eff = json.dumps(eff.get("target"), sort_keys=True)
                _sanitize_selector_dict(eff.get("target"), key, counts, enforce_self_whitelist=True)
                if json.dumps(eff.get("target"), sort_keys=True) != before_eff:
                    entry_modified = True
            for cost in ab.get("costs") or []:
                before_cost = json.dumps(cost.get("target"), sort_keys=True)
                _sanitize_selector_dict(cost.get("target"), key, counts, enforce_self_whitelist=True)
                if json.dumps(cost.get("target"), sort_keys=True) != before_cost:
                    entry_modified = True
            for cond in ab.get("conditions") or []:
                before_cond = json.dumps(cond.get("selector"), sort_keys=True)
                _sanitize_selector_dict(cond.get("selector"), key, counts, enforce_self_whitelist=False)
                if json.dumps(cond.get("selector"), sort_keys=True) != before_cond:
                    entry_modified = True

            # 3. Enforce triggered + star_phase on all genuine Star abilities.
            ab_id = str(ab.get("ability_id") or "")
            trig_low = str(ab.get("trigger_event") or "").strip().lower()
            is_genuine_star = bool(
                ab.get("is_star")
                or is_star_side
                or trig_low in ("star_phase", "star")
                or ab_id.lower().startswith("star_")
            )
            if is_genuine_star:
                changed_star = False
                if not ab.get("is_star"):
                    ab["is_star"] = True
                    changed_star = True
                if ab.get("trigger_event") != "star_phase":
                    ab["trigger_event"] = "star_phase"
                    changed_star = True
                if not ab_id.lower().startswith("star_"):
                    ab["ability_id"] = f"star_{ab_id or 'ability'}"
                    changed_star = True
                if ab.get("activation_mode") != ActivationMode.TRIGGERED.value:
                    ab["activation_mode"] = ActivationMode.TRIGGERED.value
                    changed_star = True
                if changed_star:
                    counts["normalized_star_activation"] += 1
                    entry_modified = True
                continue

            # 4. Normalize plain entry/play manually_triggered abilities to immediate.
            if ab.get("activation_mode") == ActivationMode.MANUALLY_TRIGGERED.value:
                before_mods = json.dumps(ab.get("modifiers"), sort_keys=True)
                _strip_spurious_limit_modifiers(ab, raw_sa, counts)
                if json.dumps(ab.get("modifiers"), sort_keys=True) != before_mods:
                    entry_modified = True
                if not _should_keep_manually_triggered(ab, card_type, raw_sa):
                    ab["activation_mode"] = ActivationMode.IMMEDIATE.value
                    counts["converted_manual_to_immediate"] += 1
                    entry_modified = True
                else:
                    counts["preserved_genuine_manual"] += 1

        if entry_modified:
            counts["modified_entries"] += 1
            try:
                side_model = CardSideLogic.model_validate(ast)
                ok_fm, fm_issues = verify_fact_matrix(raw_sa, extract_ast_facts(side_model))
                if not ok_fm:
                    errors.append(f"{key} ({get_card_name(card)}): fact_matrix issues: {fm_issues}")
            except Exception as exc:
                errors.append(f"{key} ({get_card_name(card)}): validation error: {exc}")

    return migrated, counts, errors


def main() -> int:
    """CLI entrypoint for executing or dry-running the Phase 3 normalization migration."""
    parser = argparse.ArgumentParser(description="Phase 3 deterministic AST normalization migration")
    parser.add_argument("--dry-run", action="store_true", help="Compute changes without writing ai_generated_abilities.json")
    args = parser.parse_args()

    ext_cards = json.loads(EXT_PATH.read_text(encoding="utf-8"))["cards"]
    ext_by_id = {str(c.get("Id") or c.get("id")): c for c in ext_cards}
    ai_data = json.loads(AI_PATH.read_text(encoding="utf-8"))

    migrated, counts, errors = migrate_ai_data(ai_data, ext_by_id)

    print("Phase 3 Migration Summary:")
    for stat_key, stat_val in sorted(counts.items()):
        print(f"  {stat_key}: {stat_val}")
    print(f"  validation_errors: {len(errors)}")
    for err in errors[:20]:
        print(f"  ERROR: {err}")

    if errors:
        return 1

    if not args.dry_run and counts["modified_entries"] > 0:
        AI_PATH.write_text(json.dumps(migrated, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")
        print(f"Updated {AI_PATH}")
    elif args.dry_run:
        print("Dry-run complete; no files written.")
    else:
        print("No changes needed (already idempotent).")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
