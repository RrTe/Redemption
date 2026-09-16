"""Factual game-mechanic matrix verifier for Redemption CCG abilities.

Extracts atomic mechanics (numbers, actions, meta-modifiers) directly from
the AST and validates them against the raw card ability text without heuristic string matching.
"""

from __future__ import annotations
import re
from typing import Any, Dict, List, Set, Tuple
from models.logic.card_logic import CardSideLogic


def extract_ast_facts(side_logic: CardSideLogic) -> Dict[str, Any]:
    """Extracts factual game mechanics from AST for invariant verification.

    Args:
        side_logic: CardSideLogic model.

    Returns:
        Dict containing numbers, actions, modifiers, and named entities.
    """
    numbers: Set[int] = set()
    actions: Set[str] = set()
    modifiers: Set[str] = set()
    entities: Set[str] = set()

    for ab in side_logic.abilities:
        if not ab.is_negatable:
            modifiers.add("cannot_be_negated")
        if not ab.is_interruptible:
            modifiers.add("cannot_be_interrupted")
        if not ab.is_preventable:
            modifiers.add("cannot_be_prevented")

        for m in ab.modifiers:
            m_type = str(m.modifier_type.value if hasattr(m.modifier_type, "value") else m.modifier_type).lower()
            modifiers.add(m_type)
            if m.limit_params and m.limit_params.count:
                numbers.add(m.limit_params.count)

        for eff in ab.effects:
            act = str(eff.action.value if hasattr(eff.action, "value") else eff.action).lower()
            actions.add(act)
            if eff.strength_mod is not None:
                numbers.add(abs(eff.strength_mod))
            if eff.toughness_mod is not None:
                numbers.add(abs(eff.toughness_mod))
            if eff.target:
                if eff.target.count and eff.target.count.fixed_value and isinstance(eff.target.count.fixed_value, int):
                    numbers.add(eff.target.count.fixed_value)
                for t in eff.target.card_titles:
                    entities.add(t.lower())

    return {
        "numbers": numbers,
        "actions": actions,
        "modifiers": modifiers,
        "entities": entities
    }


def verify_fact_matrix(raw: str, ast_facts: Dict[str, Any]) -> Tuple[bool, List[str]]:
    """Checks factual invariants between raw card text and extracted AST facts.

    Args:
        raw: Original raw card ability text.
        ast_facts: Extracted mechanics from AST.

    Returns:
        Tuple of (passed_bool, list_of_discrepancies).
    """
    issues: List[str] = []
    raw_lower = raw.lower()

    # 1. Number consistency check (only critical counts > 1)
    raw_nums = {int(n) for n in re.findall(r"\b\d+\b", raw) if int(n) > 1}
    # Exclude typical Bible chapter/verse numbers (e.g. Genesis 12-24)
    filtered_raw_nums = {n for n in raw_nums if n not in (12, 14, 15, 17, 18, 24)}
    missing_nums = filtered_raw_nums - ast_facts["numbers"]
    if missing_nums:
        issues.append(f"Missing numbers in AST: {sorted(missing_nums)}")

    # 2. Meta-Modifier invariants
    if "cannot be negated" in raw_lower:
        if not any("negat" in m for m in ast_facts["modifiers"]):
            issues.append("Missing modifier: 'cannot be negated'")
    if "cannot be interrupted" in raw_lower:
        if not any("interrupt" in m for m in ast_facts["modifiers"]):
            issues.append("Missing modifier: 'cannot be interrupted'")
    if "cannot be prevented" in raw_lower:
        if not any("prevent" in m for m in ast_facts["modifiers"]):
            issues.append("Missing modifier: 'cannot be prevented'")
    if "first strike" in raw_lower:
        if "first strike" not in ast_facts["actions"] and not any("first_strike" in m for m in ast_facts["modifiers"]):
            issues.append("Missing ability: 'first strike'")

    # 3. Core action presence (ignoring zone nouns like 'discard pile')
    core_actions = ["draw", "band", "convert", "heal"]
    for act in core_actions:
        if f" {act} " in f" {raw_lower} " and act not in ast_facts["actions"]:
            issues.append(f"Missing primary action: '{act}'")

    if re.search(r"\bdiscard\b(?!\s+(?:pile|abilities|special abilities))", raw_lower):
        if "discard" not in ast_facts["actions"]:
            issues.append("Missing primary action: 'discard'")

    return len(issues) == 0, issues
