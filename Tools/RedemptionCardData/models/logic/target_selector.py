"""Target selector model for identifying effect targets in Redemption CCG.

Supports algorithmic decision modes, ownership checks, multi-zone scopes,
attribute filters, testament/reference buckets, dynamic counts, and chained
target references.
"""

from typing import Any, Dict, List, Optional, Literal
import re
from pydantic import BaseModel, Field, field_validator, model_validator
from models.enums.zone import Zone
from models.enums.selection_mode import SelectionMode
from models.logic.dynamic_value import DynamicValue
from models.logic.stat_filter import StatFilter, parse_stat_filters
from models.logic.target_decomposer import (
    CANONICAL_BRIGADE_MAP,
    CLASS_MAP,
    HUMAN_MAP,
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
    "meek",
    "royalty",
    "philistine",
    "demon",
    "angel",
    "idol",
    "cloud",
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
    classes: List[Literal["Warrior", "Weapon", "Territory"]] = Field(default_factory=list)
    testament: Optional[Literal["OT", "NT"]] = None
    references: List[str] = Field(default_factory=list)
    identifiers: List[str] = Field(default_factory=list)
    card_titles: List[str] = Field(default_factory=list)
    target_card_ids: List[str] = Field(default_factory=list)
    stat_filters: List[StatFilter] = Field(default_factory=list)
    count: Optional[DynamicValue] = None
    ref_step: Optional[int] = None

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

        is_plural = False
        raw_brigades = list(data.get("brigades") or [])
        raw_idents = list(data.get("identifiers") or [])
        raw_titles = list(data.get("card_titles") or [])
        raw_classes = list(data.get("classes") or [])
        clean_refs = list(data.get("references") or [])
        clean_filters: List[Any] = list(data.get("stat_filters") or [])
        gender_val = data.get("gender")
        if isinstance(gender_val, str):
            g_low = gender_val.strip().lower()
            if g_low in ("male", "female"):
                gender_val = g_low
            elif g_low == "":
                gender_val = None
        is_generic_val = data.get("is_generic")
        if isinstance(is_generic_val, str):
            ig_low = is_generic_val.strip().lower()
            if ig_low in ("true", "generic"):
                is_generic_val = True
            elif ig_low in ("false", "unique"):
                is_generic_val = False
            elif ig_low == "":
                is_generic_val = None
        is_human_val = data.get("is_human")
        if isinstance(is_human_val, str):
            ih_low = is_human_val.strip().lower()
            if ih_low in ("true", "human", "humans"):
                is_human_val = True
            elif ih_low in ("false", "non-human", "non-humans"):
                is_human_val = False
            elif ih_low == "":
                is_human_val = None
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
            elif tt_clean in HUMAN_MAP:
                ih_bool, plur, imp_type = HUMAN_MAP[tt_clean]
                data["target_type"] = imp_type
                if is_human_val is None:
                    is_human_val = ih_bool
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
            nonlocal testament_val, gender_val, is_generic_val, is_human_val, is_plural
            if dec.get("gender") and not gender_val:
                gender_val = dec["gender"]
            if dec.get("is_generic") is not None and is_generic_val is None:
                is_generic_val = dec["is_generic"]
            if dec.get("is_human") is not None and is_human_val is None:
                is_human_val = dec["is_human"]
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
                if cur_tt in (None, "card") or (cur_tt == "character" and new_tt in ("hero", "evil_character")):
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
            if i_low in HUMAN_MAP:
                ih_bool, plur, imp_type = HUMAN_MAP[i_low]
                if is_human_val is None:
                    is_human_val = ih_bool
                if plur:
                    is_plural = True
                if data.get("target_type") in (None, "card"):
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

        if is_plural and not _has_explicit_multi_count(data.get("count")):
            data["selection_mode"] = SelectionMode.AUTOMATIC_ALL
            data["count"] = None
            if data.get("zone_owner") in (None, "either"):
                data["zone_owner"] = "both"

        if gender_val is not None or "gender" in data:
            data["gender"] = gender_val
        if is_generic_val is not None or "is_generic" in data:
            data["is_generic"] = is_generic_val
        if is_human_val is not None or "is_human" in data:
            data["is_human"] = is_human_val
        if raw_classes or clean_classes or "classes" in data:
            data["classes"] = clean_classes
        if testament_val is not None or "testament" in data:
            data["testament"] = testament_val
        if clean_refs or "references" in data:
            data["references"] = clean_refs
        if raw_brigades or clean_brigades:
            data["brigades"] = clean_brigades
        if raw_idents or clean_idents:
            data["identifiers"] = clean_idents
        if raw_titles or clean_titles:
            data["card_titles"] = clean_titles
        if clean_filters or "stat_filters" in data:
            data["stat_filters"] = clean_filters

        return data

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
        if value is None:
            return "controller"
        if isinstance(value, str):
            clean = value.strip().lower()
            if clean in ("context_scope", "context", "none", "null", ""):
                return "controller"
            if clean in ("any", "either"):
                return "either"
            if clean in ("all", "both"):
                return "both"
        return value

    @field_validator("scope", mode="before")
    @classmethod
    def normalize_scope(cls, value: Any) -> Any:
        """Normalizes single or multi-zone scope inputs into a deduplicated list of Zones."""
        if value is None:
            return [Zone.IN_PLAY]
        if isinstance(value, (list, tuple, set)):
            items = [_normalize_single_zone(v) for v in value if v is not None]
            if not items:
                return [Zone.IN_PLAY]
            deduped: List[Any] = []
            for item in items:
                if item not in deduped:
                    deduped.append(item)
            return deduped
        return [_normalize_single_zone(value)]
