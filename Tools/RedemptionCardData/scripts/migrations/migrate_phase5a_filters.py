"""Phase 5a migration: Promote high-frequency identifiers into structured selector filters.

Migrates both data/ai_generated_abilities.json and data/card_abilities_raw.json:
1. Promotes self-exclusions ('except this card', 'except this one', 'other', 'another', ...) -> exclude_self=True.
2. Promotes state/timing/occupancy/brigade-structure qualifiers -> StateFilter enums in state_filters.
3. Promotes relative comparisons ('matching brigade', 'opposite alignment', 'selected brigade', ...) -> RelativeFilter.
4. Promotes 'used by ...' qualifiers -> TargetSelector.used_by ('self', 'controller', 'opponent', or TargetSelector).
5. Enforces full schema validation via CardSideLogic and CardLinker target_card_ids linking.
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any, Dict, List

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / "scripts"))

from models.logic.card_logic import CardSideLogic
from utils.card_linker import CardLinker, link_side_logic_targets
from utils.target_phase5a_helper import promote_phase5a_fields

AI_FILE = BASE_DIR / "data" / "ai_generated_abilities.json"
RAW_FILE = BASE_DIR / "data" / "card_abilities_raw.json"
EXT_FILE = BASE_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"


def _apply_special_phase5a_repairs(card_id: str, side: Dict[str, Any]) -> None:
    """Applies targeted structural cleanups uncovered during the Phase 5a audit."""
    for ab in side.get("abilities") or []:
        ab_id = str(ab.get("ability_id") or "")
        for cond in ab.get("conditions") or []:
            sel = cond.get("selector")
            if not isinstance(sel, dict):
                continue
            idents = list(sel.get("identifiers") or [])
            if len(idents) == 1 and str(idents[0]).lower().startswith("used by "):
                promote_phase5a_fields(sel, action="")
                if sel.get("used_by") is not None and sel.get("target_type") is not None and not sel.get("identifiers"):
                    pass
        for item in list(ab.get("costs") or []) + list(ab.get("effects") or []):
            tgt = item.get("target")
            if not isinstance(tgt, dict):
                continue
            # Lost Soul "O.T. Only" (-945890825) & siblings using identifiers=['this'] instead of automatic_self
            if tgt.get("identifiers") == ["this"] and tgt.get("selection_mode") == "automatic_all":
                tgt["selection_mode"] = "automatic_self"
                tgt["zone_owner"] = "controller"
                tgt["identifiers"] = []
            # Agabus [RR2] (1339028134): 'other evil Enhancements' inside restrict target
            if card_id == "1339028134" and "other evil Enhancements" in (tgt.get("identifiers") or []):
                tgt["exclude_self"] = True
                tgt["identifiers"] = [x for x in tgt["identifiers"] if x != "other evil Enhancements"]
            # Leper (-1090030388) action='disease' identifiers=['Leprosy'] -> ORDIR 'Disease' or clear redundant label
            if item.get("action") == "disease" and "Leprosy" in (tgt.get("identifiers") or []):
                tgt["identifiers"] = [x for x in tgt["identifiers"] if x != "Leprosy"]
            # Michal (271289061): enhancements connected with David -> ORDIR 'Connected with David'
            if card_id == "271289061" and ab_id == "ignore_david_and_connected_enhancements" and item.get("step") == 2:
                tgt.pop("used_by", None)
                idents = list(tgt.get("identifiers") or [])
                idents = [x for x in idents if x.lower() != "connected with him"]
                if "Connected with David" not in idents:
                    idents.append("Connected with David")
                tgt["identifiers"] = idents


def _migrate_side_phase5a(card_id: str, side: Dict[str, Any]) -> None:
    """Walks all selectors of a single card side AST and applies Phase 5a promotions."""
    _apply_special_phase5a_repairs(card_id, side)
    for ab in side.get("abilities") or []:
        for trig_key in ("trigger_subject", "trigger_source"):
            sel = ab.get(trig_key)
            if isinstance(sel, dict):
                promote_phase5a_fields(sel, action="")
        for cond in ab.get("conditions") or []:
            sel = cond.get("selector")
            if isinstance(sel, dict):
                promote_phase5a_fields(sel, action="")
        for list_key in ("costs", "effects"):
            for item in ab.get(list_key) or []:
                act = str(item.get("action") or "").lower()
                tgt = item.get("target")
                if isinstance(tgt, dict):
                    promote_phase5a_fields(tgt, action=act)
                for attr in ("strength_mod", "toughness_mod"):
                    mv = item.get(attr)
                    dyn_sel = ((mv.get("dynamic") or {}).get("selector")) if isinstance(mv, dict) else None
                    if isinstance(dyn_sel, dict):
                        promote_phase5a_fields(dyn_sel, action=act)
                pf = item.get("protection_filter")
                if isinstance(pf, dict):
                    for cs in pf.get("card_sources") or []:
                        if isinstance(cs, dict):
                            promote_phase5a_fields(cs, action=act)


def run_migration(dry_run: bool = False) -> Dict[str, Any]:
    """Executes Phase 5a migration across AI and RAW datasets cleanly.

    Args:
        dry_run: If True, validates and reports counts without modifying files on disk.

    Returns:
        Summary dictionary with modified counts and validation error diagnostics.
    """
    ext_cards = json.loads(EXT_FILE.read_text(encoding="utf-8"))["cards"]
    linker = CardLinker(ext_cards)

    ai_data = json.loads(AI_FILE.read_text(encoding="utf-8"))
    raw_data = json.loads(RAW_FILE.read_text(encoding="utf-8"))

    ai_modified = 0
    raw_modified = 0
    validation_errors: List[str] = []

    for key, entry in ai_data.items():
        ast = entry.get("ast")
        if not ast:
            continue
        cid = str(entry.get("card_id") or key.rsplit("_", 1)[0])
        work = copy.deepcopy(ast)
        _migrate_side_phase5a(cid, work)
        try:
            validated = CardSideLogic.model_validate(work)
            link_side_logic_targets(validated, linker)
            normalized = validated.model_dump(mode="json", exclude_none=True)
        except Exception as exc:
            validation_errors.append(f"AI {key}: {exc}")
            continue
        if normalized != ast:
            ai_modified += 1
            entry["ast"] = normalized

    for cid, card_entry in raw_data.items():
        sides = card_entry.get("sides") or {}
        for sk, side_ast in list(sides.items()):
            work = copy.deepcopy(side_ast)
            _migrate_side_phase5a(str(cid), work)
            try:
                validated = CardSideLogic.model_validate(work)
                link_side_logic_targets(validated, linker)
                normalized = validated.model_dump(mode="json", exclude_none=True)
            except Exception as exc:
                validation_errors.append(f"RAW {cid}_{sk}: {exc}")
                continue
            if normalized != side_ast:
                raw_modified += 1
                sides[sk] = normalized

    if not dry_run and not validation_errors:
        if ai_modified:
            AI_FILE.write_text(json.dumps(ai_data, indent=2, ensure_ascii=False), encoding="utf-8")
        if raw_modified:
            RAW_FILE.write_text(json.dumps(raw_data, indent=2, ensure_ascii=False), encoding="utf-8")

    return {
        "dry_run": dry_run,
        "ai_modified": ai_modified,
        "raw_modified": raw_modified,
        "validation_errors": validation_errors[:25],
        "validation_error_count": len(validation_errors),
    }


def main() -> None:
    """CLI entry point for Phase 5a filter migration."""
    parser = argparse.ArgumentParser(description="Migrate Phase 5a structured TargetSelector filters.")
    parser.add_argument("--dry-run", action="store_true", help="Validate without modifying JSON files.")
    args = parser.parse_args()
    summary = run_migration(dry_run=args.dry_run)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    if summary["validation_errors"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
