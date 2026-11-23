"""Phase 5b migration: Promote exceptions, ability-target filters, and canonical ORDIR tags.

Migrates both data/ai_generated_abilities.json and data/card_abilities_raw.json:
1. Applies targeted structural repairs for multi-part clauses uncovered during audit
   (e.g. Grumbling at God except 1 Hero and 1 EC, Covenant with Phinehas, Michael (Wa)).
2. Recursively runs promote_phase5b_fields across all selectors (effects, costs,
   conditions, trigger_subject, trigger_source, dynamic value selectors, card_sources).
3. Resolves card_titles inside exclude and used_by via CardLinker.
4. Validates all migrated CardSideLogic objects against Pydantic v2 schemas and
   reports any remaining non-allowlisted identifier tokens.
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from collections import Counter
from pathlib import Path
from typing import Any, Dict, Iterable, List, Set, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / "scripts"))

from models.enums.state_filter import StateFilter  # noqa: E402
from models.logic.card_logic import CardSideLogic  # noqa: E402
from utils.card_linker import CardLinker, link_side_logic_targets  # noqa: E402
from utils.target_phase5b_helper import (  # noqa: E402
    PRINTED_SELECTOR_IDENTIFIERS,
    promote_phase5b_fields,
)

AI_FILE = BASE_DIR / "data" / "ai_generated_abilities.json"
RAW_FILE = BASE_DIR / "data" / "card_abilities_raw.json"
EXT_FILE = BASE_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"
DIST_EXT_FILE = BASE_DIR / "data" / "dist" / "cards_extended_with_ordir_fuzzy.json"


def _load_extended_cards() -> List[Dict[str, Any]]:
    """Loads extended card entries preferring canonical cards_extended_with_ordir_fuzzy.json."""
    src = EXT_FILE if EXT_FILE.exists() else DIST_EXT_FILE
    data = json.loads(src.read_text(encoding="utf-8"))
    if isinstance(data, dict) and "cards" in data:
        return list(data["cards"])
    if isinstance(data, dict):
        return list(data.values())
    return list(data)


def _build_ordir_lookup(cards: List[Dict[str, Any]]) -> Dict[str, str]:
    """Builds lowercase -> canonical ORDIR tag dictionary from the extended database."""
    lookup: Dict[str, str] = {}
    for card in cards:
        if not isinstance(card, dict):
            continue
        for cat in card.get("ORDIR") or []:
            if cat:
                c_str = str(cat).strip()
                lookup[c_str.lower()] = c_str
        for side in (card.get("CardSides") or {}).values():
            if isinstance(side, dict):
                for cat in side.get("ORDIR") or []:
                    if cat:
                        c_str = str(cat).strip()
                        lookup[c_str.lower()] = c_str
    return lookup


def _apply_special_phase5b_repairs(card_id: str, side: Dict[str, Any]) -> None:
    """Applies surgical structural fixes for complex multi-target exceptions."""
    for ab in side.get("abilities") or []:
        ab_id = str(ab.get("ability_id") or "")

        # Grumbling at God (1550103804): "Withdraw all characters (except 1 Hero and 1 Evil Character)"
        if card_id == "1550103804":
            new_effects: List[Dict[str, Any]] = []
            for eff in ab.get("effects") or []:
                tgt = eff.get("target") or {}
                if "except 1 Hero and 1 Evil Character" in (tgt.get("identifiers") or []):
                    hero_eff = copy.deepcopy(eff)
                    hero_eff["target"]["target_type"] = "hero"
                    hero_eff["target"]["alignment"] = "good"
                    hero_eff["target"]["identifiers"] = []
                    hero_eff["target"]["count"] = {
                        "dynamic": {"source": "count_cards", "operation": "add", "multiplier": 1, "offset": -1}
                    }
                    ec_eff = copy.deepcopy(eff)
                    ec_eff["target"]["target_type"] = "evil_character"
                    ec_eff["target"]["alignment"] = "evil"
                    ec_eff["target"]["identifiers"] = []
                    ec_eff["target"]["count"] = {
                        "dynamic": {"source": "count_cards", "operation": "add", "multiplier": 1, "offset": -1}
                    }
                    new_effects.extend([hero_eff, ec_eff])
                else:
                    new_effects.append(eff)
            for idx, eff in enumerate(new_effects, start=1):
                eff["step"] = idx
            ab["effects"] = new_effects

        # Covenant with Phinehas (-451562976): Protect Priests (House of Eleazar) from discard on evil cards
        if card_id == "-451562976":
            for eff in ab.get("effects") or []:
                tgt = eff.get("target")
                if isinstance(tgt, dict) and "house of Eleazar abilities on" in (tgt.get("identifiers") or []):
                    tgt["identifiers"] = ["Priest", "House of Eleazar"]
                pf = eff.get("protection_filter")
                if isinstance(pf, dict):
                    acts = list(pf.get("actions") or [])
                    if "discard" not in acts:
                        acts.append("discard")
                    pf["actions"] = acts
                    for cs in pf.get("card_sources") or []:
                        if isinstance(cs, dict) and "house of Eleazar abilities on" in (cs.get("identifiers") or []):
                            cs["identifiers"] = []

        # Standing in the Gap (1287384609): "multi-color Sites, and good Fortresses"
        if card_id == "1287384609":
            for eff in ab.get("effects") or []:
                tgt = eff.get("target")
                if isinstance(tgt, dict) and "multi-color Site" in (tgt.get("identifiers") or []):
                    tgt["identifiers"] = [x for x in tgt["identifiers"] if x != "multi-color Site"]
                    tgt["target_type"] = None
                    tgt["alignment"] = None
                    tgt["any_of"] = [
                        {"target_type": "site", "state_filters": [StateFilter.MULTI_BRIGADE.value]},
                        {"target_type": "fortress", "alignment": "good"},
                    ]

        # King Zimri (-978550881): "Discard King Elah" -> exact card title without bare King ORDIR filter
        if card_id == "-978550881":
            for eff in ab.get("effects") or []:
                tgt = eff.get("target")
                if isinstance(tgt, dict) and "Elah" in (tgt.get("identifiers") or []):
                    tgt["identifiers"] = [x for x in tgt["identifiers"] if x not in ("King", "Elah")]
                    tgt["card_titles"] = ["King Elah"]

        # Ordained as a Disciple (-1915321846): keep Disciple in identifiers, not card_titles
        if card_id == "-1915321846":
            for eff in ab.get("effects") or []:
                tgt = eff.get("target")
                if isinstance(tgt, dict):
                    tgt["card_titles"] = [t for t in (tgt.get("card_titles") or []) if t != "Disciple"]

        # Letters to the Corinthians (-324860879): split "Lost Souls and Corinth Heroes" cleanly
        if card_id == "-324860879":
            for eff in ab.get("effects") or []:
                tgt = eff.get("target")
                if isinstance(tgt, dict) and "Lost Souls and Corinth Heroes" in (tgt.get("identifiers") or []):
                    tgt["identifiers"] = [x for x in tgt["identifiers"] if x != "Lost Souls and Corinth Heroes"]
                    tgt["target_type"] = None
                    tgt["any_of"] = [
                        {"target_type": "lost_soul"},
                        {"target_type": "hero", "identifiers": ["Corinth Church"]},
                    ]

        # Balaam's Disobedience (654766573): promote "unless an angel is in battle" to negated condition
        if card_id == "654766573":
            for eff in ab.get("effects") or []:
                pf = eff.get("protection_filter")
                if isinstance(pf, dict):
                    for cs in pf.get("card_sources") or []:
                        if isinstance(cs, dict) and "unless an angel is in battle" in (cs.get("identifiers") or []):
                            cs["identifiers"] = [
                                x for x in cs["identifiers"] if x != "unless an angel is in battle"
                            ]
                            conds = list(ab.get("conditions") or [])
                            if not conds:
                                conds.append({
                                    "condition_type": "zone_check",
                                    "negate": True,
                                    "selector": {
                                        "selection_mode": "automatic_all",
                                        "zone_owner": "both",
                                        "scope": ["battle"],
                                        "target_type": "character",
                                        "identifiers": ["Angel"],
                                    },
                                })
                                ab["conditions"] = conds

        # Zadok Annoints Solomon (141826046): "brigade other than teal" -> exclude={"brigades": ["Teal"]}
        if card_id == "141826046":
            for eff in ab.get("effects") or []:
                tgt = eff.get("target")
                if isinstance(tgt, dict) and "with a brigade than" in (tgt.get("identifiers") or []):
                    tgt["identifiers"] = [x for x in tgt["identifiers"] if x != "with a brigade than"]
                    tgt["brigades"] = []
                    tgt["exclude"] = {"brigades": ["Teal"]}

        # Jerusalem (-829066160): split Chief Priests, Pharisees, Sadducees into disjoint branches
        if card_id == "-829066160":
            for eff in ab.get("effects") or []:
                tgt = eff.get("target")
                if isinstance(tgt, dict) and "Chief Priest" in (tgt.get("identifiers") or []):
                    tgt["identifiers"] = []
                    tgt["any_of"] = [
                        {"target_type": "character", "card_titles": ["Chief Priest", "Chief Priests"]},
                        {"target_type": "character", "identifiers": ["Pharisee"]},
                        {"target_type": "character", "identifiers": ["Sadducee"]},
                    ]

        # Jericho (1048103794, -2085561862): split Jericho (Site) and Canaanites (Character)
        if card_id in {"1048103794", "-2085561862"}:
            for eff in ab.get("effects") or []:
                tgt = eff.get("target")
                if isinstance(tgt, dict) and "Jericho" in (tgt.get("identifiers") or []):
                    tgt["identifiers"] = []
                    tgt["target_type"] = None
                    tgt["any_of"] = [
                        {"target_type": "site", "card_titles": ["Jericho"]},
                        {"target_type": "character", "identifiers": ["Canaanite"]},
                    ]

        # Plague of Blood (1232063500): canonical title is 'Kingdoms of the World'
        if card_id == "1232063500":
            for eff in ab.get("effects") or []:
                tgt = eff.get("target")
                if isinstance(tgt, dict) and tgt.get("card_titles"):
                    tgt["card_titles"] = [
                        "Kingdoms of the World" if t == "Kingdoms of this World" else t
                        for t in tgt["card_titles"]
                    ]

        # King Joash (Pi) (1808193815): remove typo 'Jehoiada, the High Priest' with comma
        if card_id == "1808193815":
            for eff in ab.get("effects") or []:
                tgt = eff.get("target")
                if isinstance(tgt, dict) and tgt.get("card_titles"):
                    tgt["card_titles"] = [
                        t for t in tgt["card_titles"] if t != "Jehoiada, the High Priest"
                    ]

        # Bound to the Law (-233673980): restore explicit 'Restrict: control' marker
        if card_id == "-233673980":
            for eff in ab.get("effects") or []:
                if eff.get("action") == "restrict":
                    tgt = eff.get("target")
                    if isinstance(tgt, dict):
                        idents = list(tgt.get("identifiers") or [])
                        if "Restrict: control" not in idents:
                            idents.append("Restrict: control")
                        tgt["identifiers"] = idents

        # False Dreams (-218508247) & Great Mourning (-608997023): restrict rescue attempt
        if card_id in {"-218508247", "-608997023"}:
            for eff in ab.get("effects") or []:
                if eff.get("action") == "restrict":
                    tgt = eff.get("target")
                    if isinstance(tgt, dict):
                        tgt["targets_abilities"] = True
                        acts = list(tgt.get("ability_target_actions") or [])
                        if "rescue" not in acts:
                            acts.append("rescue")
                        tgt["ability_target_actions"] = acts

        # Lost Soul "Slaves" (-1480202451, -2138520123): restrict putting Lost Souls into Sites
        if card_id in {"-1480202451", "-2138520123"} and ab_id == "restrict_putting_lost_souls_into_sites":
            for eff in ab.get("effects") or []:
                if eff.get("action") == "restrict":
                    tgt = eff.get("target")
                    if isinstance(tgt, dict):
                        tgt["targets_abilities"] = True
                        acts = list(tgt.get("ability_target_actions") or [])
                        if "place" not in acts:
                            acts.append("place")
                        tgt["ability_target_actions"] = acts


def _migrate_selector_tree(
    sel: Dict[str, Any],
    ordir_lookup: Dict[str, str],
    action: str = "",
) -> None:
    """Applies Phase 5b field promotions to a selector and any nested dynamic count selector."""
    promote_phase5b_fields(sel, ordir_lookup=ordir_lookup, action=action)
    cnt = sel.get("count")
    dyn_sel = ((cnt.get("dynamic") or {}).get("selector")) if isinstance(cnt, dict) else None
    if isinstance(dyn_sel, dict):
        promote_phase5b_fields(dyn_sel, ordir_lookup=ordir_lookup, action=action)


def _migrate_side_phase5b(
    card_id: str,
    side: Dict[str, Any],
    ordir_lookup: Dict[str, str],
) -> None:
    """Walks all selectors inside one card side AST and applies Phase 5b normalizations."""
    _apply_special_phase5b_repairs(card_id, side)
    for ab in side.get("abilities") or []:
        for trig_key in ("trigger_subject", "trigger_source"):
            sel = ab.get(trig_key)
            if isinstance(sel, dict):
                _migrate_selector_tree(sel, ordir_lookup, action="")
        for cond in ab.get("conditions") or []:
            sel = cond.get("selector")
            if isinstance(sel, dict):
                _migrate_selector_tree(sel, ordir_lookup, action="")
        for list_key in ("costs", "effects"):
            for item in ab.get(list_key) or []:
                act = str(item.get("action") or "").lower()
                tgt = item.get("target")
                if isinstance(tgt, dict):
                    _migrate_selector_tree(tgt, ordir_lookup, action=act)
                for attr in ("strength_mod", "toughness_mod"):
                    mv = item.get(attr)
                    dyn_sel = ((mv.get("dynamic") or {}).get("selector")) if isinstance(mv, dict) else None
                    if isinstance(dyn_sel, dict):
                        _migrate_selector_tree(dyn_sel, ordir_lookup, action=act)
                pf = item.get("protection_filter")
                if isinstance(pf, dict):
                    for cs in pf.get("card_sources") or []:
                        if isinstance(cs, dict):
                            _migrate_selector_tree(cs, ordir_lookup, action=act)


def _iter_selector_dicts(node: Any) -> Iterable[Dict[str, Any]]:
    """Yields all selector dictionaries (including branches, used_by, exclude) recursively."""
    if isinstance(node, dict):
        if "identifiers" in node:
            yield node
        for val in node.values():
            yield from _iter_selector_dicts(val)
    elif isinstance(node, list):
        for item in node:
            yield from _iter_selector_dicts(item)


def _migrate_ai_file(
    file_path: Path,
    linker: CardLinker,
    ordir_lookup: Dict[str, str],
    allowed_exact: Set[str],
    dry_run: bool,
) -> Tuple[int, List[str], Counter]:
    """Runs Phase 5b migration on ai_generated_abilities.json (entry['ast'] layout)."""
    data = json.loads(file_path.read_text(encoding="utf-8"))
    modified = 0
    errors: List[str] = []
    unknown_counter: Counter = Counter()

    for key, entry in data.items():
        if str(key) == "__meta__" or not isinstance(entry, dict):
            continue
        ast = entry.get("ast")
        if not isinstance(ast, dict):
            continue

        cid = str(entry.get("card_id") or key.rsplit("_", 1)[0])
        work = copy.deepcopy(ast)
        _migrate_side_phase5b(cid, work, ordir_lookup)
        try:
            side_obj = CardSideLogic.model_validate(work)
            link_side_logic_targets(side_obj, linker)
            dumped = side_obj.model_dump(mode="json", exclude_none=True)
            for sel in _iter_selector_dicts(dumped):
                for ident in sel.get("identifiers") or []:
                    if ident not in allowed_exact:
                        unknown_counter[ident] += 1
            if dumped != ast:
                modified += 1
                entry["ast"] = dumped
        except Exception as exc:
            errors.append(f"{file_path.name} {key}: {exc}")

    if modified > 0 and not dry_run and not errors:
        file_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    return modified, errors, unknown_counter


def _migrate_raw_file(
    file_path: Path,
    linker: CardLinker,
    ordir_lookup: Dict[str, str],
    allowed_exact: Set[str],
    dry_run: bool,
) -> Tuple[int, List[str], Counter]:
    """Runs Phase 5b migration on card_abilities_raw.json (entry['sides'] layout)."""
    data = json.loads(file_path.read_text(encoding="utf-8"))
    modified = 0
    errors: List[str] = []
    unknown_counter: Counter = Counter()

    for cid, entry in data.items():
        if str(cid) == "__meta__" or not isinstance(entry, dict):
            continue
        sides = entry.get("sides") or {}
        if not isinstance(sides, dict):
            continue

        for side_key, side_data in list(sides.items()):
            if not isinstance(side_data, dict):
                continue
            work = copy.deepcopy(side_data)
            _migrate_side_phase5b(str(cid), work, ordir_lookup)
            try:
                side_obj = CardSideLogic.model_validate(work)
                link_side_logic_targets(side_obj, linker)
                dumped = side_obj.model_dump(mode="json", exclude_none=True)
                for sel in _iter_selector_dicts(dumped):
                    for ident in sel.get("identifiers") or []:
                        if ident not in allowed_exact:
                            unknown_counter[ident] += 1
                if dumped != side_data:
                    modified += 1
                    sides[side_key] = dumped
            except Exception as exc:
                errors.append(f"{file_path.name} {cid}.{side_key}: {exc}")

    if modified > 0 and not dry_run and not errors:
        file_path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")

    return modified, errors, unknown_counter


def run_migration(dry_run: bool = False) -> Dict[str, Any]:
    """Executes Phase 5b migration across both AI and deterministic AST datasets.

    Args:
        dry_run: When True, simulates migration without saving modified JSON files.

    Returns:
        Summary dictionary with modified counts, validation errors, and unknown token stats.
    """
    ext_cards = _load_extended_cards()
    linker = CardLinker(ext_cards)
    ordir_lookup = _build_ordir_lookup(ext_cards)
    allowed_exact: Set[str] = set(ordir_lookup.values()) | set(PRINTED_SELECTOR_IDENTIFIERS)

    ai_mod, ai_err, ai_unk = _migrate_ai_file(AI_FILE, linker, ordir_lookup, allowed_exact, dry_run)
    raw_mod, raw_err, raw_unk = _migrate_raw_file(RAW_FILE, linker, ordir_lookup, allowed_exact, dry_run)

    combined_unk = ai_unk + raw_unk
    all_err = ai_err + raw_err
    return {
        "dry_run": dry_run,
        "ai_modified": ai_mod,
        "raw_modified": raw_mod,
        "validation_errors": all_err[:20],
        "validation_error_count": len(all_err),
        "unknown_identifier_unique_count": len(combined_unk),
        "unknown_identifier_total_count": sum(combined_unk.values()),
        "top_unknown_identifiers": combined_unk.most_common(60),
    }


def main() -> None:
    """CLI entry point for Phase 5b excludes & ability-targets migration."""
    parser = argparse.ArgumentParser(description="Migrate Phase 5b excludes and ability targets.")
    parser.add_argument("--dry-run", action="store_true", help="Audit changes without writing files.")
    args = parser.parse_args()

    summary = run_migration(dry_run=args.dry_run)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    if summary["validation_error_count"] > 0:
        sys.exit(1)


if __name__ == "__main__":
    main()
