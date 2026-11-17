"""Shared compact AST builder helpers for Phase 2 migration and repair scripts."""

from __future__ import annotations

from typing import Any, Dict, List, Optional


def dv_int(val: int) -> Dict[str, Any]:
    """Builds a fixed integer DynamicValue dict."""
    return {"fixed_value": val}


def dv_up_to(max_val: int, min_val: int = 0) -> Dict[str, Any]:
    """Builds a bounded 'up to N' DynamicValue dict."""
    return {"min_value": min_val, "max_value": max_val}


def dv_all() -> Dict[str, Any]:
    """Builds an 'all' DynamicValue dict."""
    return {"fixed_value": "all"}


def dv_x(
    source: str = "count_cards",
    scope: Optional[str] = None,
    target_type: Optional[str] = None,
    limit: Optional[int] = None,
    multiplier: int = 1,
    min_value: Optional[int] = None,
) -> Dict[str, Any]:
    """Builds a dynamic X DynamicValue dict."""
    calc: Dict[str, Any] = {"source": source, "multiplier": multiplier}
    if scope is not None:
        calc["scope"] = scope
    if target_type is not None:
        calc["target_type"] = target_type
    if limit is not None:
        calc["limit"] = limit
    out: Dict[str, Any] = {"dynamic": calc}
    if min_value is not None:
        out["min_value"] = min_value
    return out


def sel(
    selection_mode: str = "automatic_all",
    zone_owner: str = "controller",
    scope: Optional[List[str]] = None,
    target_type: Optional[str] = "card",
    alignment: Optional[str] = None,
    brigades: Optional[List[str]] = None,
    gender: Optional[str] = None,
    is_generic: Optional[bool] = None,
    is_human: Optional[bool] = None,
    classes: Optional[List[str]] = None,
    testament: Optional[str] = None,
    references: Optional[List[str]] = None,
    identifiers: Optional[List[str]] = None,
    card_titles: Optional[List[str]] = None,
    stat_filters: Optional[List[Dict[str, Any]]] = None,
    count: Optional[Dict[str, Any]] = None,
    ref_step: Optional[int] = None,
) -> Dict[str, Any]:
    """Builds a TargetSelector dict with canonical defaults."""
    out: Dict[str, Any] = {
        "selection_mode": selection_mode,
        "zone_owner": zone_owner,
        "scope": scope if scope is not None else ["in_play"],
        "target_type": target_type,
        "brigades": brigades or [],
        "classes": classes or [],
        "references": references or [],
        "identifiers": identifiers or [],
        "card_titles": card_titles or [],
        "target_card_ids": [],
        "stat_filters": stat_filters or [],
    }
    if alignment is not None:
        out["alignment"] = alignment
    if gender is not None:
        out["gender"] = gender
    if is_generic is not None:
        out["is_generic"] = is_generic
    if is_human is not None:
        out["is_human"] = is_human
    if testament is not None:
        out["testament"] = testament
    if count is not None:
        out["count"] = count
    if ref_step is not None:
        out["ref_step"] = ref_step
    return out


def pf(
    actions: Optional[List[str]] = None,
    card_sources: Optional[List[Dict[str, Any]]] = None,
    from_harm: bool = False,
    except_actions: Optional[List[str]] = None,
    qualifiers: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Builds a ProtectionFilter dict."""
    return {
        "from_harm": from_harm,
        "actions": actions or [],
        "except_actions": except_actions or [],
        "card_sources": card_sources or [],
        "qualifiers": qualifiers or [],
    }


def eff(
    step: int,
    action: str,
    target: Optional[Dict[str, Any]] = None,
    effect_type: str = "instant",
    duration: str = "instant",
    destination: Optional[str] = None,
    destination_position: str = "as_is",
    strength_mod: Optional[int] = None,
    toughness_mod: Optional[int] = None,
    protection_filter: Optional[Dict[str, Any]] = None,
    creates_context_scope: bool = False,
    dependency: str = "always",
) -> Dict[str, Any]:
    """Builds an ActionEffect dict."""
    out: Dict[str, Any] = {
        "step": step,
        "action": action,
        "effect_type": effect_type,
        "duration": duration,
        "destination_position": destination_position,
        "creates_context_scope": creates_context_scope,
        "dependency": dependency,
    }
    if target is not None:
        out["target"] = target
    if protection_filter is not None:
        out["protection_filter"] = protection_filter
    if destination is not None:
        out["destination"] = destination
    if strength_mod is not None:
        out["strength_mod"] = strength_mod
    if toughness_mod is not None:
        out["toughness_mod"] = toughness_mod
    return out


def cond(
    condition_type: str = "zone_check",
    selector: Optional[Dict[str, Any]] = None,
    operator: str = ">=",
    value: Any = 1,
) -> Dict[str, Any]:
    """Builds a ConditionExpression dict."""
    out: Dict[str, Any] = {"condition_type": condition_type, "operator": operator}
    if selector is not None:
        out["selector"] = selector
    if value is not None:
        out["value"] = value
    return out


def mod(
    modifier_type: str,
    applies_to: str = "this_ability",
    limit_count: Optional[int] = None,
    limit_per: Optional[str] = None,
    trigger_event: Optional[str] = None,
    replace_with_action: Optional[str] = None,
) -> Dict[str, Any]:
    """Builds a Modifier dict."""
    out: Dict[str, Any] = {"modifier_type": modifier_type, "applies_to": applies_to}
    if modifier_type == "limit":
        out["limit_params"] = {"count": limit_count or 1, "per": limit_per or "battle"}
    elif modifier_type == "instead":
        out["replacement_params"] = {
            "trigger_event": trigger_event or "would_occur",
            "replace_with_action": replace_with_action or "instead",
        }
    return out


def ab(
    ability_id: str,
    effects: List[Dict[str, Any]],
    activation_mode: str = "immediate",
    is_optional: bool = False,
    is_star: bool = False,
    trigger_event: Optional[str] = None,
    trigger_filter: Optional[Dict[str, Any]] = None,
    conditions: Optional[List[Dict[str, Any]]] = None,
    costs: Optional[List[Dict[str, Any]]] = None,
    modifiers: Optional[List[Dict[str, Any]]] = None,
    choice_group: Optional[str] = None,
    is_negatable: bool = True,
    is_interruptible: bool = True,
    is_preventable: bool = True,
) -> Dict[str, Any]:
    """Builds an Ability dict."""
    out: Dict[str, Any] = {
        "ability_id": ability_id,
        "is_star": is_star,
        "activation_mode": "triggered" if is_star and activation_mode == "immediate" else activation_mode,
        "is_optional": is_optional,
        "is_preventable": is_preventable,
        "is_interruptible": is_interruptible,
        "is_negatable": is_negatable,
        "conditions": conditions or [],
        "costs": costs or [],
        "effects": effects,
        "modifiers": modifiers or [],
    }
    if is_star and not trigger_event:
        out["trigger_event"] = "star_phase"
    elif trigger_event is not None:
        out["trigger_event"] = trigger_event
    if trigger_filter is not None:
        out["trigger_filter"] = trigger_filter
    if choice_group is not None:
        out["choice_group"] = choice_group
    return out


def side(
    abilities: List[Dict[str, Any]],
    modifiers: Optional[List[Dict[str, Any]]] = None,
) -> Dict[str, Any]:
    """Builds a CardSideLogic dict."""
    return {"modifiers": modifiers or [], "abilities": abilities}
