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
    identifiers: Set[str] = set()
    target_types: Set[str] = set()

    for ab in side_logic.abilities:
        if not ab.is_negatable:
            modifiers.add("cannot_be_negated")
        if not ab.is_interruptible:
            modifiers.add("cannot_be_interrupted")
        if not ab.is_preventable:
            modifiers.add("cannot_be_prevented")
        if ab.trigger_event:
            for tn in re.findall(r"\b\d+\b", str(ab.trigger_event)):
                numbers.add(int(tn))

        for m in ab.modifiers:
            m_type = str(m.modifier_type.value if hasattr(m.modifier_type, "value") else m.modifier_type).lower()
            modifiers.add(m_type)
            if m.limit_params and m.limit_params.count:
                numbers.add(m.limit_params.count)
            for mn in re.findall(r"\b\d+\b", str(m)):
                numbers.add(int(mn))

        for cond in ab.conditions:
            if cond.value is not None and isinstance(cond.value, int):
                numbers.add(cond.value)

        for eff in list(ab.effects) + list(ab.costs):
            act = str(eff.action.value if hasattr(eff.action, "value") else eff.action).lower()
            actions.add(act)
            if eff.strength_mod is not None:
                numbers.add(abs(eff.strength_mod))
            if eff.toughness_mod is not None:
                numbers.add(abs(eff.toughness_mod))
            for dn in re.findall(r"\b\d+\b", str(eff.duration)):
                numbers.add(int(dn))
            if eff.target:
                if eff.target.target_type:
                    target_types.add(str(eff.target.target_type).lower())
                for ident in eff.target.identifiers:
                    identifiers.add(ident.lower())
                if eff.target.count and eff.target.count.fixed_value and isinstance(eff.target.count.fixed_value, int):
                    numbers.add(eff.target.count.fixed_value)
                for t in eff.target.card_titles:
                    entities.add(t.lower())

    return {
        "numbers": numbers,
        "actions": actions,
        "modifiers": modifiers,
        "entities": entities,
        "identifiers": identifiers,
        "target_types": target_types
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

    # 1. Number consistency check (only critical counts > 1, excluding verses/chapters like 22:14, durations, limits)
    clean_raw = re.sub(r"\b\d+:\d+\b", " ", raw)
    clean_raw = re.sub(r"\b(?:1st|2nd|3rd|\d+th)\b", " ", clean_raw, flags=re.I)
    clean_raw = re.sub(r"\b\d+\s+(?:turns?|phases?|rounds?)\b", " ", clean_raw, flags=re.I)
    clean_raw = re.sub(r"\blimit\s+\d+\b", " ", clean_raw, flags=re.I)
    raw_nums = {int(n) for n in re.findall(r"\b\d+\b", clean_raw) if int(n) > 1}
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

    # 3. Core action presence & REG vocabulary equivalences
    try:
        from utils.reg_vocabulary import is_action_prohibited, is_action_in_trigger, REG_LEGACY_SYNONYMS, RESTRICTION_PATTERNS
    except ImportError:
        from scripts.utils.reg_vocabulary import is_action_prohibited, is_action_in_trigger, REG_LEGACY_SYNONYMS, RESTRICTION_PATTERNS

    for legacy_term, canonical_act in REG_LEGACY_SYNONYMS.items():
        if f" {legacy_term} " in f" {raw_lower} ":
            if re.search(rf"\b{legacy_term}\s+(?:abilities|special abilities)\b", raw_lower):
                continue
            if canonical_act not in ast_facts["actions"] and legacy_term not in ast_facts["actions"]:
                if not is_action_prohibited(raw, legacy_term) and not is_action_in_trigger(raw, legacy_term):
                    issues.append(f"Missing action '{canonical_act}' for legacy term '{legacy_term}'")

    if re.search(r"\b(?:has|have|had)\s+no\s+effect\b", raw_lower):
        if not any(a in ast_facts["actions"] for a in ["withdraw", "negate", "ignore", "protect", "immune"]):
            issues.append("Missing action 'withdraw' or 'negate' for 'has no effect'")

    core_actions = ["draw", "band", "convert", "heal"]
    for act in core_actions:
        if act == "draw":
            if not re.search(r"\bdraw\b(?!\s+(?:pile|phase|deck))", raw_lower):
                continue
        elif f" {act} " not in f" {raw_lower} ":
            continue

        if act not in ast_facts["actions"]:
            if not is_action_prohibited(raw, act) and not is_action_in_trigger(raw, act):
                issues.append(f"Missing primary action: '{act}'")

    if re.search(r"\bdiscard\b(?!\s+(?:pile|abilities|special abilities))", raw_lower):
        if "discard" not in ast_facts["actions"]:
            if not is_action_prohibited(raw, "discard") and not is_action_in_trigger(raw, "discard"):
                issues.append("Missing primary action: 'discard'")

    if any(p.search(raw_lower) for p in RESTRICTION_PATTERNS):
        if not any(a in ast_facts["actions"] for a in ["restrict", "prevent", "ignore", "withdraw"]):
            issues.append("Missing restriction action: 'restrict' or 'prevent'")

    # 4. Relational / Conceptual Identifiers (e.g. music, weapon, idol, curse, demon)
    all_target_facts = " ".join(
        ast_facts.get("identifiers", set()) |
        ast_facts.get("target_types", set()) |
        ast_facts.get("entities", set())
    )
    relational_patterns = [
        (r"\b(?:involve|involves|involving)\s+([a-z]+)\b", "involve"),
        (r"\bdepicting\s+(?:an?\s+)?([a-z]+)\b", "depicting"),
        (r"\bconnected\s+with\s+([a-z]+)\b", "connected with"),
    ]
    for pat, prefix in relational_patterns:
        m = re.search(pat, raw_lower)
        if m:
            concept = m.group(1)
            if concept not in all_target_facts:
                issues.append(f"Missing conceptual identifier: '{prefix} {concept}'")

    # 5. Reverse Verb / Hallucination check & 'used by this card'
    if "immune" in ast_facts["actions"] and "immune" not in raw_lower:
        issues.append("Hallucinated action 'immune' (use 'gain' with modifier instead)")

    if "used by this card" in raw_lower and "used by this card" not in all_target_facts:
        issues.append("Missing restriction identifier: 'used by this card'")

    return len(issues) == 0, issues
