"""Decompiler converting CardSideLogic ASTs back into canonical English rule text.

Performs round-trip synthesis of abilities according to REG v11.0.0 rules
to enable semantic validation and fidelity auditing without consuming API tokens.
"""

from __future__ import annotations
from typing import Any, List, Optional
from models.logic.card_logic import CardSideLogic
from models.logic.ability import Ability
from models.logic.action_effect import ActionEffect
from models.logic.target_selector import TargetSelector
from models.logic.condition_expression import ConditionExpression
from models.logic.modifier import Modifier


def _val(obj: Any) -> str:
    """Safely extracts enum value or string representation."""
    if obj is None:
        return ""
    if hasattr(obj, "value"):
        return str(obj.value)
    return str(obj)


def decompile_target(target: Optional[TargetSelector]) -> str:
    """Decompiles a TargetSelector into natural language noun phrase.

    Args:
        target: TargetSelector model or None.

    Returns:
        str: English target description (e.g. 'opponent's evil character in battle').
    """
    if not target:
        return "a card"
    if target.card_titles:
        return " or ".join(target.card_titles)

    parts: List[str] = []
    mode = _val(target.selection_mode)
    owner = _val(target.zone_owner)
    scope = _val(target.scope)

    # 1. Count or quantifier
    if target.count:
        if target.count.fixed_value is not None:
            parts.append(str(target.count.fixed_value))
        elif target.count.dynamic is not None:
            parts.append("X")
    elif "all" in mode:
        parts.append("all")
    elif "random" in mode:
        parts.append("a random")

    # 2. Ownership
    if owner == "controller":
        parts.append("your")
    elif owner == "opponent":
        parts.append("opponent's")

    # 3. Alignment, Brigades, Identifiers
    if target.alignment:
        parts.append(_val(target.alignment))
    if target.brigades:
        parts.extend([_val(b) for b in target.brigades])
    if target.identifiers:
        parts.extend([_val(i) for i in target.identifiers])

    # 4. Target Type
    t_type = _val(target.target_type).replace("_", " ")
    if t_type:
        parts.append(t_type)
    elif not parts or parts[-1] in ("your", "opponent's", "all"):
        parts.append("cards" if "all" in mode else "card")

    # 5. Zone / Scope
    if scope == "battle":
        parts.append("in battle")
    elif scope == "in_play":
        parts.append("in play")
    elif scope == "hand":
        parts.append("from hand")
    elif scope in ("deck", "draw_pile"):
        parts.append("from deck")
    elif scope in ("discard", "discard_pile"):
        parts.append("from discard pile")
    elif scope in ("reserve", "reserve_pile"):
        parts.append("from Reserve")
    elif scope == "territory":
        parts.append("in territory")

    return " ".join(parts)


def decompile_effect(effect: ActionEffect) -> str:
    """Translates a single ActionEffect into a natural English imperative clause.

    Args:
        effect: ActionEffect specification.

    Returns:
        str: Formatted effect clause (e.g. 'discard an evil character').
    """
    act = _val(effect.action).replace("_", " ")
    dest = _val(effect.destination).replace("_", " ")
    pos = str(effect.destination_position)

    # Special verb mappings per REG
    if "place" in act and "deck" in dest:
        act = "underdeck" if pos == "bottom" else "topdeck"
    elif "place" in act and "reserve" in dest:
        act = "reserve"

    tgt = decompile_target(effect.target)

    # Stat modifications
    if effect.strength_mod is not None or effect.toughness_mod is not None:
        s = f"+{effect.strength_mod}" if (effect.strength_mod or 0) > 0 else str(effect.strength_mod or 0)
        t = f"+{effect.toughness_mod}" if (effect.toughness_mod or 0) > 0 else str(effect.toughness_mod or 0)
        if "modify" in act:
            clause = f"{tgt} is worth {s}/{t}" if (effect.strength_mod or 0) >= 0 and (effect.toughness_mod or 0) >= 0 else f"decrease {tgt} by {abs(effect.strength_mod or 0)}/{abs(effect.toughness_mod or 0)}"
        else:
            clause = f"{act} {tgt} {s}/{t}"
    else:
        clause = f"{act} {tgt}"

    # Duration notes
    dur = _val(effect.duration)
    if dur == "this_turn":
        clause += " this turn"
    elif dur == "until_end_of_phase":
        clause += " until end of phase"

    return clause


def decompile_condition(cond: ConditionExpression) -> str:
    """Formats a ConditionExpression into a natural language condition.

    Args:
        cond: ConditionExpression model.

    Returns:
        str: Natural language conditional clause.
    """
    if cond.selector:
        sc = _val(cond.selector.scope).replace("_", " ")
        prep = "" if sc.startswith("in") else "in "
        if cond.selector.card_titles:
            names = " or ".join(cond.selector.card_titles)
            return f"If {names} is {prep}{sc}"
        target_name = decompile_target(cond.selector)
        return f"If a {target_name} is {prep}{sc}"
    c_type = _val(cond.condition_type).replace("_", " ")
    if c_type:
        return f"If {c_type}"
    return "If condition met"


def decompile_modifier(mod: Modifier) -> str:
    """Formats an ability modifier into canonical rule text.

    Args:
        mod: Modifier model.

    Returns:
        str: Standard modifier string (e.g. 'Cannot be negated.').
    """
    m_type = _val(mod.modifier_type).lower().replace("_", " ")
    if "negate" in m_type:
        return "Cannot be negated."
    if "interrupt" in m_type:
        return "Cannot be interrupted."
    if "prevent" in m_type:
        return "Cannot be prevented."
    if "first strike" in m_type:
        return "First strike."
    if mod.limit_params and mod.limit_params.count:
        return f"(limit {mod.limit_params.count})."
    return f"{m_type.capitalize()}."


def decompile_ability(ability: Ability) -> str:
    """Synthesizes an entire Ability clause into natural card ability sentences.

    Args:
        ability: Ability model with conditions, costs, effects, and modifiers.

    Returns:
        str: Decompiled card text matching REG format.
    """
    clauses: List[str] = []

    # 1. Conditions
    for cond in ability.conditions:
        clauses.append(decompile_condition(cond))

    # 2. Costs & Effects
    effect_parts: List[str] = []
    for c in ability.costs:
        effect_parts.append(decompile_effect(c))

    for idx, e in enumerate(ability.effects):
        txt = decompile_effect(e)
        if idx == 0 and ability.is_optional and not effect_parts:
            txt = f"You may {txt}"
        effect_parts.append(txt)

    if effect_parts:
        clauses.append(", ".join(effect_parts) + ".")

    # 3. Modifiers
    for m in ability.modifiers:
        clauses.append(decompile_modifier(m))

    return " ".join(clauses).strip()


def decompile_card_side(side_logic: CardSideLogic) -> str:
    """Decompiles all abilities of a CardSideLogic into unified card rule text.

    Args:
        side_logic: CardSideLogic model containing list of abilities.

    Returns:
        str: Complete synthesized ability text.
    """
    return " ".join(decompile_ability(ab) for ab in side_logic.abilities)
