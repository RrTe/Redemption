"""Migration script for Stage 10 Pipeline & Schema Hardening.

Cleans and normalizes `data/ai_generated_abilities.json`:
1. Resolves `<id>_shared` and `<id>_top` collisions on non-Star, non-Dual cards.
2. Migrates rigid `fixed_value` counts on `"up to <N>"` clauses to `DynamicValue.up_to(N)`.
3. Repairs banding scope defaults (`["in_play", "hand"]`) and alignment hallucinations.
4. Re-validates all ASTs through `CardSideLogic` to decompose `TargetSelector` fields
   into canonical `target_type`, `testament`, `references`, and singular `identifiers`.
"""

from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Set, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.append(str(BASE_DIR / "scripts"))
sys.path.append(str(BASE_DIR))

from fact_matrix import extract_ast_facts, verify_fact_matrix
from models.enums import ActionVerb, ActivationMode, Zone
from models.logic.card_logic import CardSideLogic
from models.logic.dynamic_value import DynamicValue
from models.logic.target_selector import TargetSelector
from utils.card_helpers import check_is_star_card, get_side_field, get_star_ability
from utils.card_linker import CardLinker

WORD_TO_NUM: Dict[str, int] = {
    "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
    "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
}

UP_TO_RE = re.compile(
    r"\bup\s+to\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b",
    re.IGNORECASE,
)
UP_TO_SUFFIX_IGNORE_RE = re.compile(r"^\s*(?:turns?|phases?|rounds?|times?)\b", re.IGNORECASE)
STAT_RATIO_RE = re.compile(r"^\d+\s*/\s*\d+")
BAND_ZONE_RESTRICTION_RE = re.compile(
    r"\bband\b[^.;]*\b(?:in\s+play|in\s+battle|in\s+territory|in\s+territories|from\s+hand|in\s+hand|"
    r"from\s+discard|in\s+discard|from\s+reserve|in\s+reserve|from\s+set-aside|in\s+set-aside)\b",
    re.IGNORECASE,
)


def extract_up_to_numbers(raw_text: str) -> List[int]:
    """Extracts all target count numbers from 'up to <N>' phrases in raw ability text.

    Args:
        raw_text: Raw ability string on the card side.

    Returns:
        List of integer upper bounds from 'up to <N>' clauses.
    """
    results: List[int] = []
    for match in UP_TO_RE.finditer(raw_text or ""):
        after = raw_text[match.end():]
        if UP_TO_SUFFIX_IGNORE_RE.match(after):
            continue
        if STAT_RATIO_RE.match(raw_text[match.start(1):]):
            continue
        token = match.group(1).lower()
        val = int(token) if token.isdigit() else WORD_TO_NUM.get(token)
        if val is not None:
            results.append(val)
    return results


def iter_selectors(side_logic: CardSideLogic) -> List[TargetSelector]:
    """Collects all TargetSelector instances within a CardSideLogic tree.

    Args:
        side_logic: Validated CardSideLogic instance.

    Returns:
        Flat list of all TargetSelector objects in the side logic.
    """
    selectors: List[TargetSelector] = []
    for ability in side_logic.abilities:
        if ability.trigger_filter:
            selectors.append(ability.trigger_filter)
        for cond in ability.conditions:
            if cond.selector:
                selectors.append(cond.selector)
        for cost in ability.costs:
            if cost.target:
                selectors.append(cost.target)
        for eff in ability.effects:
            if eff.target:
                selectors.append(eff.target)
            if eff.protection_filter:
                selectors.extend(eff.protection_filter.card_sources)
    return selectors


def score_candidate_side(
    side_logic: CardSideLogic,
    side_card_type: str,
    raw_text: str,
) -> Tuple[int, int]:
    """Scores a candidate AST to resolve shared/top collisions on single-sided cards.

    Higher tuple score is better:
    - Element 0: 0 if no alignment hallucination, -100 if hallucinated.
    - Element 1: Total semantic specificity (count of identifiers, references, testament, brigades, titles).

    Args:
        side_logic: Parsed CardSideLogic candidate.
        side_card_type: CardType of the side (e.g. 'EE', 'Evil Character', 'Hero').
        raw_text: Raw ability text for the side.

    Returns:
        Tuple of (hallucination_penalty, specificity_score).
    """
    penalty = 0
    for ability in side_logic.abilities:
        for eff in [*ability.costs, *ability.effects]:
            if eff.action == ActionVerb.BAND and eff.target:
                if side_card_type in ("EE", "Evil Character", "Curse") and (
                    eff.target.target_type == "hero" or eff.target.alignment == "good"
                ):
                    if not re.search(r"\b(?:hero|heroes|good)\b", raw_text, re.I):
                        penalty -= 100
                elif side_card_type in ("GE", "Hero", "Covenant") and (
                    eff.target.target_type == "evil_character" or eff.target.alignment == "evil"
                ):
                    if not re.search(r"\b(?:evil\s+characters?|evil)\b", raw_text, re.I):
                        penalty -= 100

    if raw_text and raw_text.strip().lower() not in ("none", "n/a", "meek"):
        is_valid, fact_issues = verify_fact_matrix(raw_text, extract_ast_facts(side_logic))
        if not is_valid:
            penalty -= 50 * len(fact_issues)

    specificity = 0
    for sel in iter_selectors(side_logic):
        specificity += len(sel.identifiers) * 3
        specificity += len(sel.references) * 3
        specificity += 2 if sel.testament else 0
        specificity += len(sel.brigades) * 2
        specificity += len(sel.card_titles) * 2
        if sel.count and sel.count.max_value is not None:
            specificity += 2
    return penalty, specificity


def repair_side_logic(
    side_logic: CardSideLogic,
    side_card_type: str,
    raw_text: str,
    stats: Dict[str, int],
) -> None:
    """Applies in-place schema migrations and semantic repairs to a CardSideLogic AST.

    Args:
        side_logic: Validated CardSideLogic model to mutate in place.
        side_card_type: CardType of the card side.
        raw_text: Raw ability text for the card side.
        stats: Mutable counter dictionary tracking migration changes.
    """
    up_to_nums = extract_up_to_numbers(raw_text)
    if up_to_nums:
        remaining = list(up_to_nums)
        # First pass: check if any selector already satisfies max_value == val
        for sel in iter_selectors(side_logic):
            if sel.count and sel.count.max_value in remaining:
                remaining.remove(sel.count.max_value)

        # Second pass: migrate matching fixed_value to up_to
        for sel in iter_selectors(side_logic):
            if sel.count and sel.count.fixed_value in remaining and sel.count.max_value is None:
                val = sel.count.fixed_value
                sel.count = DynamicValue.up_to(val)
                remaining.remove(val)
                stats["up_to_migrated"] += 1

        # Fallback only for effects whose count is None or 1, never clobbering larger explicit numbers
        if remaining:
            all_raw_nums = {int(x) for x in re.findall(r"\b\d+\b", raw_text) if int(x) > 1}
            for ability in side_logic.abilities:
                for eff in ability.effects:
                    if not remaining:
                        break
                    if eff.target and eff.target.count and eff.target.count.max_value is None:
                        fv = eff.target.count.fixed_value
                        if fv and fv in all_raw_nums and fv not in remaining:
                            continue
                        eff.target.count = DynamicValue.up_to(remaining.pop(0))
                        stats["up_to_migrated"] += 1

    for ability in side_logic.abilities:
        for eff in [*ability.costs, *ability.effects]:
            if eff.action == ActionVerb.BAND and eff.target:
                if eff.target.scope in ([Zone.IN_PLAY], [Zone.BATTLE]) and not BAND_ZONE_RESTRICTION_RE.search(raw_text):
                    eff.target.scope = [Zone.IN_PLAY, Zone.HAND]
                    stats["band_scope_normalized"] += 1

                if raw_text:
                    if side_card_type in ("EE", "Evil Character", "Curse") and (
                        eff.target.target_type == "hero" or eff.target.alignment == "good"
                    ):
                        if not re.search(r"\b(?:hero|heroes|good)\b", raw_text, re.I):
                            if re.search(r"\bcharacters?\b", raw_text, re.I) and not re.search(
                                r"\bevil\s+characters?\b", raw_text, re.I
                            ):
                                eff.target.target_type = "character"
                                eff.target.alignment = None
                            else:
                                eff.target.target_type = "evil_character"
                                if eff.target.alignment == "good":
                                    eff.target.alignment = "evil"
                            stats["band_alignment_repaired"] += 1
                    elif side_card_type in ("GE", "Hero", "Covenant") and (
                        eff.target.target_type == "evil_character" or eff.target.alignment == "evil"
                    ):
                        if not re.search(r"\b(?:evil\s+characters?|evil)\b", raw_text, re.I):
                            if re.search(r"\bcharacters?\b", raw_text, re.I) and not re.search(
                                r"\b(?:hero|heroes)\b", raw_text, re.I
                            ):
                                eff.target.target_type = "character"
                                eff.target.alignment = None
                            else:
                                eff.target.target_type = "hero"
                                if eff.target.alignment == "evil":
                                    eff.target.alignment = "good"
                            stats["band_alignment_repaired"] += 1
            elif eff.action == ActionVerb.RESTRICT and eff.target and raw_text:
                if re.search(r"\brestrict\s+(?:good\s+|evil\s+)?dominants\b", raw_text, re.I):
                    if eff.target.target_type != "dominant":
                        eff.target.target_type = "dominant"
                        eff.target.identifiers = [
                            i for i in eff.target.identifiers if i.lower() not in ("play", "dominants")
                        ]


def run_migration(input_path: Path, output_path: Path) -> Dict[str, int]:
    """Executes the full Stage 10 hardening migration on ai_generated_abilities.json.

    Args:
        input_path: Source path to ai_generated_abilities.json.
        output_path: Destination path for migrated JSON output.

    Returns:
        Dictionary of migration statistics.
    """
    ext_path = BASE_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"
    with ext_path.open("r", encoding="utf-8") as f:
        ext_cards = json.load(f).get("cards", [])

    linker = CardLinker(ext_cards)
    star_card_ids: Set[str] = set()
    dual_card_ids: Set[str] = set()
    id_to_side_types: Dict[str, Dict[str, str]] = {}
    id_to_raw_abilities: Dict[str, Dict[str, str]] = {}

    for card in ext_cards:
        cid = str(card.get("Id", "")).strip()
        if not cid:
            continue
        star_sa = get_star_ability(card)
        if star_sa or check_is_star_card(card):
            star_card_ids.add(cid)
        if "bottom" in card.get("CardSides", {}):
            dual_card_ids.add(cid)
        id_to_side_types[cid] = {
            sk: str(get_side_field(card, sk, "Type"))
            for sk in ("top", "bottom")
            if get_side_field(card, sk, "Type")
        }
        sm: Dict[str, str] = {}
        if star_sa:
            sm["shared"] = star_sa
        elif card.get("SpecialAbility"):
            sm["shared"] = str(card.get("SpecialAbility"))
        for sk in ("top", "bottom"):
            sa = get_side_field(card, sk, "SpecialAbility")
            if sa:
                sm[sk] = str(sa)
        id_to_raw_abilities[cid] = sm

    with input_path.open("r", encoding="utf-8") as f:
        ai_data: Dict[str, Dict[str, Any]] = json.load(f)

    stats: Dict[str, int] = {
        "shared_top_deduped": 0,
        "shared_moved_to_top": 0,
        "up_to_migrated": 0,
        "band_scope_normalized": 0,
        "band_alignment_repaired": 0,
        "total_output_entries": 0,
    }

    by_cid: Dict[str, Dict[str, Dict[str, Any]]] = {}
    for key, entry in ai_data.items():
        parts = key.split("_", 1)
        cid = str(entry.get("card_id") or parts[0]).strip()
        side = str(entry.get("side") or (parts[1] if len(parts) > 1 else "top")).strip()
        entry["card_id"] = cid
        entry["side"] = side
        by_cid.setdefault(cid, {})[side] = entry

    migrated: Dict[str, Dict[str, Any]] = {}
    for cid, sides_map in by_cid.items():
        is_star = cid in star_card_ids
        is_dual = cid in dual_card_ids
        if not is_dual and "bottom" not in sides_map:
            if "shared" in sides_map and "top" in sides_map:
                sh_entry = sides_map["shared"]
                top_entry = sides_map["top"]
                sh_logic = CardSideLogic.model_validate(sh_entry["ast"])
                top_logic = CardSideLogic.model_validate(top_entry["ast"])
                if is_star:
                    # Mark star abilities and merge them into top
                    for ab in sh_logic.abilities:
                        ab.is_star = True
                        if not ab.trigger_event or ab.trigger_event.strip().lower() == "star":
                            ab.trigger_event = "star_phase"
                        if not ab.ability_id.lower().startswith("star_"):
                            ab.ability_id = f"star_{ab.ability_id}"
                        if ab.activation_mode == ActivationMode.IMMEDIATE:
                            ab.activation_mode = ActivationMode.TRIGGERED
                    top_logic.modifiers.extend(sh_logic.modifiers)
                    existing_ab_ids = {a.ability_id for a in top_logic.abilities}
                    for ab in sh_logic.abilities:
                        if ab.ability_id not in existing_ab_ids:
                            top_logic.abilities.append(ab)
                            existing_ab_ids.add(ab.ability_id)
                    top_entry["ast"] = top_logic.model_dump(exclude_none=True)
                    top_raw = id_to_raw_abilities.get(cid, {}).get("top") or top_entry.get("raw_ability", "")
                    sh_raw = id_to_raw_abilities.get(cid, {}).get("shared") or sh_entry.get("raw_ability", "")
                    if sh_raw and sh_raw not in top_raw:
                        top_entry["raw_ability"] = f"{sh_raw} {top_raw}".strip()
                    sides_map = {"top": top_entry}
                    stats["shared_top_deduped"] += 1
                else:
                    raw_text = (
                        id_to_raw_abilities.get(cid, {}).get("top")
                        or top_entry.get("raw_ability")
                        or sh_entry.get("raw_ability", "")
                    )
                    side_type = id_to_side_types.get(cid, {}).get("top", "")
                    if score_candidate_side(sh_logic, side_type, raw_text) > score_candidate_side(
                        top_logic, side_type, raw_text
                    ):
                        chosen = sh_entry
                    else:
                        chosen = top_entry
                    chosen["side"] = "top"
                    chosen["raw_ability"] = raw_text
                    sides_map = {"top": chosen}
                    stats["shared_top_deduped"] += 1
            elif "shared" in sides_map:
                sh_entry = sides_map["shared"]
                sh_entry["side"] = "top"
                if is_star:
                    sh_logic = CardSideLogic.model_validate(sh_entry["ast"])
                    for ab in sh_logic.abilities:
                        ab.is_star = True
                        if not ab.trigger_event or ab.trigger_event.strip().lower() == "star":
                            ab.trigger_event = "star_phase"
                        if not ab.ability_id.lower().startswith("star_"):
                            ab.ability_id = f"star_{ab.ability_id}"
                        if ab.activation_mode == ActivationMode.IMMEDIATE:
                            ab.activation_mode = ActivationMode.TRIGGERED
                    sh_entry["ast"] = sh_logic.model_dump(exclude_none=True)
                sides_map = {"top": sh_entry}
                stats["shared_moved_to_top"] += 1

        for side_key, entry in sides_map.items():
            raw_text = (
                id_to_raw_abilities.get(cid, {}).get(side_key)
                or entry.get("raw_ability")
                or id_to_raw_abilities.get(cid, {}).get("top", "")
            )
            side_type = (
                id_to_side_types.get(cid, {}).get(side_key)
                or id_to_side_types.get(cid, {}).get("top", "")
            )
            side_logic = CardSideLogic.model_validate(entry["ast"])
            repair_side_logic(side_logic, side_type, raw_text, stats)
            for sel in iter_selectors(side_logic):
                if sel.card_titles:
                    sel.target_card_ids = linker.resolve_titles(sel.card_titles)
            entry["ast"] = side_logic.model_dump(exclude_none=True)
            migrated[f"{cid}_{side_key}"] = entry

    stats["total_output_entries"] = len(migrated)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with output_path.open("w", encoding="utf-8") as f:
        json.dump(migrated, f, indent=2, ensure_ascii=False)

    return stats


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Migrate ai_generated_abilities.json for Stage 10 hardening.")
    parser.add_argument(
        "--input",
        type=Path,
        default=BASE_DIR / "data" / "ai_generated_abilities.json",
        help="Input ai_generated_abilities.json path",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=BASE_DIR / "data" / "ai_generated_abilities.json",
        help="Output ai_generated_abilities.json path",
    )
    args = parser.parse_args()
    migration_stats = run_migration(args.input, args.output)
    print(json.dumps(migration_stats, indent=2))
