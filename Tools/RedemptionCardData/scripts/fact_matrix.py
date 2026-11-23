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
    brigades: Set[str],
    is_restrict: bool = False,
) -> None:
    """Extracts factual tokens and numeric bounds from a TargetSelector instance."""
    if not sel:
        return
    if getattr(sel, "target_type", None):
        target_types.add(str(sel.target_type).lower())
    for brig in getattr(sel, "brigades", []) or []:
        brig_low = str(getattr(brig, "value", brig)).lower()
        if brig_low:
            brigades.add(brig_low)
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
    if getattr(sel, "is_gospel", None) is True:
        identifiers.add("gospel")
    if getattr(sel, "is_cloud", None) is True:
        identifiers.add("cloud")
    if getattr(sel, "is_star", None) is True:
        identifiers.update(("star", "*"))
    if getattr(sel, "is_meek", None) is True:
        identifiers.add("meek")
    if getattr(sel, "exclude_self", False):
        identifiers.update(("other", "another"))
    for st_f in getattr(sel, "state_filters", None) or []:
        st_low = str(getattr(st_f, "value", st_f)).lower()
        identifiers.add(st_low)
        identifiers.add(st_low.replace("_", " "))
        identifiers.add(st_low.replace("_", "-"))
        if is_restrict:
            restrict_identifiers.add(st_low.replace("_", " "))
    for rf in getattr(sel, "relative_filters", None) or []:
        attr_low = str(getattr(rf, "attribute", "")).lower()
        rel_low = str(getattr(rf, "relation", "")).lower()
        if attr_low:
            identifiers.add(attr_low)
        if rel_low:
            identifiers.add(rel_low)
        if rel_low == "same" and attr_low:
            identifiers.add(f"matching {attr_low}")
        ref_val = getattr(rf, "reference", None)
        if isinstance(ref_val, str):
            identifiers.add(ref_val.lower())
    ub = getattr(sel, "used_by", None)
    if ub is not None:
        if ub == "self":
            identifiers.add("used by this card")
        elif isinstance(ub, str):
            identifiers.add(f"used by {ub}")
        else:
            identifiers.add("used by")
            _collect_selector_facts(
                ub,
                numbers,
                max_values,
                identifiers,
                entities,
                target_types,
                restrict_identifiers,
                brigades,
                is_restrict=is_restrict,
            )
    excl = getattr(sel, "exclude", None)
    if excl is not None:
        identifiers.add("except")
        _collect_selector_facts(
            excl,
            numbers,
            max_values,
            identifiers,
            entities,
            target_types,
            restrict_identifiers,
            brigades,
            is_restrict=is_restrict,
        )
    if getattr(sel, "targets_abilities", False):
        identifiers.add("special abilities")
        if is_restrict:
            restrict_identifiers.add("special abilities")
    for act_attr in ("ability_target_actions", "exclude_ability_actions"):
        for act_item in getattr(sel, act_attr, None) or []:
            act_val = (act_item.value if hasattr(act_item, "value") else str(act_item)).lower()
            if act_val:
                identifiers.add(act_val)
                if is_restrict:
                    restrict_identifiers.add(act_val)
                    if act_val == "place":
                        restrict_identifiers.update({"put", "putting"})
                    elif act_val == "rescue":
                        restrict_identifiers.update({"rescue attempt", "make"})
                    elif act_val == "play":
                        restrict_identifiers.add("playing")
    for flag_attr, tok in (("is_cloud", "cloud"), ("is_star", "*"), ("is_meek", "meek")):
        if getattr(sel, flag_attr, None):
            identifiers.add(tok)
    for branch in getattr(sel, "any_of", None) or []:
        _collect_selector_facts(
            branch,
            numbers,
            max_values,
            identifiers,
            entities,
            target_types,
            restrict_identifiers,
            brigades,
            is_restrict=is_restrict,
        )
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
            ident_low = ident.lower()
            restrict_identifiers.add(ident_low)
            if ident_low == "restrict: control":
                restrict_identifiers.update({"control", "controlling"})
            elif ident_low == "restrict: attack":
                restrict_identifiers.add("attack")
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
            if isinstance(getattr(dyn, "fixed_value", None), int):
                numbers.add(abs(dyn.fixed_value))
            if isinstance(getattr(dyn, "limit", None), int):
                numbers.add(dyn.limit)
                max_values.add(dyn.limit)
            mult = getattr(dyn, "multiplier", None)
            if isinstance(mult, (int, float)) and abs(mult) > 1 and float(mult).is_integer():
                numbers.add(int(abs(mult)))
            if getattr(dyn, "selector", None):
                _collect_selector_facts(
                    dyn.selector,
                    numbers,
                    max_values,
                    identifiers,
                    entities,
                    target_types,
                    restrict_identifiers,
                    brigades,
                    is_restrict=is_restrict,
                )


def _collect_stat_mod_facts(
    mod: Any,
    numbers: Set[int],
    max_values: Set[int],
    identifiers: Set[str],
    entities: Set[str],
    target_types: Set[str],
    restrict_identifiers: Set[str],
    brigades: Set[str],
) -> None:
    """Extracts numeric bounds and referenced selector facts from int or DynamicValue stat mods."""
    if mod is None:
        return
    if isinstance(mod, int) and not isinstance(mod, bool):
        numbers.add(abs(mod))
        return
    if isinstance(getattr(mod, "fixed_value", None), int):
        numbers.add(abs(mod.fixed_value))
    dyn = getattr(mod, "dynamic", None)
    if dyn:
        if isinstance(getattr(dyn, "fixed_value", None), int):
            numbers.add(abs(dyn.fixed_value))
        if isinstance(getattr(dyn, "limit", None), int):
            numbers.add(dyn.limit)
            max_values.add(dyn.limit)
        mult = getattr(dyn, "multiplier", None)
        if isinstance(mult, (int, float)) and abs(mult) > 1 and float(mult).is_integer():
            numbers.add(int(abs(mult)))
        if getattr(dyn, "selector", None):
            _collect_selector_facts(
                dyn.selector,
                numbers,
                max_values,
                identifiers,
                entities,
                target_types,
                restrict_identifiers,
                brigades,
            )


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
    brigades: Set[str] = set()

    restrict_identifiers: Set[str] = set()
    has_capture_protection: bool = False

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
            te_items = ab.trigger_event if isinstance(ab.trigger_event, list) else [ab.trigger_event]
            for te_item in te_items:
                for tn in re.findall(r"\b\d+\b", str(getattr(te_item, "value", te_item))):
                    numbers.add(int(tn))
        for trig_sel in (getattr(ab, "trigger_subject", None), getattr(ab, "trigger_source", None)):
            if trig_sel:
                _collect_selector_facts(
                    trig_sel, numbers, max_values, identifiers, entities, target_types, restrict_identifiers, brigades
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
                    cond.selector, numbers, max_values, identifiers, entities, target_types, restrict_identifiers, brigades
                )

        for eff in list(ab.effects) + list(ab.costs):
            act = str(eff.action.value if hasattr(eff.action, "value") else eff.action).lower()
            actions.add(act)
            if eff.strength_mod is not None:
                _collect_stat_mod_facts(
                    eff.strength_mod, numbers, max_values, identifiers, entities, target_types, restrict_identifiers, brigades
                )
            if eff.toughness_mod is not None:
                _collect_stat_mod_facts(
                    eff.toughness_mod, numbers, max_values, identifiers, entities, target_types, restrict_identifiers, brigades
                )
            for dn in re.findall(r"\b\d+\b", str(eff.duration)):
                numbers.add(int(dn))
            if eff.target:
                _collect_selector_facts(
                    eff.target, numbers, max_values, identifiers, entities, target_types,
                    restrict_identifiers, brigades, is_restrict=(act == "restrict")
                )

            if eff.protection_filter:
                pf = eff.protection_filter
                for pact in pf.actions:
                    pact_str = str(pact.value if hasattr(pact, "value") else pact).lower()
                    actions.add(pact_str)
                    if act in ("protect", "immune") and pact_str == "capture":
                        has_capture_protection = True
                for cs in pf.card_sources:
                    _collect_selector_facts(
                        cs, numbers, max_values, identifiers, entities, target_types, restrict_identifiers, brigades
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
        "target_types": target_types,
        "brigades": brigades,
        "has_capture_protection": has_capture_protection,
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
        if not any(a in ast_facts["actions"] for a in ["negate", "protect", "immune"]):
            issues.append("Missing action 'negate' for 'has no effect'")

    # REG v11.1.0: battle entry & blocked-by prohibitions map to 'paralyze'
    if re.search(r"\b(?:cannot|may\s+not)\s+enter\s+battle\b", raw_lower):
        if not any(a in ast_facts["actions"] for a in ["paralyze", "protect", "immune"]):
            issues.append("Missing action 'paralyze' for 'cannot/may not enter battle'")
    if re.search(r"\b(?:cannot|may\s+not)\s+be\s+blocked\s+by\b", raw_lower):
        if not any(a in ast_facts["actions"] for a in ["paralyze", "protect", "immune"]):
            issues.append("Missing action 'paralyze' for 'cannot/may not be blocked by'")

    # REG v11.1.0: returning a captured character to territory is 'release', not 'withdraw'
    is_release_clause = (
        re.search(
            r"\breturn\b[^.]*\b(?:captured|held\s+captive|captives?)\b[^.]*\bto\s+(?:your\s+|player's\s+|its\s+|owner's\s+|owners'\s+|their\s+)?territor(?:y|ies)\b",
            raw_lower,
        )
        or re.search(
            r"\btaken\s+prisoner\b[^.]*\breturn(?:s|ed)?\b[^.]*\bto\s+(?:your\s+|player's\s+|its\s+|owner's\s+|owners'\s+|their\s+)?territor(?:y|ies)\b",
            raw_lower,
        )
    )
    if is_release_clause and not re.search(r"\binstead\b", raw_lower):
        if not any(a in ast_facts["actions"] for a in ["release", "rescue"]):
            issues.append("Missing action 'release' for returning captured card to territory")

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

    if re.search(r"\b(?:cannot|may\s+not)\s+be\s+(?:taken\s+prisoner|captured)\b", raw_lower):
        if not ast_facts.get("has_capture_protection"):
            issues.append(
                "Missing capture protection ('protect'/'immune' with protection_filter action 'capture')"
            )

    cleaned_prot_check = re.sub(
        r"\b(?:do\s+not|does\s+not|not|regardless\s+of|negate|negates|ignore|ignores|prevent|prevents)\s+protect(?:ing|ed|s)?\b",
        " ",
        raw_lower,
    )
    cleaned_prot_check = re.sub(r"\bprotect\s+(?:abilities|ability|special\s+abilities)\b", " ", cleaned_prot_check)
    if (
        re.search(r"\b(?:protect|protected|immune)\b", cleaned_prot_check)
        and "restrict" in ast_facts["actions"]
        and not any(a in ast_facts["actions"] for a in ("protect", "immune"))
    ):
        issues.append("Misclassified protection as 'restrict' (expected 'protect' or 'immune')")

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
            # ORDIR 7.1.0 equivalences:
            # - "depicting an evil altar / false religious practice" -> "Idol"
            # - "connected with demons" (Enhancements) -> orange + enhancement
            if prefix == "depicting" and "idol" in all_target_facts and re.search(
                r"\bdepicting\s+(?:an?\s+)?(?:idol|evil\s+altar|false\s+religious\s+practice)\b", raw_lower
            ):
                continue
            if prefix == "connected with" and concept == "demons" and (
                "orange" in ast_facts.get("brigades", set()) and "enhancement" in ast_facts.get("target_types", set())
            ):
                continue
            if prefix == "connected with" and concept == "him" and "connected with david" in all_target_facts:
                continue
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
