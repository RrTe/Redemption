"""Target selector model for identifying effect targets in Redemption CCG.

Supports algorithmic decision modes, ownership checks, multi-zone scopes,
attribute filters, testament/reference buckets, dynamic counts, and chained
target references.
"""

from typing import Any, Dict, List, Optional, Literal, Union
import re
from pydantic import BaseModel, Field, field_validator, model_validator
from models.enums.zone import Zone
from models.enums.selection_mode import SelectionMode
from models.enums.action_verb import ActionVerb, normalize_ability_filter_action
from models.enums.state_filter import StateFilter
from models.logic.dynamic_value import DynamicValue, DynamicValueCalculation
from models.logic.stat_filter import StatFilter, parse_stat_filters
from models.logic.relative_filter import RelativeFilter
from models.logic.target_decomposer import (
    CANONICAL_BRIGADE_MAP,
    CLASS_MAP,
    GROUP_BOOL_MAP,
    HUMAN_MAP,
    LAMB_ICON_MAP,
    UNAMBIGUOUS_CARD_TITLES,
    PLURAL_CARD_TYPE_MAP,
    SINGULAR_CARD_TYPE_ALIASES,
    SUBTYPE_MAP,
    try_decompose_phrase,
)

_ZONE_ALIAS_MAP: Dict[str, Zone] = {
    "draw_pile": Zone.DECK,
    "reserve_pile": Zone.RESERVE_PILE,
    "discard_pile": Zone.DISCARD_PILE,
    "banish_pile": Zone.BANISH_PILE,
    "removed_from_game": Zone.BANISH_PILE,
    "battlefield": Zone.BATTLE,
    "field_of_battle": Zone.BATTLE,
    "field": Zone.IN_PLAY,
    "field_of_play": Zone.IN_PLAY,
    "in_play": Zone.IN_PLAY,
    "bondage": Zone.LAND_OF_BONDAGE,
    "land_of_bondage": Zone.LAND_OF_BONDAGE,
    "redemption": Zone.LAND_OF_REDEMPTION,
    "land_of_redemption": Zone.LAND_OF_REDEMPTION,
    "set-aside": Zone.SET_ASIDE,
    "set_aside_area": Zone.SET_ASIDE,
}

# Only atomic self-referential ORDIR traits/locations/tokens are allowed in
# target.identifiers when selection_mode is automatic_self.
AUTOMATIC_SELF_IDENTIFIER_WHITELIST = frozenset({
    "royalty",
    "philistine",
    "demon",
    "angel",
    "idol",
    "gideon in the title",
    "token",
    "king",
    "animal",
    "jerusalem",
    "egypt",
    "disease",
})

# Verb/syntax artifacts leaked into target.identifiers (e.g. "may block" / "to block")
# must never persist as nominal target identifiers.
VERB_ACTION_IDENTIFIER_NOISE = frozenset({
    "block",
})


def _normalize_single_zone(item: Any) -> Any:
    """Normalizes a single zone enum or unambiguous zone alias string.

    Bare action verbs ('draw', 'discard', 'banish', 'play', 'reserve') are
    deliberately excluded so effect keywords are never accepted as zones.

    Args:
        item: Raw zone item.

    Returns:
        Normalized Zone enum or original value for Pydantic validation.
    """
    if isinstance(item, Zone):
        return item
    if isinstance(item, str):
        clean = item.strip().lower()
        if clean in _ZONE_ALIAS_MAP:
            return _ZONE_ALIAS_MAP[clean]
    return item


def _has_explicit_multi_count(cnt: Any) -> bool:
    """Checks whether a count specification explicitly defines a multi-count or range.

    Args:
        cnt: DynamicValue instance, dict, or None.

    Returns:
        True if dynamic, max_value, or fixed_value > 1 is present.
    """
    if isinstance(cnt, DynamicValue):
        return bool(
            cnt.dynamic is not None
            or cnt.max_value is not None
            or (isinstance(cnt.fixed_value, int) and cnt.fixed_value > 1)
        )
    if isinstance(cnt, dict):
        fv = cnt.get("fixed_value")
        return bool(
            cnt.get("dynamic") is not None
            or cnt.get("max_value") is not None
            or (isinstance(fv, int) and fv > 1)
        )
    return False


def _normalize_optional_bool(value: Any, true_tokens: tuple[str, ...], false_tokens: tuple[str, ...] = ()) -> Any:
    """Normalizes boolean or known textual boolean aliases to Optional[bool].

    Args:
        value: Input boolean, string alias, or None.
        true_tokens: Lowercase string aliases mapping to True.
        false_tokens: Lowercase string aliases mapping to False.

    Returns:
        Boolean value, None, or original value for Pydantic validation.
    """
    if isinstance(value, str):
        low = value.strip().lower()
        if low in ("true",) + true_tokens:
            return True
        if low in ("false",) + false_tokens:
            return False
        if low == "":
            return None
    return value


def _normalize_zone_owner_value(value: Any, default_if_none: Optional[str]) -> Any:
    """Normalizes LLM variations for zone_owner.

    Args:
        value: Raw zone_owner input.
        default_if_none: Value returned when input is None/empty (None for any_of branches).

    Returns:
        Normalized zone_owner string or None.
    """
    if value is None:
        return default_if_none
    if isinstance(value, str):
        clean = value.strip().lower()
        if clean in ("context_scope", "context", "none", "null", ""):
            return default_if_none
        if clean in ("any", "either"):
            return "either"
        if clean in ("all", "both"):
            return "both"
    return value


def _normalize_scope_value(value: Any, default_if_none: Optional[List[Zone]]) -> Any:
    """Normalizes single or multi-zone scope inputs into deduplicated Zones.

    Args:
        value: Raw scope value (Zone, str, list, tuple, set, or None).
        default_if_none: Default list returned for full selectors, or None for any_of branches.

    Returns:
        Deduplicated list of normalized Zones, or default_if_none.
    """
    if value is None:
        return default_if_none
    if isinstance(value, (list, tuple, set)):
        items = [_normalize_single_zone(v) for v in value if v is not None]
        if not items:
            return default_if_none
        deduped: List[Any] = []
        for item in items:
            if item not in deduped:
                deduped.append(item)
        return deduped
    return [_normalize_single_zone(value)]


def _normalize_selector_payload(data: Any, *, is_branch: bool = False) -> Any:
    """Decomposes compound selector fields into orthogonal TargetSelector buckets.

    Shared between ``TargetSelector`` and ``TargetSelectorBranch`` (``any_of``
    elements) so branch filters share identical canonical normalization without
    injecting ``selection_mode`` or ``count``.

    Args:
        data: Raw input dictionary or model state.
        is_branch: True when validating a ``TargetSelectorBranch`` inside ``any_of``.

    Returns:
        Normalized selector payload dictionary.
    """
    if not isinstance(data, dict):
        return data

    data = dict(data)
    if is_branch:
        for forbidden in ("selection_mode", "count", "ref_step", "any_of"):
            if forbidden in data:
                if data[forbidden] is not None and data[forbidden] != []:
                    raise ValueError(f"any_of branch must not define '{forbidden}'")
                data.pop(forbidden, None)

    is_plural = False
    raw_brigades = list(data.get("brigades") or [])
    raw_idents = list(data.get("identifiers") or [])
    raw_titles = list(data.get("card_titles") or [])
    raw_classes = list(data.get("classes") or [])
    has_refs_key = "references" in data and data.get("references") is not None
    clean_refs = list(data.get("references") or [])
    has_filters_key = "stat_filters" in data and data.get("stat_filters") is not None
    clean_filters: List[Any] = list(data.get("stat_filters") or [])

    gender_val = data.get("gender")
    if isinstance(gender_val, str):
        g_low = gender_val.strip().lower()
        if g_low in ("male", "female"):
            gender_val = g_low
        elif g_low == "":
            gender_val = None

    is_generic_val = _normalize_optional_bool(data.get("is_generic"), ("generic",), ("unique",))
    is_human_val = _normalize_optional_bool(data.get("is_human"), ("human", "humans"), ("non-human", "non-humans"))
    is_gospel_val = _normalize_optional_bool(data.get("is_gospel"), ("gospel",))
    is_cloud_val = _normalize_optional_bool(data.get("is_cloud"), ("cloud", "cloud card", "cloud cards"))
    is_star_val = _normalize_optional_bool(data.get("is_star"), ("star", "star card", "star cards", "*"))
    is_meek_val = _normalize_optional_bool(data.get("is_meek"), ("meek",))

    clean_classes: List[str] = []
    for cls_item in raw_classes:
        cls_clean = str(cls_item).strip().lower()
        if cls_clean in ("warrior", "weapon", "territory"):
            cls_canon = cls_clean.capitalize()
            if cls_canon not in clean_classes:
                clean_classes.append(cls_canon)

    testament_val = data.get("testament")
    if isinstance(testament_val, str):
        t_low = testament_val.strip().lower()
        if t_low in ("ot", "o.t.", "old testament"):
            testament_val = "OT"
        elif t_low in ("nt", "n.t.", "new testament"):
            testament_val = "NT"
        else:
            testament_val = None

    # 1. Normalize target_type strictly to canonical CardType
    raw_tt = data.get("target_type")
    if isinstance(raw_tt, str):
        tt_clean = raw_tt.strip().lower()
        if tt_clean in PLURAL_CARD_TYPE_MAP:
            c_type, imp_align = PLURAL_CARD_TYPE_MAP[tt_clean]
            data["target_type"] = c_type
            if imp_align and not data.get("alignment"):
                data["alignment"] = imp_align
            is_plural = True
        elif tt_clean in SINGULAR_CARD_TYPE_ALIASES:
            c_type, imp_align, extra_ident = SINGULAR_CARD_TYPE_ALIASES[tt_clean]
            data["target_type"] = c_type
            if imp_align and not data.get("alignment"):
                data["alignment"] = imp_align
            if extra_ident:
                raw_idents.append(extra_ident)
        elif tt_clean in LAMB_ICON_MAP:
            c_type, imp_align, plur = LAMB_ICON_MAP[tt_clean]
            data["target_type"] = c_type
            if imp_align and not data.get("alignment"):
                data["alignment"] = imp_align
            if plur:
                is_plural = True
        elif tt_clean in HUMAN_MAP:
            ih_bool, plur, imp_type = HUMAN_MAP[tt_clean]
            data["target_type"] = imp_type
            if is_human_val is None:
                is_human_val = ih_bool
            if plur:
                is_plural = True
        elif tt_clean in GROUP_BOOL_MAP:
            field_name, b_val, plur, imp_type = GROUP_BOOL_MAP[tt_clean]
            data["target_type"] = imp_type or "card"
            if field_name == "is_gospel" and is_gospel_val is None:
                is_gospel_val = b_val
            elif field_name == "is_cloud" and is_cloud_val is None:
                is_cloud_val = b_val
            elif field_name == "is_star" and is_star_val is None:
                is_star_val = b_val
            elif field_name == "is_meek" and is_meek_val is None:
                is_meek_val = b_val
            if plur:
                is_plural = True
        elif tt_clean in CLASS_MAP:
            canon_cls, imp_type, plur = CLASS_MAP[tt_clean]
            data["target_type"] = imp_type or "card"
            if canon_cls not in clean_classes:
                clean_classes.append(canon_cls)
            if plur:
                is_plural = True
        elif tt_clean in SUBTYPE_MAP:
            canon_ident, imp_type, plur, imp_align = SUBTYPE_MAP[tt_clean]
            data["target_type"] = imp_type
            if imp_align and not data.get("alignment"):
                data["alignment"] = imp_align
            raw_idents.insert(0, canon_ident)
            if plur:
                is_plural = True
        elif tt_clean == "deck":
            data["target_type"] = "card"
            if data.get("scope") in (None, "battle", ["battle"], [Zone.BATTLE]):
                data["scope"] = [Zone.DECK]
        elif tt_clean == "player":
            data["target_type"] = None

    clean_brigades: List[str] = []
    clean_idents: List[str] = []
    clean_titles: List[str] = []

    def _merge_decomposed(dec: Dict[str, Any]) -> None:
        nonlocal testament_val, gender_val, is_generic_val, is_human_val
        nonlocal is_gospel_val, is_cloud_val, is_star_val, is_meek_val, is_plural
        if dec.get("gender") and not gender_val:
            gender_val = dec["gender"]
        if dec.get("is_generic") is not None and is_generic_val is None:
            is_generic_val = dec["is_generic"]
        if dec.get("is_human") is not None and is_human_val is None:
            is_human_val = dec["is_human"]
        if dec.get("is_gospel") is not None and is_gospel_val is None:
            is_gospel_val = dec["is_gospel"]
        if dec.get("is_cloud") is not None and is_cloud_val is None:
            is_cloud_val = dec["is_cloud"]
        if dec.get("is_star") is not None and is_star_val is None:
            is_star_val = dec["is_star"]
        if dec.get("is_meek") is not None and is_meek_val is None:
            is_meek_val = dec["is_meek"]
        for c_item in dec.get("classes", []):
            if c_item not in clean_classes:
                clean_classes.append(c_item)
        if dec.get("testament") and not testament_val:
            testament_val = dec["testament"]
        if dec.get("alignment") and not data.get("alignment"):
            data["alignment"] = dec["alignment"]
        if dec.get("target_type"):
            cur_tt = data.get("target_type")
            new_tt = dec["target_type"]
            is_idol_only = new_tt == "artifact" and dec.get("identifiers") == ["Idol"]
            if (
                (cur_tt is None)
                or (cur_tt == "card" and not is_idol_only)
                or (cur_tt == "character" and new_tt in ("hero", "evil_character"))
            ):
                data["target_type"] = new_tt
        if dec.get("is_plural"):
            is_plural = True
        for b_item in dec.get("brigades", []):
            if b_item not in clean_brigades:
                clean_brigades.append(b_item)
        for r_item in dec.get("references", []):
            if r_item.lower() not in {x.lower() for x in clean_refs}:
                clean_refs.append(r_item)
        for i_item in dec.get("identifiers", []):
            if i_item.lower() not in {x.lower() for x in clean_idents}:
                clean_idents.append(i_item)
        for t_item in dec.get("card_titles", []):
            if t_item.lower() not in {x.lower() for x in clean_titles}:
                clean_titles.append(t_item)

    # 2. Process brigades
    for b in raw_brigades:
        b_str = str(b).strip()
        if not b_str:
            continue
        b_key = re.sub(r"\s+brigade$", "", b_str, flags=re.I).strip().lower()
        if b_key in CANONICAL_BRIGADE_MAP:
            canon_b = CANONICAL_BRIGADE_MAP[b_key]
            if canon_b not in clean_brigades:
                clean_brigades.append(canon_b)
        elif b_str.lower() in ("territory", "territories"):
            if data.get("scope") in (None, "battle", ["battle"], [Zone.BATTLE]):
                data["scope"] = [Zone.TERRITORY]
        else:
            dec = try_decompose_phrase(b_str, is_from_titles=False)
            if dec is not None:
                _merge_decomposed(dec)
            elif b_str.lower() not in {x.lower() for x in clean_idents}:
                clean_idents.append(b_str)

    # 3. Process card_titles
    for t in raw_titles:
        t_str = str(t).strip()
        if not t_str:
            continue
        dec = try_decompose_phrase(t_str, is_from_titles=True)
        if dec is not None:
            _merge_decomposed(dec)
        elif t_str.lower() not in {x.lower() for x in clean_titles}:
            clean_titles.append(t_str)

    # 4. Process identifiers
    title_lower_set = {x.lower() for x in clean_titles}
    for ident in raw_idents:
        i_str = str(ident).strip()
        if not i_str or i_str.lower() in VERB_ACTION_IDENTIFIER_NOISE:
            continue
        parsed_sf = parse_stat_filters(i_str)
        if parsed_sf:
            for sf in parsed_sf:
                sf_payload = sf.model_dump(exclude_none=True)
                existing_payloads = [
                    f.model_dump(exclude_none=True) if hasattr(f, "model_dump") else f
                    for f in clean_filters
                ]
                if sf_payload not in existing_payloads:
                    clean_filters.append(sf_payload)
            continue
        i_key = re.sub(r"\s+brigade$", "", i_str, flags=re.I).strip().lower()
        if i_key in CANONICAL_BRIGADE_MAP:
            canon_b = CANONICAL_BRIGADE_MAP[i_key]
            if canon_b not in clean_brigades:
                clean_brigades.append(canon_b)
            continue
        if i_str.lower() in ("male", "female"):
            if not gender_val:
                gender_val = i_str.lower()
            continue
        if i_str.lower() == "generic":
            if is_generic_val is None:
                is_generic_val = True
            continue
        if i_str.lower() == "unique":
            if is_generic_val is None:
                is_generic_val = False
            continue
        i_low = i_str.lower()
        if i_low in LAMB_ICON_MAP:
            c_type, imp_align, plur = LAMB_ICON_MAP[i_low]
            if data.get("target_type") in (None, "card"):
                data["target_type"] = c_type
            if not data.get("alignment"):
                data["alignment"] = imp_align
            if plur:
                is_plural = True
            continue
        if i_low in HUMAN_MAP:
            ih_bool, plur, imp_type = HUMAN_MAP[i_low]
            if is_human_val is None:
                is_human_val = ih_bool
            if plur:
                is_plural = True
            if data.get("target_type") in (None, "card"):
                data["target_type"] = imp_type
            continue
        if i_low in GROUP_BOOL_MAP:
            field_name, b_val, plur, imp_type = GROUP_BOOL_MAP[i_low]
            if field_name == "is_gospel" and is_gospel_val is None:
                is_gospel_val = b_val
            elif field_name == "is_cloud" and is_cloud_val is None:
                is_cloud_val = b_val
            elif field_name == "is_star" and is_star_val is None:
                is_star_val = b_val
            elif field_name == "is_meek" and is_meek_val is None:
                is_meek_val = b_val
            if plur:
                is_plural = True
            if imp_type and data.get("target_type") in (None, "card"):
                data["target_type"] = imp_type
            continue
        if i_low in CLASS_MAP:
            canon_cls, imp_type, plur = CLASS_MAP[i_low]
            if canon_cls not in clean_classes:
                clean_classes.append(canon_cls)
            if plur:
                is_plural = True
            if imp_type and data.get("target_type") in (None, "card"):
                data["target_type"] = imp_type
            continue
        if i_str.lower() in title_lower_set:
            continue
        dec = try_decompose_phrase(i_str, is_from_titles=False)
        if dec is not None:
            _merge_decomposed(dec)
            title_lower_set = {x.lower() for x in clean_titles}
        elif i_str.lower() not in {x.lower() for x in clean_idents}:
            clean_idents.append(i_str)

    if not is_branch and is_plural and not _has_explicit_multi_count(data.get("count")):
        data["selection_mode"] = SelectionMode.AUTOMATIC_ALL
        data["count"] = None
        if data.get("zone_owner") in (None, "either"):
            data["zone_owner"] = "both"

    def _set_if_needed(key: str, val: Any) -> None:
        if val is not None or (not is_branch and key in data):
            data[key] = val

    _set_if_needed("gender", gender_val)
    _set_if_needed("is_generic", is_generic_val)
    _set_if_needed("is_human", is_human_val)
    _set_if_needed("is_gospel", is_gospel_val)
    _set_if_needed("is_cloud", is_cloud_val)
    _set_if_needed("is_star", is_star_val)
    _set_if_needed("is_meek", is_meek_val)
    _set_if_needed("testament", testament_val)

    if clean_classes or (not is_branch and raw_classes) or (not is_branch and "classes" in data):
        data["classes"] = clean_classes
    elif "classes" in data and data["classes"] is None:
        data.pop("classes")

    if clean_refs or (not is_branch and has_refs_key):
        data["references"] = clean_refs
    elif "references" in data and not data["references"]:
        data.pop("references")

    if clean_brigades or (not is_branch and raw_brigades):
        data["brigades"] = clean_brigades
    elif is_branch and "brigades" in data and not data["brigades"]:
        data.pop("brigades")

    if clean_idents or (not is_branch and raw_idents):
        data["identifiers"] = clean_idents
    elif is_branch and "identifiers" in data and not data["identifiers"]:
        data.pop("identifiers")

    if clean_titles or (not is_branch and raw_titles):
        data["card_titles"] = clean_titles
    elif is_branch and "card_titles" in data and not data["card_titles"]:
        data.pop("card_titles")

    if clean_filters or (not is_branch and has_filters_key):
        data["stat_filters"] = clean_filters
    elif is_branch and "stat_filters" in data and not data["stat_filters"]:
        data.pop("stat_filters")

    if "used_by" in data and isinstance(data["used_by"], str):
        ub_clean = data["used_by"].strip().lower()
        if ub_clean in ("self", "this card", "this one", "this hero", "this character"):
            data["used_by"] = "self"
        elif ub_clean in ("controller", "you"):
            data["used_by"] = "controller"
        elif ub_clean in ("opponent",):
            data["used_by"] = "opponent"

    if is_branch:
        for opt_list_key in ("state_filters", "relative_filters"):
            if opt_list_key in data and not data[opt_list_key]:
                data.pop(opt_list_key)
        if data.get("exclude_self") is None:
            data.pop("exclude_self", None)

    return data


class TargetSelectorBranch(BaseModel):
    """Partial filter branch inside ``TargetSelector.any_of``.

    Inherits ``selection_mode``, ``count``, default ``scope``, and default
    ``zone_owner`` from the enclosing parent ``TargetSelector``. Must never
    define ``selection_mode`` or ``count``.
    """

    zone_owner: Optional[Literal["controller", "opponent", "both", "either", "target_player"]] = None
    scope: Optional[List[Zone]] = None
    target_type: Optional[str] = None
    brigades: Optional[List[str]] = None
    alignment: Optional[str] = None
    gender: Optional[Literal["male", "female"]] = None
    is_generic: Optional[bool] = None
    is_human: Optional[bool] = None
    is_gospel: Optional[bool] = None
    is_cloud: Optional[bool] = None
    is_star: Optional[bool] = None
    is_meek: Optional[bool] = None
    classes: Optional[List[Literal["Warrior", "Weapon", "Territory"]]] = None
    testament: Optional[Literal["OT", "NT"]] = None
    references: Optional[List[str]] = None
    identifiers: Optional[List[str]] = None
    card_titles: Optional[List[str]] = None
    target_card_ids: Optional[List[str]] = None
    stat_filters: Optional[List[StatFilter]] = None
    exclude_self: Optional[bool] = None
    state_filters: Optional[List[StateFilter]] = None
    relative_filters: Optional[List[RelativeFilter]] = None
    used_by: Optional[Union[Literal["self", "controller", "opponent"], "TargetSelector"]] = None
    exclude: Optional["TargetSelector"] = None
    targets_abilities: Optional[bool] = None
    ability_target_actions: Optional[List[ActionVerb]] = None
    exclude_ability_actions: Optional[List[ActionVerb]] = None

    @field_validator("ability_target_actions", "exclude_ability_actions", mode="before")
    @classmethod
    def normalize_branch_ability_actions(cls, value: Any) -> Optional[List[ActionVerb]]:
        """Normalizes ability filter action strings/enums and rejects unknown actions."""
        if value is None:
            return None
        if isinstance(value, (str, ActionVerb)):
            value = [value]
        res: List[ActionVerb] = []
        for item in value:
            norm = normalize_ability_filter_action(item)
            if norm not in res:
                res.append(norm)
        return res

    @model_validator(mode="after")
    def validate_branch_exclude_non_recursive(self) -> "TargetSelectorBranch":
        """Prevents nested exclude clauses inside TargetSelectorBranch."""
        if self.exclude is not None:
            if self.exclude.exclude is not None or any(
                b.exclude is not None for b in (self.exclude.any_of or [])
            ):
                raise ValueError("Nested TargetSelector.exclude is not permitted.")
            if self.exclude.count is not None:
                raise ValueError("TargetSelector.exclude must be a filter-only selector without count.")
        return self

    @model_validator(mode="before")
    @classmethod
    def normalize_branch_selector(cls, data: Any) -> Any:
        """Validates and decomposes partial filter attributes on an any_of branch."""
        return _normalize_selector_payload(data, is_branch=True)

    @field_validator("zone_owner", mode="before")
    @classmethod
    def normalize_branch_zone_owner(cls, value: Any) -> Any:
        """Normalizes optional zone_owner override on an any_of branch."""
        return _normalize_zone_owner_value(value, None)

    @field_validator("scope", mode="before")
    @classmethod
    def normalize_branch_scope(cls, value: Any) -> Any:
        """Normalizes optional scope override on an any_of branch."""
        return _normalize_scope_value(value, None)


class TargetSelector(BaseModel):
    """Specification of what entities or cards an effect acts upon.

    Attributes:
        selection_mode: Decision mechanism (manual, automatic, chained, etc.).
        zone_owner: Owner of the target zone ('controller', 'opponent', etc.).
        scope: List of target zones per REG definitions (e.g. [Zone.BATTLE]).
        target_type: Primary singular CardType classification (e.g. 'hero', 'evil_character').
        brigades: Required brigade affiliations (empty if any).
        alignment: Required alignment ('good', 'evil', 'neutral').
        gender: Optional character gender requirement ('male' or 'female').
        is_generic: Optional character uniqueness requirement (True for generic, False for unique).
        is_human: Optional character humanity requirement (True for human, False for non-human).
        classes: Required canonical card classes ('Warrior', 'Weapon', 'Territory').
        testament: Optional testament requirement ('OT' or 'NT').
        references: Biblical book or chapter references (e.g. ['Revelation'], ['I Samuel']).
        identifiers: Required singular ORDIR subtypes, roles, locations, or traits.
        card_titles: Specific card names if targeting named cards.
        target_card_ids: Resolved canonical card IDs for card_titles.
        stat_filters: Structured numeric or dynamic status value constraints.
        count: Amount of targets to select.
        ref_step: Reference step index if selection_mode is CHAINED_TARGET.
    """
    selection_mode: SelectionMode = SelectionMode.AUTOMATIC_ALL
    zone_owner: Literal["controller", "opponent", "both", "either", "target_player"] = "controller"
    scope: List[Zone] = Field(default_factory=lambda: [Zone.BATTLE])
    target_type: Optional[str] = None
    brigades: List[str] = Field(default_factory=list)
    alignment: Optional[str] = None
    gender: Optional[Literal["male", "female"]] = None
    is_generic: Optional[bool] = None
    is_human: Optional[bool] = None
    is_gospel: Optional[bool] = None
    is_cloud: Optional[bool] = None
    is_star: Optional[bool] = None
    is_meek: Optional[bool] = None
    classes: List[Literal["Warrior", "Weapon", "Territory"]] = Field(default_factory=list)
    testament: Optional[Literal["OT", "NT"]] = None
    references: List[str] = Field(default_factory=list)
    identifiers: List[str] = Field(default_factory=list)
    card_titles: List[str] = Field(default_factory=list)
    target_card_ids: List[str] = Field(default_factory=list)
    stat_filters: List[StatFilter] = Field(default_factory=list)
    exclude_self: bool = False
    state_filters: List[StateFilter] = Field(default_factory=list)
    relative_filters: List[RelativeFilter] = Field(default_factory=list)
    used_by: Optional[Union[Literal["self", "controller", "opponent"], "TargetSelector"]] = None
    exclude: Optional["TargetSelector"] = None
    targets_abilities: bool = False
    ability_target_actions: List[ActionVerb] = Field(default_factory=list)
    exclude_ability_actions: List[ActionVerb] = Field(default_factory=list)
    any_of: List[TargetSelectorBranch] = Field(default_factory=list)
    count: Optional[DynamicValue] = None
    ref_step: Optional[int] = None

    @field_validator("ability_target_actions", "exclude_ability_actions", mode="before")
    @classmethod
    def normalize_ability_actions(cls, value: Any) -> List[ActionVerb]:
        """Normalizes ability filter action strings/enums and rejects unknown actions."""
        if not value:
            return []
        if isinstance(value, (str, ActionVerb)):
            value = [value]
        res: List[ActionVerb] = []
        for item in value:
            norm = normalize_ability_filter_action(item)
            if norm not in res:
                res.append(norm)
        return res

    @model_validator(mode="after")
    def validate_exclude_non_recursive(self) -> "TargetSelector":
        """Prevents nested exclude clauses and count constraints inside exclude."""
        if self.exclude is not None:
            if self.exclude.exclude is not None or any(
                b.exclude is not None for b in (self.exclude.any_of or [])
            ):
                raise ValueError("Nested TargetSelector.exclude is not permitted.")
            if self.exclude.count is not None:
                raise ValueError("TargetSelector.exclude must be a filter-only selector without count.")
        return self

    @model_validator(mode="before")
    @classmethod
    def normalize_plural_target_semantics(cls, data: Any) -> Any:
        """Decomposes compound selectors into 6 orthogonal buckets and preserves plural 'all' semantics.

        Args:
            data: Raw input dictionary or model state.

        Returns:
            Normalized dictionary.
        """
        if not isinstance(data, dict):
            return data
        return _normalize_selector_payload(data, is_branch=False)

    @field_validator("selection_mode", mode="before")
    @classmethod
    def normalize_selection_mode(cls, value: Any) -> Any:
        """Normalizes selection mode aliases like 'self' to AUTOMATIC_SELF."""
        if isinstance(value, str):
            clean = value.strip().lower().replace("-", "_").replace(" ", "_")
            if clean in ("self", "this", "this_card", "source", "automatic_self"):
                return SelectionMode.AUTOMATIC_SELF
        return value

    @field_validator("zone_owner", mode="before")
    @classmethod
    def normalize_zone_owner(cls, value: Any) -> Any:
        """Normalizes LLM output variations for zone_owner."""
        return _normalize_zone_owner_value(value, "controller")

    @field_validator("scope", mode="before")
    @classmethod
    def normalize_scope(cls, value: Any) -> Any:
        """Normalizes single or multi-zone scope inputs into a deduplicated list of Zones."""
        return _normalize_scope_value(value, [Zone.IN_PLAY])


TargetSelectorBranch.model_rebuild()
TargetSelector.model_rebuild()


DynamicValueCalculation.model_rebuild(_types_namespace={"TargetSelector": TargetSelector})
DynamicValue.model_rebuild(_types_namespace={"TargetSelector": TargetSelector})
