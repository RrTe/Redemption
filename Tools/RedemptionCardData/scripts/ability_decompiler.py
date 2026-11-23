"""Decompiler converting CardSideLogic ASTs back into canonical English rule text.

Performs round-trip synthesis of abilities according to REG v11.1.0 rules
to enable semantic validation and fidelity auditing without consuming API tokens.
"""

from __future__ import annotations
from typing import Any, List, Optional
from models.logic.card_logic import CardSideLogic
from models.logic.ability import Ability
from models.logic.action_effect import ActionEffect
from models.logic.protection_filter import ProtectionFilter
from models.logic.stat_filter import StatFilter
from models.logic.target_selector import TargetSelector
from models.logic.condition_expression import ConditionExpression
from models.logic.modifier import Modifier


def _val(obj: Any) -> str:
    """Safely extracts enum value or string representation."""
    return str(obj.value) if hasattr(obj, "value") else str(obj or "")


def _scopes(scope_val: Any) -> List[str]:
    """Extracts a list of string zone values from target.scope."""
    if isinstance(scope_val, (list, tuple, set)):
        return [_val(s) for s in scope_val if s is not None]
    return [_val(scope_val)] if scope_val is not None else []


def _format_stat_filter(sf: StatFilter) -> str:
    """Formats a single numeric StatFilter into canonical rule phrasing.

    Args:
        sf: StatFilter model with stat, operator, value, or variable.

    Returns:
        Formatted constraint phrase (e.g. ``with strength >= 10``).
    """
    thresh = sf.variable if sf.variable else (str(sf.value) if sf.value is not None else "X")
    stat_label = "abilities" if sf.stat in ("both", "either") else sf.stat
    if sf.operator == ">=":
        rel = f"{thresh} or greater"
    elif sf.operator == "<=":
        rel = f"{thresh} or less"
    elif sf.operator == ">":
        rel = f"greater than {thresh}"
    elif sf.operator == "<":
        rel = f"less than {thresh}"
    elif sf.operator == "==":
        rel = f"of {thresh}"
    else:
        rel = f"!= {thresh}"
    return f"with {stat_label} {rel}"


def decompile_protection_filter(pf: ProtectionFilter, preposition: str = "from") -> str:
    """Decompiles a ProtectionFilter into a natural English protection clause.

    Args:
        pf: ProtectionFilter specification containing actions, sources, and qualifiers.
        preposition: Connecting preposition (``from`` for protect, ``to`` for immune).

    Returns:
        Formatted protection tail (e.g. ``from evil discard abilities``), or empty string.
    """
    action_labels = [_val(a).replace("_", " ") for a in pf.actions]
    source_parts = [decompile_target(cs) for cs in pf.card_sources]
    qual_parts = [q.strip() for q in pf.qualifiers if q and q.strip()]

    cause_tokens: List[str] = []
    if action_labels:
        act_str = " or ".join(action_labels)
        cause_tokens.append(f"{act_str} abilities" if len(action_labels) == 1 else f"{act_str} abilities")
    elif pf.from_harm and not source_parts:
        cause_tokens.append("harm")

    tail_parts: List[str] = []
    if source_parts and cause_tokens:
        tail_parts.append(f"{preposition} {' and '.join(source_parts)} {' '.join(cause_tokens)}")
    elif source_parts:
        tail_parts.append(f"{preposition} {' and '.join(source_parts)}")
    elif cause_tokens:
        tail_parts.append(f"{preposition} {' '.join(cause_tokens)}")

    if pf.except_actions:
        exc_str = ", ".join(_val(a).replace("_", " ") for a in pf.except_actions)
        tail_parts.append(f"(except {exc_str})")

    if qual_parts:
        tail_parts.extend(qual_parts)

    return " ".join(tail_parts).strip()


def decompile_target(target: Optional[TargetSelector]) -> str:
    """Decompiles a TargetSelector into a natural language noun phrase.

    Args:
        target: TargetSelector instance or None.

    Returns:
        Natural language target noun phrase including testament, generic/human/gender/class
        qualifiers, stat filters, and zone scope.
    """
    if not target:
        return "a card"
    if getattr(target, "any_of", None):
        branch_strs = [decompile_target(branch) for branch in target.any_of]
        base_str = " or ".join(b for b in branch_strs if b)
        scopes_list = _scopes(getattr(target, "scope", None))
        sc_map = {
            "battle": "in battle", "in_play": "in play", "hand": "from hand",
            "deck": "from deck", "draw_pile": "from deck", "discard": "from discard pile",
            "discard_pile": "from discard pile", "reserve": "from Reserve",
            "reserve_pile": "from Reserve", "territory": "in territory",
            "set_aside": "in set-aside area", "artifact_pile": "from Artifact pile",
        }
        mapped_scopes = [sc_map[s] for s in scopes_list if s in sc_map]
        return f"{base_str} {' or '.join(mapped_scopes)}".strip() if mapped_scopes else base_str

    if target.card_titles:
        return " or ".join(target.card_titles)

    mode = _val(getattr(target, "selection_mode", ""))
    scopes_list = _scopes(getattr(target, "scope", None))
    primary_scope = scopes_list[0] if scopes_list else ""
    has_specifics = (
        getattr(target, "count", None) is not None
        or target.target_type == "lost_soul"
        or (primary_scope in ("deck", "draw_pile"))
    )
    if "self" in mode and not has_specifics:
        t = _val(target.target_type).replace("_", " ") if target.target_type else "card"
        return f"This {t.title()}" if t in ("hero", "character", "evil character") else "This card"

    parts: List[str] = []
    owner = _val(getattr(target, "zone_owner", ""))

    if getattr(target, "count", None):
        parts.append(str(target.count.fixed_value) if target.count.fixed_value is not None else "X")
    elif "all" in mode:
        parts.append("all")
    elif "random" in mode:
        parts.append("a random")

    if owner == "controller":
        parts.append("your")
    elif owner == "opponent":
        parts.append("opponent's")

    if target.alignment:
        parts.append(_val(target.alignment))
    testament = getattr(target, "testament", None)
    if testament:
        t_up = _val(testament).upper()
        parts.append("O.T." if t_up == "OT" else ("N.T." if t_up == "NT" else _val(testament)))
    is_generic = getattr(target, "is_generic", None)
    if is_generic is True:
        parts.append("generic")
    elif is_generic is False:
        parts.append("unique")
    if getattr(target, "is_meek", None) is True:
        parts.append("meek")
    if getattr(target, "is_gospel", None) is True:
        parts.append("Gospel")
    if getattr(target, "is_cloud", None) is True:
        parts.append("cloud")
    if getattr(target, "is_star", None) is True:
        parts.append("*")
    if getattr(target, "gender", None):
        parts.append(_val(target.gender))
    is_human = getattr(target, "is_human", None)
    if is_human is True:
        parts.append("human")
    elif is_human is False:
        parts.append("non-human")
    if target.brigades:
        parts.extend([_val(b) for b in target.brigades])
    if getattr(target, "classes", None):
        for cls_item in target.classes:
            cls_low = _val(cls_item).lower()
            parts.append(f"{cls_low} class" if not cls_low.endswith("class") else cls_low)
    if getattr(target, "references", None):
        parts.extend([_val(r) for r in target.references])
    if getattr(target, "exclude_self", False):
        parts.append("other")
    if getattr(target, "state_filters", None):
        parts.extend([_val(sf).replace("_", " ") for sf in target.state_filters])
    if getattr(target, "relative_filters", None):
        for rf in target.relative_filters:
            parts.append(f"{rf.relation} {rf.attribute}")
    if target.identifiers:
        parts.extend([_val(i) for i in target.identifiers])

    t_type = _val(target.target_type).replace("_", " ")
    if "Lost Soul" in target.identifiers or "lost" in t_type:
        parts = [p for p in parts if p not in ("evil", "good")]
        if "Lost Soul" not in parts:
            parts.append("Lost Soul")
    elif t_type:
        parts.append(t_type)
    elif not parts or parts[-1] in ("your", "opponent's", "all"):
        parts.append("cards" if "all" in mode else "card")

    ub = getattr(target, "used_by", None)
    if ub == "self":
        parts.append("used by this card")
    elif isinstance(ub, str):
        parts.append(f"used by {ub}")
    elif ub is not None:
        parts.append(f"used by {decompile_target(ub)}")

    if getattr(target, "targets_abilities", False):
        ab_acts = getattr(target, "ability_target_actions", None) or []
        if ab_acts:
            vals = [a.value if hasattr(a, "value") else str(a) for a in ab_acts]
            parts.append(f"({' or '.join(vals)} abilities)")
        else:
            parts.append("(special abilities)")
    else:
        ab_acts = getattr(target, "ability_target_actions", None) or []
        if ab_acts:
            vals = [a.value if hasattr(a, "value") else str(a) for a in ab_acts]
            parts.append(f"with ({' or '.join(vals)}) ability")

    excl_acts = getattr(target, "exclude_ability_actions", None) or []
    if excl_acts:
        vals = [a.value if hasattr(a, "value") else str(a) for a in excl_acts]
        parts.append(f"(except {' or '.join(vals)} abilities)")

    excl_sel = getattr(target, "exclude", None)
    if excl_sel is not None:
        parts.append(f"(except {decompile_target(excl_sel)})")

    stat_filters = getattr(target, "stat_filters", None) or []
    for sf in stat_filters:
        parts.append(_format_stat_filter(sf))

    sc_map = {
        "battle": "in battle", "in_play": "in play", "hand": "from hand",
        "deck": "from deck", "draw_pile": "from deck", "discard": "from discard pile",
        "discard_pile": "from discard pile", "reserve": "from Reserve",
        "reserve_pile": "from Reserve", "territory": "in territory",
        "set_aside": "in set-aside area", "artifact_pile": "from Artifact pile",
    }
    mapped_scopes = [sc_map[s] for s in scopes_list if s in sc_map]
    if mapped_scopes:
        parts.append(" or ".join(mapped_scopes))
    return " ".join(parts)


def _format_stat_mod(mod: Any) -> str:
    """Formats an integer or DynamicValue stat modifier for English rule synthesis."""
    if mod is None:
        return "0"
    if isinstance(mod, int) and not isinstance(mod, bool):
        return f"+{mod}" if mod > 0 else str(mod)
    if getattr(mod, "fixed_value", None) is not None:
        fv = mod.fixed_value
        return f"+{fv}" if isinstance(fv, int) and fv > 0 else str(fv)
    dyn = getattr(mod, "dynamic", None)
    if dyn:
        if dyn.fixed_value is not None:
            return str(dyn.fixed_value)
        if dyn.multiplier is not None and dyn.multiplier < 0:
            return "-X"
    return "X"


def decompile_effect(effect: ActionEffect) -> str:
    """Translates a single ActionEffect into a natural English imperative clause."""
    act = _val(effect.action).replace("_", " ")
    dest = _val(effect.destination).replace("_", " ")
    pos = str(effect.destination_position)

    if "place" in act and "deck" in dest: act = "underdeck" if pos == "bottom" else "topdeck"
    elif "place" in act and "reserve" in dest: act = "reserve"

    tgt = decompile_target(effect.target)

    if effect.strength_mod is not None or effect.toughness_mod is not None:
        s = _format_stat_mod(effect.strength_mod)
        t = _format_stat_mod(effect.toughness_mod)
        clause = f"{tgt} is worth {s}/{t}" if "modify" in act else f"{act} {tgt} {s}/{t}"
    elif act == "draw":
        pos_str = " from bottom of deck" if pos == "bottom" else " from deck"
        clause = f"draw {tgt}{pos_str}" if "deck" not in tgt else f"draw {tgt.replace('from deck', '').strip()}{pos_str}"
    elif act == "restrict": clause = f"restrict {tgt}"
    elif act == "withdraw": clause = f"withdraw {tgt}"
    elif act == "hold": clause = f"hold {tgt}"
    elif act == "choose": clause = f"choose {tgt} to block" if "evil" in tgt.lower() else f"choose {tgt}"
    elif act == "first strike": clause = f"{tgt} has first strike" if tgt and tgt != "a card" else "first strike"
    elif "use other enhancements" in act: clause = f"{tgt} may use other enhancements" if tgt and tgt != "a card" else "may use other enhancements"
    elif act == "site access": clause = f"{tgt} has access to any Site" if tgt and tgt != "a card" else "has access to any Site"
    else: clause = f"{act} {tgt}"

    pf = getattr(effect, "protection_filter", None)
    if pf is not None:
        prep = "to" if act == "immune" else "from"
        pf_str = decompile_protection_filter(pf, preposition=prep)
        if pf_str:
            clause = f"{clause} {pf_str}"

    dur = _val(effect.duration)
    if dur == "this_turn": clause += " this turn"
    elif dur == "until_end_of_phase": clause += " until end of phase"
    return clause


def decompile_condition(cond: ConditionExpression) -> str:
    """Formats a ConditionExpression into a natural language condition."""
    if cond.selector:
        scopes_list = _scopes(cond.selector.scope)
        sc = (scopes_list[0] if scopes_list else "in_play").replace("_", " ")
        prep = "" if sc.startswith("in") else "in "
        if cond.selector.card_titles:
            names = " or ".join(cond.selector.card_titles)
            return f"If {names} is {prep}{sc}"
        target_name = decompile_target(cond.selector)
        prefix = "" if target_name.lower().startswith(("this", "all")) else "a "
        return f"If {prefix}{target_name} is {prep}{sc}"
    c_type = _val(cond.condition_type).replace("_", " ")
    return f"If {c_type}" if c_type else "If condition met"


def decompile_modifier(mod: Modifier) -> str:
    """Formats an ability modifier into canonical rule text."""
    m = _val(mod.modifier_type).lower()
    for k, v in [("negate", "Cannot be negated."), ("interrupt", "Cannot be interrupted."),
                 ("prevent", "Cannot be prevented."), ("first strike", "First strike.")]:
        if k in m: return v
    if mod.limit_params and mod.limit_params.count:
        return f"(limit {mod.limit_params.count})."
    return f"{m.replace('_', ' ').capitalize()}."


def decompile_ability(ability: Ability) -> str:
    """Synthesizes an entire Ability clause into natural card ability sentences.

    Args:
        ability: Structured Ability clause model.

    Returns:
        Natural language representation of the ability clause.
    """
    clauses: List[str] = []

    if ability.trigger_event:
        te_list = ability.trigger_event if isinstance(ability.trigger_event, list) else [ability.trigger_event]
        te_strs = [_val(t).strip() for t in te_list if _val(t).strip() and _val(t).strip().lower() not in ("star_phase", "star")]
        if te_strs:
            trig = " or ".join(t.replace("_", " ") for t in te_strs)
            if not trig.lower().startswith(("if", "when", "after", "while", "during", "on", "would")):
                trig = f"When {trig}"
            for tf in (getattr(ability, "trigger_subject", None), getattr(ability, "trigger_source", None)):
                if tf is not None:
                    tf_str = decompile_target(tf)
                    if tf_str and tf_str not in ("a card", "This card") and tf_str.lower() not in trig.lower():
                        trig = f"{trig} ({tf_str})"
            clauses.append(trig)

    for cond in ability.conditions:
        clauses.append(decompile_condition(cond))

    effect_parts: List[str] = []
    for c in ability.costs:
        effect_parts.append(decompile_effect(c))

    for idx, e in enumerate(ability.effects):
        txt = decompile_effect(e)
        if idx == 0 and ability.is_optional and not effect_parts:
            if not txt.lower().startswith(("you may", "this ", "holder may", "all ")):
                txt = f"You may {txt}"
        effect_parts.append(txt)

    if effect_parts:
        clauses.append(", ".join(effect_parts) + ".")

    for m in ability.modifiers:
        clauses.append(decompile_modifier(m))

    rendered = " ".join(clauses).strip()
    if getattr(ability, "is_star", False) and rendered and not rendered.upper().startswith("STAR:"):
        return f"STAR: {rendered}"
    return rendered


def decompile_card_side(side_logic: CardSideLogic) -> str:
    """Decompiles all abilities of a CardSideLogic into unified card rule text."""
    parts: List[str] = []
    curr_grp: Optional[str] = None
    grp_items: List[str] = []
    last_cond: Optional[str] = None

    for ab in side_logic.abilities:
        grp = getattr(ab, "choice_group", None)
        cond_str = " ".join(decompile_condition(c) for c in ab.conditions)
        txt = decompile_ability(ab)
        if cond_str and cond_str == last_cond and txt.startswith(cond_str):
            txt = txt[len(cond_str):].strip()
            if txt.startswith("You may"):
                txt = "may " + txt[7:].strip()
            elif txt and txt[0].islower():
                txt = txt.capitalize()
        if cond_str: last_cond = cond_str

        if grp and grp == curr_grp:
            grp_items.append(txt.rstrip("."))
        else:
            if grp_items:
                parts.append(" or ".join(grp_items) + ".")
                grp_items = []
            if grp:
                curr_grp, grp_items = grp, [txt.rstrip(".")]
            else:
                curr_grp = None
                parts.append(txt)
    if grp_items:
        parts.append(" or ".join(grp_items) + ".")
    return " ".join(parts)
