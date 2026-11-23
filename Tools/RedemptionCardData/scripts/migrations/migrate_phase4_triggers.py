"""Phase 4 migration: Normalize all TriggerEvents and split trigger_filter into trigger_subject/trigger_source.

Migrates both data/ai_generated_abilities.json and data/card_abilities_raw.json:
1. Maps all 288 legacy free-text/compound trigger_event values to canonical TriggerEvent enum values
   (scalar or list) and extracts embedded actors/sources into trigger_subject / trigger_source.
2. Resolves all ~200 triggered abilities missing trigger_event and fixes misclassified
   immediate/static/manually_triggered abilities (including multi-clause and King Zimri cases).
3. Decomposes all trigger_filter payloads into trigger_subject / trigger_source (removing legacy trigger_filter).
4. Enforces strict TriggerEvent conformance via CardSideLogic Pydantic validation and links IDs via CardLinker.
"""

from __future__ import annotations

import argparse
import copy
import json
import re
import sys
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple, Union

BASE_DIR = Path(__file__).resolve().parent.parent.parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / "scripts"))

from models.enums.trigger_event import CANONICAL_TRIGGER_EVENTS, TriggerEvent
from models.logic.card_logic import CardSideLogic
from utils.card_linker import CardLinker, link_side_logic_targets

AI_FILE = BASE_DIR / "data" / "ai_generated_abilities.json"
RAW_FILE = BASE_DIR / "data" / "card_abilities_raw.json"
EXT_FILE = BASE_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"

_CANONICAL_SET = frozenset(CANONICAL_TRIGGER_EVENTS)

# Direct mapping from legacy free-text / alias trigger_event strings -> canonical TriggerEvent (or list).
EXPLICIT_TRIGGER_MAP: Dict[str, Union[str, List[str]]] = {
    "star": "star_phase",
    "block": "on_block",
    "blocking": "on_block",
    "blocks": "on_block",
    "blocks o.t. hero": "on_block",
    "blocking alone": "on_block",
    "blocking_alone": "on_block",
    "character_blocks": "on_block",
    "evil_king_of_israel_blocks": "on_block",
    "lone_pale_green_human_blocks": "on_block",
    "block_or_taunt": ["on_block", "on_taunt"],
    "blocked": "on_blocked",
    "blocked_from_hand": "on_blocked",
    "blocked from hand": "on_blocked",
    "on_blocked_from_hand": "on_blocked",
    "on_block_from_hand": "on_blocked",
    "hero_blocked": "on_blocked",
    "character_blocked": "on_blocked",
    "samaritan_blocked": "on_blocked",
    "attack": "on_attack",
    "attacks": "on_attack",
    "attacking": "on_attack",
    "hero_attacks": "on_attack",
    "character_attacks": "on_attack",
    "lone_meek_or_ruth_hero_attacks": "on_attack",
    "attacked": "on_attacked",
    "when_attacked": "on_attacked",
    "if_attacked": "on_attacked",
    "being attacked": "on_attacked",
    "under_attack": "on_attacked",
    "enters_battle": "on_enters_battle",
    "enter_battle": "on_enters_battle",
    "enters battle": "on_enters_battle",
    "enter the field of battle": "on_enters_battle",
    "on_enter_battle": "on_enters_battle",
    "hero_enters_battle": "on_enters_battle",
    "begins a battle": "on_enters_battle",
    "each_upkeep": "upkeep",
    "upkeep_start": "upkeep",
    "upkeep_phase": "upkeep",
    "prep_phase": "preparation_phase",
    "site_phase": "preparation_phase",
    "turn": "on_turn_start",
    "turn_start": "on_turn_start",
    "start_of_turn": "on_turn_start",
    "each_turn": "on_turn_start",
    "turn_phase": "on_turn_start",
    "turn_end": "end_of_turn",
    "end_of_next_turn": "end_of_turn",
    "after battle": "after_battle",
    "end_of_battle": "after_battle",
    "battle_end": "after_battle",
    "after_block": "after_battle",
    "put_in_play": "on_put_in_play",
    "on_enter_play": "on_put_in_play",
    "enter_play": "on_put_in_play",
    "enters_play": "on_put_in_play",
    "opponent_puts_hero_in_play": "on_put_in_play",
    "opponent_puts_good_card_in_play_during_battle": "on_put_in_play",
    "put_in_territory": "on_put_in_territory",
    "place_in_territory": "on_put_in_territory",
    "on_enter_territory": "on_put_in_territory",
    "on_enter_site": "on_enters_site",
    "put_in_site": "on_enters_site",
    "put_in_a_site": "on_enters_site",
    "put_in_territory_or_site": ["on_put_in_territory", "on_enters_site"],
    "on_place_in_site": "on_enters_site",
    "on_place_in_land_of_bondage": "on_placed",
    "on_lost_soul_placed": "on_placed",
    "lost_soul_put_here": "on_placed",
    "place": "on_place",
    "play": "on_play",
    "play_card": "on_play",
    "play_site": "on_play",
    "play an enhancement": "on_play",
    "played": "on_played",
    "played_from_hand": "on_played",
    "played_in_battle": "on_played",
    "enhanced": "on_play",
    "uses_enhancement": "on_play",
    "hero_uses_enhancement": "on_play",
    "opponent_plays_dominant": "on_play",
    "opponent_plays_good_dominant": "on_play",
    "opponent_plays_evil_character": "on_play",
    "opponent_plays_good_enhancement": "on_play",
    "opponent plays an enhancement in their territory": "on_play",
    "opponent_plays_more_than_one_additional_enhancement_this_battle": "on_play",
    "son of god is played": "on_played",
    "put_in_play_or_rescued": ["on_put_in_play", "on_rescued"],
    "put in play by opponent or drawn with no evil characters in territory": ["on_put_in_play", "on_drawn"],
    "drawn or put in play by an opponent's special ability": ["on_drawn", "on_put_in_play"],
    "drawn_or_put_in_play_by_opponent_ability": ["on_drawn", "on_put_in_play"],
    "drawn_or_put_in_play_by_opponent": ["on_drawn", "on_put_in_play"],
    "drawn": "on_drawn",
    "draw": "on_draw",
    "opponent_draws": "on_draw",
    "opponent_draw": "on_draw",
    "opponent_draws_by_special_ability": "on_draw",
    "opponent_draws_by_ability": "on_draw",
    "opponent draws because of a special ability he controls": "on_draw",
    "a player uses a draw ability": "on_draw",
    "opponent uses a good draw ability": "on_draw",
    "opponent_uses_draw_ability": "on_draw",
    "opponent_used_special_ability_to_draw": "on_draw",
    "search": "on_search",
    "opponent searches a deck": "on_search",
    "opponent_uses_search": "on_search",
    "opponent_uses_search_ability": "on_search",
    "opponent_used_search_ability": "on_search",
    "opponent_search_ability": "on_search",
    "opponent_used_special_ability_to_search": "on_search",
    "opponent_uses_draw_or_search": ["on_draw", "on_search"],
    "opponent_uses_good_draw_or_search_ability": ["on_draw", "on_search"],
    "opponent_uses_good_ability_to_draw_or_search": ["on_draw", "on_search"],
    "opponent_uses_good_special_ability_to_look_reveal_or_search": ["on_look", "on_reveal", "on_search"],
    "opponent_used_special_ability_to_exchange": "on_exchange",
    "opponent_take_or_draw": ["on_draw", "on_put_in_play"],
    "opponent_card_reserved": "on_reserved",
    "discard": "on_discard",
    "discarded": "on_discarded",
    "discarded_from_battle": "on_discarded",
    "discarded_from_play": "on_discarded",
    "discarded_by_opponent": "on_discarded",
    "card_discarded": "on_discarded",
    "character_discarded": "on_discarded",
    "selected_hero_is_discarded": "on_discarded",
    "evil_character_discarded_by_opponent": "on_discarded",
    "on_hero_discarded": "on_discarded",
    "on_opponent_discard_evil_human": "on_discarded",
    "on_opponent_discard_exodus_hero": "on_discarded",
    "on_hero_discard": "would_be_discarded",
    "opponent_uses_discard_ability": "on_discard",
    "opponent uses an evil discard ability": "on_discard",
    "opponent_uses_evil_discard_ability": "on_discard",
    "being_discarded": "would_be_discarded",
    "about_to_be_discarded": "would_be_discarded",
    "about to be discarded": "would_be_discarded",
    "hero_about_to_be_discarded": "would_be_discarded",
    "discard_or_underdeck": ["on_discarded", "on_underdecked"],
    "banish": "on_banish",
    "remove_from_game": "would_be_banished",
    "would_be_removed_from_game_by_opponent": "would_be_banished",
    "capture": "on_capture",
    "captured": "on_captured",
    "captured_or_discarded_by_opponent": ["on_captured", "on_discarded"],
    "convert": "on_converted",
    "character_converted": "on_converted",
    "defeat": "on_defeat",
    "defeated": "on_defeated",
    "character_defeated": "on_defeated",
    "hero_defeats_demon": "on_defeat",
    "harm": "on_harmed",
    "on_harm": "on_harmed",
    "harmed": "on_harmed",
    "harmed_by_opponent": "on_harmed",
    "on_card_harmed": "on_harmed",
    "character_harmed": "on_harmed",
    "on_harmed_or_defeated": ["on_harmed", "on_defeated"],
    "targeted": "on_targeted",
    "targeted_by_special_ability": "on_targeted",
    "targeted_by_opponent_special_ability": "on_targeted",
    "removed_from_battle": "on_removed_from_battle",
    "character_removed_from_battle": "on_removed_from_battle",
    "hero_removed_from_battle": "on_removed_from_battle",
    "removed_from_battle_by_opponent_special_ability": "on_removed_from_battle",
    "leaves_play": "on_leaves_play",
    "returns to territory": "on_returned_to_territory",
    "rescue": "on_rescue",
    "rescued": "on_rescued",
    "lost_soul_rescued": "on_rescued",
    "hero_rescues_lost_soul_from_site": "on_rescue",
    "after this hero makes a successful rescue or converts an evil character in battle": [
        "on_successful_rescue",
        "on_convert",
    ],
    "successful_rescue": "on_successful_rescue",
    "successful_rescue_attempt": "on_successful_rescue",
    "on_rescue_success": "on_successful_rescue",
    "battle_victory": "on_successful_rescue",
    "rescue or battle challenge is successful": ["on_successful_rescue", "on_win_battle"],
    "win_battle": "on_win_battle",
    "demon wins in battle": "on_win_battle",
    "demon wins a battle": "on_win_battle",
    "character_loses_battle": "on_lose_battle",
    "rescue_fails": "on_failed_rescue",
    "rescue_attempt_fails": "on_failed_rescue",
    "rescue attempt fails": "on_failed_rescue",
    "successful_block": "on_successful_block",
    "block_successful": "on_successful_block",
    "rescue_attempt": "on_rescue_attempt",
    "rescue attempt": "on_rescue_attempt",
    "hero_begins_rescue": "on_rescue_attempt",
    "opponent_rescue_attempt": "on_rescue_attempt",
    "rescue_attempt_at_site": "on_rescue_attempt",
    "rescue_attempt_at_this_site": "on_rescue_attempt",
    "start_of_rescue_attempt": "on_rescue_attempt",
    "selected opponent's next rescue attempt": "on_rescue_attempt",
    "band": "on_band",
    "banded into battle": "on_banded",
    "rescuing_player_bands_different_books": "on_band",
    "withdraw": "on_withdraw",
    "release": "on_release",
    "activate": "on_activate",
    "on_activation": "on_activate",
    "activate_ability": "on_activate",
    "activate_artifact": "on_activate_artifact",
    "on_deactivation": "on_deactivated",
    "blocker presented": "on_present",
    "present": "on_present",
    "repents": "on_repent",
    "saul_repents": "on_repent",
    "contracts leprosy": "on_diseased",
    "torn": "would_be_torn",
    "zero_toughness": "on_zero_toughness",
    "toughness_zero_or_less": "on_zero_toughness",
    "hero reaches */0 or less": "on_zero_toughness",
    "on_hero_zero_toughness": "on_zero_toughness",
    "deck_has_no_cards": "on_deck_empty",
    "on_return": "on_return_from_set_aside",
    "on return": "on_return_from_set_aside",
    "after_return": "on_return_from_set_aside",
    "upon return": "on_return_from_set_aside",
    "on_return_to_territory": "on_return_from_set_aside",
    "after_set_aside": "on_return_from_set_aside",
    "return": "on_return_from_set_aside",
    "after_two_turns": "on_return_from_set_aside",
    "after_3_turns": "on_return_from_set_aside",
    "after_4_turns": "on_return_from_set_aside",
    "five turns": "on_turn_start",
    "remains_for_4_turns": "on_turn_start",
    "turn_after_reaching_1_1": "on_turn_start",
    "on_enhancement_interrupted_or_negated": ["on_interrupted", "on_negated"],
    "on_paul_captured_or_removed": ["on_captured", "on_removed_from_battle"],
    "discarded_and_rescue_attempt_fails": "on_failed_rescue",
    "demon is discarded or captured": ["would_be_discarded", "would_be_captured"],
    "your revelation hero is banished, captured, converted or underdecked by an opponent": [
        "on_banished",
        "on_captured",
        "on_converted",
        "on_underdecked",
    ],
    "an opponent's good dominant rescues or discards a card": ["on_rescue", "on_discard"],
    "opponent_end_the_battle": "on_end_battle",
    "evil_ability_used": "on_end_battle",
    "opponent_forces_character_use": "on_activate",
}

# Context-sensitive trigger defaults: (cid, ability_id) -> {activation_mode?, trigger_event?, clear_trigger?, trigger_subject?, trigger_source?}
EXPLICIT_ABILITY_OVERRIDES: Dict[Tuple[str, str], Dict[str, Any]] = {
    # 5 manually_triggered with trigger_event
    ("773830287", "prevent_next_evil_enhancement"): {
        "activation_mode": "triggered",
        "trigger_event": "on_play",
    },
    ("-1792720191", "negate_covenant_discard"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-1819828040", "devouring_birds_block_return"): {
        "activation_mode": "triggered",
        "trigger_event": "after_battle",
        "clear_selectors": True,
    },
    ("744385770", "end_battle_begin_new"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-382054700", "holder_discard_warrior_evil"): {
        "activation_mode": "triggered",
        "trigger_event": "on_successful_rescue",
    },
    # Grapes of Wrath RoA / GoC non-triggered
    ("-1061444159", "end_battle_begin_new"): {"activation_mode": "immediate", "clear_trigger": True},
    # Lost Soul Chaff (-840157467): must be on_rescued + exclude other Lost Soul (Phase 5a promotes except this card -> exclude_self)
    ("-840157467", "lost_soul_chaff_underdeck"): {
        "trigger_event": "on_rescued",
        "trigger_subject": {
            "selection_mode": "automatic_all",
            "zone_owner": "either",
            "scope": ["in_play", "land_of_bondage"],
            "target_type": "lost_soul",
            "exclude_self": True,
        },
    },
    # Non-triggered abilities falsely in triggered list (static / immediate / restrict / limit)
    ("-115429966", "ec_negate_characters_lost_souls"): {"activation_mode": "static", "clear_trigger": True},
    ("-1552459994", "helmet_of_salvation_protect_lost_souls"): {"activation_mode": "static", "clear_trigger": True},
    ("-1318898460", "protect_musicians_from_next_evil_enhancement"): {
        "trigger_event": "on_play",
    },
    ("-2105699545", "protect_sons_of_jacob_from_next_evil_enhancement"): {
        "trigger_event": "on_play",
    },
    ("963874993", "prevent_next_evil_enhancement"): {
        "trigger_event": "on_play",
    },
    ("112834751", "repel_red_brigade"): {"activation_mode": "static", "clear_trigger": True},
    ("867077280", "angry_mob_buff_and_protect"): {"activation_mode": "static", "clear_trigger": True},
    ("2005500989", "prison_ec_negate_protect"): {"activation_mode": "static", "clear_trigger": True},
    ("638935085", "promised_land_limit_discard"): {"activation_mode": "immediate", "clear_trigger": True},
    ("1250500221", "prevent_good_draw_and_protect_from_rescue"): {"trigger_event": "on_band"},
    ("-177140099", "protect_from_different_books_band"): {"trigger_event": "on_band"},
    ("-422167252", "ee_interrupt_battle_play_enhancement_draw"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-409366366", "reveal_hand_if_no_evil"): {"activation_mode": "immediate", "clear_trigger": True},
    ("246872368", "end_battle_if_all_evil_greek"): {"activation_mode": "immediate", "clear_trigger": True},
    ("781945923", "gibeonite_trickery_end_battle"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-1319298208", "return_opponent_evil_character_to_bottom_of_deck"): {"activation_mode": "immediate", "clear_trigger": True},
    ("1142794271", "exodus_egyptian_effect"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-1898350774", "end_battle_if_used_by_emperor"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-1121788287", "heavy_taxes_emperor"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-336576341", "honor_thy_enemy_end_battle"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-2136109374", "underdeck_evil_if_ot_hero"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-605054389", "negate_evil_card_if_used_by_priest"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-526400141", "nt_hero_draw_two"): {"activation_mode": "immediate", "clear_trigger": True},
    ("1316410190", "return_to_top_if_canaanite_philistine"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-1966776058", "destroying_the_temple_ability"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-282366754", "false_witnesses_capture"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-1557648696", "discard_artifact_if_used_by_meek_hero"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-1557648696", "take_ot_artifact_from_reserve_if_used_by_meek_hero"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-500454065", "discard_demon_if_genesis_hero"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-500454065", "convert_human_evil_character_if_genesis_hero"): {"activation_mode": "immediate", "clear_trigger": True},
    ("369158611", "underdeck_if_multi_brigade_magician"): {"activation_mode": "immediate", "clear_trigger": True},
    ("1949982372", "add_taken_heroes_to_battle"): {"activation_mode": "immediate", "clear_trigger": True},
    ("2011322691", "add_taken_heroes_to_battle"): {"activation_mode": "immediate", "clear_trigger": True},
    ("1133140715", "divination_look_takehand_topdeck"): {"activation_mode": "immediate", "clear_trigger": True},
    ("1133140715", "divination_look_takehand_underdeck"): {"activation_mode": "immediate", "clear_trigger": True},
    ("1133140715", "divination_look_addbattle_topdeck"): {"activation_mode": "immediate", "clear_trigger": True},
    ("1133140715", "divination_look_addbattle_underdeck"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-231532652", "holy_unto_the_lord_shuffle_evil_characters"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-1407061728", "capture_hero_if_used_by_egyptian"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-428609774", "banish_male_female_evil_samson"): {"activation_mode": "immediate", "clear_trigger": True},
    ("1394601865", "used_by_prophet_take_from_deck"): {"activation_mode": "immediate", "clear_trigger": True},
    ("1394601865", "used_by_blocking_prophet_reserve_this_card"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-992141468", "elhanan_blocked_giant_play_enhancement"): {"trigger_event": "on_blocked"},
    ("192892147", "hero_conditional_banish_protect"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-1116685202", "opponent_discard_artifact_instead"): {"activation_mode": "immediate", "clear_trigger": True},
    ("1167184355", "owner_discard_good_card_instead"): {"activation_mode": "immediate", "clear_trigger": True},
    ("1814552187", "trembling_demon_opponent_negate"): {"activation_mode": "immediate", "clear_trigger": True},
    ("-666697691", "envy_topdeck_reserve"): {"trigger_event": ["on_exchange", "on_search"]},
    ("-666697691", "envy_draw_two"): {"trigger_event": "on_draw"},
    ("1119795234", "ashkelon_site_discard"): {"trigger_event": "on_enters_site"},
    ("1119795234", "ashkelon_fort_draw"): {"trigger_event": "upkeep"},
    ("-1142609134", "babel_site_take_evil_ot_human"): {"trigger_event": "on_play"},
    ("-462000859", "upkeep_reserve_take_good_card"): {"trigger_event": "upkeep"},
    ("696031614", "hebron_site_draw_if_giant_blocks"): {"trigger_event": "on_block"},
    ("939679284", "nineveh_site_ability"): {"trigger_event": "on_enters_site"},
    ("859819185", "samaria_fort_take_reserve"): {"trigger_event": "on_block"},
    ("-1350670986", "sychar_fort_draw"): {"trigger_event": "on_reserved"},
    ("-213262997", "draw_if_gray_discarded"): {"trigger_event": "on_discard"},
    ("2005920135", "protect_meek_lost_souls_if_not_revealed_each_good_brigade"): {"activation_mode": "immediate", "clear_trigger": True},
    ("2005920135", "prevent_next_good_card_when_blocking"): {"trigger_event": "on_block"},
    ("1163240448", "ability_2"): {"trigger_event": "on_rescue"},
    ("-1006199933", "evil_character_gain_when_blocking_rescue"): {"trigger_event": "on_block"},
    ("-2090466743", "evil_character_gain_when_blocking_rescue"): {"trigger_event": "on_block"},
    ("513165601", "place_evil_characters"): {"trigger_event": "after_draw_phase"},
    ("513165601", "remove_evil_characters"): {"trigger_event": "after_draw_phase"},
    ("513165601", "exchange_evil_characters"): {"trigger_event": "after_draw_phase"},
    ("-1812037992", "discard_opposite_when_discarded"): {"trigger_event": "on_discarded"},
    ("984593844", "discard_evil_on_win_battle"): {"trigger_event": "on_win_battle"},
    ("388381318", "enhance_activate_and_discard"): {"trigger_event": "on_enters_battle"},
    ("-213074732", "withdraw_if_discarded"): {"trigger_event": "would_be_discarded"},
    ("2108070068", "capture_if_defeated"): {"trigger_event": "on_defeated"},
    ("454416128", "temptation_wilderness_banish_to_add_angel"): {"activation_mode": "manually_triggered", "clear_trigger": True},
    ("-1828165989", "assyria_tribute_negate"): {"trigger_event": "on_block"},
    # Misclassified immediate / manually_triggered abilities that ARE triggered
    ("-978550881", "ab_3_discard"): {"activation_mode": "triggered", "trigger_event": "after_battle"},
    ("1482900311", "draw_if_attacking_limit_3"): {"activation_mode": "triggered", "trigger_event": "on_attack"},
    ("1676890855", "discard_royal_human_after_battle"): {"activation_mode": "triggered", "trigger_event": "after_battle"},
    ("-1004752518", "draw_if_attacking"): {"activation_mode": "triggered", "trigger_event": "on_attack"},
    ("-643369192", "discard_if_blocking"): {"activation_mode": "triggered", "trigger_event": "on_block"},
    ("1576695943", "band_to_evil_warrior_if_blocking"): {"activation_mode": "triggered", "trigger_event": "on_block"},
    ("1576695943", "topdeck_meek_lost_soul_if_blocking"): {"activation_mode": "triggered", "trigger_event": "on_block"},
    ("-1395471304", "draw_if_attacking"): {"activation_mode": "triggered", "trigger_event": "on_attack"},
    ("1618077959", "discard_evil_character_after_battle"): {"activation_mode": "triggered", "trigger_event": "after_battle"},
    ("1456445054", "take_ot_clay_if_attacking"): {"activation_mode": "triggered", "trigger_event": "on_attack"},
    ("953045732", "band_if_blocked_by_non_human"): {"activation_mode": "triggered", "trigger_event": "on_blocked"},
    ("16135360", "release_barabbas_if_captured"): {"activation_mode": "triggered", "trigger_event": "end_of_turn"},
    ("1344044830", "discard_territory_character_shuffle_after_battle"): {"activation_mode": "triggered", "trigger_event": "after_battle"},
    ("-689120544", "discard_on_capture"): {"activation_mode": "triggered", "trigger_event": "on_captured"},
    ("1228725586", "return_any_cards_to_top_of_deck_during_discard_phase"): {"activation_mode": "manually_triggered", "clear_trigger": True},
    ("1487393298", "discard_top_of_deck_each_upkeep"): {"activation_mode": "triggered", "trigger_event": "upkeep"},
    ("-566445267", "draw_when_lone_isamuel_attacks"): {"activation_mode": "triggered", "trigger_event": "on_attack"},
    ("-43469145", "doomed_conspirators_otherwise_discard_after_battle"): {"activation_mode": "triggered", "trigger_event": "after_battle"},
    ("1317727649", "negate_good_when_blocking"): {"activation_mode": "triggered", "trigger_event": "on_block"},
    ("618190496", "take_enhancement_from_opponent_discard_if_blocking"): {"activation_mode": "triggered", "trigger_event": "on_block"},
    ("637824990", "ignore_good_strength_when_blocking_jacob"): {"activation_mode": "triggered", "trigger_event": "on_block"},
    ("-975757998", "take_ot_brown_human_if_attacking"): {"activation_mode": "triggered", "trigger_event": "on_attack"},
    ("53858989", "play_first_enhancement_after_blocker"): {"activation_mode": "triggered", "trigger_event": "on_present"},
    ("-1764443543", "take_evil_nt_from_reserve_if_blocking"): {"activation_mode": "triggered", "trigger_event": "on_block"},
    ("-1077552689", "jerusalem_hero_enters_battle_underdeck_james"): {"activation_mode": "triggered", "trigger_event": "on_enters_battle"},
    ("819433421", "reserve_self_if_played_in_battle"): {"activation_mode": "triggered", "trigger_event": "on_play"},
    ("241633187", "place_negate_paralyze"): {"activation_mode": "triggered", "trigger_event": "after_battle"},
    ("-1905868256", "toss_good_enhancement_if_lone_warrior_blocked"): {"activation_mode": "triggered", "trigger_event": "on_blocked"},
}


def _strip_empty_branch(d: Dict[str, Any]) -> Dict[str, Any]:
    """Ensures a selector dict conforms cleanly when promoted to trigger_subject/trigger_source."""
    out = copy.deepcopy(d)
    if not out.get("selection_mode"):
        out["selection_mode"] = "automatic_all"
    if not out.get("scope"):
        out["scope"] = ["in_play"]
    return out


def _clause_matches_text(ab_id: str, sa: str, effects: List[Dict[str, Any]]) -> str:
    """Finds the best matching sentence/clause inside SA for a given ability_id/effect list."""
    if not sa:
        return ""
    sentences = [s.strip() for s in re.split(r"(?<=[.!?])\s+|\s*\n\s*", sa) if s.strip()]
    if len(sentences) <= 1:
        return sa
    toks = [t for t in ab_id.lower().split("_") if len(t) >= 3 and t not in ("ability", "the", "and", "from", "with", "card", "cards", "for")]
    best_s = sentences[0]
    best_score = -1
    for s in sentences:
        low = s.lower()
        score = sum(2 for t in toks if t in low)
        for ef in effects or []:
            act = str(ef.get("action") or "").lower().replace("_", " ")
            if act and act in low:
                score += 1
        if score > best_score:
            best_score = score
            best_s = s
    return best_s


def _infer_missing_trigger_from_context(
    ab: Dict[str, Any], raw_ability: str
) -> Union[str, List[str]]:
    """Deterministically infers canonical TriggerEvent for a triggered ability missing trigger_event."""
    ab_id = str(ab.get("ability_id") or "").lower()
    mods = [str(m.get("modifier_type") or "").lower() for m in ab.get("modifiers") or []]
    clause = _clause_matches_text(ab_id, raw_ability, ab.get("effects") or [])
    low = f"{ab_id.replace('_', ' ')} | {clause.lower()}"

    # High-confidence explicit trigger phrasing in ability_id or matched clause
    if "each upkeep" in clause.lower() or "upkeep" in ab_id:
        return TriggerEvent.UPKEEP.value
    if "following draw phase" in clause.lower() or "after draw phase" in clause.lower():
        return TriggerEvent.AFTER_DRAW_PHASE.value
    if "discard phase" in clause.lower() or "discard_phase" in ab_id:
        return TriggerEvent.DISCARD_PHASE.value
    if "preparation phase" in clause.lower() or "prep_phase" in ab_id:
        return TriggerEvent.PREPARATION_PHASE.value
    if "each turn" in clause.lower():
        return TriggerEvent.ON_TURN_START.value
    if "end of current player's next turn" in clause.lower() or "end_of_next_turn" in low or "end of turn" in clause.lower():
        return TriggerEvent.END_OF_TURN.value
    if "reaches */0 or less" in clause.lower() or "reduced to */0 or less" in clause.lower() or "zero_toughness" in ab_id or "when_zero" in ab_id:
        return TriggerEvent.ON_ZERO_TOUGHNESS.value
    if "instead" in mods or "instead" in clause.lower():
        if re.search(r"harmed\s+or\s+defeated", clause, re.I) or "harmed_defeated" in ab_id:
            return [TriggerEvent.WOULD_BE_HARMED.value, TriggerEvent.WOULD_BE_DEFEATED.value]
        if re.search(r"banished,\s*captured,\s*converted\s+or\s+underdecked", clause, re.I):
            return [
                TriggerEvent.WOULD_BE_BANISHED.value,
                TriggerEvent.WOULD_BE_CAPTURED.value,
                TriggerEvent.WOULD_BE_CONVERTED.value,
                TriggerEvent.WOULD_BE_UNDERDECKED.value,
            ]
        if re.search(r"removes\s+a\s+lost\s+soul\s+from\s+play|removed\s+from\s+play|leaves\s+play", clause, re.I):
            return TriggerEvent.WOULD_BE_BANISHED.value
        if re.search(r"about\s+to\s+be\s+discarded|is\s+discarded|discards\s+your|discard\s+a", clause, re.I) or "discard" in ab_id:
            return TriggerEvent.WOULD_BE_DISCARDED.value
        if "banishes" in clause.lower() or "banish" in ab_id:
            return TriggerEvent.WOULD_BE_BANISHED.value
        if "harm" in ab_id or "harmed" in clause.lower():
            return TriggerEvent.WOULD_BE_HARMED.value
    if "following battle" in clause.lower() or "after battle" in clause.lower() or "after_battle" in ab_id or "after_play" in ab_id or "end of battle" in clause.lower():
        return TriggerEvent.ON_PLAY.value if "after_play" in ab_id or "after play" in clause.lower() else TriggerEvent.AFTER_BATTLE.value
    if re.search(r"on\s+return|upon\s+return|returns?\s+from", clause, re.I) or "on_return" in ab_id:
        return TriggerEvent.ON_RETURN_FROM_SET_ASIDE.value
    if re.search(r"returns?\s+to\s+territory|return(?:s)?\s+to\s+owner'?s?\s+territory", clause, re.I):
        return TriggerEvent.ON_RETURNED_TO_TERRITORY.value
    if re.search(r"leaves?\s+(?:the\s+)?(?:field\s+of\s+)?battle", clause, re.I) or "leaves_battle" in ab_id:
        return TriggerEvent.ON_LEAVES_BATTLE.value
    if re.search(r"leaves?\s+(?:the\s+)?(?:field\s+of\s+)?play", clause, re.I) or "leaves_play" in ab_id or "hero_leaves" in ab_id:
        return TriggerEvent.ON_LEAVES_PLAY.value
    if "removed from battle" in clause.lower() or "removed from play" in clause.lower():
        return TriggerEvent.ON_REMOVED_FROM_BATTLE.value
    if re.search(r"harmed\s+or\s+defeated", clause, re.I):
        return [TriggerEvent.ON_HARMED.value, TriggerEvent.ON_DEFEATED.value]
    if "harmed" in clause.lower() or "harms" in clause.lower():
        return TriggerEvent.ON_HARMED.value
    if "about to be discarded" in clause.lower() or "is being discarded" in clause.lower():
        return TriggerEvent.WOULD_BE_DISCARDED.value
    if re.search(r"\b(?:is|are)\s+discarded\b|discard(?:ed|s)\s+by\s+an\s+opponent", clause, re.I) or "when_discarded" in ab_id or "if_discarded" in ab_id or "discard_trigger" in ab_id:
        return TriggerEvent.ON_DISCARDED.value
    if re.search(r"captured", clause, re.I) or "capture" in ab_id:
        if "capture a hero" in clause.lower() or "when you capture" in clause.lower() or "if you capture" in clause.lower():
            return TriggerEvent.ON_CAPTURE.value
        return TriggerEvent.ON_CAPTURED.value
    if re.search(r"deactivated", clause, re.I) or "deactivated" in ab_id:
        return TriggerEvent.ON_DEACTIVATED.value
    if re.search(r"presents?\s+(?:an\s+)?evil\s+character|blocker\s+is\s+presented", clause, re.I):
        return TriggerEvent.ON_PRESENT.value
    if re.search(r"enters?\s+battle", clause, re.I) or "enter_battle" in ab_id or "enters_battle" in ab_id:
        return TriggerEvent.ON_ENTERS_BATTLE.value
    if re.search(r"(?:following|after)\s+(?:a\s+|your\s+)?successful\s+rescue|is\s+involved\s+in\s+a\s+successful\s+rescue|makes\s+a\s+successful\s+rescue", clause, re.I) or "successful_rescue" in ab_id or "on_rescue" in ab_id:
        return TriggerEvent.ON_SUCCESSFUL_RESCUE.value
    if re.search(r"win\s+this\s+battle|wins\s+(?:a\s+|the\s+)?battle", clause, re.I) or "win_battle" in ab_id:
        return TriggerEvent.ON_WIN_BATTLE.value
    if re.search(r"begins?\s+a\s+rescue|rescue\s+is\s+attempted|during\s+a\s+rescue\s+attempt", clause, re.I) or "rescue_attempt" in ab_id or "begins_rescue" in ab_id:
        return TriggerEvent.ON_RESCUE_ATTEMPT.value
    if re.search(r"lost\s+soul\s+is\s+rescued|rescues?\s+a\s+lost\s+soul", clause, re.I):
        return TriggerEvent.ON_RESCUE.value if re.search(r"rescues?\s+a\s+lost\s+soul", clause, re.I) else TriggerEvent.ON_RESCUED.value
    if re.search(r"(?:is|was)\s+defeated|opponent\s+defeats|is\s+defeated", clause, re.I) or "defeated" in ab_id:
        return TriggerEvent.ON_DEFEATED.value
    if re.search(r"blocked\s+from\s+hand", clause, re.I) or "blocked_from_hand" in ab_id:
        return TriggerEvent.ON_BLOCKED.value
    if re.search(r"if\s+blocking|while\s+(?:you\s+are\s+)?blocking|when\s+blocking|blocks?\b", clause, re.I) or "block" in ab_id and "blocked" not in clause.lower():
        if re.search(r"\b(?:successfully\s+blocks?)\b", clause, re.I):
            return TriggerEvent.ON_SUCCESSFUL_BLOCK.value
        return TriggerEvent.ON_BLOCK.value
    if re.search(r"\bis\s+blocked\b|\bif\s+blocked\b|blocked\s+by", clause, re.I) or "blocked" in ab_id:
        return TriggerEvent.ON_BLOCKED.value
    if re.search(r"\battacks?\b|if\s+attacking|while\s+attacking", clause, re.I) or "attack" in ab_id:
        return TriggerEvent.ON_ATTACKED.value if "you are attacked" in clause.lower() or "are attacked" in clause.lower() else TriggerEvent.ON_ATTACK.value
    if re.search(r"you\s+are\s+attacked|if\s+attacked", clause, re.I):
        return TriggerEvent.ON_ATTACKED.value
    if re.search(r"targets?\s+your|targets?\s+this|is\s+targeted", clause, re.I):
        return TriggerEvent.ON_TARGETED.value
    if re.search(r"draws?\s+because\s+of|uses\s+(?:a\s+|an\s+.*?)\s*draw\s+ability|draws?\s+a\s+card|draws?\s+cards", clause, re.I) or "draw" in ab_id:
        return TriggerEvent.ON_DRAW.value
    if re.search(r"uses\s+(?:a\s+|an\s+.*?)\s*search\s+ability|searches\s+", clause, re.I) or "used_search" in ab_id or "search_trigger" in ab_id:
        return TriggerEvent.ON_SEARCH.value
    if re.search(r"uses\s+(?:a\s+|an\s+.*?)\s*discard\s+ability", clause, re.I):
        return TriggerEvent.ON_DISCARD.value
    if re.search(r"exchanges?\s+to\s+or\s+takes", clause, re.I):
        return [TriggerEvent.ON_EXCHANGE.value, TriggerEvent.ON_PUT_IN_PLAY.value]
    if re.search(r"put\s+in\s+(?:your\s+|a\s+)?territory", clause, re.I):
        return TriggerEvent.ON_PUT_IN_TERRITORY.value
    if re.search(r"placed?\s+in\s+(?:this|a)\s+site|put\s+in\s+a\s+site|put\s+here", clause, re.I):
        return TriggerEvent.ON_ENTERS_SITE.value
    if re.search(r"puts?\s+.*?\s+in\s+play|put\s+in\s+play", clause, re.I):
        return TriggerEvent.ON_PUT_IN_PLAY.value
    if re.search(r"if\s+played\s+in\s+battle|if\s+played\s+from\s+hand|when\s+played|when\s+you\s+play|plays?\s+an?\s+|has\s+played", clause, re.I):
        return TriggerEvent.ON_PLAY.value
    if re.search(r"uses?\s+a\s+.*?\s*card\s+during\s+a\s+successful\s+rescue", clause, re.I):
        return TriggerEvent.ON_SUCCESSFUL_RESCUE.value
    if re.search(r"used\s+by\s+", clause, re.I):
        return TriggerEvent.ON_PLAY.value
    return TriggerEvent.ON_PLAY.value


def _refine_ambiguous_trigger(
    canon: Union[str, List[str]], raw_trig: str, clause: str, ab_id: str, mods: List[str]
) -> Union[str, List[str]]:
    """Refines legacy ambiguous trigger tokens ('discard', 'play', 'rescue', etc.) using clause grammar."""
    if isinstance(canon, list):
        if "instead" in mods or "instead" in clause.lower():
            repl_map = {
                "on_discarded": "would_be_discarded",
                "on_discard": "would_be_discarded",
                "on_harmed": "would_be_harmed",
                "on_defeated": "would_be_defeated",
                "on_banished": "would_be_banished",
                "on_captured": "would_be_captured",
                "on_converted": "would_be_converted",
                "on_underdecked": "would_be_underdecked",
            }
            return [repl_map.get(c, c) for c in canon]
        return canon

    low_trig = raw_trig.strip().lower()
    low_clause = clause.lower()
    is_instead = "instead" in mods and ("instead" in low_clause or "would " in low_clause or "about to " in low_clause)

    if low_trig in ("discard", "on_discard"):
        if is_instead or "about to be discarded" in low_clause or "is being discarded" in low_clause or "removes" in low_clause:
            return TriggerEvent.WOULD_BE_DISCARDED.value
        if re.search(r"\b(?:is|are|was|were)\s+discarded\b|discarded\s+by\b", low_clause) or (
            "uses" not in low_clause and "discard ability" not in low_clause and "opponent discards" not in low_clause and "if you discard" not in low_clause
        ):
            return TriggerEvent.ON_DISCARDED.value if re.search(r"\b(?:is|are)\s+discarded\b|discarded\b", low_clause) else TriggerEvent.ON_DISCARD.value
        return TriggerEvent.ON_DISCARD.value

    if low_trig in ("on_rescue", "rescue"):
        if re.search(r"\b(?:lost\s+soul|character|hero)\s+(?:is|are)\s+rescued\b|another\s+lost\s+soul\s+is\s+rescued", low_clause):
            return TriggerEvent.ON_RESCUED.value
        if re.search(r"successful\s+rescue|rescue\s+is\s+successful", low_clause):
            return TriggerEvent.ON_SUCCESSFUL_RESCUE.value
        return TriggerEvent.ON_RESCUE.value

    if low_trig in ("banish", "remove_from_game"):
        if is_instead or "being removed" in low_clause or "would be removed" in low_clause:
            return TriggerEvent.WOULD_BE_BANISHED.value
        if re.search(r"\b(?:is|are)\s+banished\b|\b(?:is|are)\s+removed\s+from\s+the\s+game\b", low_clause):
            return TriggerEvent.ON_BANISHED.value
        return TriggerEvent.ON_BANISH.value

    if low_trig in ("capture", "on_capture"):
        if re.search(r"\b(?:is|are|was|were)\s+captured\b|taken\s+prisoner|discarded\s+or\s+captured", low_clause):
            return TriggerEvent.ON_CAPTURED.value
        return TriggerEvent.ON_CAPTURE.value

    if low_trig == "draw":
        if is_instead:
            return TriggerEvent.WOULD_DRAW.value
        return TriggerEvent.ON_DRAW.value

    if low_trig == "search":
        if is_instead and "searches" not in low_clause:
            return TriggerEvent.WOULD_SEARCH.value
        return TriggerEvent.ON_SEARCH.value

    if low_trig in ("harmed", "on_harm", "harm", "on_card_harmed"):
        if is_instead:
            return TriggerEvent.WOULD_BE_HARMED.value
        return TriggerEvent.ON_HARMED.value

    if low_trig in ("defeat", "defeated"):
        if is_instead:
            return TriggerEvent.WOULD_BE_DEFEATED.value
        return TriggerEvent.ON_DEFEATED.value

    if low_trig in ("draw_phase",):
        if "following draw phase" in low_clause or "after draw phase" in low_clause:
            return TriggerEvent.AFTER_DRAW_PHASE.value
        return TriggerEvent.DRAW_PHASE.value

    return canon


def _split_trigger_filter(
    raw_trig: str,
    canon: Union[str, List[str]],
    tf: Optional[Dict[str, Any]],
    clause: str,
    existing_subj: Optional[Dict[str, Any]],
    existing_src: Optional[Dict[str, Any]],
) -> Tuple[Optional[Dict[str, Any]], Optional[Dict[str, Any]]]:
    """Splits legacy trigger_filter + compound trigger_event strings into trigger_subject & trigger_source."""
    subj = copy.deepcopy(existing_subj) if existing_subj else None
    src = copy.deepcopy(existing_src) if existing_src else None
    low_trig = raw_trig.strip().lower()
    low_clause = clause.lower()
    first_canon = canon[0] if isinstance(canon, list) else canon

    # If trigger_filter exists and neither subject nor source was already migrated, place it accurately
    if tf and subj is None and src is None:
        tf_clean = _strip_empty_branch(tf)
        tf_type = str(tf_clean.get("target_type") or "")
        tf_zo = str(tf_clean.get("zone_owner") or "")
        is_by_tf = False
        if first_canon in (
            "on_blocked",
            "on_defeated",
            "on_harmed",
            "on_targeted",
            "on_attacked",
            "on_banished",
            "on_captured",
            "on_discarded",
            "would_be_discarded",
            "would_be_banished",
            "would_be_captured",
            "would_be_harmed",
            "would_be_defeated",
        ):
            # When the card triggers on "blocked by [evil_character]" or "defeated by [Paul/Silas]" or "uses an evil discard ability"
            if re.search(r"\bblocked\s+by\b|\bdefeated\s+by\b|\btargeted\s+by\b", low_clause) and tf_type in (
                "evil_character",
                "character",
                "enhancement",
                "card",
            ) and "your " not in low_clause:
                is_by_tf = True
            elif first_canon == "on_defeated" and tf_clean.get("card_titles") in (["Paul", "Silas"],):
                is_by_tf = True
            elif low_trig in ("blocked_from_hand", "blocked from hand", "on_blocked_from_hand", "on_block_from_hand"):
                if tf_type == "evil_character" or tf_clean.get("alignment") == "evil" or tf_clean.get("scope") == ["hand"]:
                    is_by_tf = True
        if is_by_tf:
            src = tf_clean
        else:
            subj = tf_clean

    # Enrich trigger_source for blocked-from-hand triggers
    if low_trig in ("blocked_from_hand", "blocked from hand", "on_blocked_from_hand", "on_block_from_hand") or (
        "blocked from hand" in low_clause and first_canon == "on_blocked"
    ):
        if src is None:
            src = {
                "selection_mode": "automatic_all",
                "zone_owner": "opponent",
                "scope": ["hand"],
                "target_type": "evil_character",
                "alignment": "evil",
            }
        else:
            src["scope"] = ["hand"]

    # Enrich embedded subjects/sources from long legacy compound trigger strings
    if low_trig == "son of god is played":
        if subj is None:
            subj = {
                "selection_mode": "automatic_all",
                "zone_owner": "both",
                "scope": ["in_play"],
                "card_titles": ["Son of God"],
            }
    elif low_trig == "opponent_plays_dominant":
        if subj is None:
            subj = {
                "selection_mode": "automatic_all",
                "zone_owner": "opponent",
                "scope": ["in_play"],
                "target_type": "dominant",
            }
        if src is None:
            src = {"selection_mode": "automatic_all", "zone_owner": "opponent", "scope": ["in_play"]}
    elif low_trig == "opponent_plays_good_dominant":
        if subj is None:
            subj = {
                "selection_mode": "automatic_all",
                "zone_owner": "opponent",
                "scope": ["in_play"],
                "target_type": "dominant",
                "alignment": "good",
            }
    elif low_trig == "hero reaches */0 or less":
        if subj is None:
            subj = {
                "selection_mode": "automatic_all",
                "zone_owner": "both",
                "scope": ["in_play"],
                "target_type": "hero",
                "alignment": "good",
            }
    elif low_trig == "lost_soul_put_here":
        if subj is None:
            subj = {
                "selection_mode": "automatic_all",
                "zone_owner": "both",
                "scope": ["in_play"],
                "target_type": "lost_soul",
            }
    elif re.search(r"by_opponent|by an opponent", low_trig) and src is None:
        src = {
            "selection_mode": "automatic_all",
            "zone_owner": "opponent",
            "scope": ["in_play"],
            "target_type": "card",
        }

    return subj, src


def _ensure_used_by_condition(ab: Dict[str, Any], tf: Dict[str, Any]) -> None:
    """Preserves a legacy trigger_filter on a re-classified immediate 'If used by X' ability inside conditions."""
    if not tf:
        return
    conds = list(ab.get("conditions") or [])
    if not conds:
        sel = _strip_empty_branch(tf)
        conds.append({"condition_type": "zone_check", "selector": sel, "operator": ">=", "value": 1})
        ab["conditions"] = conds


def _migrate_side_phase4(card_id: str, side_key: str, side: Dict[str, Any], raw_ability: str) -> None:
    """Migrates all abilities on a single card side to Phase 4 trigger specifications.

    Args:
        card_id: Canonical card ID string.
        side_key: Card side ('top', 'bottom', 'shared', 'star').
        side: Side AST dict modified in place.
        raw_ability: Printed ability text string for context matching.

    Returns:
        None.
    """
    abilities = side.get("abilities") or []
    for ab in abilities:
        ab_id = str(ab.get("ability_id") or "")
        mods = [str(m.get("modifier_type") or "").lower() for m in ab.get("modifiers") or []]
        legacy_tf = ab.pop("trigger_filter", None)
        if not isinstance(legacy_tf, dict):
            legacy_tf = None

        override = EXPLICIT_ABILITY_OVERRIDES.get((card_id, ab_id))
        if override:
            if override.get("activation_mode"):
                ab["activation_mode"] = override["activation_mode"]
            if override.get("clear_trigger"):
                if legacy_tf is not None:
                    _ensure_used_by_condition(ab, legacy_tf)
                ab["trigger_event"] = None
                ab["trigger_subject"] = None
                ab["trigger_source"] = None
                # Also normalize King Zimri ab_3_discard target away from bogus identifier noise
                if card_id == "-978550881" and ab_id == "ab_3_discard":
                    pass
                continue
            if override.get("clear_selectors"):
                ab["trigger_subject"] = None
                ab["trigger_source"] = None
            if override.get("trigger_event") is not None:
                ab["trigger_event"] = override["trigger_event"]
            if override.get("trigger_subject") is not None:
                ab["trigger_subject"] = copy.deepcopy(override["trigger_subject"])
            if override.get("trigger_source") is not None:
                ab["trigger_source"] = copy.deepcopy(override["trigger_source"])

        # King Zimri ab_3_discard special fix: self-discard after one block
        if card_id == "-978550881" and ab_id == "ab_3_discard":
            ab["activation_mode"] = "triggered"
            ab["trigger_event"] = "after_battle"
            for ef in ab.get("effects") or []:
                ef["target"] = {
                    "selection_mode": "automatic_self",
                    "zone_owner": "controller",
                    "scope": ["battle"],
                    "target_type": "evil_character",
                    "alignment": "evil",
                    "count": {"fixed_value": 1},
                }

        mode = str(ab.get("activation_mode") or "immediate")
        if mode != "triggered":
            # Ensure non-triggered abilities never carry dangling trigger fields
            if ab.get("trigger_event") is not None:
                ab["trigger_event"] = None
            if ab.get("trigger_subject") is not None or legacy_tf is not None:
                if legacy_tf is not None and mode == "immediate":
                    _ensure_used_by_condition(ab, legacy_tf)
                ab["trigger_subject"] = None
            if ab.get("trigger_source") is not None:
                ab["trigger_source"] = None
            continue

        # mode == "triggered"
        if ab.get("is_star"):
            ab["trigger_event"] = TriggerEvent.STAR_PHASE.value
            if legacy_tf and not ab.get("trigger_subject"):
                ab["trigger_subject"] = _strip_empty_branch(legacy_tf)
            continue

        raw_trig = ab.get("trigger_event")
        clause = _clause_matches_text(ab_id, raw_ability, ab.get("effects") or [])

        # Determine canonical TriggerEvent value or list
        if raw_trig is None or (isinstance(raw_trig, str) and not raw_trig.strip()):
            inferred = _infer_missing_trigger_from_context(ab, raw_ability)
            ab["trigger_event"] = inferred
            raw_trig_str = ""
        elif isinstance(raw_trig, list):
            mapped_list: List[str] = []
            for item in raw_trig:
                item_s = str(item or "").strip()
                item_low = item_s.lower()
                if item_s in _CANONICAL_SET:
                    val = item_s
                else:
                    mapped = EXPLICIT_TRIGGER_MAP.get(item_low, item_s)
                    if isinstance(mapped, list):
                        for m_i in mapped:
                            if m_i not in mapped_list:
                                mapped_list.append(m_i)
                        continue
                    val = mapped
                if val not in mapped_list:
                    mapped_list.append(val)
            ab["trigger_event"] = mapped_list[0] if len(mapped_list) == 1 else mapped_list
            raw_trig_str = " ".join(str(x) for x in raw_trig)
        else:
            raw_trig_str = str(raw_trig).strip()
            low_trig = raw_trig_str.lower()
            if raw_trig_str in _CANONICAL_SET:
                canon: Union[str, List[str]] = _refine_ambiguous_trigger(raw_trig_str, raw_trig_str, clause, ab_id, mods)
            elif low_trig in EXPLICIT_TRIGGER_MAP:
                canon = _refine_ambiguous_trigger(EXPLICIT_TRIGGER_MAP[low_trig], raw_trig_str, clause, ab_id, mods)
            else:
                # Fallback normalization for whitespace/casing variants
                norm_key = re.sub(r"[^a-z0-9]+", "_", low_trig).strip("_")
                if norm_key in _CANONICAL_SET:
                    canon = _refine_ambiguous_trigger(norm_key, raw_trig_str, clause, ab_id, mods)
                elif f"on_{norm_key}" in _CANONICAL_SET:
                    canon = _refine_ambiguous_trigger(f"on_{norm_key}", raw_trig_str, clause, ab_id, mods)
                else:
                    canon = _infer_missing_trigger_from_context(ab, raw_ability)
            ab["trigger_event"] = canon

        subj, src = _split_trigger_filter(
            raw_trig_str,
            ab["trigger_event"],
            legacy_tf,
            clause,
            ab.get("trigger_subject"),
            ab.get("trigger_source"),
        )
        ab["trigger_subject"] = subj
        ab["trigger_source"] = src


def _side_raw_text(card_id: str, side_key: str, ext_by_id: Dict[str, Dict[str, Any]]) -> str:
    """Gets printed SpecialAbility text for fallback matching when AI raw_ability is empty."""
    ext = ext_by_id.get(card_id) or {}
    sides = ext.get("CardSides") or {}
    side_node = sides.get(side_key) or sides.get("top") or sides.get("shared") or {}
    return str(side_node.get("SpecialAbility") or ext.get("SpecialAbility") or "")


def run_migration(dry_run: bool = False) -> Dict[str, Any]:
    """Executes Phase 4 trigger migration across AI and RAW datasets cleanly.

    Args:
        dry_run: If True, computes stats and validates without writing files to disk.

    Returns:
        Summary dictionary with modified counts and validation error diagnostics.
    """
    ext_cards = json.loads(EXT_FILE.read_text(encoding="utf-8"))["cards"]
    ext_by_id = {str(c["Id"]): c for c in ext_cards}
    linker = CardLinker(ext_cards)

    ai_data = json.loads(AI_FILE.read_text(encoding="utf-8"))
    raw_data = json.loads(RAW_FILE.read_text(encoding="utf-8"))

    ai_modified = 0
    raw_modified = 0
    validation_errors: List[str] = []

    for key, entry in ai_data.items():
        ast = entry.get("ast")
        if not ast:
            continue
        work = copy.deepcopy(ast)
        cid = str(entry.get("card_id") or key.rsplit("_", 1)[0])
        side_key = str(entry.get("side") or "top")
        raw_ab = str(entry.get("raw_ability") or _side_raw_text(cid, side_key, ext_by_id))
        _migrate_side_phase4(cid, side_key, work, raw_ab)
        try:
            validated = CardSideLogic.model_validate(work)
            link_side_logic_targets(validated, linker)
            normalized = validated.model_dump(mode="json", exclude_none=True)
        except Exception as exc:
            validation_errors.append(f"AI {key}: {exc}")
            continue
        if normalized != ast:
            ai_modified += 1
            entry["ast"] = normalized

    for cid, card_entry in raw_data.items():
        sides = card_entry.get("sides") or {}
        for sk, side_ast in list(sides.items()):
            work = copy.deepcopy(side_ast)
            raw_ab = _side_raw_text(str(cid), str(sk), ext_by_id)
            _migrate_side_phase4(str(cid), str(sk), work, raw_ab)
            try:
                validated = CardSideLogic.model_validate(work)
                link_side_logic_targets(validated, linker)
                normalized = validated.model_dump(mode="json", exclude_none=True)
            except Exception as exc:
                validation_errors.append(f"RAW {cid}_{sk}: {exc}")
                continue
            if normalized != side_ast:
                raw_modified += 1
                sides[sk] = normalized

    if not dry_run and not validation_errors:
        if ai_modified:
            AI_FILE.write_text(json.dumps(ai_data, indent=2, ensure_ascii=False), encoding="utf-8")
        if raw_modified:
            RAW_FILE.write_text(json.dumps(raw_data, indent=2, ensure_ascii=False), encoding="utf-8")

    return {
        "dry_run": dry_run,
        "ai_modified": ai_modified,
        "raw_modified": raw_modified,
        "validation_errors": validation_errors[:25],
        "validation_error_count": len(validation_errors),
    }


def main() -> None:
    """CLI entry point for Phase 4 trigger migration."""
    parser = argparse.ArgumentParser(description="Migrate legacy trigger_event and trigger_filter to Phase 4 AST schema.")
    parser.add_argument("--dry-run", action="store_true", help="Validate and report changes without writing files.")
    args = parser.parse_args()
    summary = run_migration(dry_run=args.dry_run)
    print(json.dumps(summary, indent=2, ensure_ascii=False))
    if summary["validation_errors"]:
        sys.exit(1)


if __name__ == "__main__":
    main()
