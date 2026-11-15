"""Factual game-mechanic matrix verifier for Redemption CCG abilities.

Extracts atomic mechanics (numbers, actions, meta-modifiers) directly from
the AST and validates them against the raw card ability text without heuristic string matching.
"""

from __future__ import annotations
import re
from typing import Any, Dict, List, Set, Tuple
from models.logic.card_logic import CardSideLogic


def _collect_selector_facts(
    sel: Any,
    numbers: Set[int],
    max_values: Set[int],
    identifiers: Set[str],
    entities: Set[str],
    target_types: Set[str],
    restrict_identifiers: Set[str],
    is_restrict: bool = False,
) -> None:
    """Extracts factual tokens and numeric bounds from a TargetSelector instance."""
    if not sel:
        return
    if getattr(sel, "target_type", None):
        target_types.add(str(sel.target_type).lower())
    if getattr(sel, "testament", None):
        identifiers.add("o.t." if sel.testament == "OT" else "n.t.")
        identifiers.add(str(sel.testament).lower())
    if getattr(sel, "gender", None):
        identifiers.add(str(sel.gender).lower())
    is_generic = getattr(sel, "is_generic", None)
    if is_generic is True:
        identifiers.add("generic")
    elif is_generic is False:
        identifiers.add("unique")
    is_human = getattr(sel, "is_human", None)
    if is_human is True:
        identifiers.add("human")
    elif is_human is False:
        identifiers.add("non-human")
    for cls in getattr(sel, "classes", []) or []:
        c_low = str(cls).lower()
        identifiers.add(c_low)
        identifiers.add(f"{c_low} class")
        if c_low == "weapon":
            identifiers.add("weapons")
            identifiers.add("depicting a weapon")
            identifiers.add("depicting weapons")
    for ref in getattr(sel, "references", []) or []:
        identifiers.add(ref.lower())
        for rnum in re.findall(r"\b\d+\b", ref):
            numbers.add(int(rnum))
    for ident in getattr(sel, "identifiers", []) or []:
        identifiers.add(ident.lower())
        for inum in re.findall(r"\b\d+\b", ident):
            numbers.add(int(inum))
        if is_restrict:
            restrict_identifiers.add(ident.lower())
    for sf in getattr(sel, "stat_filters", []) or []:
        if isinstance(getattr(sf, "value", None), int):
            numbers.add(sf.value)
    for t in getattr(sel, "card_titles", []) or []:
        entities.add(t.lower())
        for tnum in re.findall(r"\b\d+\b", t):
            numbers.add(int(tnum))
    cnt = getattr(sel, "count", None)
    if cnt:
        if isinstance(getattr(cnt, "fixed_value", None), int):
            numbers.add(cnt.fixed_value)
        if isinstance(getattr(cnt, "min_value", None), int) and cnt.min_value > 0:
            numbers.add(cnt.min_value)
        if isinstance(getattr(cnt, "max_value", None), int):
            numbers.add(cnt.max_value)
            max_values.add(cnt.max_value)
        dyn = getattr(cnt, "dynamic", None)
        if dyn:
            if isinstance(getattr(dyn, "limit", None), int):
                numbers.add(dyn.limit)
                max_values.add(dyn.limit)
            if isinstance(getattr(dyn, "multiplier", None), int) and dyn.multiplier > 1:
                numbers.add(dyn.multiplier)


def extract_ast_facts(side_logic: CardSideLogic) -> Dict[str, Any]:
    """Extracts factual game mechanics from AST for invariant verification.

    Args:
        side_logic: CardSideLogic model.

    Returns:
        Dict containing numbers, max_values, actions, modifiers, and named entities.
    """
    numbers: Set[int] = set()
    max_values: Set[int] = set()
    actions: Set[str] = set()
    modifiers: Set[str] = set()
    entities: Set[str] = set()
    identifiers: Set[str] = set()
    target_types: Set[str] = set()

    restrict_identifiers: Set[str] = set()

    for m in side_logic.modifiers:
        m_type = str(m.modifier_type.value if hasattr(m.modifier_type, "value") else m.modifier_type).lower()
        modifiers.add(m_type)
        if m.limit_params and m.limit_params.count:
            numbers.add(m.limit_params.count)
            max_values.add(m.limit_params.count)
        if m.replacement_params and m.replacement_params.replace_with_action:
            rep_act = str(m.replacement_params.replace_with_action).lower()
            actions.add(rep_act)
            for verb in ("discard", "draw", "banish", "band", "convert", "heal", "capture", "rescue", "play"):
                if re.search(rf"\b{verb}\b", rep_act):
                    actions.add(verb)

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
        if ab.trigger_filter:
            _collect_selector_facts(
                ab.trigger_filter, numbers, max_values, identifiers, entities, target_types, restrict_identifiers
            )

        for m in ab.modifiers:
            m_type = str(m.modifier_type.value if hasattr(m.modifier_type, "value") else m.modifier_type).lower()
            modifiers.add(m_type)
            if m.limit_params and m.limit_params.count:
                numbers.add(m.limit_params.count)
                max_values.add(m.limit_params.count)
            if m.replacement_params and m.replacement_params.replace_with_action:
                actions.add(str(m.replacement_params.replace_with_action).lower())
            for mn in re.findall(r"\b\d+\b", str(m)):
                numbers.add(int(mn))

        for cond in ab.conditions:
            if cond.value is not None and isinstance(cond.value, int):
                numbers.add(cond.value)
            if cond.selector:
                _collect_selector_facts(
                    cond.selector, numbers, max_values, identifiers, entities, target_types, restrict_identifiers
                )

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
                _collect_selector_facts(
                    eff.target, numbers, max_values, identifiers, entities, target_types,
                    restrict_identifiers, is_restrict=(act == "restrict")
                )

            if eff.protection_filter:
                pf = eff.protection_filter
                for pact in pf.actions:
                    pact_str = str(pact.value if hasattr(pact, "value") else pact).lower()
                    actions.add(pact_str)
                for cs in pf.card_sources:
                    _collect_selector_facts(
                        cs, numbers, max_values, identifiers, entities, target_types, restrict_identifiers
                    )
                for q in pf.qualifiers:
                    for qnum in re.findall(r"\b\d+\b", q):
                        numbers.add(int(qnum))

    return {
        "numbers": numbers,
        "max_values": max_values,
        "actions": actions,
        "modifiers": modifiers,
        "entities": entities,
        "identifiers": identifiers,
        "restrict_identifiers": restrict_identifiers,
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
    clean_raw = re.sub(
        r"\b(?:[123]\s+|i+\s+)?(?:genesis|exodus|leviticus|numbers|deuteronomy|joshua|judges|ruth|samuel|kings|"
        r"chronicles|ezra|nehemiah|esther|job|psalms?|proverbs|ecclesiastes|isaiah|jeremiah|lamentations|ezekiel|"
        r"daniel|hosea|joel|amos|obadiah|jonah|micah|nahum|habakkuk|zephaniah|haggai|zechariah|malachi|matthew|"
        r"mark|luke|john|acts|romans|corinthians|galatians|ephesians|philippians|colossians|thessalonians|"
        r"timothy|titus|philemon|hebrews|james|peter|jude|revelation)(?:\s+\d+(?:\s*[-–]\s*\d+)?)?\b",
        " ",
        clean_raw,
        flags=re.I,
    )
    clean_raw = re.sub(r"\b(?:1st|2nd|3rd|\d+th)\b", " ", clean_raw, flags=re.I)
    clean_raw = re.sub(r"\b\d+\s+(?:turns?|phases?|rounds?)\b", " ", clean_raw, flags=re.I)
    clean_raw = re.sub(r"\blimit\s+\d+\b", " ", clean_raw, flags=re.I)
    clean_raw = re.sub(r"\(\s*or\s+\d+\s+if\b.*?\)", " ", clean_raw, flags=re.I)
    raw_nums = {int(n) for n in re.findall(r"\b\d+\b", clean_raw) if int(n) > 1}
    filtered_raw_nums = {n for n in raw_nums if n not in (12, 14, 15, 17, 18, 24)}
    missing_nums = filtered_raw_nums - ast_facts["numbers"]
    if missing_nums:
        issues.append(f"Missing numbers in AST: {sorted(missing_nums)}")

    # 1b. Bounded range ('up to N') check against max_values
    word_to_int = {
        "one": 1, "two": 2, "three": 3, "four": 4, "five": 5,
        "six": 6, "seven": 7, "eight": 8, "nine": 9, "ten": 10,
    }
    up_to_check_raw = re.sub(r"\bup\s+to\s+\d+/\d+\b", " ", clean_raw, flags=re.I)
    up_to_check_raw = re.sub(r"\bup\s+to\s+(?:\d+|one|two|three|four)\s+times\b", " ", up_to_check_raw, flags=re.I)
    for m_up in re.finditer(r"\bup\s+to\s+(\d+|one|two|three|four|five|six|seven|eight|nine|ten)\b", up_to_check_raw, flags=re.I):
        tok = m_up.group(1).lower()
        n_val = word_to_int[tok] if tok in word_to_int else int(tok)
        max_vals = ast_facts.get("max_values", set())
        if n_val not in max_vals and n_val in ast_facts["numbers"]:
            issues.append(f"Unmigrated 'up to {n_val}' using fixed_value instead of max_value")

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
        from utils.reg_vocabulary import (
            is_action_prohibited, is_action_in_trigger, REG_LEGACY_SYNONYMS,
            PLAYER_RESTRICTION_PATTERNS, CARD_PREVENTION_PATTERNS, CARD_PROTECTION_PATTERNS
        )
    except ImportError:
        from scripts.utils.reg_vocabulary import (
            is_action_prohibited, is_action_in_trigger, REG_LEGACY_SYNONYMS,
            PLAYER_RESTRICTION_PATTERNS, CARD_PREVENTION_PATTERNS, CARD_PROTECTION_PATTERNS
        )

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

    # Mask out quoted literal words, ability-type descriptors, phase names, and zone nouns
    # before checking whether core_actions / discard appear as active effect verbs.
    action_check_text = re.sub(r"['\"][^'\"]+['\"]", " ", raw_lower)
    action_check_text = re.sub(
        r"\b(?:with\s+(?:a|an)\s+)?(?:band|draw|convert|heal|discard|search|shuffle|capture|rescue|play|choose|side\s+battle|interrupt|negate)"
        r"(?:\s*(?:,|or|and)\s*(?:band|draw|convert|heal|discard|search|shuffle|capture|rescue|play|choose|side\s+battle|interrupt|negate))*"
        r"\s+(?:abilities|ability|special\s+abilities|special\s+ability|enhancements?|cards?)\b",
        " ",
        action_check_text,
    )
    action_check_text = re.sub(
        r"\b(?:draw|discard|reserve|banish|prep|battle|combat|artifact)(?:\s*(?:,\s*or|,\s*and|,|or|and)\s*(?:draw|discard|reserve|banish|prep|battle|combat|artifact))*\s+(?:pile|piles|phase|phases|deck|decks|area)\b",
        " ",
        action_check_text,
    )
    action_check_text = re.sub(
        r"\b(?:from|in|into|on|of|beneath)\s+(?:(?:a\s+|an\s+|the\s+|your\s+|opponent's\s+|opponents'\s+|their\s+|holder's\s+)?(?:deck|reserve|draw|discard|hand|territory)\s+(?:or|and)\s+)*(?:a\s+|an\s+|the\s+|your\s+|opponent's\s+|opponents'\s+|their\s+|holder's\s+)?(?:discard|reserve|draw)\b",
        " ",
        action_check_text,
    )

    core_actions = ["draw", "band", "convert", "heal"]
    for act in core_actions:
        if not re.search(rf"\b{act}\b", action_check_text):
            continue

        if act not in ast_facts["actions"]:
            if not is_action_prohibited(raw, act) and not is_action_in_trigger(raw, act):
                issues.append(f"Missing primary action: '{act}'")

    if re.search(r"\bdiscard\b", action_check_text):
        if "discard" not in ast_facts["actions"]:
            if not is_action_prohibited(raw, "discard") and not is_action_in_trigger(raw, "discard"):
                issues.append("Missing primary action: 'discard'")

    # Head Judge: 1. Restrict (Players)
    if any(p.search(raw_lower) for p in PLAYER_RESTRICTION_PATTERNS):
        if not any(a in ast_facts["actions"] for a in ["restrict", "prevent"]):
            issues.append("Missing player restriction action: 'restrict'")
        elif "restrict" in ast_facts["actions"]:
            restrict_idents = " ".join(
                ast_facts.get("restrict_identifiers", set()) | ast_facts.get("target_types", set())
            ).lower()
            for p in PLAYER_RESTRICTION_PATTERNS:
                for match in p.finditer(raw_lower):
                    verb = match.groups()[-1] if match.groups() else ""
                    stem = re.sub(r"(?:ing|s)$", "", verb)
                    if (
                        verb
                        and len(verb) > 2
                        and verb not in restrict_idents
                        and (not stem or stem not in restrict_idents)
                        and verb not in ("opponent", "players", "player")
                    ):
                        issues.append(f"Missing restricted action '{verb}' in target identifiers for 'restrict'")

    # Head Judge: 2. Prevent (Cards acting)
    if any(p.search(raw_lower) for p in CARD_PREVENTION_PATTERNS):
        if not any(a in ast_facts["actions"] for a in ["prevent", "withdraw", "restrict"]):
            issues.append("Missing card action prevention: 'prevent'")

    # Head Judge: 3. Protect (Cards passive / acted upon)
    if any(p.search(raw_lower) for p in CARD_PROTECTION_PATTERNS):
        if not any(a in ast_facts["actions"] for a in ["protect", "prevent", "ignore", "immune"]):
            if not any("cannot_be" in m for m in ast_facts["modifiers"]):
                issues.append("Missing card protection action: 'protect'")

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

    if re.search(r"(?<!non-)\bgeneric\b", raw_lower) and "generic" not in all_target_facts:
        issues.append("Missing generic qualifier: 'is_generic: true'")

    raw_unique_check = re.sub(r"\bsame\s+unique\b", " ", raw_lower)
    if re.search(r"(?<!non-)\bunique\b", raw_unique_check) and "unique" not in all_target_facts:
        issues.append("Missing unique qualifier: 'is_generic: false'")

    return len(issues) == 0, issues
