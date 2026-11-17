"""Pipeline Stage 10: Ability Logic Verification & Game Server Export

Audits the structured ability ASTs for semantic correctness, validates
chained target reference integrity, checks REG zone constraints, and exports
the production-ready cards_logic.json file for the Colyseus rules engine.
"""

from __future__ import annotations
import argparse
import copy
import json
import re
import shutil
import sys
from pathlib import Path
from typing import Dict, List, Any, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(Path(__file__).resolve().parent))
sys.path.append(str(BASE_DIR))

from models.logic.card_logic import CardLogic, CardSideLogic
from models.logic.target_selector import TargetSelector
from models.logic.stat_filter import parse_stat_filters, StatFilter
from models.logic.target_decomposer import (
    CANONICAL_CARD_TYPES, PLURAL_CARD_TYPE_MAP, SUBTYPE_MAP, HUMAN_MAP, CLASS_MAP,
)
from models.logic.dynamic_value import DynamicValue
from models.enums import (
    SelectionMode, Zone, ActionVerb, ActivationMode, Duration, ModifierType, ConditionType,
    CHARACTER_SIDE_TYPES, GENDERS,
)
from utils.card_linker import CardLinker, normalize_chained_targets
from utils.card_helpers import check_is_star_card, get_card_name, get_side_field, get_star_ability
from utils.ast_constants_exporter import export_ast_constants
from utils.card_hierarchy_exporter import export_card_hierarchy
from fact_matrix import extract_ast_facts, verify_fact_matrix

_BAND_ZONE_RESTRICTION_RE = re.compile(
    r"\bband\b[^.;]*\b(?:in\s+play|in\s+battle|in\s+territory|in\s+territories|from\s+hand|in\s+hand|"
    r"from\s+discard|in\s+discard|from\s+reserve|in\s+reserve|from\s+set-aside|in\s+set-aside)\b",
    re.IGNORECASE,
)
_SIDE_SUFFIX_RE = re.compile(r"_(?:top|bottom|shared|star)$", re.IGNORECASE)
_TRIVIAL_ABILITY_TEXTS = {"", "none", "n/a", "meek", "-", "no special ability"}
_PLURAL_SUBTYPE_SET = {k for k, v in SUBTYPE_MAP.items() if v[2]} | set(PLURAL_CARD_TYPE_MAP.keys())
_UNMIGRATED_HUMAN_TOKENS = {
    "human", "humans", "non-human", "non-humans",
} | set(HUMAN_MAP.keys())
_UNMIGRATED_CLASS_TOKENS = {
    "warrior", "warriors", "warrior class", "warrior-class",
    "weapon", "weapons", "weapon class", "weapon-class",
    "depicting a weapon", "depicting weapons", "illustration depicting a weapon",
    "territory class", "territory-class",
} | set(CLASS_MAP.keys())


def _audit_selector_invariants(sel: TargetSelector, ab_id: str, side_key: str, issues: List[str]) -> None:
    """Checks that a TargetSelector adheres to canonical CardType, singular identifier, and testament rules."""
    if sel.target_type and sel.target_type not in CANONICAL_CARD_TYPES:
        issues.append(f"Non-canonical target_type '{sel.target_type}' in '{ab_id}' ({side_key})")
    for ident in sel.identifiers:
        low = ident.strip().lower()
        if low in ("o.t.", "n.t.", "ot", "nt", "old testament", "new testament"):
            issues.append(f"Unextracted testament '{ident}' in identifiers of '{ab_id}' ({side_key})")
        if low in ("male", "female"):
            issues.append(f"Unmigrated gender '{ident}' in identifiers of '{ab_id}' ({side_key})")
        if low in ("generic", "unique"):
            issues.append(f"Unmigrated generic qualifier '{ident}' in identifiers of '{ab_id}' ({side_key})")
        if low in _UNMIGRATED_HUMAN_TOKENS:
            issues.append(f"Unmigrated human qualifier '{ident}' in identifiers of '{ab_id}' ({side_key})")
        if low in _UNMIGRATED_CLASS_TOKENS:
            issues.append(f"Unmigrated class qualifier '{ident}' in identifiers of '{ab_id}' ({side_key})")
        if low in _PLURAL_SUBTYPE_SET:
            issues.append(f"Unsplit/plural identifier '{ident}' in '{ab_id}' ({side_key})")
        if parse_stat_filters(ident):
            issues.append(f"Unmigrated stat filter '{ident}' in identifiers of '{ab_id}' ({side_key})")
    for sf in sel.stat_filters:
        if sf.value is None and not sf.variable:
            issues.append(f"StatFilter without value or variable in '{ab_id}' ({side_key})")
CONFIG_FILE = BASE_DIR / "config.json"
with CONFIG_FILE.open("r", encoding="utf-8") as _cf:
    _config = json.load(_cf)

INPUT_FILE = BASE_DIR / _config.get("card_abilities_raw", "data/card_abilities_raw.json")
OUTPUT_LOGIC_FILE = BASE_DIR / _config.get("cards_logic_json", "data/dist/cards_logic.json")
OUTPUT_CONSTANTS_FILE = BASE_DIR / "data" / "dist" / "ast_constants.json"
OUTPUT_HIERARCHY_FILE = BASE_DIR / _config.get("card_hierarchy_json", "data/dist/cardHierarchy.json")
REPORT_LOG = BASE_DIR / _config.get("logic_verification_report", "data/logic_verification_report.log")
CARDS_EXT_FILE = BASE_DIR / _config.get("cards_extended_with_ordir_fuzzy", "data/cards_extended_with_ordir_fuzzy.json")


def merge_side_ast(
    existing_side: Optional[Dict[str, Any]],
    incoming_ast: Dict[str, Any],
    is_star_entry: bool = False,
) -> Dict[str, Any]:
    """Merges an incoming Stage 9 AST into an existing Stage 8/9 side payload without data loss.

    Preserves deterministic ``is_star=True`` abilities when merging regular ``top``/``shared`` AI
    abilities, and conversely preserves regular abilities when merging a ``side="star"`` AI entry.

    Args:
        existing_side: Existing serialized CardSideLogic dict on the target side, or None.
        incoming_ast: Incoming serialized CardSideLogic dict from Stage 9.
        is_star_entry: True when the incoming Stage 9 entry had ``side="star"``.

    Returns:
        Merged CardSideLogic dictionary ready for schema validation and verification.
    """
    incoming = copy.deepcopy(incoming_ast)
    if is_star_entry:
        for ab in incoming.get("abilities", []):
            ab["is_star"] = True
            trig = (ab.get("trigger_event") or "").strip().lower()
            if not trig or trig == "star":
                ab["trigger_event"] = "star_phase"
            ab_id = ab.get("ability_id") or "ability"
            if not ab_id.lower().startswith("star_"):
                ab["ability_id"] = f"star_{ab_id}"
            if ab.get("activation_mode") == "immediate":
                ab["activation_mode"] = "triggered"

    if not existing_side:
        return incoming

    merged = copy.deepcopy(existing_side)
    existing_abs = list(merged.get("abilities", []))
    incoming_abs = list(incoming.get("abilities", []))

    if is_star_entry:
        # Keep existing regular (non-star) abilities and supply incoming Star abilities
        regular_abs = [ab for ab in existing_abs if not ab.get("is_star")]
        merged["abilities"] = regular_abs + incoming_abs
    else:
        incoming_has_star = any(bool(ab.get("is_star")) for ab in incoming_abs)
        incoming_has_reg = any(not bool(ab.get("is_star")) for ab in incoming_abs)
        if incoming_has_star and not incoming_has_reg:
            regular_abs = [ab for ab in existing_abs if not ab.get("is_star")]
            merged["abilities"] = regular_abs + incoming_abs
        elif incoming_has_star:
            merged["abilities"] = incoming_abs
        else:
            # Retain deterministically parsed is_star abilities alongside incoming regular abilities
            existing_star_abs = [ab for ab in existing_abs if ab.get("is_star")]
            merged["abilities"] = existing_star_abs + incoming_abs

    seen_mods = {
        (m.get("modifier_type"), m.get("applies_to"))
        for m in merged.get("modifiers", [])
        if isinstance(m, dict)
    }
    merged_mods = list(merged.get("modifiers", []))
    for m in incoming.get("modifiers", []):
        sig = (m.get("modifier_type"), m.get("applies_to")) if isinstance(m, dict) else None
        if sig not in seen_mods:
            merged_mods.append(m)
            seen_mods.add(sig)
    merged["modifiers"] = merged_mods

    for meta_key in ("gender", "is_generic", "is_human"):
        if merged.get(meta_key) is None and incoming.get(meta_key) is not None:
            merged[meta_key] = incoming[meta_key]
    if not merged.get("classes") and incoming.get("classes"):
        merged["classes"] = list(incoming["classes"])

    return merged


def _combine_raw_texts_for_side(
    side_key: str,
    side_logic: CardSideLogic,
    raw_abilities: Dict[str, str],
) -> tuple[str, str]:
    """Resolves banding raw context text and fact-matrix raw text for a card side.

    Matches Star-only parsed sides solely against Star text so partially parsed cards
    with an unparsed regular side are not falsely rejected by ``verify_fact_matrix``.

    Args:
        side_key: Target side key (``top``, ``bottom``, or ``shared``).
        side_logic: Validated CardSideLogic instance for the side.
        raw_abilities: Mapping of raw text sources (``top``, ``bottom``, ``shared``, ``star``).

    Returns:
        Tuple of ``(raw_text_for_banding_checks, raw_text_for_fact_matrix)``.
    """
    base_reg = (raw_abilities.get(side_key) or raw_abilities.get("shared") or "").strip()
    star_txt = (raw_abilities.get("star") or "").strip()

    banding_parts = []
    if base_reg:
        banding_parts.append(base_reg)
    elif raw_abilities.get("top") and side_key != "bottom":
        banding_parts.append(raw_abilities["top"].strip())
    if star_txt and side_key in ("top", "shared") and star_txt not in " ".join(banding_parts):
        banding_parts.append(star_txt)
    banding_text = " ".join(p for p in banding_parts if p)

    has_star = any(ab.is_star for ab in side_logic.abilities)
    has_reg = any(not ab.is_star for ab in side_logic.abilities)

    if has_star and not has_reg:
        fact_text = star_txt or base_reg
    elif has_star and has_reg:
        if star_txt and star_txt.lower() not in base_reg.lower():
            fact_text = f"{base_reg} {star_txt}".strip()
        else:
            fact_text = base_reg or star_txt
    else:
        fact_text = base_reg

    return banding_text, fact_text


def _is_trivial_ability_text(text: Any) -> bool:
    """Returns True when a SpecialAbility text represents no executable ability."""
    cleaned = str(text or "").strip().lower()
    return cleaned in _TRIVIAL_ABILITY_TEXTS


def _collect_unresolved_selectors(node: Any, path: str = "") -> List[tuple[str, List[str]]]:
    """Walks a serialized CardSideLogic dict and collects selectors with unresolved card_titles."""
    hits: List[tuple[str, List[str]]] = []
    if isinstance(node, dict):
        titles = node.get("card_titles")
        if titles and not node.get("target_card_ids"):
            hits.append((path, list(titles)))
        for k, v in node.items():
            hits.extend(_collect_unresolved_selectors(v, f"{path}.{k}" if path else k))
    elif isinstance(node, list):
        for idx, item in enumerate(node):
            hits.extend(_collect_unresolved_selectors(item, f"{path}[{idx}]"))
    return hits


def audit_ext_coverage(
    ext_cards: List[Dict[str, Any]],
    raw_map: Dict[str, Dict[str, Any]],
    dist_map: Dict[str, Dict[str, Any]],
) -> Dict[str, List[str]]:
    """Audits Stage 10 logic coverage and structural consistency against extended card data.

    All checks are non-blocking and reported as structured sections in
    ``logic_verification_report.log`` without excluding otherwise valid cards from export.

    Args:
        ext_cards: Canonical extended card list from ``cards_extended_with_ordir_fuzzy.json``.
        raw_map: Combined Stage 8 + Stage 9 card logic map.
        dist_map: Exportable clean distribution card map.

    Returns:
        Dictionary mapping audit category names to formatted finding lines.
    """
    sections: Dict[str, List[str]] = {
        "missing_from_logic": [],
        "orphaned_ids": [],
        "missing_regular_sides": [],
        "missing_star_abilities": [],
        "shared_vs_top_deviations": [],
        "unresolved_card_titles": [],
    }
    ext_ids: set[str] = set()

    for c in ext_cards:
        cid = str(c.get("Id", "")).strip()
        if not cid:
            continue
        ext_ids.add(cid)
        cname = get_card_name(c) or f"Card {cid}"
        sides_dict = c.get("CardSides", {})
        is_dual = isinstance(sides_dict.get("bottom"), dict)

        logic_entry = dist_map.get(cid)
        if not logic_entry:
            status = "rejected_by_verifier" if cid in raw_map else "missing_from_raw_and_ai"
            sections["missing_from_logic"].append(f"[{cid}] {cname} ({status})")
            logic_entry = raw_map.get(cid)
            if not logic_entry:
                continue

        sides_ast = logic_entry.get("sides", {})
        star_sa = get_star_ability(c).strip()
        shared_sa = (
            (c.get("SpecialAbility") or "")
            or (sides_dict.get("shared", {}).get("SpecialAbility", "") if isinstance(sides_dict.get("shared"), dict) else "")
        ).strip()
        direct_top_sa = (
            sides_dict.get("top", {}).get("SpecialAbility", "")
            if isinstance(sides_dict.get("top"), dict)
            else ""
        ) or ""
        direct_bottom_sa = (
            sides_dict.get("bottom", {}).get("SpecialAbility", "")
            if isinstance(sides_dict.get("bottom"), dict)
            else ""
        ) or ""
        has_shared_regular_sa = bool(
            shared_sa and not re.match(r"^(?:STAR\s*:|\(\s*Star\s*\))", shared_sa, re.I)
        )

        def _has_regular_logic(s_node: Optional[Dict[str, Any]]) -> bool:
            if not s_node:
                return False
            has_reg_ab = any(not ab.get("is_star") for ab in s_node.get("abilities", []))
            return has_reg_ab or bool(s_node.get("modifiers"))

        # 1. Missing regular non-trivial SpecialAbility sides (uses direct CardSides keys without fallback)
        if is_dual:
            if not _is_trivial_ability_text(direct_top_sa):
                if not _has_regular_logic(sides_ast.get("top")):
                    sections["missing_regular_sides"].append(
                        f"[{cid}] {cname} | missing/empty 'top' side | ext_top={direct_top_sa!r}"
                    )
            if not _is_trivial_ability_text(direct_bottom_sa):
                if not _has_regular_logic(sides_ast.get("bottom")):
                    sections["missing_regular_sides"].append(
                        f"[{cid}] {cname} | missing/empty 'bottom' side | ext_bottom={direct_bottom_sa!r}"
                    )
            if has_shared_regular_sa and not _is_trivial_ability_text(shared_sa):
                if not _has_regular_logic(sides_ast.get("shared")):
                    sections["missing_regular_sides"].append(
                        f"[{cid}] {cname} | missing/empty 'shared' side | ext_shared={shared_sa!r}"
                    )
        else:
            expected_single_sa = shared_sa if has_shared_regular_sa else direct_top_sa
            if not _is_trivial_ability_text(expected_single_sa):
                if not _has_regular_logic(sides_ast.get("top")):
                    sections["missing_regular_sides"].append(
                        f"[{cid}] {cname} | missing/empty 'top' side | ext={expected_single_sa!r}"
                    )

        # 2. Missing StarAbility
        if not _is_trivial_ability_text(star_sa):
            has_star_ast = any(
                bool(ab.get("is_star"))
                for s_data in sides_ast.values()
                for ab in s_data.get("abilities", [])
            )
            if not has_star_ast:
                kind = "dual" if is_dual else "single"
                sections["missing_star_abilities"].append(
                    f"[{cid}] {cname} ({kind}) | missing is_star AST | star={star_sa!r}"
                )

        # 3. Shared vs Top side deviations
        has_shared_ast = "shared" in sides_ast
        has_top_ast = "top" in sides_ast
        if not is_dual and has_shared_ast:
            sections["shared_vs_top_deviations"].append(
                f"[{cid}] {cname} | single-sided card uses 'shared' in logic (sides={sorted(sides_ast)})"
            )
        elif (
            is_dual
            and has_shared_ast
            and not has_top_ast
            and not has_shared_regular_sa
            and not _is_trivial_ability_text(direct_top_sa)
        ):
            sections["shared_vs_top_deviations"].append(
                f"[{cid}] {cname} | dual card has 'shared' without 'top' despite non-trivial direct top SA"
            )
        elif not is_dual and isinstance(sides_dict.get("shared"), dict) and not isinstance(sides_dict.get("top"), dict):
            if has_shared_regular_sa and not _is_trivial_ability_text(shared_sa) and has_top_ast:
                sections["shared_vs_top_deviations"].append(
                    f"[{cid}] {cname} | ext CardSides uses 'shared' (no 'top') while logic stores under 'top'"
                )

        # 4. Unresolved card_titles without target_card_ids
        for skey, s_data in sides_ast.items():
            for path, titles in _collect_unresolved_selectors(s_data, skey):
                sections["unresolved_card_titles"].append(
                    f"[{cid}] {cname} | {path} | card_titles={titles}"
                )

    for rid in sorted(set(raw_map.keys()) - ext_ids):
        sections["orphaned_ids"].append(f"[{rid}] present in raw/AI logic but absent from extended DB")

    return sections


def verify_card_logic(
    card_id: str,
    card_data: Dict[str, Any],
    linker: CardLinker | None = None,
    has_star_ability: bool = False,
    is_dual_card: bool = False,
    side_types: Dict[str, str] | None = None,
    side_genders: Dict[str, str] | None = None,
    side_generics: Dict[str, bool] | None = None,
    side_humans: Dict[str, bool] | None = None,
    side_classes: Dict[str, List[str]] | None = None,
    raw_abilities: Dict[str, str] | None = None,
) -> tuple[List[str], Dict[str, Any] | None]:
    """Audits CardLogic node integrity and links referenced card_titles to canonical IDs.

    Args:
        card_id: Unique card identifier.
        card_data: Raw dictionary representation of CardLogic.
        linker: Optional CardLinker instance for resolving card_titles to IDs.
        has_star_ability: True if the card has a card-wide StarAbility in extended card data.
        is_dual_card: True if the card has a bottom side in extended card data.
        side_types: Optional mapping of side keys ('top', 'bottom') to CardType strings.
        side_genders: Optional mapping of side keys to resolved character Gender strings.
        side_generics: Optional mapping of side keys to resolved IsGeneric booleans.
        side_humans: Optional mapping of side keys to resolved IsHuman booleans.
        side_classes: Optional mapping of side keys to normalized Classes lists.
        raw_abilities: Optional mapping of card sides to raw ability texts for factual matrix audit.

    Returns:
        Tuple of (issues list, compiled/linked data dict or None).
    """
    issues: List[str] = []

    try:
        card_logic = CardLogic.model_validate(card_data)
    except Exception as e:
        return [f"Schema validation failure: {e}"], None

    if "shared" in card_logic.sides and not is_dual_card and "bottom" not in card_logic.sides:
        if "top" in card_logic.sides:
            issues.append("Conflicting 'shared' and 'top' sides on single-sided card (expected 'top' only)")
        else:
            issues.append("Orphaned 'shared' side on single-sided card (expected 'top')")

    for side_key, side_logic in card_logic.sides.items():
        raw_text_for_side = ""
        raw_text_for_fact = ""
        if raw_abilities:
            raw_text_for_side, raw_text_for_fact = _combine_raw_texts_for_side(
                side_key, side_logic, raw_abilities
            )
        side_card_type = ""
        if side_types:
            side_card_type = side_types.get(side_key) or side_types.get("top", "")
        if side_genders:
            resolved_side_gender = side_genders.get(side_key)
            if resolved_side_gender is None and side_key == "shared":
                unique_genders = set(side_genders.values())
                if len(unique_genders) == 1 and (not side_types or len(side_genders) == len(side_types)):
                    resolved_side_gender = next(iter(unique_genders))
            if resolved_side_gender in GENDERS:
                side_logic.gender = resolved_side_gender  # type: ignore[assignment]
        if side_generics:
            resolved_side_generic = side_generics.get(side_key)
            if resolved_side_generic is None and side_key == "shared":
                unique_generics = set(side_generics.values())
                if len(unique_generics) == 1 and (not side_types or len(side_generics) == len(side_types)):
                    resolved_side_generic = next(iter(unique_generics))
            if isinstance(resolved_side_generic, bool):
                side_logic.is_generic = resolved_side_generic
        if side_humans:
            resolved_side_human = side_humans.get(side_key)
            if resolved_side_human is None and side_key == "shared":
                unique_humans = set(side_humans.values())
                if len(unique_humans) == 1 and (not side_types or len(side_humans) == len(side_types)):
                    resolved_side_human = next(iter(unique_humans))
            if isinstance(resolved_side_human, bool):
                side_logic.is_human = resolved_side_human
        if side_classes:
            resolved_side_classes = side_classes.get(side_key)
            if resolved_side_classes is None and side_key == "shared":
                unique_class_tuples = {tuple(v) for v in side_classes.values()}
                if len(unique_class_tuples) == 1 and (not side_types or len(side_classes) == len(side_types)):
                    resolved_side_classes = list(next(iter(unique_class_tuples)))
            if resolved_side_classes:
                side_logic.classes = list(resolved_side_classes)
        # Auto-renumber duplicate step indices before normalizing chained targets
        for ability in side_logic.abilities:
            cost_steps = [c.step for c in ability.costs]
            if len(cost_steps) != len(set(cost_steps)):
                for idx, cost in enumerate(ability.costs, start=1):
                    cost.step = idx
            eff_steps = [e.step for e in ability.effects]
            if len(eff_steps) != len(set(eff_steps)) or bool(set(cost_steps) & set(eff_steps)):
                offset = max(cost_steps) if cost_steps else 0
                for idx, eff in enumerate(ability.effects, start=1):
                    eff.step = offset + idx

        normalize_chained_targets(side_logic)
        has_explicit_star_ab = any(
            ability.is_star or ability.ability_id.lower().startswith("star_")
            for ability in side_logic.abilities
        )
        has_regular_shared_text = bool(
            raw_abilities
            and raw_abilities.get("shared")
            and raw_abilities["shared"].strip() != raw_abilities.get("star", "").strip()
        )
        for ability in side_logic.abilities:
            if (
                side_key == "shared"
                and has_star_ability
                and not has_explicit_star_ab
                and not has_regular_shared_text
            ) or (
                has_star_ability and (ability.is_star or ability.ability_id.lower().startswith("star_"))
            ):
                ability.is_star = True
                if not ability.trigger_event or ability.trigger_event.strip().lower() == "star":
                    ability.trigger_event = "star_phase"
                if not ability.ability_id.lower().startswith("star_"):
                    ability.ability_id = f"star_{ability.ability_id}"
                if ability.activation_mode == ActivationMode.IMMEDIATE:
                    ability.activation_mode = ActivationMode.TRIGGERED
            # Check sequential integrity within costs
            seen_cost_steps = set()
            for cost in ability.costs:
                if cost.step in seen_cost_steps:
                    issues.append(f"Duplicate step index {cost.step} in costs of '{ability.ability_id}' ({side_key})")
                seen_cost_steps.add(cost.step)

            # Check sequential integrity and chained references within effects
            seen_eff_steps = set()
            prior_steps = set(seen_cost_steps)
            for eff in ability.effects:
                if eff.step in seen_eff_steps:
                    issues.append(f"Duplicate step index {eff.step} in ability '{ability.ability_id}' ({side_key})")
                seen_eff_steps.add(eff.step)

                # Check chained target reference validity
                if eff.target and eff.target.selection_mode == SelectionMode.CHAINED_TARGET:
                    ref = eff.target.ref_step
                    if ref is None:
                        issues.append(f"Step {eff.step} uses CHAINED_TARGET but ref_step is missing in '{ability.ability_id}'")
                    elif ref >= eff.step or ref not in prior_steps:
                        issues.append(f"Step {eff.step} references non-prior step {ref} in '{ability.ability_id}'")
                prior_steps.add(eff.step)

                # Check Land of Bondage constraints per REG
                if eff.destination == Zone.LAND_OF_BONDAGE:
                    if eff.action != ActionVerb.CAPTURE and (not eff.target or eff.target.target_type != "lost_soul"):
                        # Characters are allowed via CAPTURE; lost souls are allowed directly
                        issues.append(f"Step {eff.step} moves to Land of Bondage without CAPTURE or Lost Soul in '{ability.ability_id}'")

                # Auto-normalize contradictory duration on instant actions (e.g. discard with permanent duration)
                if eff.action in (ActionVerb.DISCARD, ActionVerb.DRAW, ActionVerb.BANISH) and eff.duration in (Duration.PERMANENT, "permanent"):
                    eff.duration = Duration.INSTANT

                # Sanitize and normalize DRAW semantics across rule-based and AI-generated ASTs
                if eff.action == ActionVerb.DRAW:
                    if eff.destination is None:
                        eff.destination = Zone.HAND
                    if eff.target is None:
                        eff.target = TargetSelector(
                            selection_mode=SelectionMode.AUTOMATIC_NEXT,
                            zone_owner="controller",
                            scope=[Zone.DECK],
                            count=DynamicValue.from_int(1)
                        )
                    else:
                        if eff.target.scope != [Zone.DECK]:
                            eff.target.scope = [Zone.DECK]
                        if eff.target.selection_mode == SelectionMode.AUTOMATIC_ALL:
                            eff.target.selection_mode = SelectionMode.AUTOMATIC_NEXT

                # Sanitize and normalize DISCARD semantics across rule-based and AI-generated ASTs
                if eff.action == ActionVerb.DISCARD:
                    if eff.destination is None:
                        eff.destination = Zone.DISCARD_PILE
                    if eff.target:
                        if eff.target.target_type == "evil card":
                            eff.target.target_type = "card"
                            if not eff.target.alignment:
                                eff.target.alignment = "evil"
                        elif eff.target.target_type == "good card":
                            eff.target.target_type = "card"
                            if not eff.target.alignment:
                                eff.target.alignment = "good"
                        if eff.target.alignment == "evil" and eff.target.zone_owner == "controller":
                            eff.target.zone_owner = "either"

                # Normalize standard BAND scope and validate against alignment hallucinations
                if eff.action == ActionVerb.BAND and eff.target:
                    if eff.target.scope in ([Zone.IN_PLAY], [Zone.BATTLE]) and not _BAND_ZONE_RESTRICTION_RE.search(raw_text_for_side):
                        eff.target.scope = [Zone.IN_PLAY, Zone.HAND]
                    if raw_text_for_side:
                        import re as _re
                        if side_card_type in ("EE", "Evil Character", "Curse") and (
                            eff.target.target_type == "hero" or eff.target.alignment == "good"
                        ):
                            if not _re.search(r"\b(?:hero|heroes|good)\b", raw_text_for_side, _re.I):
                                issues.append(
                                    f"Banding alignment hallucination in '{ability.ability_id}' ({side_key}): "
                                    f"{side_card_type} bands to hero/good without raw text support"
                                )
                        elif side_card_type in ("GE", "Hero", "Covenant") and (
                            eff.target.target_type == "evil_character" or eff.target.alignment == "evil"
                        ):
                            if not _re.search(r"\b(?:evil\s+characters?|evil)\b", raw_text_for_side, _re.I):
                                issues.append(
                                    f"Banding alignment hallucination in '{ability.ability_id}' ({side_key}): "
                                    f"{side_card_type} bands to evil_character/evil without raw text support"
                                )

            # Audit selector invariants across conditions, costs, effects, and triggers
            if ability.trigger_filter:
                _audit_selector_invariants(ability.trigger_filter, ability.ability_id, side_key, issues)
            for cond in ability.conditions:
                if cond.selector:
                    _audit_selector_invariants(cond.selector, ability.ability_id, side_key, issues)
            for cost in ability.costs:
                if cost.action == ActionVerb.BAND and cost.target:
                    if cost.target.scope in ([Zone.IN_PLAY], [Zone.BATTLE]) and not _BAND_ZONE_RESTRICTION_RE.search(raw_text_for_side):
                        cost.target.scope = [Zone.IN_PLAY, Zone.HAND]
                if cost.target:
                    _audit_selector_invariants(cost.target, ability.ability_id, side_key, issues)
            for eff in ability.effects:
                if eff.target:
                    _audit_selector_invariants(eff.target, ability.ability_id, side_key, issues)
                if eff.protection_filter:
                    for cs in eff.protection_filter.card_sources:
                        _audit_selector_invariants(cs, ability.ability_id, side_key, issues)

            # Check for completely empty ability clause
            if not ability.effects and not ability.costs and not ability.modifiers:
                issues.append(f"Ability '{ability.ability_id}' ({side_key}) has no effects, costs, or modifiers")

            # Resolve card_titles to canonical target_card_ids if linker provided
            if linker:
                if ability.trigger_filter and ability.trigger_filter.card_titles:
                    ability.trigger_filter.target_card_ids = linker.resolve_titles(ability.trigger_filter.card_titles)
                for cond in ability.conditions:
                    if cond.selector and cond.selector.card_titles:
                        cond.selector.target_card_ids = linker.resolve_titles(cond.selector.card_titles)
                for cost in ability.costs:
                    if cost.target and cost.target.card_titles:
                        cost.target.target_card_ids = linker.resolve_titles(cost.target.card_titles)
                for eff in ability.effects:
                    if eff.target and eff.target.card_titles:
                        eff.target.target_card_ids = linker.resolve_titles(eff.target.card_titles)
                    if eff.protection_filter:
                        for cs in eff.protection_filter.card_sources:
                            if cs.card_titles:
                                cs.target_card_ids = linker.resolve_titles(cs.card_titles)
                    if eff.action in (ActionVerb.PROTECT, ActionVerb.IMMUNE) and eff.target:
                        for ident in eff.target.identifiers:
                            if ident.lower() in ("harm", "rescue", "discard abilities", "capture abilities", "convert abilities"):
                                issues.append(f"Leaked protection cause in target.identifiers: '{ident}' in '{ability.ability_id}'")

        # Audit against raw ability text via factual game-mechanic matrix
        if raw_abilities:
            raw_text = raw_text_for_fact
            if raw_text and raw_text.strip().lower() not in ("none", "n/a", "meek"):
                is_valid, fact_issues = verify_fact_matrix(raw_text, extract_ast_facts(side_logic))
                if not is_valid:
                    for fi in fact_issues:
                        issues.append(f"Fact matrix issue ({side_key}): {fi}")

    return issues, card_logic.model_dump(exclude_none=True)


def run_logic_verifier(export_dist: bool = True) -> None:
    """Audits all raw logic models and generates the production distribution file.

    Args:
        export_dist: Whether to export production files under data/dist/.
    """
    if not INPUT_FILE.exists():
        print(f"Error: Raw logic file not found at {INPUT_FILE}")
        sys.exit(1)

    linker: CardLinker | None = None
    id_to_meta: Dict[str, tuple[str, str]] = {}
    star_card_ids: set[str] = set()
    dual_card_ids: set[str] = set()
    id_to_side_types: Dict[str, Dict[str, str]] = {}
    id_to_side_genders: Dict[str, Dict[str, str]] = {}
    id_to_side_generics: Dict[str, Dict[str, bool]] = {}
    id_to_side_humans: Dict[str, Dict[str, bool]] = {}
    id_to_side_classes: Dict[str, Dict[str, List[str]]] = {}
    id_to_raw_abilities: Dict[str, Dict[str, str]] = {}
    if CARDS_EXT_FILE.exists():
        print(f"Loading extended cards for ID linking from: {CARDS_EXT_FILE}")
        with CARDS_EXT_FILE.open("r", encoding="utf-8") as f:
            ext_cards = json.load(f).get("cards", [])
            linker = CardLinker(ext_cards)
            for c in ext_cards:
                cid = str(c.get("Id", "")).strip()
                if not cid:
                    continue
                id_to_meta[cid] = (get_card_name(c), c.get("OfficialSet", ""))
                star_sa = get_star_ability(c)
                if star_sa or check_is_star_card(c):
                    star_card_ids.add(cid)
                sides_dict = c.get("CardSides", {})
                if "bottom" in sides_dict:
                    dual_card_ids.add(cid)
                st_map: Dict[str, str] = {}
                sg_map: Dict[str, str] = {}
                sgen_map: Dict[str, bool] = {}
                shum_map: Dict[str, bool] = {}
                scls_map: Dict[str, List[str]] = {}
                real_side_keys = [
                    k for k, v in sides_dict.items()
                    if k != "shared" and isinstance(v, dict)
                ] or ["top"]
                for sk in ("top", "bottom"):
                    t_val = get_side_field(c, sk, "Type")
                    if t_val:
                        st_map[sk] = str(t_val)
                for sk in real_side_keys:
                    t_val = get_side_field(c, sk, "Type")
                    cls_val = get_side_field(c, sk, "Classes")
                    if isinstance(cls_val, list) and cls_val:
                        cls_list = [str(x) for x in cls_val if x]
                        if cls_list:
                            scls_map[sk] = cls_list
                            if sk not in ("top", "bottom"):
                                scls_map.setdefault("top", list(cls_list))
                    if t_val in CHARACTER_SIDE_TYPES:
                        g_val = get_side_field(c, sk, "Gender")
                        if g_val in GENDERS:
                            sg_map[sk] = str(g_val)
                            if sk not in ("top", "bottom"):
                                sg_map.setdefault("top", str(g_val))
                        ig_val = get_side_field(c, sk, "IsGeneric")
                        if isinstance(ig_val, bool):
                            sgen_map[sk] = ig_val
                            if sk not in ("top", "bottom"):
                                sgen_map.setdefault("top", ig_val)
                        ih_val = get_side_field(c, sk, "IsHuman")
                        if isinstance(ih_val, bool):
                            shum_map[sk] = ih_val
                            if sk not in ("top", "bottom"):
                                shum_map.setdefault("top", ih_val)
                id_to_side_types[cid] = st_map
                if sg_map:
                    id_to_side_genders[cid] = sg_map
                if sgen_map:
                    id_to_side_generics[cid] = sgen_map
                if shum_map:
                    id_to_side_humans[cid] = shum_map
                if scls_map:
                    id_to_side_classes[cid] = scls_map
                sm: Dict[str, str] = {}
                top_sa = get_side_field(c, "top", "SpecialAbility")
                bottom_sa = get_side_field(c, "bottom", "SpecialAbility")
                shared_node = sides_dict.get("shared", {}) if isinstance(sides_dict.get("shared"), dict) else {}
                shared_sa = (c.get("SpecialAbility") or shared_node.get("SpecialAbility") or "").strip()
                if star_sa:
                    sm["star"] = star_sa
                if shared_sa and not re.match(r"^(?:STAR\s*:|\(\s*Star\s*\))", shared_sa, re.IGNORECASE):
                    sm["shared"] = shared_sa
                if top_sa:
                    sm["top"] = top_sa
                if bottom_sa:
                    sm["bottom"] = bottom_sa
                id_to_raw_abilities[cid] = sm
            print(f"CardLinker initialized with {len(linker._index)} cards.")
    else:
        ext_cards = []

    print(f"Loading raw card abilities from: {INPUT_FILE}")
    with INPUT_FILE.open("r", encoding="utf-8") as f:
        raw_map: Dict[str, Dict[str, Any]] = json.load(f)

    # Merge AI generated abilities (Stage 9) cleanly without dropping Star or partial sides
    AI_INPUT_FILE = BASE_DIR / "data" / "ai_generated_abilities.json"
    if AI_INPUT_FILE.exists():
        print(f"Merging AI generated abilities from: {AI_INPUT_FILE}")
        with AI_INPUT_FILE.open("r", encoding="utf-8") as f_ai:
            ai_data = json.load(f_ai)
        for entry in ai_data.values():
            cid = _SIDE_SUFFIX_RE.sub("", str(entry.get("card_id", "")).strip())
            raw_side = entry.get("side", "shared")
            is_star_entry = raw_side == "star"
            target_side = ("shared" if cid in dual_card_ids else "top") if is_star_entry else raw_side
            ast = entry.get("ast")
            raw_ab = entry.get("raw_ability", "").strip()
            if not cid or not ast:
                continue
            if cid not in id_to_raw_abilities:
                id_to_raw_abilities[cid] = {}
            if raw_ab:
                if is_star_entry:
                    id_to_raw_abilities[cid].setdefault("star", raw_ab)
                else:
                    id_to_raw_abilities[cid].setdefault(target_side, raw_ab)
            if cid not in raw_map:
                raw_map[cid] = {"card_identifier": cid, "sides": {}}
            existing_side_ast = raw_map[cid]["sides"].get(target_side)
            raw_map[cid]["sides"][target_side] = merge_side_ast(
                existing_side_ast, ast, is_star_entry=is_star_entry
            )

    total_cards = len(raw_map)
    clean_cards = 0
    total_issues = 0
    issue_report: Dict[str, List[str]] = {}
    verified_distribution_map: Dict[str, Dict[str, Any]] = {}

    print(f"Verifying {total_cards} card logic trees...")
    for card_id, card_data in raw_map.items():
        card_issues, linked_data = verify_card_logic(
            card_id,
            card_data,
            linker=linker,
            has_star_ability=(card_id in star_card_ids),
            is_dual_card=(card_id in dual_card_ids),
            side_types=id_to_side_types.get(card_id),
            side_genders=id_to_side_genders.get(card_id),
            side_generics=id_to_side_generics.get(card_id),
            side_humans=id_to_side_humans.get(card_id),
            side_classes=id_to_side_classes.get(card_id),
            raw_abilities=id_to_raw_abilities.get(card_id),
        )
        meta_name, meta_set = id_to_meta.get(card_id, ("", ""))
        node = linked_data or card_data
        entry_payload = {
            "card_id": card_id,
            "card_name": meta_name or card_data.get("card_name", ""),
            "set": meta_set or card_data.get("set", ""),
            "sides": node.get("sides", {})
        }
        if card_issues:
            total_issues += len(card_issues)
            issue_report[card_id] = card_issues
        else:
            clean_cards += 1
            verified_distribution_map[card_id] = entry_payload

    if export_dist:
        # Ensure output dist directory exists
        OUTPUT_LOGIC_FILE.parent.mkdir(parents=True, exist_ok=True)
        with OUTPUT_LOGIC_FILE.open("w", encoding="utf-8") as out:
            json.dump(verified_distribution_map, out, indent=2, ensure_ascii=False)

        # Export canonical AST constants and enums as single source of truth
        export_ast_constants(OUTPUT_CONSTANTS_FILE)

        # Export canonical card type hierarchy (types, groups, IS-A inheritance)
        export_card_hierarchy(OUTPUT_HIERARCHY_FILE)

        # Bundle complete production card databases into dist/
        dist_dir = OUTPUT_LOGIC_FILE.parent
        if CARDS_EXT_FILE.exists():
            shutil.copy2(CARDS_EXT_FILE, dist_dir / "cards_extended_with_ordir_fuzzy.json")
        raw_carddata = BASE_DIR / "data" / "carddata.json"
        if raw_carddata.exists():
            shutil.copy2(raw_carddata, dist_dir / "carddata.json")

    coverage_audit = audit_ext_coverage(ext_cards, raw_map, verified_distribution_map)

    # Write audit log report
    with REPORT_LOG.open("w", encoding="utf-8") as rep:
        rep.write(f"# Redemption Ability Logic Verification Report\n# Total Cards Evaluated: {total_cards}\n"
                  f"# Clean Verified Cards:  {clean_cards} ({clean_cards / max(1, total_cards):.1%})\n"
                  f"# Total Issues Found:    {total_issues}\n\n")

        if issue_report:
            rep.write("## Issues Detected:\n")
            for cid, errs in issue_report.items():
                rep.write(f"- Card [{cid}]:\n")
                for err in errs:
                    rep.write(f"    * {err}\n")
        else:
            rep.write("All evaluated cards passed semantic and structural validation without errors.\n")

        section_titles = {
            "missing_from_logic": "## Audit (Non-Blocking): Missing Cards vs. Extended DB",
            "orphaned_ids": "## Audit (Non-Blocking): Orphaned Card IDs",
            "missing_regular_sides": "## Audit (Non-Blocking): Missing Non-Trivial SpecialAbility Sides",
            "missing_star_abilities": "## Audit (Non-Blocking): Missing StarAbilities (is_star=True)",
            "shared_vs_top_deviations": "## Audit (Non-Blocking): Shared vs. Top Side Deviations",
            "unresolved_card_titles": "## Audit (Non-Blocking): Unresolved card_titles Without target_card_ids",
        }
        rep.write("\n## Coverage & Structural Audit Summary (Non-Blocking):\n")
        for key, title in section_titles.items():
            rep.write(f"- {title.split(': ', 1)[1]}: {len(coverage_audit[key])}\n")
        rep.write("\n")
        for key, title in section_titles.items():
            items = coverage_audit[key]
            rep.write(f"{title} ({len(items)}):\n")
            for item in items:
                rep.write(f"  - {item}\n")
            rep.write("\n")

    print(f"\nStage 10 Complete:\n - Evaluated Cards:        {total_cards}\n"
          f" - Clean Verified Cards:   {clean_cards} ({clean_cards / max(1, total_cards):.1%})\n"
          f" - Total Issues Found:     {total_issues}\n"
          f" - Coverage Audit (non-blocking): "
          f"missing_cards={len(coverage_audit['missing_from_logic'])}, "
          f"orphaned={len(coverage_audit['orphaned_ids'])}, "
          f"missing_sides={len(coverage_audit['missing_regular_sides'])}, "
          f"missing_stars={len(coverage_audit['missing_star_abilities'])}, "
          f"shared_vs_top={len(coverage_audit['shared_vs_top_deviations'])}, "
          f"unresolved_titles={len(coverage_audit['unresolved_card_titles'])}\n"
          f" - Production File Export: {OUTPUT_LOGIC_FILE}\n"
          f" - AST Constants Export:   {OUTPUT_CONSTANTS_FILE}\n"
          f" - Card Hierarchy Export:  {OUTPUT_HIERARCHY_FILE}")

def _parse_args() -> argparse.Namespace:
    """Parses Stage 10 verifier command-line arguments."""
    parser = argparse.ArgumentParser(description="Stage 10 ability logic verification and dist export.")
    parser.add_argument(
        "--export-dist",
        action="store_true",
        default=True,
        help="Export cards_logic.json, cardHierarchy.json, ast_constants.json, and card databases to data/dist/.",
    )
    parser.add_argument(
        "--no-export-dist",
        action="store_false",
        dest="export_dist",
        help="Run verification report only without overwriting data/dist/ exports.",
    )
    return parser.parse_args()


if __name__ == "__main__":
    _args = _parse_args()
    run_logic_verifier(export_dist=_args.export_dist)
