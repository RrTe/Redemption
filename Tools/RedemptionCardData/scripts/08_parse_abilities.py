"""Pipeline Stage 8: Rule-Based Card Ability Parser

Parses raw card ability texts into structured ASTs using deterministic pattern
matching, abbreviation protection (O.T./N.T.), dynamic variable support (X),
colon context scope parsing, and strict all-or-nothing card side validation.
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

from utils.card_helpers import get_card_name, get_side_field
from utils.ability_patterns import (
    extract_modifiers_from_text,
    extract_star_trigger,
    extract_condition_prefix,
    parse_target_zone_suffix,
    protect_abbreviations,
    restore_abbreviations
)
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
    BASE_DIR / _config.get("carddata_json", "")
]
INPUT_FILE = next((p for p in _possible_inputs if p and p.exists()), None)
OUTPUT_FILE = BASE_DIR / _config.get("card_abilities_raw", "data/card_abilities_raw.json")
UNPARSED_LOG = BASE_DIR / _config.get("unparsed_abilities_log", "data/unparsed_abilities.log")

# Enhanced patterns with dynamic X and (limit Y) support
DRAW_PATTERN = re.compile(
    r'^(?:you\s+may\s+|holder\s+may\s+)?draw\s+(\d+|x|all)(?:\s*\(\s*limit\s+(\d+)\s*\))?\.?$',
    re.IGNORECASE
)
DISCARD_PATTERN = re.compile(
    r'^(?:you\s+may\s+|holder\s+may\s+)?discard\s+(one|\d+|x|all|an?)?\s*([a-zA-Z\s\(\)]+?)(?:\s*\(\s*limit\s+(\d+)\s*\))?(?:\s+(?:from|in)\s+.*)?\.?$',
    re.IGNORECASE
)
NEGATE_PATTERN = re.compile(
    r'^(?:you\s+may\s+|holder\s+may\s+)?negate\s+(?:all\s+|an?\s+)?([a-zA-Z\s]+)\b\.?$',
    re.IGNORECASE
)
INTERRUPT_PATTERN = re.compile(
    r'^(?:you\s+may\s+|holder\s+may\s+)?interrupt\s+(?:the\s+last\s+|the\s+next\s+|an?\s+|all\s+)?([a-zA-Z\s]+)\b\.?$',
    re.IGNORECASE
)
BAND_PATTERN = re.compile(
    r'^(?:you\s+|holder\s+)?may\s+band\s+to\s+(?:a\s+|an\s+)?([a-zA-Z\s,\(\)]+)\b\.?$',
    re.IGNORECASE
)
SEARCH_PATTERN = re.compile(
    r'^(?:you\s+may\s+|holder\s+may\s+)?search\s+(deck|reserve|discard pile)\s+for\s+(?:an?\s+|the\s+)?([a-zA-Z\s,\(\)]+)\b\.?$',
    re.IGNORECASE
)
TOPDECK_PATTERN = re.compile(
    r'^(?:you\s+may\s+|holder\s+may\s+)?topdeck\s+(?:an?\s+)?([a-zA-Z\s\(\)]+?)(?:\s+from\s+deck)?\.?$',
    re.IGNORECASE
)
TAKE_PATTERN = re.compile(
    r'^(?:you\s+may\s+|holder\s+may\s+)?take\s+(?:an?\s+|the\s+)?([a-zA-Z\s\(\)]+?)(?:\s+from\s+(?:deck|discard pile|reserve))?\.?$',
    re.IGNORECASE
)
PROTECT_PATTERN = re.compile(
    r'^(?:you\s+may\s+|holder\s+may\s+)?protect\s+([a-zA-Z\s]+?)\s+from\s+([a-zA-Z\s]+)\b\.?$',
    re.IGNORECASE
)
WITHDRAW_PATTERN = re.compile(
    r'^(?:you\s+may\s+|holder\s+may\s+)?withdraw\s+(?:all\s+|an?\s+)?([a-zA-Z\s]+)\b\.?$',
    re.IGNORECASE
)
FIRST_STRIKE_PATTERN = re.compile(
    r'^(?:this\s+hero\s+has\s+|holder\s+has\s+)?first\s+strike\b\.?$',
    re.IGNORECASE
)

# Compound action pattern (e.g. Negate and discard)
COMPOUND_DUAL_PATTERN = re.compile(
    r'^(?:you\s+may\s+|holder\s+may\s+)?(negate|interrupt)\s+and\s+discard\s+(?:an?\s+|all\s+)?([a-zA-Z\s\(\)]+)\b\.?$',
    re.IGNORECASE
)

# Cost-benefit pattern: Discard X to draw Y
COST_BENEFIT_DISCARD_DRAW = re.compile(
    r'^(?:you\s+may\s+|holder\s+may\s+)?discard\s+(one|\d+|x|a|an)?\s*([a-zA-Z\s\(\)]+?)\s+to\s+draw\s+(\d+|x)\b\.?$',
    re.IGNORECASE
)

# Colon Context Scope Pattern: Look/Reveal ... : ... and underdeck the rest
COLON_LOOK_REVEAL_PATTERN = re.compile(
    r'^(?:you\s+may\s+|holder\s+may\s+)?(look\s+at|reveal)\s+(.*?)\s*:\s*(.*)$',
    re.IGNORECASE
)


def _build_count_value(token: str, limit_val: Optional[int] = None) -> DynamicValue:
    """Helper creating a DynamicValue from token ('x', 'all', or numeric)."""
    t = (token or "1").lower().strip()
    if t == "all":
        return DynamicValue.all_targets()
    if t == "x":
        return DynamicValue(dynamic=DynamicValueCalculation(source="count_cards", limit=limit_val))
    try:
        return DynamicValue.from_int(int(t))
    except ValueError:
        return DynamicValue.from_int(1)


def parse_colon_clause(clause: str, ability_idx: int) -> Optional[Ability]:
    """Parses colon-separated look/reveal abilities creating context scopes."""
    m = COLON_LOOK_REVEAL_PATTERN.match(clause)
    if not m:
        return None

    action_word, target_desc, action_desc = m.groups()
    is_optional = bool(re.search(r'\bmay\b', clause, re.IGNORECASE))
    first_verb = ActionVerb.LOOK if "look" in action_word.lower() else ActionVerb.REVEAL

    # Parse inspect count
    count_match = re.search(r'top\s+(\d+|x)\s+cards', target_desc, re.IGNORECASE)
    insp_count = _build_count_value(count_match.group(1)) if count_match else DynamicValue.from_int(3)
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
                scope=scope_zone,
                zone_owner=owner_str,
                count=insp_count
            )
        )
    ]

    # Parse action on inspected cards (e.g. discard an evil enhancement and underdeck the rest)
    has_underdeck_remainder = bool(re.search(r'\b(?:and\s+)?underdeck\s+(?:the\s+)?rest\b', action_desc, re.IGNORECASE))
    cleaned_action = re.sub(r'\b(?:and\s+)?underdeck\s+(?:the\s+)?rest\b', '', action_desc, flags=re.IGNORECASE).strip(' ;,')

    if cleaned_action:
        # Check if discard or take inside context scope
        if re.search(r'\bdiscard\b', cleaned_action, re.IGNORECASE):
            effects.append(ActionEffect(
                step=2,
                action=ActionVerb.DISCARD,
                effect_type="instant",
                destination=Zone.DISCARD_PILE,
                target=TargetSelector(
                    selection_mode=SelectionMode.MANUAL_CONTROLLER,
                    scope=Zone.CONTEXT_SCOPE,
                    count=DynamicValue.from_int(1)
                )
            ))
        elif re.search(r'\btake\b', cleaned_action, re.IGNORECASE):
            effects.append(ActionEffect(
                step=2,
                action=ActionVerb.TAKE,
                effect_type="instant",
                destination=Zone.HAND,
                target=TargetSelector(
                    selection_mode=SelectionMode.MANUAL_CONTROLLER,
                    scope=Zone.CONTEXT_SCOPE,
                    count=DynamicValue.from_int(1)
                )
            ))

    if has_underdeck_remainder:
        effects.append(ActionEffect(
            step=len(effects) + 1,
            action=ActionVerb.UNDERDECK,
            effect_type="instant",
            destination=Zone.DECK,
            destination_position="bottom",
            target=TargetSelector(
                selection_mode=SelectionMode.CONTEXT_REMAINDER,
                scope=Zone.CONTEXT_SCOPE,
                count=DynamicValue.all_targets()
            )
        ))

    return Ability(
        ability_id=f"ab_{ability_idx}_context_scope",
        activation_mode=ActivationMode.IMMEDIATE,
        is_optional=is_optional,
        effects=effects
    )


def parse_deterministic_clause(
    clause: str,
    ability_idx: int,
    condition: Optional[ConditionExpression] = None,
    activation_mode: ActivationMode = ActivationMode.IMMEDIATE
) -> Optional[Ability]:
    """Matches an individual clause against deterministic regex patterns."""
    cleaned = clause.strip()
    is_optional = bool(re.search(r'\b(?:you\s+may|holder\s+may|may)\b', cleaned, re.IGNORECASE))
    conditions = [condition] if condition else []

    # 1. Colon Context Scope (Look/Reveal ... : ...)
    colon_ab = parse_colon_clause(cleaned, ability_idx)
    if colon_ab:
        colon_ab.conditions = conditions
        colon_ab.activation_mode = activation_mode
        return colon_ab

    # 2. Compound Dual Action: Negate/Interrupt and discard
    comp_match = COMPOUND_DUAL_PATTERN.match(cleaned)
    if comp_match:
        act_verb = comp_match.group(1).lower()
        target_str = comp_match.group(2).strip()
        first_action = ActionVerb.NEGATE if act_verb == "negate" else ActionVerb.INTERRUPT
        return Ability(
            ability_id=f"ab_{ability_idx}_{act_verb}_and_discard",
            activation_mode=activation_mode,
            is_optional=is_optional,
            conditions=conditions,
            effects=[
                ActionEffect(
                    step=1,
                    action=first_action,
                    effect_type="instant",
                    target=TargetSelector(
                        selection_mode=SelectionMode.MANUAL_CONTROLLER,
                        scope=Zone.BATTLE,
                        target_type=target_str.lower()
                    )
                ),
                ActionEffect(
                    step=2,
                    action=ActionVerb.DISCARD,
                    effect_type="instant",
                    destination=Zone.DISCARD_PILE,
                    target=TargetSelector(
                        selection_mode=SelectionMode.CHAINED_TARGET,
                        ref_step=1
                    ),
                    dependency="if_previous_successful"
                )
            ]
        )

    # 3. Cost-Benefit: Discard X to draw Y
    cb_match = COST_BENEFIT_DISCARD_DRAW.match(cleaned)
    if cb_match:
        disc_target = cb_match.group(2).strip()
        draw_count_token = cb_match.group(3)
        return Ability(
            ability_id=f"ab_{ability_idx}_cost_discard_draw",
            activation_mode=activation_mode,
            is_optional=is_optional,
            conditions=conditions,
            costs=[
                ActionEffect(
                    step=1,
                    action=ActionVerb.DISCARD,
                    effect_type="instant",
                    destination=Zone.DISCARD_PILE,
                    target=TargetSelector(
                        selection_mode=SelectionMode.MANUAL_CONTROLLER,
                        scope=Zone.HAND,
                        target_type=disc_target.lower(),
                        count=DynamicValue.from_int(1)
                    )
                )
            ],
            effects=[
                ActionEffect(
                    step=2,
                    action=ActionVerb.DRAW,
                    effect_type="instant",
                    target=TargetSelector(
                        selection_mode=SelectionMode.AUTOMATIC_ALL,
                        zone_owner="controller",
                        count=_build_count_value(draw_count_token)
                    ),
                    dependency="if_you_do"
                )
            ]
        )

    # 4. Draw (with X and limit support)
    draw_match = DRAW_PATTERN.match(cleaned)
    if draw_match:
        cnt_token = draw_match.group(1)
        limit_val = int(draw_match.group(2)) if draw_match.group(2) else None
        return Ability(
            ability_id=f"ab_{ability_idx}_draw",
            activation_mode=activation_mode,
            is_optional=is_optional,
            conditions=conditions,
            effects=[
                ActionEffect(
                    step=1,
                    action=ActionVerb.DRAW,
                    effect_type="instant",
                    target=TargetSelector(
                        selection_mode=SelectionMode.AUTOMATIC_ALL,
                        zone_owner="controller",
                        count=_build_count_value(cnt_token, limit_val)
                    )
                )
            ]
        )

    # 5. Discard (with X, limits, and zone suffixes)
    discard_match = DISCARD_PATTERN.match(cleaned)
    if discard_match:
        raw_target = discard_match.group(2).strip()
        clean_target, scope_zone, zone_owner = parse_target_zone_suffix(raw_target)
        cnt_token = discard_match.group(1) or "1"
        limit_val = int(discard_match.group(3)) if discard_match.group(3) else None

        return Ability(
            ability_id=f"ab_{ability_idx}_discard",
            activation_mode=activation_mode,
            is_optional=is_optional,
            conditions=conditions,
            effects=[
                ActionEffect(
                    step=1,
                    action=ActionVerb.DISCARD,
                    effect_type="instant",
                    destination=Zone.DISCARD_PILE,
                    target=TargetSelector(
                        selection_mode=SelectionMode.AUTOMATIC_ALL if cnt_token.lower() == "all" else SelectionMode.MANUAL_CONTROLLER,
                        scope=scope_zone,
                        zone_owner=zone_owner,
                        target_type=clean_target.lower(),
                        count=_build_count_value(cnt_token, limit_val)
                    )
                )
            ]
        )

    # 6. Negate
    negate_match = NEGATE_PATTERN.match(cleaned)
    if negate_match:
        target_str = negate_match.group(1).strip()
        return Ability(
            ability_id=f"ab_{ability_idx}_negate",
            activation_mode=activation_mode,
            is_optional=is_optional,
            conditions=conditions,
            effects=[
                ActionEffect(
                    step=1,
                    action=ActionVerb.NEGATE,
                    effect_type="instant",
                    target=TargetSelector(
                        selection_mode=SelectionMode.AUTOMATIC_ALL,
                        scope=Zone.BATTLE,
                        target_type=target_str.lower()
                    )
                )
            ]
        )

    # 7. Interrupt
    interrupt_match = INTERRUPT_PATTERN.match(cleaned)
    if interrupt_match:
        target_str = interrupt_match.group(1).strip()
        return Ability(
            ability_id=f"ab_{ability_idx}_interrupt",
            activation_mode=activation_mode,
            is_optional=is_optional,
            conditions=conditions,
            effects=[
                ActionEffect(
                    step=1,
                    action=ActionVerb.INTERRUPT,
                    effect_type="instant",
                    target=TargetSelector(
                        selection_mode=SelectionMode.AUTOMATIC_LAST if "last" in cleaned.lower() else SelectionMode.MANUAL_CONTROLLER,
                        scope=Zone.BATTLE,
                        target_type=target_str.lower()
                    )
                )
            ]
        )

    # 8. Band
    band_match = BAND_PATTERN.match(cleaned)
    if band_match:
        target_str = band_match.group(1).strip()
        return Ability(
            ability_id=f"ab_{ability_idx}_band",
            activation_mode=activation_mode,
            is_optional=is_optional,
            conditions=conditions,
            effects=[
                ActionEffect(
                    step=1,
                    action=ActionVerb.BAND,
                    effect_type="instant",
                    target=TargetSelector(
                        selection_mode=SelectionMode.MANUAL_CONTROLLER,
                        scope=Zone.TERRITORY,
                        identifiers=[target_str]
                    )
                )
            ]
        )

    # 9. Search
    search_match = SEARCH_PATTERN.match(cleaned)
    if search_match:
        zone_name = search_match.group(1).lower()
        target_str = search_match.group(2).strip()
        search_zone = Zone.DECK
        if "reserve" in zone_name:
            search_zone = Zone.RESERVE_PILE
        elif "discard" in zone_name:
            search_zone = Zone.DISCARD_PILE

        return Ability(
            ability_id=f"ab_{ability_idx}_search",
            activation_mode=activation_mode,
            is_optional=is_optional,
            conditions=conditions,
            effects=[
                ActionEffect(
                    step=1,
                    action=ActionVerb.SEARCH,
                    effect_type="instant",
                    destination=Zone.HAND,
                    target=TargetSelector(
                        selection_mode=SelectionMode.MANUAL_CONTROLLER,
                        scope=search_zone,
                        identifiers=[target_str],
                        count=DynamicValue.from_int(1)
                    )
                )
            ]
        )

    # 10. Topdeck
    topdeck_match = TOPDECK_PATTERN.match(cleaned)
    if topdeck_match:
        target_str = topdeck_match.group(1).strip()
        return Ability(
            ability_id=f"ab_{ability_idx}_topdeck",
            activation_mode=activation_mode,
            is_optional=is_optional,
            conditions=conditions,
            effects=[
                ActionEffect(
                    step=1,
                    action=ActionVerb.TOPDECK,
                    effect_type="instant",
                    destination=Zone.DECK,
                    destination_position="top",
                    target=TargetSelector(
                        selection_mode=SelectionMode.MANUAL_CONTROLLER,
                        scope=Zone.DECK,
                        identifiers=[target_str],
                        count=DynamicValue.from_int(1)
                    )
                )
            ]
        )

    # 11. Take
    take_match = TAKE_PATTERN.match(cleaned)
    if take_match:
        target_str = take_match.group(1).strip()
        return Ability(
            ability_id=f"ab_{ability_idx}_take",
            activation_mode=activation_mode,
            is_optional=is_optional,
            conditions=conditions,
            effects=[
                ActionEffect(
                    step=1,
                    action=ActionVerb.TAKE,
                    effect_type="instant",
                    destination=Zone.HAND,
                    target=TargetSelector(
                        selection_mode=SelectionMode.MANUAL_CONTROLLER,
                        scope=Zone.DECK,
                        identifiers=[target_str],
                        count=DynamicValue.from_int(1)
                    )
                )
            ]
        )

    # 12. Protect
    protect_match = PROTECT_PATTERN.match(cleaned)
    if protect_match:
        target_str = protect_match.group(1).strip()
        from_str = protect_match.group(2).strip()
        return Ability(
            ability_id=f"ab_{ability_idx}_protect",
            activation_mode=ActivationMode.STATIC,
            is_optional=is_optional,
            conditions=conditions,
            effects=[
                ActionEffect(
                    step=1,
                    action=ActionVerb.PROTECT,
                    effect_type="ongoing",
                    duration=Duration.PERMANENT,
                    target=TargetSelector(
                        selection_mode=SelectionMode.AUTOMATIC_ALL,
                        target_type=target_str.lower(),
                        identifiers=[from_str]
                    )
                )
            ]
        )

    # 13. Withdraw
    withdraw_match = WITHDRAW_PATTERN.match(cleaned)
    if withdraw_match:
        target_str = withdraw_match.group(1).strip()
        return Ability(
            ability_id=f"ab_{ability_idx}_withdraw",
            activation_mode=activation_mode,
            is_optional=is_optional,
            conditions=conditions,
            effects=[
                ActionEffect(
                    step=1,
                    action=ActionVerb.WITHDRAW,
                    effect_type="instant",
                    target=TargetSelector(
                        selection_mode=SelectionMode.AUTOMATIC_ALL,
                        scope=Zone.BATTLE,
                        target_type=target_str.lower()
                    )
                )
            ]
        )

    # 14. First Strike
    if FIRST_STRIKE_PATTERN.match(cleaned):
        return Ability(
            ability_id=f"ab_{ability_idx}_first_strike",
            activation_mode=ActivationMode.STATIC,
            is_optional=False,
            conditions=conditions,
            effects=[
                ActionEffect(
                    step=1,
                    action=ActionVerb.FIRST_STRIKE,
                    effect_type="ongoing",
                    duration=Duration.PERMANENT,
                    target=TargetSelector(selection_mode=SelectionMode.AUTOMATIC_ALL, scope=Zone.BATTLE)
                )
            ]
        )

    return None


def parse_side_ability(
    card_name: str,
    side_key: str,
    raw_text: str
) -> Tuple[Optional[CardSideLogic], Optional[str]]:
    """Parses a card side's special ability with strict all-or-nothing validation."""
    text = (raw_text or "").strip()

    # 1. Vanilla / Meek check
    if not text or text.lower() in ("none", "n/a", "meek", "star:", "star"):
        return CardSideLogic(abilities=[], modifiers=[]), None

    # 2. Check Layer C (Manual Overrides)
    override_key = (card_name, side_key)
    if override_key in SPECIAL_ABILITY_OVERRIDES:
        return SPECIAL_ABILITY_OVERRIDES[override_key], None

    # 3. Extract STAR trigger prefix
    text_after_star, is_star = extract_star_trigger(text)
    activation_mode = ActivationMode.TRIGGERED if is_star else ActivationMode.IMMEDIATE

    # 4. Extract Modifiers (Layer A)
    remainder, modifiers = extract_modifiers_from_text(text_after_star)

    # If the entire ability was just modifiers (e.g. "Cannot be negated.")
    if not remainder:
        side_logic = CardSideLogic(modifiers=modifiers, abilities=[])
        side_logic.propagate_side_modifiers()
        return side_logic, None

    # 5. Abbreviation Protection: Protect O.T., N.T., e.g., i.e. before condition extraction and splitting
    masked_text = protect_abbreviations(remainder)

    # 6. Extract Condition Prefix (e.g. "If used by a Hero,")
    clause_text, leading_condition = extract_condition_prefix(masked_text)

    # Split into sentences / major clauses
    raw_sentences = [s.strip() for s in re.split(r'\.\s+', clause_text) if s.strip()]
    parsed_abilities: List[Ability] = []

    # Strict all-or-nothing: every single sentence must parse successfully
    for idx, raw_sentence in enumerate(raw_sentences, start=1):
        clean_sentence = restore_abbreviations(raw_sentence).strip(' .')
        if not clean_sentence:
            continue

        cond_for_clause = leading_condition if idx == 1 else None
        ability = parse_deterministic_clause(clean_sentence, idx, cond_for_clause, activation_mode)
        if not ability:
            # All-or-nothing rule: any failure marks the entire side as unparsed
            return None, f"Unmatched clause: '{clean_sentence}'"

        parsed_abilities.append(ability)

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
        card_all_sides_ok = True

        # Determine sides to process without redundant duplication:
        sides_to_process = []
        shared_sa = (shared_data.get("SpecialAbility") or "").strip()
        top_sa = (top_data.get("SpecialAbility") or "").strip()
        bottom_sa = (bottom_data.get("SpecialAbility") or "").strip() if bottom_data else ""

        if shared_sa:
            sides_to_process.append(("shared", shared_sa))
        if top_sa:
            sides_to_process.append(("top", top_sa))
        if bottom_sa:
            sides_to_process.append(("bottom", bottom_sa))

        if not sides_to_process:
            # Pure meek/vanilla card with no special ability on any side:
            sides_to_process = [("shared", "")]

        for side_key, raw_ability in sides_to_process:
            total_sides += 1
            side_logic, failure_reason = parse_side_ability(card_name, side_key, raw_ability)

            if side_logic is not None:
                card_logic_entry.sides[side_key] = side_logic
                parsed_sides += 1
            else:
                card_all_sides_ok = False
                unparsed_records.append({
                    "card_identifier": card_id,
                    "card_name": card_name,
                    "side": side_key,
                    "raw_ability": raw_ability,
                    "reason": failure_reason
                })

        # Save card only if all its real sides were successfully parsed.
        # If any side failed, the card is left for AI generation (Stage 9).
        if card_all_sides_ok and card_logic_entry.sides:
            output_logic_map[card_id] = card_logic_entry.model_dump()

    # Ensure output directory exists
    OUTPUT_FILE.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_FILE.open("w", encoding="utf-8") as out:
        json.dump(output_logic_map, out, indent=2, ensure_ascii=False)

    # Write unparsed log
    with UNPARSED_LOG.open("w", encoding="utf-8") as log:
        log.write(f"# Unparsed Abilities Log - Generated {len(unparsed_records)} unparsed sides\n")
        log.write(f"# Total Sides: {total_sides} | Parsed: {parsed_sides} ({parsed_sides / max(1, total_sides):.1%})\n\n")
        for rec in unparsed_records:
            log.write(f"[{rec['card_identifier']}] ({rec['side']}) {rec['card_name']}\n")
            log.write(f"  Ability: {rec['raw_ability']}\n")
            log.write(f"  Reason:  {rec['reason']}\n\n")

    print(f"\nStage 8 Complete:")
    print(f" - Total Card Sides Evaluated: {total_sides}")
    print(f" - Successfully Parsed Sides:  {parsed_sides} ({parsed_sides / max(1, total_sides):.1%})")
    print(f" - Unparsed Sides Logged:      {len(unparsed_records)} -> {UNPARSED_LOG}")
    print(f" - 100% Fully Parsed Cards:    {len(output_logic_map)} cards -> {OUTPUT_FILE}")


if __name__ == "__main__":
    run_ability_parser()
