"""Idempotent Phase 2 migration for group booleans, canonical Royalty/lamb tags, and Temple ASTs.

Applies schema upgrades across ``data/ai_generated_abilities.json`` and
``data/card_abilities_raw.json``:
1. Splits mixed OR targets involving Temple / Tabernacle / Star / Meek / Royal
   into structured ``any_of`` branches (preserving ``selection_mode`` and
   ``count`` on the enclosing parent selector).
2. Fixes card-specific Temple / Tabernacle bugs (Zerubbabel target_type,
   Temple Dedication, A Royal Priesthood, Chronicles of the Kings, Desecrate
   the Temple, Filling Zerubbabel's Temple, Temple Priests, Captain of the
   Temple Guard, Bezaleel, Oholiab, Purging Evil, King Abijam, etc.).
3. Normalizes standalone group tokens (``Meek``, ``Gospel``, ``Cloud``, ``*``,
   ``Star``, ``lamb icon``, ``Royal`` / verbose Royalty) into typed booleans
   and canonical ORDIR tags.

Usage:
    python scripts/migrations/migrate_phase2_groups_and_temple.py --dry-run
    python scripts/migrations/migrate_phase2_groups_and_temple.py
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

BASE_DIR = Path(__file__).resolve().parents[2]
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from models.logic.card_logic import CardSideLogic  # noqa: E402

AI_FILE = BASE_DIR / "data" / "ai_generated_abilities.json"
RAW_FILE = BASE_DIR / "data" / "card_abilities_raw.json"

_ROYAL_SYNONYMS = {
    "royal",
    "royals",
    "royal family",
    "member of any royal family",
    "members of any royal family",
    "royalty (or royal or member of a royal family)",
}

_GROUP_BOOL_TOKENS: Dict[str, Tuple[str, Optional[str]]] = {
    "meek": ("is_meek", None),
    "gospel": ("is_gospel", None),
    "cloud": ("is_cloud", None),
    "cloud card": ("is_cloud", "card"),
    "cloud cards": ("is_cloud", "card"),
    "star": ("is_star", None),
    "star card": ("is_star", "card"),
    "star cards": ("is_star", "card"),
    "*": ("is_star", None),
    "* card": ("is_star", "card"),
    "* cards": ("is_star", "card"),
}

_LAMB_ICON_TOKENS = {"lamb icon", "lamb icon card", "lamb icon cards"}

_CHRONICLES_LO_CARDS = {"-387607069", "2132888307"}


def _iter_side_selectors(side_dict: Dict[str, Any]) -> List[Dict[str, Any]]:
    """Collects all mutable TargetSelector dicts inside a CardSideLogic dict.

    Args:
        side_dict: Serialized CardSideLogic dictionary.

    Returns:
        List of nested selector dictionary references.
    """
    selectors: List[Dict[str, Any]] = []

    def _collect(sel: Any) -> None:
        if not isinstance(sel, dict):
            return
        selectors.append(sel)
        for branch in sel.get("any_of") or []:
            _collect(branch)
        cnt = sel.get("count")
        if isinstance(cnt, dict):
            dyn = cnt.get("dynamic")
            if isinstance(dyn, dict) and isinstance(dyn.get("selector"), dict):
                _collect(dyn["selector"])

    for ab in side_dict.get("abilities") or []:
        if not isinstance(ab, dict):
            continue
        _collect(ab.get("trigger_filter"))
        for cond in ab.get("conditions") or []:
            if isinstance(cond, dict):
                _collect(cond.get("selector"))
        for cost in ab.get("costs") or []:
            if isinstance(cost, dict):
                _collect(cost.get("target"))
                for mkey in ("strength_mod", "toughness_mod"):
                    mval = cost.get(mkey)
                    if isinstance(mval, dict) and isinstance(mval.get("dynamic"), dict):
                        _collect(mval["dynamic"].get("selector"))
        for eff in ab.get("effects") or []:
            if isinstance(eff, dict):
                _collect(eff.get("target"))
                for mkey in ("strength_mod", "toughness_mod"):
                    mval = eff.get(mkey)
                    if isinstance(mval, dict) and isinstance(mval.get("dynamic"), dict):
                        _collect(mval["dynamic"].get("selector"))
                pf = eff.get("protection_filter")
                if isinstance(pf, dict):
                    for cs in pf.get("card_sources") or []:
                        _collect(cs)
    return selectors


def _apply_any_of(
    sel: Dict[str, Any],
    branches: List[Dict[str, Any]],
    *,
    clear_alignment: bool = True,
    scope: Optional[List[str]] = None,
) -> None:
    """Replaces mixed target filter fields on a parent selector with any_of branches.

    Args:
        sel: Mutable parent TargetSelector dictionary.
        branches: Normalized partial branch dicts.
        clear_alignment: Whether to clear parent alignment when branches carry their own.
        scope: Optional explicit scope override for parent selector.
    """
    sel["target_type"] = None
    if clear_alignment:
        sel["alignment"] = None
    sel["identifiers"] = []
    sel["card_titles"] = []
    sel["target_card_ids"] = []
    if scope is not None:
        sel["scope"] = list(scope)
    sel["any_of"] = branches


def _repair_special_cards(card_id: str, side_key: str, side_dict: Dict[str, Any]) -> None:
    """Applies targeted structural repairs for multi-target Temple/Tabernacle/OR cards.

    Args:
        card_id: Numeric Redemption card ID string.
        side_key: Side key ('top', 'bottom', 'shared', 'star').
        side_dict: Mutable serialized CardSideLogic dictionary.
    """
    abilities = side_dict.get("abilities") or []

    for ab in abilities:
        if not isinstance(ab, dict):
            continue
        ab_id = str(ab.get("ability_id") or "")

        # Conditions
        for cond in ab.get("conditions") or []:
            if not isinstance(cond, dict) or not isinstance(cond.get("selector"), dict):
                continue
            sel = cond["selector"]
            idents = list(sel.get("identifiers") or [])
            titles = list(sel.get("card_titles") or [])

            if card_id == "-39757696" and "Jerusalem" in titles and "Herod's Temple" in idents:
                _apply_any_of(
                    sel,
                    [
                        {"target_type": "site", "card_titles": ["Jerusalem"]},
                        {"target_type": "site", "card_titles": ["Herod's Temple (G)"]},
                    ],
                )
            elif card_id == "-636306929" and "Priest" in idents and "Temple Artifact" in idents:
                _apply_any_of(
                    sel,
                    [
                        {"target_type": "character", "identifiers": ["Priest"]},
                        {"target_type": "artifact", "identifiers": ["Temple Artifact"]},
                    ],
                )
            elif card_id == "-46149311" and "King Josiah" in titles and "Solomon's Temple Priest" in idents:
                _apply_any_of(
                    sel,
                    [
                        {"target_type": "hero", "alignment": "good", "identifiers": ["Solomon's Temple Priest"]},
                        {"target_type": "hero", "alignment": "good", "card_titles": ["King Josiah"]},
                    ],
                )

        # Effects
        for eff in ab.get("effects") or []:
            if not isinstance(eff, dict) or not isinstance(eff.get("target"), dict):
                continue
            sel = eff["target"]
            idents = list(sel.get("identifiers") or [])
            titles = list(sel.get("card_titles") or [])

            if card_id == "1553336041" and "The Tabernacle" in titles and "Temple" in idents:
                _apply_any_of(
                    sel,
                    [
                        {"target_type": "fortress", "card_titles": ["The Tabernacle"]},
                        {"target_type": "city", "identifiers": ["Temple"]},
                    ],
                )
            elif card_id in ("-888694675", "-1123206957") and sel.get("target_type") == "site" and "Temple" in idents:
                sel["target_type"] = "fortress"
                sel["alignment"] = "good"
                sel["identifiers"] = ["Temple"]
            elif card_id == "-1928692553":
                if "Solomon's Temple" in titles and "Temple" in idents:
                    _apply_any_of(
                        sel,
                        [
                            {"target_type": "fortress", "card_titles": ["Solomon's Temple"]},
                            {"target_type": "artifact", "identifiers": ["Temple Artifact"]},
                        ],
                    )
                elif "Solomon's Temple" in titles and ("Priest" in idents or "Musician" in idents):
                    _apply_any_of(
                        sel,
                        [
                            {"target_type": "character", "alignment": "good", "identifiers": ["Solomon's Temple Priest"]},
                            {"target_type": "hero", "alignment": "good", "identifiers": ["Musician"]},
                        ],
                    )
            elif card_id in ("-1843219564", "-1902242496") and "The Tabernacle" in titles and "Tabernacle" in idents:
                _apply_any_of(
                    sel,
                    [
                        {"target_type": "fortress", "card_titles": ["The Tabernacle"]},
                        {"target_type": "artifact", "identifiers": ["Tabernacle Artifact"]},
                    ],
                )
            elif card_id == "-427694647" and eff.get("action") == "search" and "Tabernacle" in idents:
                sel["target_type"] = "fortress"
                sel["identifiers"] = []
                sel["card_titles"] = ["The Tabernacle"]
            elif card_id == "1622407641":
                if "Zerubbabel's Temple" in titles and sel.get("target_type") == "site":
                    sel["target_type"] = "fortress"
                elif sel.get("target_type") == "artifact" and "Temple" in idents:
                    sel["identifiers"] = ["Temple Artifact"]
            elif card_id == "401121449":
                if not sel.get("any_of"):
                    _apply_any_of(
                        sel,
                        [
                            {"target_type": "artifact"},
                            {"target_type": "city", "identifiers": ["Temple"]},
                            {"target_type": "dominant", "alignment": "good"},
                        ],
                        scope=(["territory"] if "territory" in (sel.get("scope") or []) or sel.get("scope") == ["in_play"] and eff.get("step") == 1 else sel.get("scope")),
                    )
            elif card_id in _CHRONICLES_LO_CARDS:
                if "lamb" in ab_id.lower() and not sel.get("any_of"):
                    _apply_any_of(
                        sel,
                        [
                            {"target_type": "curse"},
                            {"target_type": "artifact", "identifiers": ["Idol"]},
                            {"target_type": "enhancement", "alignment": "evil"},
                        ],
                    )
                elif "reaper" in ab_id.lower() and not sel.get("any_of"):
                    _apply_any_of(
                        sel,
                        [
                            {"target_type": "covenant"},
                            {"target_type": "artifact", "identifiers": ["Temple Artifact"]},
                            {"target_type": "enhancement", "alignment": "good"},
                        ],
                    )
            elif card_id == "-2079573517":
                if "Temple Artifacts and" in idents:
                    _apply_any_of(
                        sel,
                        [
                            {"target_type": "artifact", "identifiers": ["Temple Artifact"]},
                            {"target_type": "lost_soul"},
                        ],
                    )
                elif "except Temple Artifacts" in idents:
                    sel["identifiers"] = ["except Temple Artifact"]
            elif card_id == "460780034" and "Tabernacle" in idents and "Temple Artifact" in idents:
                sel["identifiers"] = ["except Tabernacle and Temple Artifacts"]
            elif card_id == "552677887" and "Tabernacle or Priestly" in idents:
                _apply_any_of(
                    sel,
                    [
                        {"target_type": "artifact", "identifiers": ["Tabernacle Artifact"]},
                        {"target_type": "artifact", "identifiers": ["Priestly Artifact"]},
                    ],
                )
            elif card_id == "-1728451304" and "Priestly" in idents and "Tabernacle" in idents:
                sel["selection_mode"] = "manual_controller"
                sel["count"] = {"fixed_value": 1}
                _apply_any_of(
                    sel,
                    [
                        {"target_type": "character", "card_titles": ["Hophni, son of Eli", "Phinehas, son of Eli"]},
                        {"target_type": "artifact", "identifiers": ["Priestly Artifact"]},
                        {"target_type": "artifact", "identifiers": ["Tabernacle Artifact"]},
                    ],
                )
            elif card_id == "848128688" and "Idol" in idents and "Royal" in idents:
                _apply_any_of(
                    sel,
                    [
                        {"target_type": "site", "testament": "OT"},
                        {"target_type": "artifact", "testament": "OT", "identifiers": ["Idol"]},
                        {"target_type": "evil_character", "alignment": "evil", "gender": "female", "identifiers": ["Royalty"]},
                    ],
                )
                sel["gender"] = None
                sel["testament"] = None
            elif card_id == "251756403" and "Patriarch" in idents and "or a meek blue Hero" in idents:
                _apply_any_of(
                    sel,
                    [
                        {"target_type": "hero", "alignment": "good", "identifiers": ["Patriarch"]},
                        {"target_type": "hero", "alignment": "good", "brigades": ["Blue"], "is_meek": True},
                    ],
                )
            elif card_id == "1824516505" and "or Star card" in idents:
                _apply_any_of(
                    sel,
                    [
                        {"target_type": "hero", "alignment": "good"},
                        {"target_type": "card", "is_star": True},
                    ],
                )
            elif card_id == "1455842322" and "evil king of Judah" in idents:
                _apply_any_of(
                    sel,
                    [
                        {"target_type": "hero", "alignment": "good", "is_meek": True, "identifiers": ["King"]},
                        {"target_type": "evil_character", "alignment": "evil", "identifiers": ["King of Judah"]},
                    ],
                )
            elif card_id == "139226334" and idents == ["star"] and eff.get("action") == "activate":
                sel["target_type"] = "card"
                sel["is_star"] = True
                sel["identifiers"] = []

    # Lost Souls: Just a Hireling (327752693) split into clean choice_group
    if card_id == "327752693":
        new_abs: List[Dict[str, Any]] = []
        changed = False
        for ab in abilities:
            if not isinstance(ab, dict):
                continue
            effs = ab.get("effects") or []
            if (
                len(effs) == 1
                and isinstance(effs[0].get("target"), dict)
                and "or any number of meek Lost Souls" in (effs[0]["target"].get("identifiers") or [])
            ):
                changed = True
                ab1 = copy.deepcopy(ab)
                ab1["ability_id"] = "discard_pharisee_to_shuffle_up_to_3_lost_souls"
                ab1["choice_group"] = "hireling_shuffle_choice"
                ab1["effects"][0]["target"]["identifiers"] = []

                ab2 = copy.deepcopy(ab)
                ab2["ability_id"] = "discard_pharisee_to_shuffle_meek_lost_souls"
                ab2["choice_group"] = "hireling_shuffle_choice"
                ab2["effects"][0]["target"]["identifiers"] = []
                ab2["effects"][0]["target"]["is_meek"] = True
                ab2["effects"][0]["target"]["count"] = {"min_value": 0, "max_value": None}
                new_abs.extend([ab1, ab2])
            else:
                new_abs.append(ab)
        if changed:
            side_dict["abilities"] = new_abs


def _normalize_selector_phase2(sel: Dict[str, Any]) -> None:
    """Applies generic Phase 2 identifier and type fixes to a single selector dict.

    Args:
        sel: Mutable TargetSelector or TargetSelectorBranch dict.
    """
    idents = list(sel.get("identifiers") or [])
    if not idents:
        return

    idents_low = {str(x).strip().lower() for x in idents}
    new_idents: List[str] = []

    # Noise token cleanup on Glory of the Lord 2015
    if "target" in idents_low and "temple" in idents_low:
        idents = [i for i in idents if str(i).strip().lower() != "target"]
        idents_low.discard("target")

    # Handle composite Priest + Temple/Tabernacle/Zerubbabel's Temple splits
    if sel.get("target_type") in ("character", "hero"):
        if "temple" in idents_low and "priest" in idents_low:
            idents = [i for i in idents if str(i).strip().lower() not in ("temple", "priest")]
            idents.append("Temple Priest")
        elif "tabernacle" in idents_low and "priest" in idents_low:
            idents = [i for i in idents if str(i).strip().lower() not in ("tabernacle", "priest")]
            idents.append("Tabernacle Priest")
        elif "zerubbabel's temple" in idents_low and "priest" in idents_low:
            idents = [i for i in idents if str(i).strip().lower() not in ("zerubbabel's temple", "priest")]
            idents.append("Zerubbabel's Temple Priest")
        elif idents_low == {"temple"}:
            idents = ["Temple Priest"]
        elif idents_low == {"tabernacle"}:
            idents = ["Tabernacle Priest"]

    # Artifact + bare Temple / Tabernacle -> Temple Artifact / Tabernacle Artifact
    if sel.get("target_type") == "artifact":
        idents = [
            "Temple Artifact" if str(i).strip().lower() == "temple" else (
                "Tabernacle Artifact" if str(i).strip().lower() == "tabernacle" else i
            )
            for i in idents
        ]

    for ident in idents:
        s = str(ident).strip()
        if not s:
            continue
        low = s.lower()

        if low in _LAMB_ICON_TOKENS:
            if sel.get("target_type") in (None, "card"):
                sel["target_type"] = "dominant"
            if not sel.get("alignment"):
                sel["alignment"] = "good"
            continue

        if low in _GROUP_BOOL_TOKENS:
            field_name, implied_tt = _GROUP_BOOL_TOKENS[low]
            sel[field_name] = True
            if implied_tt and sel.get("target_type") in (None,):
                sel["target_type"] = implied_tt
            continue

        if low in _ROYAL_SYNONYMS:
            if "Royalty" not in new_idents:
                new_idents.append("Royalty")
            continue

        if s not in new_idents:
            new_idents.append(s)

    if "identifiers" in sel or new_idents:
        sel["identifiers"] = new_idents


def migrate_side_payload(card_id: str, side_key: str, side_dict: Dict[str, Any]) -> Tuple[Dict[str, Any], List[str], bool]:
    """Migrates and validates a single CardSideLogic dictionary.

    Args:
        card_id: Numeric card ID string.
        side_key: Side key ('top', 'bottom', 'shared', 'star').
        side_dict: Existing serialized CardSideLogic dict.

    Returns:
        Tuple of ``(migrated_side_dict, validation_errors, semantically_changed)``.
    """
    before_raw = json.dumps(side_dict, sort_keys=True, ensure_ascii=False)
    updated = copy.deepcopy(side_dict)
    _repair_special_cards(card_id, side_key, updated)
    for sel in _iter_side_selectors(updated):
        _normalize_selector_phase2(sel)
    after_mutated = json.dumps(updated, sort_keys=True, ensure_ascii=False)

    try:
        validated = CardSideLogic.model_validate(updated)
    except Exception as exc:
        return updated, [f"{card_id}:{side_key}: {exc}"], False

    semantically_changed = before_raw != after_mutated
    if not semantically_changed:
        return side_dict, [], False

    dumped = validated.model_dump(exclude_none=True)
    return dumped, [], True


def run_migration(dry_run: bool = False) -> Dict[str, Any]:
    """Runs idempotent Phase 2 migration on AI and raw AST files.

    Args:
        dry_run: If True, reports counts without writing modified files.

    Returns:
        Summary metrics dictionary.
    """
    ai_changed = 0
    raw_changed = 0
    errors: List[str] = []

    if AI_FILE.exists():
        with AI_FILE.open("r", encoding="utf-8") as f:
            ai_data: Dict[str, Any] = json.load(f)
        for key, entry in ai_data.items():
            if not isinstance(entry, dict) or not isinstance(entry.get("ast"), dict):
                continue
            card_id = str(entry.get("card_id") or key.split("_")[0])
            side_key = str(entry.get("side") or "top")
            migrated_ast, errs, changed = migrate_side_payload(card_id, side_key, entry["ast"])
            if errs:
                errors.extend(errs)
                continue
            if changed:
                ai_changed += 1
                entry["ast"] = migrated_ast
        if not dry_run and ai_changed and not errors:
            with AI_FILE.open("w", encoding="utf-8") as f:
                json.dump(ai_data, f, indent=2, ensure_ascii=False)

    if RAW_FILE.exists():
        with RAW_FILE.open("r", encoding="utf-8") as f:
            raw_data: Dict[str, Any] = json.load(f)
        for card_id, entry in raw_data.items():
            if not isinstance(entry, dict) or not isinstance(entry.get("sides"), dict):
                continue
            for sk, side_ast in list(entry["sides"].items()):
                if not isinstance(side_ast, dict):
                    continue
                migrated_side, errs, changed = migrate_side_payload(str(card_id), sk, side_ast)
                if errs:
                    errors.extend(errs)
                    continue
                if changed:
                    raw_changed += 1
                    entry["sides"][sk] = migrated_side
        if not dry_run and raw_changed and not errors:
            with RAW_FILE.open("w", encoding="utf-8") as f:
                json.dump(raw_data, f, indent=2, ensure_ascii=False)

    return {
        "dry_run": dry_run,
        "ai_modified": ai_changed,
        "raw_modified": raw_changed,
        "validation_errors": errors,
    }


def main() -> None:
    """CLI entry point for Phase 2 migration."""
    parser = argparse.ArgumentParser(description="Migrate Phase 2 group booleans, Royalty, and Temple ASTs.")
    parser.add_argument("--dry-run", action="store_true", help="Report planned changes without modifying files.")
    args = parser.parse_args()
    summary = run_migration(dry_run=args.dry_run)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    if summary["validation_errors"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
