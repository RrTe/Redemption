"""Shared Phase 5a extraction logic for exclude_self, state_filters, relative_filters, and used_by."""

from __future__ import annotations

import copy
import re
from typing import Any, Dict, FrozenSet, List, Optional, Tuple

from models.enums.state_filter import StateFilter

# Identifier phrases promoted to exclude_self=True when not referring to self/host zones.
EXCLUDE_SELF_TOKENS: FrozenSet[str] = frozenset({
    "except this card",
    "except this one",
    "except self",
    "except himself",
    "except herself",
    "other",
    "another",
    "all other",
    "any other lost soul",
})

# Tokens representing StateFilter enums inside TargetSelector.identifiers.
STATE_FILTER_TOKEN_MAP: Dict[str, List[str]] = {
    "attacking": [StateFilter.ATTACKING.value],
    "blocking": [StateFilter.BLOCKING.value],
    "blocking your hero": [StateFilter.BLOCKING.value],
    "blocking holder's heroes": [StateFilter.BLOCKING.value],
    "blocking a rescue": [StateFilter.BLOCKING.value],
    "blocking alone": [StateFilter.BLOCKING.value, StateFilter.LONE.value],
    "blocking a rescue at that site": [StateFilter.BLOCKING.value, StateFilter.IN_SAME_ZONE.value],
    "blocking a rescue attempt": [StateFilter.BLOCKING.value],
    "rescuing": [StateFilter.RESCUING.value],
    "opposed": [StateFilter.OPPOSED.value],
    "unless a character is opposed": [StateFilter.OPPOSED.value],
    "blocked": [StateFilter.BLOCKED.value],
    "unblocked": [StateFilter.UNBLOCKED.value],
    "banded": [StateFilter.BANDED.value],
    "already banded": [StateFilter.BANDED.value],
    "lone": [StateFilter.LONE.value],
    "alone": [StateFilter.LONE.value],
    "lone rescuing": [StateFilter.LONE.value, StateFilter.RESCUING.value],
    "in battle": [StateFilter.IN_BATTLE.value],
    "not in battle": [StateFilter.NOT_IN_BATTLE.value],
    "not in field of battle": [StateFilter.NOT_IN_BATTLE.value],
    "not in the field of battle": [StateFilter.NOT_IN_BATTLE.value],
    "active": [StateFilter.ACTIVATED.value],
    "activated": [StateFilter.ACTIVATED.value],
    "currently activated": [StateFilter.ACTIVATED.value],
    "inactive": [StateFilter.INACTIVE.value],
    "deactivated": [StateFilter.INACTIVE.value],
    "captured": [StateFilter.CAPTURED.value],
    "captive": [StateFilter.CAPTURED.value],
    "captured character": [StateFilter.CAPTURED.value],
    "prisoner": [StateFilter.CAPTURED.value],
    "being held": [StateFilter.CAPTURED.value],
    "face-down": [StateFilter.FACE_DOWN.value],
    "face down": [StateFilter.FACE_DOWN.value],
    "face down in a site": [StateFilter.FACE_DOWN.value],
    "face down on a site": [StateFilter.FACE_DOWN.value],
    "face-up": [StateFilter.FACE_UP.value],
    "face up": [StateFilter.FACE_UP.value],
    "set-aside": [StateFilter.SET_ASIDE.value],
    "was or is set aside": [StateFilter.SET_ASIDE.value],
    "equipped": [StateFilter.EQUIPPED.value],
    "holding weapon": [StateFilter.HOLDING_WEAPON.value],
    "occupied": [StateFilter.OCCUPIED.value],
    "occupied site": [StateFilter.OCCUPIED.value],
    "unoccupied": [StateFilter.UNOCCUPIED.value],
    "empty": [StateFilter.UNOCCUPIED.value],
    "unoccupied single color": [StateFilter.UNOCCUPIED.value, StateFilter.SINGLE_BRIGADE.value],
    "empty single color site": [StateFilter.UNOCCUPIED.value, StateFilter.SINGLE_BRIGADE.value],
    "protected": [StateFilter.PROTECTED.value],
    "converted": [StateFilter.CONVERTED.value],
    "poisoned": [StateFilter.POISONED.value],
    "diseased": [StateFilter.DISEASED.value],
    "with leprosy": [StateFilter.DISEASED.value],
    "revealed": [StateFilter.REVEALED.value],
    "about to be discarded": [StateFilter.ABOUT_TO_BE_DISCARDED.value],
    "single-brigade": [StateFilter.SINGLE_BRIGADE.value],
    "single-color": [StateFilter.SINGLE_BRIGADE.value],
    "single color": [StateFilter.SINGLE_BRIGADE.value],
    "single-colored": [StateFilter.SINGLE_BRIGADE.value],
    "single color site": [StateFilter.SINGLE_BRIGADE.value],
    "single-color site": [StateFilter.SINGLE_BRIGADE.value],
    "multi-brigade": [StateFilter.MULTI_BRIGADE.value],
    "multi-color": [StateFilter.MULTI_BRIGADE.value],
    "on this card": [StateFilter.ATTACHED_TO_SELF.value],
    "on this artifact": [StateFilter.ATTACHED_TO_SELF.value],
    "contents": [StateFilter.ATTACHED_TO_SELF.value],
    "content": [StateFilter.ATTACHED_TO_SELF.value],
    "in it": [StateFilter.ATTACHED_TO_SELF.value],
    "from here": [StateFilter.ATTACHED_TO_SELF.value],
    "here": [StateFilter.ATTACHED_TO_SELF.value],
    "on this hero": [StateFilter.ATTACHED_TO_SELF.value],
    "occupying this fortress": [StateFilter.ATTACHED_TO_SELF.value],
    "in this site": [StateFilter.HELD_BY_SELF.value],
    "on this site": [StateFilter.HELD_BY_SELF.value],
    "held here": [StateFilter.HELD_BY_SELF.value],
    "held prisoner in this site": [StateFilter.CAPTURED.value, StateFilter.HELD_BY_SELF.value],
    "at that site": [StateFilter.IN_SAME_ZONE.value],
    "on that site": [StateFilter.IN_SAME_ZONE.value],
    "in that territory": [StateFilter.IN_SAME_ZONE.value],
    "another hero in that territory": [StateFilter.IN_SAME_ZONE.value],
    "played this turn": [StateFilter.PLAYED_THIS_TURN.value],
    "played this battle": [StateFilter.PLAYED_THIS_BATTLE.value],
    "played in battle": [StateFilter.PLAYED_THIS_BATTLE.value],
    "if played during battle": [StateFilter.PLAYED_THIS_BATTLE.value],
    "played during this phase": [StateFilter.PLAYED_THIS_BATTLE.value],
    "played during that battle": [StateFilter.PLAYED_THIS_BATTLE.value],
    "drawn this turn": [StateFilter.DRAWN_THIS_TURN.value],
    "drawn cards this turn": [StateFilter.DRAWN_THIS_TURN.value],
    "entered battle this turn": [StateFilter.ENTERED_BATTLE_THIS_TURN.value],
    "first played each battle": [StateFilter.FIRST_PLAYED_THIS_BATTLE.value],
    "first each battle": [StateFilter.FIRST_PLAYED_THIS_BATTLE.value],
    "first played this battle": [StateFilter.FIRST_PLAYED_THIS_BATTLE.value],
    "first played by an opponent each battle": [StateFilter.FIRST_PLAYED_THIS_BATTLE.value],
    "first played by an opponent": [StateFilter.FIRST_PLAYED_THIS_BATTLE.value],
    "first opponent plays each battle": [StateFilter.FIRST_PLAYED_THIS_BATTLE.value],
    "first played by an opponent each turn": [StateFilter.FIRST_PLAYED_THIS_TURN.value],
    "next played": [StateFilter.NEXT_PLAYED.value],
    "next played this battle": [StateFilter.NEXT_PLAYED.value],
    "next": [StateFilter.NEXT_PLAYED.value],
    "last played": [StateFilter.LAST_PLAYED.value],
}

# Relative comparison filters extracted from TargetSelector.identifiers.
RELATIVE_FILTER_TOKEN_MAP: Dict[str, Dict[str, Any]] = {
    "opposite alignment": {"attribute": "alignment", "relation": "opposite", "reference": "self"},
    "different alignment": {"attribute": "alignment", "relation": "different", "reference": "self"},
    "a different alignment": {"attribute": "alignment", "relation": "different", "reference": "self"},
    "different alignment than this card": {"attribute": "alignment", "relation": "different", "reference": "self"},
    "matching alignment": {"attribute": "alignment", "relation": "same", "reference": "self"},
    "opposite gender": {"attribute": "gender", "relation": "opposite", "reference": "chained_target"},
    "selected brigade": {"attribute": "brigade", "relation": "same", "reference": "selected"},
    "a selected brigade": {"attribute": "brigade", "relation": "same", "reference": "selected"},
    "selected evil brigade": {"attribute": "brigade", "relation": "same", "reference": "selected"},
    "chosen brigade": {"attribute": "brigade", "relation": "same", "reference": "selected"},
    "matching brigade": {"attribute": "brigade", "relation": "same", "reference": "actor"},
    "of matching brigade": {"attribute": "brigade", "relation": "same", "reference": "chained_target"},
    "matching hero's brigade": {"attribute": "brigade", "relation": "same", "reference": "actor"},
    "matching king saul's brigade": {"attribute": "brigade", "relation": "same", "reference": "self"},
    "matching joab's brigade": {"attribute": "brigade", "relation": "same", "reference": "self"},
    "matching the discarded enhancement": {"attribute": "brigade", "relation": "same", "reference": "chained_target"},
    "matching that covenant's brigade": {"attribute": "brigade", "relation": "same", "reference": "chained_target"},
    "matching brigade of hero in play": {"attribute": "brigade", "relation": "same", "reference": "actor"},
    "different brigade": {"attribute": "brigade", "relation": "different", "reference": "actor"},
    "different brigades": {"attribute": "brigade", "relation": "different", "reference": "actor"},
    "another brigade": {"attribute": "brigade", "relation": "different", "reference": "actor"},
    "different brigade than the character using it": {"attribute": "brigade", "relation": "different", "reference": "actor"},
    "brigade not already in battle": {"attribute": "brigade", "relation": "different", "reference": "actor"},
    "same brigade": {"attribute": "brigade", "relation": "same", "reference": "self"},
    "same testament": {"attribute": "testament", "relation": "same", "reference": "self"},
    "same testament as this hero": {"attribute": "testament", "relation": "same", "reference": "self"},
    "different testament than that card": {"attribute": "testament", "relation": "different", "reference": "chained_target"},
    "matching lost soul's testament": {"attribute": "testament", "relation": "same", "reference": "chained_target"},
    "same book as this hero": {"attribute": "book", "relation": "same", "reference": "self"},
    "shares book with target": {"attribute": "book", "relation": "same", "reference": "chained_target"},
    "matching revealed card's book": {"attribute": "book", "relation": "same", "reference": "chained_target"},
    "matching the reserved hero's book": {"attribute": "book", "relation": "same", "reference": "chained_target"},
    "different books in reference": {"attribute": "book", "relation": "different", "reference": "self"},
    "from the same church as this hero": {"attribute": "church", "relation": "same", "reference": "self"},
    "with strength greater than demon's toughness": {"attribute": "strength", "relation": ">", "reference": "actor"},
}

# Explicit structured TargetSelectors for 'used by ...' qualifiers found in dataset.
USED_BY_SELECTOR_MAP: Dict[str, Any] = {
    "used by this card": "self",
    "used by self": "self",
    "used by this hero": "self",
    "used by this character": "self",
    "used by him": "self",
    "played on him": "self",
    "played with them": "self",
    "used by opponent": "opponent",
    "used by bearer": {"selection_mode": "chained_target", "zone_owner": "controller", "scope": ["in_play"], "target_type": "character", "ref_step": 1},
    "used by that hero": {"selection_mode": "chained_target", "zone_owner": "controller", "scope": ["in_play"], "target_type": "hero", "ref_step": 1},
    "played on hero": {"selection_mode": "chained_target", "zone_owner": "controller", "scope": ["battle"], "target_type": "hero", "ref_step": 1},
    "played on selected hero": {"selection_mode": "chained_target", "zone_owner": "controller", "scope": ["in_play"], "target_type": "hero", "ref_step": 1},
    "used by heroes": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "target_type": "hero", "alignment": "good"},
    "used by a hero": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "target_type": "hero", "alignment": "good"},
    "used by a meek hero": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "target_type": "hero", "alignment": "good", "is_meek": True},
    "used by a gospel hero": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "target_type": "hero", "alignment": "good", "is_gospel": True},
    "used by a genesis hero": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "target_type": "hero", "alignment": "good", "references": ["Genesis"]},
    "used by n.t. human heroes": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "target_type": "hero", "alignment": "good", "testament": "NT", "is_human": True},
    "used by your n.t. character": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "target_type": "character", "testament": "NT"},
    "used by clay heroes": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "target_type": "hero", "alignment": "good", "brigades": ["Clay"]},
    "used by colossae heroes": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "target_type": "hero", "alignment": "good", "identifiers": ["Colossae Church"]},
    "scripture verse used by colossae heroes": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "target_type": "hero", "alignment": "good", "identifiers": ["Colossae Church"]},
    "used by good priests this turn": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "target_type": "character", "alignment": "good", "identifiers": ["Priest"]},
    "used by a son of jacob": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "target_type": "character", "identifiers": ["Son of Jacob"]},
    "used by a thief": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["battle"], "target_type": "character", "identifiers": ["Thief"]},
    "used by a thief in battle": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["battle"], "target_type": "character", "identifiers": ["Thief"]},
    "used by a philistine": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["battle"], "target_type": "character", "identifiers": ["Philistine"]},
    "used by a demon": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["battle"], "target_type": "evil_character", "alignment": "evil", "identifiers": ["Demon"]},
    "used by a male": {"selection_mode": "automatic_all", "zone_owner": "either", "scope": ["battle"], "target_type": "character", "gender": "male"},
    "used by a single brigade character": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["battle"], "target_type": "character", "state_filters": ["single_brigade"]},
    "used by job": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "card_titles": ["Job"]},
    "used by eleazar": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "card_titles": ["Eleazar"]},
    "used by haman": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "card_titles": ["Haman"]},
    "used by thomas": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "card_titles": ["Thomas"]},
    "used by michael": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "card_titles": ["Michael"]},
    "played with michael": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["battle"], "card_titles": ["Michael"]},
    "played on michael": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["battle"], "card_titles": ["Michael"]},
    "played on peter": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["battle"], "card_titles": ["Peter"]},
    "played on paul": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["battle"], "card_titles": ["Paul"]},
    "played on king jotham": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["battle"], "card_titles": ["King Jotham"]},
    "used by mordecai": {"selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "card_titles": ["Mordecai"]},
    "used by a luke or john hero": {
        "selection_mode": "automatic_all",
        "zone_owner": "controller",
        "scope": ["battle"],
        "target_type": "hero",
        "alignment": "good",
        "any_of": [
            {"target_type": "hero", "alignment": "good", "references": ["Luke"]},
            {"target_type": "hero", "alignment": "good", "references": ["John"]},
        ],
    },
    "used by a musician or n.t. female": {
        "selection_mode": "automatic_all",
        "zone_owner": "controller",
        "scope": ["battle"],
        "target_type": "character",
        "any_of": [
            {"target_type": "character", "identifiers": ["Musician"]},
            {"target_type": "character", "testament": "NT", "gender": "female"},
        ],
    },
}

UNMIGRATED_PHASE5A_IDENTIFIER_TOKENS: FrozenSet[str] = frozenset({
    "except this card",
    "except this one",
    "except self",
    "except himself",
    "except herself",
    "other",
    "another",
    "all other",
    "attacking",
    "blocking",
    "rescuing",
    "lone",
    "banded",
    "captured",
    "occupied",
    "unoccupied",
    "equipped",
    "inactive",
    "deactivated",
    "poisoned",
    "diseased",
    "multi-brigade",
    "multi-color",
    "used by this card",
    "used by self",
    "used by this hero",
    "used by this character",
    "selected brigade",
    "a selected brigade",
    "matching brigade",
    "of matching brigade",
    "opposite alignment",
    "different alignment than this card",
    "a different alignment",
    "opposite gender",
    "single-brigade",
    "single-color",
    "single color",
    "single-colored",
    "not in battle",
    "not in field of battle",
    "not in the field of battle",
    "face-down",
    "face down",
    "holding weapon",
    "held here",
    "held prisoner in this site",
    "in this site",
    "on this site",
    "on this card",
    "on this artifact",
    "at that site",
    "on that site",
    "in that territory",
    "played this turn",
    "played this battle",
    "drawn this turn",
    "about to be discarded",
    "next played",
    "last played",
})


def _append_unique_state(sel: Dict[str, Any], st: str) -> None:
    """Appends a canonical StateFilter string without duplicates."""
    cur = list(sel.get("state_filters") or [])
    if st not in cur:
        cur.append(st)
    sel["state_filters"] = cur


def _append_unique_rel(sel: Dict[str, Any], rf: Dict[str, Any]) -> None:
    """Appends a RelativeFilter dict without structural duplicates."""
    cur = list(sel.get("relative_filters") or [])
    if not any(
        x.get("attribute") == rf["attribute"]
        and x.get("relation") == rf["relation"]
        and x.get("reference") == rf["reference"]
        for x in cur
    ):
        cur.append(copy.deepcopy(rf))
    sel["relative_filters"] = cur


def _is_relative_or_state_exempt(low: str, action: str) -> bool:
    """Returns True when an ambiguous token like 'immune' or 'leprosy' refers to ability/action, not state."""
    if low == "immune":
        return True
    if low == "leprosy" and action in ("disease", "give"):
        return True
    if low == "protected" and action in ("protect", "negate", "prevent"):
        return False
    return False


def promote_phase5a_fields(
    sel: Dict[str, Any],
    *,
    action: str = "",
    is_branch: bool = False,
) -> None:
    """Deterministically promotes Phase 5a tokens out of TargetSelector.identifiers.

    Args:
        sel: TargetSelector or TargetSelectorBranch dictionary mutated in place.
        action: Enclosing ActionVerb value when available (guards verb/grant confusion).
        is_branch: True if ``sel`` is inside ``any_of`` (avoids setting ``any_of`` on a branch).

    Returns:
        None.
    """
    idents = list(sel.get("identifiers") or [])
    if idents:
        kept: List[str] = []
        for ident in idents:
            s = str(ident).strip()
            low = s.lower()

            if _is_relative_or_state_exempt(low, action):
                kept.append(s)
                continue

            if low == "another hero in that territory":
                sel["exclude_self"] = True
                _append_unique_state(sel, StateFilter.IN_SAME_ZONE.value)
                continue

            if low in EXCLUDE_SELF_TOKENS:
                sel["exclude_self"] = True
                continue

            if low == "poisoned or diseased" and not is_branch and not sel.get("any_of"):
                existing_tt = sel.get("target_type")
                sel["any_of"] = [
                    {"target_type": existing_tt, "state_filters": [StateFilter.POISONED.value]}
                    if existing_tt
                    else {"state_filters": [StateFilter.POISONED.value]},
                    {"target_type": existing_tt, "state_filters": [StateFilter.DISEASED.value]}
                    if existing_tt
                    else {"state_filters": [StateFilter.DISEASED.value]},
                ]
                continue

            if low in STATE_FILTER_TOKEN_MAP:
                for st in STATE_FILTER_TOKEN_MAP[low]:
                    _append_unique_state(sel, st)
                if low == "occupied site" and not sel.get("target_type"):
                    sel["target_type"] = "site"
                elif low in ("single color site", "single-color site") and not sel.get("target_type"):
                    sel["target_type"] = "site"
                elif low == "empty single color site" and not sel.get("target_type"):
                    sel["target_type"] = "site"
                elif "by an opponent" in low or "opponent plays" in low:
                    sel["zone_owner"] = "opponent"
                elif low == "used by good priests this turn":
                    _append_unique_state(sel, StateFilter.PLAYED_THIS_TURN.value)
                continue

            if low in RELATIVE_FILTER_TOKEN_MAP:
                _append_unique_rel(sel, RELATIVE_FILTER_TOKEN_MAP[low])
                if low == "selected evil brigade" and not sel.get("alignment"):
                    sel["alignment"] = "evil"
                continue

            if low in USED_BY_SELECTOR_MAP:
                if sel.get("used_by") is None:
                    val = USED_BY_SELECTOR_MAP[low]
                    sel["used_by"] = copy.deepcopy(val) if isinstance(val, dict) else val
                if low == "used by good priests this turn":
                    _append_unique_state(sel, StateFilter.PLAYED_THIS_TURN.value)
                continue

            if low in ("not your own", "you control", "you own", "owned_by_controller", "controlled by each opponent"):
                if low in ("you control", "you own", "owned_by_controller"):
                    sel["zone_owner"] = "controller"
                else:
                    sel["zone_owner"] = "opponent"
                continue

            kept.append(s)

        sel["identifiers"] = kept

    for br in sel.get("any_of") or []:
        if isinstance(br, dict):
            promote_phase5a_fields(br, action=action, is_branch=True)
    cnt = sel.get("count")
    dyn_sel = ((cnt.get("dynamic") or {}).get("selector")) if isinstance(cnt, dict) else None
    if isinstance(dyn_sel, dict):
        promote_phase5a_fields(dyn_sel, action=action, is_branch=False)
    ub = sel.get("used_by")
    if isinstance(ub, dict):
        promote_phase5a_fields(ub, action=action, is_branch=False)
