"""Pipeline Stage 8: Rule-Based Card Ability Parser

Parses raw card ability texts into structured ASTs using deterministic pattern
matching, abbreviation protection (O.T./N.T.), dynamic variable support (X),
multi-zone scope parsing, cost-benefit decomposition, and strict all-or-nothing
card side validation.
"""

from __future__ import annotations
import json
import re
import sys
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(Path(__file__).resolve().parent))
sys.path.append(str(BASE_DIR))

from utils.card_helpers import get_card_name, get_side_field, get_star_ability
from utils.ability_patterns import (
    extract_conditional_protection_abilities,
    extract_modifiers_from_text,
    extract_star_trigger,
    extract_condition_prefix,
    parse_target_zone_suffix,
    build_target_selector,
    protect_abbreviations,
    restore_abbreviations,
)
from utils.target_parser import UNPARSED_CLAUSE_GUARD, _map_zone_token, parse_protection_filter

from mappings.special_ability_overrides import SPECIAL_ABILITY_OVERRIDES

from models.logic.card_logic import CardLogic, CardSideLogic
from models.logic.ability import Ability
from models.logic.action_effect import ActionEffect
from models.logic.target_selector import TargetSelector
from models.logic.modifier import Modifier
from models.logic.dynamic_value import DynamicValue, DynamicValueCalculation
from models.logic.condition_expression import ConditionExpression
from models.enums.activation_mode import ActivationMode
from models.enums.action_verb import ActionVerb
from models.enums.zone import Zone
from models.enums.duration import Duration
from models.enums.selection_mode import SelectionMode

CONFIG_FILE = BASE_DIR / "config.json"
with CONFIG_FILE.open("r", encoding="utf-8") as _cf:
    _config = json.load(_cf)

_possible_inputs = [
    BASE_DIR / _config.get("cards_extended_with_ordir_fuzzy", ""),
    BASE_DIR / _config.get("cards_file", ""),
    BASE_DIR / _config.get("carddata_json", ""),
]
INPUT_FILE = next((p for p in _possible_inputs if p and p.exists()), None)
OUTPUT_FILE = BASE_DIR / _config.get("card_abilities_raw", "data/card_abilities_raw.json")
UNPARSED_LOG = BASE_DIR / _config.get("unparsed_abilities_log", "data/unparsed_abilities.log")

_COUNT_GROUP = r"(?:(one|two|three|four|\d+|up\s+to\s+x|up\s+to\s+\d+|x|all|any|an?)\b\s*)?"

DRAW_PATTERN = re.compile(
    r"^(?:you\s+may\s+|holder\s+may\s+)?draw\s+(?:(a|an|one|\d+|x|all)\b(?:\s+cards?)?)(?:\s*\(\s*limit\s+(\d+)\s*\))?\.?$",
    re.IGNORECASE,
)
DISCARD_PATTERN = re.compile(
    rf"^(?:you\s+may\s+|holder\s+may\s+)?discard\s+{_COUNT_GROUP}([a-zA-Z0-9\s\(\)\'\-\.,]+?)(?:\s*\(\s*limit\s+(\d+)\s*\))?\.?$",
    re.IGNORECASE,
)
NEGATE_PATTERN = re.compile(
    rf"^(?:you\s+may\s+|holder\s+may\s+)?negate\s+{_COUNT_GROUP}([a-zA-Z0-9\s\(\)\'\-\.,]+?)\.?$",
    re.IGNORECASE,
)
INTERRUPT_PATTERN = re.compile(
    rf"^(?:you\s+may\s+|holder\s+may\s+)?interrupt\s+{_COUNT_GROUP}([a-zA-Z0-9\s\(\)\'\-\.,]+?)\.?$",
    re.IGNORECASE,
)
BAND_PATTERN = re.compile(
    rf"^(?:you\s+|holder\s+)?may\s+band\s+to\s+{_COUNT_GROUP}([a-zA-Z0-9\s,\(\)\'\-\.]+?)\.?$",
    re.IGNORECASE,
)
SEARCH_PATTERN = re.compile(
    r"^(?:you\s+may\s+|holder\s+may\s+)?search\s+"
    r"((?:your\s+|opponent's\s+)?(?:deck|draw\s+pile|reserve(?:\s+pile)?|discard\s+pile)"
    r"(?:\s*(?:,\s*|\s+or\s+|\s+and\s+)(?:deck|draw\s+pile|reserve(?:\s+pile)?|discard\s+pile))*)\s+"
    rf"for\s+{_COUNT_GROUP}(?:the\s+)?([a-zA-Z0-9\s,\(\)\'\-\.]+?)"
    r"(?:\s+and\s+(?:put\s+(?:it|them)\s+in\s+|add\s+(?:it|them)\s+to\s+)(?:your\s+)?(hand|play|battle|territory))?\.?$",
    re.IGNORECASE,
)
TOPDECK_PATTERN = re.compile(
    rf"^(?:you\s+may\s+|holder\s+may\s+)?topdeck\s+{_COUNT_GROUP}(?:the\s+)?([a-zA-Z0-9\s\(\)\'\-\.,]+?)\.?$",
    re.IGNORECASE,
)
UNDERDECK_PATTERN = re.compile(
    rf"^(?:you\s+may\s+|holder\s+may\s+)?underdeck\s+{_COUNT_GROUP}(?:the\s+)?([a-zA-Z0-9\s\(\)\'\-\.,]+?)\.?$",
    re.IGNORECASE,
)
TAKE_PATTERN = re.compile(
    rf"^(?:you\s+may\s+|holder\s+may\s+)?take\s+{_COUNT_GROUP}(?:the\s+)?([a-zA-Z0-9\s\(\)\'\-\.,]+?)\.?$",
    re.IGNORECASE,
)
ADD_TO_BATTLE_PATTERN = re.compile(
    rf"^(?:you\s+may\s+|holder\s+may\s+)?add\s+{_COUNT_GROUP}(?:the\s+)?([a-zA-Z0-9\s\(\)\'\-\.,]+?)\s+to\s+(?:the\s+)?battle\.?$",
    re.IGNORECASE,
)
REMOVE_FROM_GAME_PATTERN = re.compile(
    rf"^(?:you\s+may\s+|holder\s+may\s+)?(?:remove\s+{_COUNT_GROUP}([a-zA-Z0-9\s\(\)\'\-\.,]+?)\s+from\s+the\s+game|remove\s+from\s+the\s+game\s+{_COUNT_GROUP}([a-zA-Z0-9\s\(\)\'\-\.,]+?)|banish\s+{_COUNT_GROUP}([a-zA-Z0-9\s\(\)\'\-\.,]+?))\.?$",
    re.IGNORECASE,
)
RETURN_TO_HAND_PATTERN = re.compile(
    rf"^(?:you\s+may\s+|holder\s+may\s+)?(?:(?:return|remove)\s+{_COUNT_GROUP}([a-zA-Z0-9\s\(\)\'\-\.,]+?)\s+to\s+(?:your\s+|owner's\s+|their\s+)?hand|bounce\s+{_COUNT_GROUP}([a-zA-Z0-9\s\(\)\'\-\.,]+?))\.?$",
    re.IGNORECASE,
)
RETURN_DECK_POS_PATTERN = re.compile(
    rf"^(?:you\s+may\s+|holder\s+may\s+)?return\s+{_COUNT_GROUP}(?:the\s+)?([a-zA-Z0-9\s\(\)\'\-\.,]+?)\s+to\s+(?:the\s+)?(top|bottom)\s+of\s+(?:your\s+|owner's\s+|their\s+)?(?:deck|draw\s+pile)\.?$",
    re.IGNORECASE,
)
RETURN_TO_TERRITORY_PATTERN = re.compile(
    rf"^(?:you\s+may\s+|holder\s+may\s+)?return\s+{_COUNT_GROUP}(?:the\s+)?([a-zA-Z0-9\s\(\)\'\-\.,]+?)\s+to\s+(?:your\s+|its\s+|owner's\s+|their\s+)?territory\.?$",
    re.IGNORECASE,
)
SHUFFLE_PATTERN = re.compile(
    rf"^(?:you\s+may\s+|holder\s+may\s+)?shuffle\s+{_COUNT_GROUP}([a-zA-Z0-9\s\(\)\'\-\.,]+?)\.?$",
    re.IGNORECASE,
)
PROTECT_PATTERN = re.compile(
    rf"^(?:you\s+may\s+|holder\s+may\s+)?protect\s+{_COUNT_GROUP}([a-zA-Z0-9\s\(\)\'\-\.]+?)\s+from\s+([a-zA-Z0-9\s\(\)\'\-\.,]+?)\.?$",
    re.IGNORECASE,
)
IMMUNE_PATTERN = re.compile(
    rf"^(?:this\s+(?:character|hero|evil\s+character|card)\s+is\s+)?immune\s+to\s+([a-zA-Z0-9\s\(\)\'\-\.,]+?)\.?$",
    re.IGNORECASE,
)
WITHDRAW_PATTERN = re.compile(
    rf"^(?:you\s+may\s+|holder\s+may\s+)?(?:withdraw|ignore|repel)\s+{_COUNT_GROUP}([a-zA-Z0-9\s\(\)\'\-\.,]+?)\.?$",
    re.IGNORECASE,
)
PARALYZE_BLOCKED_BY_PATTERN = re.compile(
    r"^(?:this\s+(?:character|hero|evil\s+character|card)\s+)?(?:cannot|may\s+not)\s+be\s+blocked\s+by\s+(.+?)\.?$",
    re.IGNORECASE,
)
PARALYZE_ENTER_BATTLE_PATTERN = re.compile(
    rf"^{_COUNT_GROUP}([a-zA-Z0-9\s\(\)\'\-\.,]+?)\s+(?:cannot|may\s+not)\s+enter\s+(?:the\s+)?battle\.?$",
    re.IGNORECASE,
)
ACTIVATE_ARTIFACT_PATTERN = re.compile(
    rf"^(?:you\s+may\s+|holder\s+may\s+)?activate\s+{_COUNT_GROUP}([a-zA-Z0-9\s\(\)\'\-\.,]*?(?:artifact|covenant|curse|idol)[a-zA-Z0-9\s\(\)\'\-\.,]*?)\.?$",
    re.IGNORECASE,
)
FIRST_STRIKE_PATTERN = re.compile(
    r"^(?:this\s+hero\s+has\s+|holder\s+has\s+)?first\s+strike\b\.?$",
    re.IGNORECASE,
)

# Compound action pattern: Negate/Interrupt and rescue a Lost Soul (e.g., Son of God)
NEGATE_AND_RESCUE_PATTERN = re.compile(
    r"^(?:you\s+may\s+|holder\s+may\s+)?(negate|interrupt(?:\s+the\s+battle)?)\s+and\s+rescue\s+(?:an?\s+|all\s+|any\s+)?lost\s+souls?\.?$",
    re.IGNORECASE,
)

# Compound action pattern: Interrupt the battle and <effect_clause>
INTERRUPT_BATTLE_AND_EFFECT_PATTERN = re.compile(
    r"^(?:you\s+may\s+|holder\s+may\s+)?interrupt\s+(?:the\s+)?(?:current\s+)?battle\s+and\s+(.+?)\.?$",
    re.IGNORECASE,
)

# Compound dual action on same target: Negate/Interrupt and discard/banish/underdeck/reserve <target>
COMPOUND_DUAL_PATTERN = re.compile(
    rf"^(?:you\s+may\s+|holder\s+may\s+)?(negate|interrupt)\s+and\s+(discard|banish|remove\s+from\s+the\s+game|underdeck|topdeck|reserve)\s+{_COUNT_GROUP}([a-zA-Z0-9\s\(\)\'\-\.,]+?)\.?$",
    re.IGNORECASE,
)

# Generic Cost-Benefit Pattern: [Discard/Negate-and-Discard/Banish X] to [Action Y]
COST_BENEFIT_PATTERN = re.compile(
    r"^(?:you\s+may\s+|holder\s+may\s+)?((?:negate\s+and\s+)?discard\s+.+?|remove\s+.+?\s+from\s+the\s+game|banish\s+.+?)\s+to\s+"
    r"((?:negate\s+and\s+discard|discard|draw|take|underdeck|topdeck|negate|interrupt|withdraw|protect|add|return|release|bounce|banish|remove|shuffle|activate)\b.+?)\.?$",
    re.IGNORECASE,
)

# Colon Context Scope Pattern: Look/Reveal ... : ... and underdeck the rest
COLON_LOOK_REVEAL_PATTERN = re.compile(
    r"^(?:you\s+may\s+|holder\s+may\s+)?(look\s+at|reveal)\s+(.*?)\s*:\s*(.*)$",
    re.IGNORECASE,
)


def _build_count_value(token: str, limit_val: Optional[int] = None) -> DynamicValue:
    """Helper creating a DynamicValue from token ('x', 'all', 'up to N', word number, or numeric)."""
    t = (token or "1").lower().strip()
    is_up_to = False
    if t.startswith("up to "):
        is_up_to = True
        t = t.replace("up to ", "").strip()
    if t == "all":
        return DynamicValue.all_targets()
    if t == "x":
        return DynamicValue(dynamic=DynamicValueCalculation(source="count_cards", limit=limit_val))
    word_map = {"a": 1, "an": 1, "one": 1, "any": 1, "two": 2, "three": 3, "four": 4}
    val = word_map.get(t)
    if val is None:
        try:
            val = int(t)
        except ValueError:
            val = 1
    if is_up_to:
        return DynamicValue.up_to(val)
    return DynamicValue.from_int(val)


def _extract_duration_suffix(clause: str) -> Tuple[str, Optional[Duration]]:
    """Extracts trailing duration phrases ('until end of turn', 'this turn', etc.) from a clause."""
    m = re.search(
        r"\s+\b(until\s+end\s+of\s+turn|for\s+remainder\s+of\s+turn|this\s+turn|"
        r"until\s+end\s+of\s+battle|until\s+end\s+of\s+phase|"
        r"for\s+remainder\s+of\s+(?:the\s+)?game)\.?$",
        clause,
        re.IGNORECASE,
    )
    if not m:
        return clause, None
    phrase = m.group(1).lower()
    clean = clause[:m.start()].strip()
    if "turn" in phrase:
        return clean, Duration.THIS_TURN
    if "battle" in phrase or "phase" in phrase:
        return clean, Duration.UNTIL_END_OF_BATTLE
    return clean, Duration.PERMANENT


def parse_colon_clause(clause: str, ability_idx: int) -> Optional[Ability]:
    """Parses colon-separated look/reveal abilities creating context scopes."""
    m = COLON_LOOK_REVEAL_PATTERN.match(clause)
    if not m:
        return None

    action_word, target_desc, action_desc = m.groups()
    is_optional = bool(re.search(r"\bmay\b", clause, re.IGNORECASE))
    first_verb = ActionVerb.LOOK if "look" in action_word.lower() else ActionVerb.REVEAL

    count_match = re.search(r"(?:(?:top|bottom)?\s*(\d+|x)\s+cards|until\s+(\d+|x)\b)", target_desc, re.IGNORECASE)
    if count_match:
        token = count_match.group(1) or count_match.group(2)
        insp_count = _build_count_value(token)
    elif "hand" in target_desc.lower():
        insp_count = None
    else:
        insp_count = DynamicValue.from_int(1)
    scope_zone = Zone.HAND if "hand" in target_desc.lower() else Zone.DECK
    owner_str = "opponent" if "opponent" in target_desc.lower() else "controller"

    effects: List[ActionEffect] = [
        ActionEffect(
            step=1,
            action=first_verb,
            effect_type="instant",
            creates_context_scope=True,
            target=TargetSelector(
                selection_mode=SelectionMode.AUTOMATIC_ALL,
                scope=[scope_zone],
                zone_owner=owner_str,
                count=insp_count,
            ),
        )
    ]

    has_underdeck_remainder = bool(
        re.search(r"\b(?:and\s+)?underdeck\s+(?:the\s+)?rest\b", action_desc, re.IGNORECASE)
    )
    cleaned_action = re.sub(
        r"\b(?:and\s+)?underdeck\s+(?:the\s+)?rest\b", "", action_desc, flags=re.IGNORECASE
    ).strip(" ;,")

    if cleaned_action:
        if UNPARSED_CLAUSE_GUARD.search(cleaned_action):
            return None
        cnt_m = re.search(
            r"\b(up\s+to\s+(?:\d+|one|two|three|four|five|six)|\d+|one|two|three|four|a|an)\b",
            cleaned_action,
            re.IGNORECASE,
        )
        act_cnt = _build_count_value(cnt_m.group(1) if cnt_m else "1")
        if re.search(r"\bdiscard\b", cleaned_action, re.IGNORECASE):
            effects.append(
                ActionEffect(
                    step=2,
                    action=ActionVerb.DISCARD,
                    effect_type="instant",
                    destination=Zone.DISCARD_PILE,
                    target=TargetSelector(
                        selection_mode=SelectionMode.MANUAL_CONTROLLER,
                        scope=[Zone.CONTEXT_SCOPE],
                        count=act_cnt,
                    ),
                )
            )
        elif re.search(r"\btake\b", cleaned_action, re.IGNORECASE):
            effects.append(
                ActionEffect(
                    step=2,
                    action=ActionVerb.TAKE,
                    effect_type="instant",
                    destination=Zone.HAND,
                    target=TargetSelector(
                        selection_mode=SelectionMode.MANUAL_CONTROLLER,
                        scope=[Zone.CONTEXT_SCOPE],
                        count=act_cnt,
                    ),
                )
            )
        elif re.search(r"\bunderdeck\b", cleaned_action, re.IGNORECASE):
            effects.append(
                ActionEffect(
                    step=2,
                    action=ActionVerb.UNDERDECK,
                    effect_type="instant",
                    destination=Zone.DECK,
                    destination_position="bottom",
                    target=TargetSelector(
                        selection_mode=SelectionMode.MANUAL_CONTROLLER,
                        scope=[Zone.CONTEXT_SCOPE],
                        count=act_cnt,
                    ),
                )
            )

    if has_underdeck_remainder:
        effects.append(
            ActionEffect(
                step=len(effects) + 1,
                action=ActionVerb.UNDERDECK,
                effect_type="instant",
                destination=Zone.DECK,
                destination_position="bottom",
                target=TargetSelector(
                    selection_mode=SelectionMode.CONTEXT_REMAINDER,
                    scope=[Zone.CONTEXT_SCOPE],
                    count=DynamicValue.all_targets(),
                ),
            )
        )

    return Ability(
        ability_id=f"ab_{ability_idx}_context_scope",
        activation_mode=ActivationMode.IMMEDIATE,
        is_optional=is_optional,
        effects=effects,
    )


def _parse_single_action_effects(clause: str) -> Optional[Tuple[str, List[ActionEffect], Optional[ActivationMode]]]:
    """Parses a single-verb or compound-dual clause into (suffix_name, effects_list, override_mode).

    Returns None if the target contains unparsed compound clauses or cannot be mapped cleanly.
    """
    cleaned, trailing_duration = _extract_duration_suffix(clause.strip())

    # 1. Compound Dual on same target: Negate/Interrupt and discard/banish/underdeck/reserve
    comp_match = COMPOUND_DUAL_PATTERN.match(cleaned)
    if comp_match:
        act_verb = comp_match.group(1).lower()
        sec_verb_str = comp_match.group(2).lower()
        cnt_token = comp_match.group(3)
        target_str = comp_match.group(4).strip()
        if UNPARSED_CLAUSE_GUARD.search(target_str):
            return None

        first_action = ActionVerb.NEGATE if act_verb == "negate" else ActionVerb.INTERRUPT
        sec_map = {
            "discard": (ActionVerb.DISCARD, Zone.DISCARD_PILE, "as_is"),
            "banish": (ActionVerb.BANISH, Zone.BANISH_PILE, "as_is"),
            "remove from the game": (ActionVerb.BANISH, Zone.BANISH_PILE, "as_is"),
            "underdeck": (ActionVerb.UNDERDECK, Zone.DECK, "bottom"),
            "topdeck": (ActionVerb.TOPDECK, Zone.DECK, "top"),
            "reserve": (ActionVerb.RESERVE, Zone.RESERVE_PILE, "as_is"),
        }
        sec_action, sec_dest, sec_pos = sec_map.get(sec_verb_str, (ActionVerb.DISCARD, Zone.DISCARD_PILE, "as_is"))
        return (
            f"{act_verb}_and_{sec_action.value}",
            [
                ActionEffect(
                    step=1,
                    action=first_action,
                    effect_type="instant",
                    target=build_target_selector(target_str, cnt_token),
                ),
                ActionEffect(
                    step=2,
                    action=sec_action,
                    effect_type="instant",
                    destination=sec_dest,
                    destination_position=sec_pos,
                    target=TargetSelector(
                        selection_mode=SelectionMode.CHAINED_TARGET,
                        scope=[Zone.IN_PLAY],
                        ref_step=1,
                    ),
                    dependency="if_previous_successful",
                ),
            ],
            None,
        )

    # 2. Draw
    draw_match = DRAW_PATTERN.match(cleaned)
    if draw_match:
        cnt_token = draw_match.group(1)
        limit_val = int(draw_match.group(2)) if draw_match.group(2) else None
        return (
            "draw",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.DRAW,
                    effect_type="instant",
                    destination=Zone.HAND,
                    target=TargetSelector(
                        selection_mode=SelectionMode.AUTOMATIC_NEXT,
                        zone_owner="controller",
                        scope=[Zone.DECK],
                        count=_build_count_value(cnt_token, limit_val),
                    ),
                )
            ],
            None,
        )

    # 3. Discard
    discard_match = DISCARD_PATTERN.match(cleaned)
    if discard_match:
        cnt_token = discard_match.group(1) or "1"
        raw_target = discard_match.group(2).strip()
        limit_val = int(discard_match.group(3)) if discard_match.group(3) else None
        if UNPARSED_CLAUSE_GUARD.search(raw_target):
            return None
        return (
            "discard",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.DISCARD,
                    effect_type="instant",
                    destination=Zone.DISCARD_PILE,
                    target=build_target_selector(raw_target, cnt_token, limit_val),
                )
            ],
            None,
        )

    # 4. Negate
    negate_match = NEGATE_PATTERN.match(cleaned)
    if negate_match:
        cnt_token = negate_match.group(1) or "all"
        target_str = negate_match.group(2).strip()
        if UNPARSED_CLAUSE_GUARD.search(target_str):
            return None
        sel = build_target_selector(target_str, cnt_token, default_scope=[Zone.BATTLE])
        eff_type = "ongoing" if trailing_duration else "instant"
        dur = trailing_duration or Duration.INSTANT
        return (
            "negate",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.NEGATE,
                    effect_type=eff_type,
                    duration=dur,
                    target=sel,
                )
            ],
            None,
        )

    # 5. Interrupt
    interrupt_match = INTERRUPT_PATTERN.match(cleaned)
    if interrupt_match:
        cnt_token = interrupt_match.group(1)
        target_str = interrupt_match.group(2).strip()
        if UNPARSED_CLAUSE_GUARD.search(target_str):
            return None
        sel = build_target_selector(target_str, cnt_token, default_scope=[Zone.BATTLE])
        return (
            "interrupt",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.INTERRUPT,
                    effect_type="instant",
                    target=sel,
                )
            ],
            None,
        )

    # 6. Band (REG Game-Rule convention: default scope=[Zone.IN_PLAY, Zone.HAND], zone_owner='both')
    band_match = BAND_PATTERN.match(cleaned)
    if band_match:
        cnt_token = band_match.group(1)
        target_str = band_match.group(2).strip()
        if UNPARSED_CLAUSE_GUARD.search(target_str):
            return None
        sel = build_target_selector(target_str, cnt_token, default_scope=[Zone.IN_PLAY, Zone.HAND])
        if sel.zone_owner == "either":
            sel.zone_owner = "both"
        return (
            "band",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.BAND,
                    effect_type="instant",
                    target=sel,
                )
            ],
            None,
        )

    # 7. Search (supports multi-zone 'deck or discard pile', 'deck, discard pile or Reserve')
    search_match = SEARCH_PATTERN.match(cleaned)
    if search_match:
        zone_clause, cnt_token, target_str, dest_str = search_match.groups()
        target_str = target_str.strip()
        if UNPARSED_CLAUSE_GUARD.search(target_str):
            return None
        raw_z_parts = re.split(r"\s*(?:,\s*(?:or\s+|and\s+)?|\s+or\s+|\s+and\s+)\s*", zone_clause, flags=re.I)
        search_scopes: List[Zone] = []
        for zp in raw_z_parts:
            zm = _map_zone_token(zp)
            if zm and zm not in search_scopes:
                search_scopes.append(zm)
        if not search_scopes:
            search_scopes = [Zone.DECK]

        sel = build_target_selector(target_str, cnt_token or "1", default_scope=search_scopes)
        sel.scope = search_scopes
        sel.zone_owner = "opponent" if "opponent" in zone_clause.lower() else "controller"

        dest_zone = Zone.HAND
        if dest_str:
            dl = dest_str.lower()
            if dl == "play":
                dest_zone = Zone.IN_PLAY
            elif dl == "battle":
                dest_zone = Zone.BATTLE
            elif dl == "territory":
                dest_zone = Zone.TERRITORY

        return (
            "search",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.SEARCH,
                    effect_type="instant",
                    destination=dest_zone,
                    target=sel,
                )
            ],
            None,
        )

    # 8. Topdeck
    topdeck_match = TOPDECK_PATTERN.match(cleaned)
    if topdeck_match:
        cnt_token = topdeck_match.group(1) or "1"
        target_str = topdeck_match.group(2).strip()
        if UNPARSED_CLAUSE_GUARD.search(target_str):
            return None
        sel = build_target_selector(target_str, cnt_token, default_scope=[Zone.DECK])
        return (
            "topdeck",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.TOPDECK,
                    effect_type="instant",
                    destination=Zone.DECK,
                    destination_position="top",
                    target=sel,
                )
            ],
            None,
        )

    # 9. Underdeck
    underdeck_match = UNDERDECK_PATTERN.match(cleaned)
    if underdeck_match:
        cnt_token = underdeck_match.group(1) or "1"
        target_str = underdeck_match.group(2).strip()
        if UNPARSED_CLAUSE_GUARD.search(target_str):
            return None
        sel = build_target_selector(target_str, cnt_token, default_scope=[Zone.IN_PLAY])
        return (
            "underdeck",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.UNDERDECK,
                    effect_type="instant",
                    destination=Zone.DECK,
                    destination_position="bottom",
                    target=sel,
                )
            ],
            None,
        )

    # 10. Take
    take_match = TAKE_PATTERN.match(cleaned)
    if take_match:
        cnt_token = take_match.group(1) or "1"
        target_str = take_match.group(2).strip()
        if UNPARSED_CLAUSE_GUARD.search(target_str):
            return None
        sel = build_target_selector(target_str, cnt_token, default_scope=[Zone.DECK])
        return (
            "take",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.TAKE,
                    effect_type="instant",
                    destination=Zone.HAND,
                    target=sel,
                )
            ],
            None,
        )

    # 11. Add to Battle (REG Game-Rule convention: default scope=[Zone.IN_PLAY])
    add_match = ADD_TO_BATTLE_PATTERN.match(cleaned)
    if add_match:
        cnt_token = add_match.group(1) or "1"
        target_str = add_match.group(2).strip()
        if UNPARSED_CLAUSE_GUARD.search(target_str):
            return None
        sel = build_target_selector(target_str, cnt_token, default_scope=[Zone.IN_PLAY])
        return (
            "add_to_battle",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.ADD_TO_BATTLE,
                    effect_type="instant",
                    destination=Zone.BATTLE,
                    target=sel,
                )
            ],
            None,
        )

    # 12. Remove from the game / Banish
    rem_match = REMOVE_FROM_GAME_PATTERN.match(cleaned)
    if rem_match:
        cnt_token = rem_match.group(1) or rem_match.group(3) or rem_match.group(5) or "1"
        target_str = (rem_match.group(2) or rem_match.group(4) or rem_match.group(6) or "").strip()
        if UNPARSED_CLAUSE_GUARD.search(target_str):
            return None
        sel = build_target_selector(target_str, cnt_token, default_scope=[Zone.IN_PLAY])
        return (
            "banish",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.BANISH,
                    effect_type="instant",
                    destination=Zone.BANISH_PILE,
                    target=sel,
                )
            ],
            None,
        )

    # 13. Return to hand / Bounce
    bounce_match = RETURN_TO_HAND_PATTERN.match(cleaned)
    if bounce_match:
        cnt_token = bounce_match.group(1) or bounce_match.group(3) or "1"
        target_str = (bounce_match.group(2) or bounce_match.group(4) or "").strip()
        if UNPARSED_CLAUSE_GUARD.search(target_str):
            return None
        sel = build_target_selector(target_str, cnt_token, default_scope=[Zone.IN_PLAY])
        return (
            "bounce",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.BOUNCE,
                    effect_type="instant",
                    destination=Zone.HAND,
                    target=sel,
                )
            ],
            None,
        )

    # 14. Shuffle
    shuf_match = SHUFFLE_PATTERN.match(cleaned)
    if shuf_match:
        cnt_token = shuf_match.group(1) or "1"
        target_str = shuf_match.group(2).strip()
        if UNPARSED_CLAUSE_GUARD.search(target_str):
            return None
        sel = build_target_selector(target_str, cnt_token, default_scope=[Zone.IN_PLAY])
        return (
            "shuffle",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.SHUFFLE,
                    effect_type="instant",
                    destination=Zone.DECK,
                    destination_position="random",
                    target=sel,
                )
            ],
            None,
        )

    # 15. Activate an Artifact (REG Game-Rule convention: default scope=[Zone.IN_PLAY], zone_owner='controller')
    act_art_match = ACTIVATE_ARTIFACT_PATTERN.match(cleaned)
    if act_art_match:
        cnt_token = act_art_match.group(1) or "1"
        target_str = act_art_match.group(2).strip()
        if UNPARSED_CLAUSE_GUARD.search(target_str):
            return None
        sel = build_target_selector(target_str, cnt_token, default_scope=[Zone.IN_PLAY])
        sel.zone_owner = "controller"
        return (
            "activate_artifact",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.ACTIVATE_ARTIFACT,
                    effect_type="instant",
                    target=sel,
                )
            ],
            None,
        )

    # 16. Protect
    protect_match = PROTECT_PATTERN.match(cleaned)
    if protect_match:
        cnt_token = protect_match.group(1) or "all"
        target_str = protect_match.group(2).strip()
        from_str = protect_match.group(3).strip()
        if UNPARSED_CLAUSE_GUARD.search(target_str) or UNPARSED_CLAUSE_GUARD.search(from_str):
            return None
        sel = build_target_selector(target_str, cnt_token, default_scope=[Zone.IN_PLAY])
        if sel.selection_mode not in (SelectionMode.AUTOMATIC_SELF, SelectionMode.CHAINED_TARGET):
            sel.selection_mode = SelectionMode.AUTOMATIC_ALL
            sel.count = None
        prot_filter = parse_protection_filter(from_str)
        return (
            "protect",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.PROTECT,
                    effect_type="ongoing",
                    duration=trailing_duration or Duration.PERMANENT,
                    target=sel,
                    protection_filter=prot_filter,
                )
            ],
            ActivationMode.STATIC,
        )

    # 17. Immune
    immune_match = IMMUNE_PATTERN.match(cleaned)
    if immune_match:
        to_str = immune_match.group(1).strip()
        if UNPARSED_CLAUSE_GUARD.search(to_str):
            return None
        sel = TargetSelector(
            selection_mode=SelectionMode.AUTOMATIC_SELF,
            zone_owner="controller",
            scope=[Zone.IN_PLAY],
        )
        prot_filter = parse_protection_filter(to_str)
        return (
            "immune",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.IMMUNE,
                    effect_type="ongoing",
                    duration=trailing_duration or Duration.PERMANENT,
                    target=sel,
                    protection_filter=prot_filter,
                )
            ],
            ActivationMode.STATIC,
        )

    # 17. Withdraw
    withdraw_match = WITHDRAW_PATTERN.match(cleaned)
    if withdraw_match:
        cnt_token = withdraw_match.group(1) or "1"
        target_str = withdraw_match.group(2).strip()
        if UNPARSED_CLAUSE_GUARD.search(target_str):
            return None
        sel = build_target_selector(target_str, cnt_token, default_scope=[Zone.BATTLE])
        return (
            "withdraw",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.WITHDRAW,
                    effect_type="instant",
                    target=sel,
                )
            ],
            None,
        )

    # 18. First Strike
    if FIRST_STRIKE_PATTERN.match(cleaned):
        return (
            "first_strike",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.FIRST_STRIKE,
                    effect_type="ongoing",
                    duration=Duration.PERMANENT,
                    target=TargetSelector(
                        selection_mode=SelectionMode.AUTOMATIC_SELF,
                        zone_owner="controller",
                        scope=[Zone.BATTLE],
                    ),
                )
            ],
            ActivationMode.STATIC,
        )

    # 19. Return to top/bottom of deck (REG v11.1.0 -> TOPDECK / UNDERDECK)
    return_deck_match = RETURN_DECK_POS_PATTERN.match(cleaned)
    if return_deck_match:
        cnt_token = return_deck_match.group(1) or "1"
        target_str = return_deck_match.group(2).strip()
        pos = return_deck_match.group(3).lower()
        if UNPARSED_CLAUSE_GUARD.search(target_str):
            return None
        sel = build_target_selector(target_str, cnt_token, default_scope=[Zone.IN_PLAY])
        action_verb = ActionVerb.TOPDECK if pos == "top" else ActionVerb.UNDERDECK
        return (
            action_verb.value,
            [
                ActionEffect(
                    step=1,
                    action=action_verb,
                    effect_type="instant",
                    destination=Zone.DECK,
                    destination_position=pos,
                    target=sel,
                )
            ],
            None,
        )

    # 20. Return to territory (REG v11.1.0: captured/captive -> RELEASE, in battle -> WITHDRAW)
    ret_terr_match = RETURN_TO_TERRITORY_PATTERN.match(cleaned)
    if ret_terr_match:
        cnt_token = ret_terr_match.group(1) or "1"
        target_str = ret_terr_match.group(2).strip()
        if UNPARSED_CLAUSE_GUARD.search(target_str):
            return None
        is_captive = bool(
            re.search(r"\b(?:captured|captive|land\s+of\s+bondage)\b", target_str, re.IGNORECASE)
        )
        if is_captive:
            sel = build_target_selector(
                target_str, cnt_token, default_scope=[Zone.LAND_OF_BONDAGE]
            )
            return (
                "release",
                [
                    ActionEffect(
                        step=1,
                        action=ActionVerb.RELEASE,
                        effect_type="instant",
                        destination=Zone.TERRITORY,
                        target=sel,
                    )
                ],
                None,
            )
        sel = build_target_selector(target_str, cnt_token, default_scope=[Zone.BATTLE])
        return (
            "withdraw",
            [
                ActionEffect(
                    step=1,
                    action=ActionVerb.WITHDRAW,
                    effect_type="instant",
                    destination=Zone.TERRITORY,
                    target=sel,
                )
            ],
            None,
        )

    # 21. Paralyze: Cannot / may not be blocked by (REG v11.1.0)
    paralyze_blk_match = PARALYZE_BLOCKED_BY_PATTERN.match(cleaned)
    if paralyze_blk_match:
        sel = _parse_paralyze_blocked_by_selector(paralyze_blk_match.group(1).strip())
        if sel is not None:
            return (
                "paralyze",
                [
                    ActionEffect(
                        step=1,
                        action=ActionVerb.PARALYZE,
                        effect_type="ongoing",
                        duration=Duration.WHILE_CONDITION,
                        target=sel,
                    )
                ],
                ActivationMode.STATIC,
            )

    # 22. Paralyze: Cannot / may not enter battle (REG v11.1.0)
    paralyze_ent_match = PARALYZE_ENTER_BATTLE_PATTERN.match(cleaned)
    if paralyze_ent_match:
        cnt_token = paralyze_ent_match.group(1) or "all"
        target_str = paralyze_ent_match.group(2).strip()
        if not UNPARSED_CLAUSE_GUARD.search(target_str):
            sel = build_target_selector(target_str, cnt_token, default_scope=[Zone.IN_PLAY])
            return (
                "paralyze",
                [
                    ActionEffect(
                        step=1,
                        action=ActionVerb.PARALYZE,
                        effect_type="ongoing",
                        duration=Duration.WHILE_CONDITION,
                        target=sel,
                    )
                ],
                ActivationMode.STATIC,
            )

    return None


def _parse_paralyze_blocked_by_selector(blocker_clause: str) -> Optional[TargetSelector]:
    """Parses the blocker phrase in 'cannot/may not be blocked by <target>' into a TargetSelector.

    Splits simple disjunctive target lists (e.g. 'Pharisees or Sadducees') before running
    the unparsed clause guard so disjunctive character identifiers parse deterministically
    per REG v11.1.0 without swallowing conditional/compound sentences.

    Args:
        blocker_clause: Raw blocker target text following 'blocked by'.

    Returns:
        Populated TargetSelector with opposing blocker scope, or None if too complex.
    """
    raw_parts = [p.strip() for p in re.split(r"\s+or\s+", blocker_clause, flags=re.IGNORECASE) if p.strip()]
    if not raw_parts:
        return None

    selectors: List[TargetSelector] = []
    for part in raw_parts:
        clean_part = re.sub(r"^(?:a|an|any)\s+", "", part, flags=re.IGNORECASE).strip()
        if not clean_part or UNPARSED_CLAUSE_GUARD.search(clean_part):
            return None
        selectors.append(build_target_selector(clean_part, "all", default_scope=[Zone.IN_PLAY]))

    merged = selectors[0].model_copy(deep=True)
    if len(selectors) > 1:
        for extra in selectors[1:]:
            for field_name in ("brigades", "classes", "references", "identifiers", "card_titles"):
                merged_vals = getattr(merged, field_name)
                for val in getattr(extra, field_name):
                    if val not in merged_vals:
                        merged_vals.append(val)
            if merged.target_type != extra.target_type:
                merged.target_type = "character"

    # Only opposing characters can block; restrict implicit 'both' ownership to opponent.
    if merged.zone_owner == "both":
        merged.zone_owner = "opponent"
    return merged


def parse_deterministic_clause(
    clause: str,
    ability_idx: int,
    condition: Optional[ConditionExpression] = None,
    activation_mode: ActivationMode = ActivationMode.IMMEDIATE,
) -> Optional[Ability]:
    """Matches an individual clause against deterministic regex patterns."""
    cleaned = clause.strip()
    is_optional = bool(re.search(r"\b(?:you\s+may|holder\s+may|may(?!\s+not))\b", cleaned, re.IGNORECASE))
    conditions = [condition] if condition else []

    # 1. Colon Context Scope (Look/Reveal ... : ...)
    colon_ab = parse_colon_clause(cleaned, ability_idx)
    if colon_ab:
        colon_ab.conditions = conditions
        colon_ab.activation_mode = activation_mode
        return colon_ab

    # 2. Negate/Interrupt and rescue a Lost Soul (e.g. Son of God)
    nr_match = NEGATE_AND_RESCUE_PATTERN.match(cleaned)
    if nr_match:
        first_word = nr_match.group(1).lower()
        first_act = ActionVerb.NEGATE if "negate" in first_word else ActionVerb.INTERRUPT
        return Ability(
            ability_id=f"ab_{ability_idx}_{first_act.value}_and_rescue",
            activation_mode=activation_mode,
            is_optional=is_optional,
            conditions=conditions,
            effects=[
                ActionEffect(
                    step=1,
                    action=first_act,
                    effect_type="instant",
                    target=TargetSelector(
                        selection_mode=SelectionMode.AUTOMATIC_ALL,
                        zone_owner="both",
                        scope=[Zone.BATTLE],
                        target_type=None,
                    ),
                ),
                ActionEffect(
                    step=2,
                    action=ActionVerb.RESCUE,
                    effect_type="instant",
                    destination=Zone.LAND_OF_REDEMPTION,
                    target=TargetSelector(
                        selection_mode=SelectionMode.MANUAL_CONTROLLER,
                        zone_owner="opponent",
                        scope=[Zone.LAND_OF_BONDAGE],
                        target_type="lost_soul",
                        alignment="neutral",
                        count=DynamicValue.from_int(1),
                    ),
                ),
            ],
        )

    # 3. Interrupt the battle and <effect_clause>
    ibe_match = INTERRUPT_BATTLE_AND_EFFECT_PATTERN.match(cleaned)
    if ibe_match:
        follow_clause = ibe_match.group(1).strip()
        follow_parsed = _parse_single_action_effects(follow_clause)
        if follow_parsed:
            f_suffix, f_effects, _ = follow_parsed
            combined_effects: List[ActionEffect] = [
                ActionEffect(
                    step=1,
                    action=ActionVerb.INTERRUPT,
                    effect_type="instant",
                    target=TargetSelector(
                        selection_mode=SelectionMode.AUTOMATIC_ALL,
                        zone_owner="both",
                        scope=[Zone.BATTLE],
                        target_type=None,
                    ),
                )
            ]
            for idx_e, eff in enumerate(f_effects, start=2):
                eff.step = idx_e
                combined_effects.append(eff)
            return Ability(
                ability_id=f"ab_{ability_idx}_interrupt_and_{f_suffix}",
                activation_mode=activation_mode,
                is_optional=is_optional,
                conditions=conditions,
                effects=combined_effects,
            )
        return None

    # 4. Generic Cost-Benefit: [Cost Clause] to [Effect Clause]
    cb_match = COST_BENEFIT_PATTERN.match(cleaned)
    if cb_match:
        cost_clause, effect_clause = cb_match.group(1).strip(), cb_match.group(2).strip()
        cost_parsed = _parse_single_action_effects(cost_clause)
        eff_parsed = _parse_single_action_effects(effect_clause)
        if cost_parsed and eff_parsed:
            c_suffix, c_effects, _ = cost_parsed
            e_suffix, e_effects, _ = eff_parsed
            for idx_c, ce in enumerate(c_effects, start=1):
                ce.step = idx_c
            next_step = len(c_effects) + 1
            for idx_e, ee in enumerate(e_effects, start=next_step):
                ee.step = idx_e
                if idx_e == next_step:
                    ee.dependency = "if_you_do"
                elif ee.target and ee.target.selection_mode == SelectionMode.CHAINED_TARGET:
                    ee.target.ref_step = next_step
            return Ability(
                ability_id=f"ab_{ability_idx}_cost_{c_suffix}_to_{e_suffix}",
                activation_mode=activation_mode,
                is_optional=is_optional,
                conditions=conditions,
                costs=c_effects,
                effects=e_effects,
            )
        return None

    # 5. Single or Compound-Dual Action Clause
    single_parsed = _parse_single_action_effects(cleaned)
    if single_parsed:
        s_suffix, s_effects, override_mode = single_parsed
        return Ability(
            ability_id=f"ab_{ability_idx}_{s_suffix}",
            activation_mode=override_mode or activation_mode,
            is_optional=is_optional,
            conditions=conditions,
            effects=s_effects,
        )

    return None


def parse_side_ability(
    card_name: str,
    side_key: str,
    raw_text: str,
    is_star_clause: bool = False,
) -> Tuple[Optional[CardSideLogic], Optional[str]]:
    """Parses a card side's special ability with strict all-or-nothing validation."""
    text = (raw_text or "").strip()

    # 1. Vanilla / Meek check
    if not text or text.lower() in ("none", "n/a", "meek", "star:", "star", "(star)"):
        return CardSideLogic(abilities=[], modifiers=[]), None

    # 2. Check Layer C (Manual Overrides)
    override_key = (card_name, side_key)
    if override_key in SPECIAL_ABILITY_OVERRIDES and not is_star_clause:
        return SPECIAL_ABILITY_OVERRIDES[override_key], None

    # 3. Extract STAR trigger prefix
    text_after_star, extracted_star = extract_star_trigger(text)
    is_star = is_star_clause or extracted_star
    activation_mode = ActivationMode.TRIGGERED if is_star else ActivationMode.IMMEDIATE

    # 4. Extract Modifiers (Layer A) and conditional protection clauses
    remainder, modifiers = extract_modifiers_from_text(text_after_star)
    remainder, cond_prot_abilities = extract_conditional_protection_abilities(
        remainder, start_idx=1, is_star=is_star
    )

    # If the entire ability was modifiers and/or conditional protections
    if not remainder:
        side_logic = CardSideLogic(modifiers=modifiers, abilities=cond_prot_abilities)
        side_logic.propagate_side_modifiers()
        return side_logic, None

    # 5. Abbreviation Protection: Protect O.T., N.T., e.g., i.e. before condition extraction and splitting
    masked_text = protect_abbreviations(remainder)

    # 6. Extract Condition Prefix (e.g. "If used by a Hero,")
    clause_text, leading_condition = extract_condition_prefix(masked_text)

    # Split into sentences / major clauses
    raw_sentences = [s.strip() for s in re.split(r"\.\s+", clause_text) if s.strip()]
    parsed_abilities: List[Ability] = []

    # Strict all-or-nothing: every single sentence must parse successfully
    for idx, raw_sentence in enumerate(raw_sentences, start=1):
        clean_sentence = restore_abbreviations(raw_sentence).strip(" .")
        if not clean_sentence:
            continue

        cond_for_clause = leading_condition if idx == 1 else None
        ability = parse_deterministic_clause(clean_sentence, idx, cond_for_clause, activation_mode)
        if not ability:
            return None, f"Unmatched clause: '{clean_sentence}'"

        if is_star:
            ability.is_star = True
            ability.trigger_event = "star_phase"
            if not ability.ability_id.startswith("star_"):
                ability.ability_id = f"star_{ability.ability_id}"

        parsed_abilities.append(ability)

    next_idx = len(parsed_abilities) + 1
    for offset, prot_ab in enumerate(cond_prot_abilities):
        prot_ab.ability_id = re.sub(
            r'ab_\d+_',
            f'ab_{next_idx + offset}_',
            prot_ab.ability_id,
            count=1,
        )
        parsed_abilities.append(prot_ab)

    side_logic = CardSideLogic(modifiers=modifiers, abilities=parsed_abilities)
    side_logic.propagate_side_modifiers()
    return side_logic, None


def run_ability_parser() -> None:
    """Executes the ability parsing pipeline over all cards in the database."""
    if not INPUT_FILE or not INPUT_FILE.exists():
        print(f"Error: No valid card data file found at {INPUT_FILE}")
        sys.exit(1)

    print(f"Loading cards from: {INPUT_FILE}")
    with INPUT_FILE.open("r", encoding="utf-8") as f:
        data = json.load(f)

    cards = data if isinstance(data, list) else data.get("cards", [])
    total_sides = 0
    parsed_sides = 0
    unparsed_records: List[Dict[str, Any]] = []
    output_logic_map: Dict[str, Dict[str, Any]] = {}

    print(f"Processing {len(cards)} cards (Abbreviation Protection, X, Colon Scope, All-Or-Nothing)...")
    for card in cards:
        card_id = str(card.get("Id", "")).strip() or (card.get("OfficialSet", "") + "_" + card.get("Name", ""))
        card_name = get_card_name(card)
        sides_dict = card.get("CardSides", {})
        shared_data = sides_dict.get("shared", {}) if isinstance(sides_dict.get("shared"), dict) else {}
        top_data = sides_dict.get("top", {}) if isinstance(sides_dict.get("top"), dict) else {}
        bottom_data = sides_dict.get("bottom") if isinstance(sides_dict.get("bottom"), dict) else None

        card_logic_entry = CardLogic(card_identifier=card_id)

        sides_to_process: List[Tuple[str, str, bool]] = []
        star_sa = get_star_ability(card)
        shared_sa = (shared_data.get("SpecialAbility") or "").strip()
        top_sa = (top_data.get("SpecialAbility") or "").strip()
        bottom_sa = (bottom_data.get("SpecialAbility") or "").strip() if bottom_data else ""

        if star_sa:
            star_target_side = "shared" if bottom_data is not None else "top"
            sides_to_process.append((star_target_side, star_sa, True))
        if shared_sa and not re.match(r"^(?:STAR\s*:|\(\s*Star\s*\))", shared_sa, re.IGNORECASE):
            target_side = "shared" if bottom_data is not None else "top"
            sides_to_process.append((target_side, shared_sa, False))
        if top_sa:
            sides_to_process.append(("top", top_sa, False))
        if bottom_sa:
            sides_to_process.append(("bottom", bottom_sa, False))

        if not sides_to_process:
            default_empty_side = "shared" if (bottom_data is not None and not top_data) else "top"
            sides_to_process = [(default_empty_side, "", False)]

        card_all_parsed = True
        for side_key, raw_ability, is_star_clause in sides_to_process:
            total_sides += 1
            side_logic, failure_reason = parse_side_ability(
                card_name, side_key, raw_ability, is_star_clause=is_star_clause
            )

            if side_logic is not None:
                if side_key in card_logic_entry.sides:
                    card_logic_entry.sides[side_key].modifiers.extend(side_logic.modifiers)
                    card_logic_entry.sides[side_key].abilities.extend(side_logic.abilities)
                else:
                    card_logic_entry.sides[side_key] = side_logic
                parsed_sides += 1
            else:
                card_all_parsed = False
                unparsed_records.append(
                    {
                        "card_identifier": card_id,
                        "card_name": card_name,
                        "side": side_key,
                        "raw_ability": f"STAR: {raw_ability}" if is_star_clause else raw_ability,
                        "reason": failure_reason,
                    }
                )

        if card_all_parsed and card_logic_entry.sides:
            output_logic_map[card_id] = card_logic_entry.model_dump()

    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_FILE.open("w", encoding="utf-8") as out:
        json.dump(output_logic_map, out, indent=2, ensure_ascii=False)

    with UNPARSED_LOG.open("w", encoding="utf-8") as log:
        log.write(f"# Unparsed Abilities Log - Generated {len(unparsed_records)} unparsed sides\n")
        log.write(
            f"# Total Sides: {total_sides} | Parsed: {parsed_sides} ({parsed_sides / max(1, total_sides):.1%})\n\n"
        )
        for rec in unparsed_records:
            log.write(f"[{rec['card_identifier']}] ({rec['side']}) {rec['card_name']}\n")
            log.write(f"  Ability: {rec['raw_ability']}\n")
            log.write(f"  Reason:  {rec['reason']}\n\n")

    print("\nStage 8 Complete:")
    print(f" - Total Card Sides Evaluated: {total_sides}")
    print(f" - Successfully Parsed Sides:  {parsed_sides} ({parsed_sides / max(1, total_sides):.1%})")
    print(f" - Unparsed Sides Logged:      {len(unparsed_records)} -> {UNPARSED_LOG}")
    print(f" - 100% Fully Parsed Cards:    {len(output_logic_map)} cards -> {OUTPUT_FILE}")


if __name__ == "__main__":
    run_ability_parser()
