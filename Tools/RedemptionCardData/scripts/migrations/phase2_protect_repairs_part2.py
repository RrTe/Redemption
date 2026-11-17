"""Curated REG v11.1.0 AST repairs for remaining protection_filter cards (Part 2)."""

from __future__ import annotations

from typing import Any, Dict

from scripts.migrations.phase2_ast_builders import (
    ab,
    cond,
    dv_all,
    dv_int,
    eff,
    mod,
    pf,
    sel,
    side,
)

PROTECT_REPAIRS_PART2: Dict[str, Dict[str, Any]] = {
    "-1949698876_top": side([
        ab(
            "aaron_band_to_miriam",
            activation_mode="immediate",
            is_optional=True,
            effects=[
                eff(1, "band", target=sel("manual_controller", "controller", ["in_play", "hand"], "hero", "good", card_titles=["Miriam"], count=dv_int(1))),
            ],
        ),
        ab(
            "holy_of_holies_protected_from_discard",
            activation_mode="static",
            conditions=[cond("zone_check", sel("automatic_all", "controller", ["in_play"], "hero", "good", card_titles=["Aaron"]), ">=", 1)],
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel("automatic_all", "both", ["in_play"], "artifact", card_titles=["Holy of Holies"], count=dv_int(1)),
                    protection_filter=pf(actions=["discard"]),
                ),
            ],
        ),
    ]),
    "1728300639_top": side([
        ab(
            "abels_sacrifice_protection",
            activation_mode="static",
            is_preventable=False,
            is_interruptible=False,
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="this_turn",
                    target=sel("automatic_self", "controller", ["in_play", "battle"], "enhancement", "good"),
                    protection_filter=pf(actions=["interrupt", "prevent"]),
                ),
                eff(
                    2,
                    "protect",
                    effect_type="ongoing",
                    duration="this_turn",
                    target=sel("automatic_all", "controller", ["in_play", "battle"], "enhancement", "good"),
                    protection_filter=pf(actions=["interrupt", "prevent"]),
                ),
            ],
            modifiers=[mod("cannot_be_interrupted"), mod("cannot_be_prevented")],
        ),
    ]),
    "-381378507_top": side(
        [
            ab(
                "protect_adam",
                activation_mode="static",
                effects=[
                    eff(
                        1,
                        "protect",
                        effect_type="ongoing",
                        duration="permanent",
                        target=sel("automatic_self", "controller", ["in_play"], "hero", "good"),
                        protection_filter=pf(
                            from_harm=True,
                            card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "character", is_human=False)],
                        ),
                    ),
                ],
            ),
            ab(
                "topdeck_antediluvian_human",
                activation_mode="immediate",
                is_optional=True,
                choice_group="adam_reserve",
                effects=[
                    eff(
                        1,
                        "topdeck",
                        target=sel("manual_controller", "controller", ["reserve_pile"], "character", is_human=True, identifiers=["Antediluvian"], count=dv_int(1)),
                        destination="deck",
                        destination_position="top",
                    ),
                ],
            ),
            ab(
                "topdeck_genesis_enhancement",
                activation_mode="immediate",
                is_optional=True,
                choice_group="adam_reserve",
                effects=[
                    eff(
                        1,
                        "topdeck",
                        target=sel("manual_controller", "controller", ["reserve_pile"], "enhancement", references=["Genesis 1-7"], count=dv_int(1)),
                        destination="deck",
                        destination_position="top",
                    ),
                ],
            ),
            ab(
                "band_to_eve",
                activation_mode="immediate",
                is_optional=True,
                effects=[
                    eff(1, "band", target=sel("manual_controller", "controller", ["in_play", "hand"], "hero", "good", card_titles=["Eve"], count=dv_int(1))),
                ],
            ),
            ab(
                "adam_cannot_be_interrupted",
                activation_mode="static",
                conditions=[cond("zone_check", sel("automatic_all", "both", ["in_play"], "character", is_human=True), ">=", 1)],
                effects=[],
                modifiers=[mod("cannot_be_interrupted", applies_to="this_side")],
            ),
        ],
    ),
    "1142905143_top": side([
        ab(
            "altar_of_incense_protect_ot_heroes",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_all", "both", ["in_play"], "hero", "good", testament="OT"),
                    protection_filter=pf(
                        actions=["discard"],
                        card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "enhancement", "evil")],
                    ),
                ),
            ],
        ),
    ]),
    "-259437110_top": side([
        ab(
            "negate_and_underdeck_curse_or_idol",
            activation_mode="immediate",
            effects=[
                eff(1, "negate", target=sel("manual_controller", "both", ["in_play"], "card", alignment="evil", identifiers=["Curse", "Idol"], count=dv_int(1))),
                eff(
                    2,
                    "underdeck",
                    target=sel("chained_target", "both", ["in_play"], "card", ref_step=1),
                    destination="deck",
                    destination_position="bottom",
                    dependency="if_previous_successful",
                ),
            ],
        ),
        ab(
            "protect_enhancements_when_hero_blocked",
            activation_mode="static",
            conditions=[
                cond("zone_check", sel("automatic_all", "controller", ["battle"], "hero", "good", references=["Revelation"], identifiers=["Priest", "Musician"]), "==", 1),
                cond("count_comparison", sel("automatic_all", "opponent", ["battle"], "evil_character", "evil"), ">", 1),
            ],
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel("automatic_all", "controller", ["in_play", "battle"], "enhancement", "good", identifiers=["used by that Hero"]),
                    protection_filter=pf(
                        actions=["negate"],
                        card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "card", alignment="evil")],
                    ),
                ),
            ],
            modifiers=[mod("cannot_be_negated")],
        ),
    ]),
    "1719368921_top": side([
        ab(
            "heal_and_protect_hero",
            activation_mode="immediate",
            effects=[
                eff(1, "heal", target=sel("manual_controller", "both", ["in_play"], "hero", "good", count=dv_int(1))),
                eff(
                    2,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("chained_target", "both", ["in_play"], "hero", "good", ref_step=1),
                    protection_filter=pf(actions=["decrease"], qualifiers=["below face value"]),
                ),
            ],
        ),
    ]),
    "-983416521_top": side(
        [
            ab(
                "protect_nt_lost_souls_and_clay_heroes",
                activation_mode="static",
                is_preventable=False,
                effects=[
                    eff(
                        1,
                        "protect",
                        effect_type="ongoing",
                        duration="permanent",
                        target=sel("automatic_all", "both", ["in_play"], "lost_soul", testament="NT"),
                        protection_filter=pf(
                            from_harm=True,
                            card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "evil_character", "evil", identifiers=["Pharisee", "Sadducee", "Heretic"])],
                        ),
                    ),
                    eff(
                        2,
                        "protect",
                        effect_type="ongoing",
                        duration="permanent",
                        target=sel("automatic_all", "both", ["in_play"], "hero", "good", brigades=["Clay"]),
                        protection_filter=pf(
                            from_harm=True,
                            card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "evil_character", "evil", identifiers=["Pharisee", "Sadducee", "Heretic"])],
                        ),
                    ),
                ],
                modifiers=[mod("cannot_be_prevented")],
            ),
            ab(
                "band_to_mark",
                activation_mode="immediate",
                is_optional=True,
                is_preventable=False,
                effects=[eff(1, "band", target=sel("manual_controller", "controller", ["in_play", "hand"], "hero", "good", card_titles=["Mark"], count=dv_int(1)))],
                modifiers=[mod("cannot_be_prevented")],
            ),
            ab(
                "search_opponent_deck_for_lost_soul",
                activation_mode="immediate",
                is_preventable=False,
                effects=[eff(1, "search", target=sel("manual_controller", "opponent", ["deck"], "lost_soul", count=dv_int(1)), destination="in_play")],
                modifiers=[mod("cannot_be_prevented")],
            ),
        ],
        modifiers=[mod("cannot_be_prevented", applies_to="this_side")],
    ),
    "1250141641_top": side([
        ab(
            "hero_immune_to_lies",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "immune",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_self", "controller", ["in_play"], "hero", "good"),
                    protection_filter=pf(card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "card", identifiers=["Lie", "Lies"])]),
                ),
            ],
        ),
    ]),
    "-985833588_top": side([
        ab(
            "blinding_light_convert_and_protect",
            activation_mode="immediate",
            effects=[
                eff(1, "convert", target=sel("manual_controller", "controller", ["in_play"], "evil_character", "evil", testament="NT", count=dv_int(1))),
                eff(
                    2,
                    "protect",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel("chained_target", "controller", ["territory"], "hero", "good", ref_step=1),
                    protection_filter=pf(from_harm=True, card_sources=[sel("automatic_all", "opponent", ["in_play", "battle"], "card")]),
                ),
            ],
        ),
    ]),
    "126690624_shared": side([
        ab(
            "blindness_immunity",
            activation_mode="static",
            conditions=[cond("zone_check", sel("automatic_all", "both", ["in_play"], "card", alignment="evil", identifiers=["on a Hero"]), ">=", 1)],
            effects=[
                eff(
                    1,
                    "immune",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel("automatic_all", "controller", ["in_play"], "evil_character", "evil", identifiers=["Demon"]),
                    protection_filter=pf(card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "hero", "good")]),
                ),
            ],
        ),
    ]),
    "800790413_top": side(
        [
            ab(
                "play_meek_ls_protect",
                activation_mode="manually_triggered",
                is_optional=True,
                is_preventable=False,
                costs=[eff(1, "play", target=sel("manual_controller", "controller", ["deck"], "lost_soul", identifiers=["Meek"], count=dv_int(1)), destination="in_play")],
                effects=[
                    eff(
                        2,
                        "protect",
                        effect_type="ongoing",
                        duration="this_turn",
                        target=sel("automatic_self", "controller", ["in_play"], "evil_character", "evil"),
                        protection_filter=pf(
                            from_harm=True,
                            card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "card", identifiers=["selected brigade"])],
                        ),
                        dependency="if_previous_successful",
                    ),
                ],
                modifiers=[mod("cannot_be_prevented")],
            ),
            ab(
                "underdeck_meek_ls_after_battle",
                activation_mode="triggered",
                is_optional=True,
                is_preventable=False,
                trigger_event="end_of_battle",
                effects=[
                    eff(1, "underdeck", target=sel("manual_controller", "controller", ["in_play", "land_of_bondage"], "lost_soul", identifiers=["Meek"], count=dv_int(1)), destination="deck", destination_position="bottom"),
                ],
                modifiers=[mod("cannot_be_prevented")],
            ),
        ],
        modifiers=[mod("cannot_be_prevented", applies_to="this_side")],
    ),
    "-289407171_top": side([
        ab(
            "band_to_elisha",
            activation_mode="immediate",
            is_optional=True,
            effects=[eff(1, "band", target=sel("manual_controller", "controller", ["in_play", "hand"], "hero", "good", card_titles=["Elisha"], count=dv_int(1)))],
        ),
        ab(
            "protected_from_discard_evil",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_self", "controller", ["in_play"], "hero", "good"),
                    protection_filter=pf(actions=["discard"], card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "card", alignment="evil")]),
                ),
            ],
        ),
        ab(
            "prophets_site_access",
            activation_mode="static",
            conditions=[cond("zone_check", sel("automatic_all", "controller", ["in_play"], "card", card_titles=["Elijah's Mantle"]), ">=", 1)],
            effects=[eff(1, "site access", effect_type="ongoing", duration="while_condition", target=sel("automatic_all", "both", ["battle"], "character", identifiers=["Prophet"]))],
        ),
    ]),
    "1168904300_shared": side([
        ab(
            "forty_years_ability",
            activation_mode="immediate",
            is_optional=True,
            effects=[
                eff(1, "protect", effect_type="ongoing", duration="this_turn", target=sel("manual_controller", "both", ["in_play"], "hero", "good", count=dv_int(1)), protection_filter=pf(actions=["underdeck"])),
                eff(2, "protect", effect_type="ongoing", duration="this_turn", target=sel("manual_controller", "both", ["in_play"], "evil_character", "evil", count=dv_int(1)), protection_filter=pf(actions=["underdeck"])),
                eff(3, "underdeck", target=sel("automatic_all", "both", ["in_play"], "character", count=dv_all()), destination="deck", destination_position="bottom"),
                eff(4, "underdeck", target=sel("automatic_all", "both", ["in_play"], "artifact", count=dv_all()), destination="deck", destination_position="bottom"),
            ],
        ),
    ]),
    "-604145472_top": side([
        ab(
            "first_strike_ability",
            activation_mode="static",
            effects=[eff(1, "first strike", effect_type="ongoing", duration="permanent", target=sel("automatic_self", "controller", ["in_play"], "hero", "good"))],
        ),
        ab(
            "protect_from_prevention_by_evil_card",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_self", "controller", ["in_play"], "enhancement", "good"),
                    protection_filter=pf(actions=["prevent"], card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "card", alignment="evil")]),
                ),
            ],
        ),
        ab(
            "ab_3_cannot_be_prevented",
            activation_mode="static",
            conditions=[cond("zone_check", sel("automatic_all", "both", ["in_play"], "card", alignment="evil"), ">=", 1)],
            effects=[],
            modifiers=[mod("cannot_be_prevented", applies_to="this_side")],
        ),
    ]),
    "140587900_top": side([
        ab(
            "golgotha_skull_icon",
            activation_mode="manually_triggered",
            is_optional=True,
            effects=[
                eff(1, "place", target=sel("manual_controller", "controller", ["hand", "discard_pile"], "card", identifiers=["skull icon"], count=dv_int(1)), destination="in_play", creates_context_scope=True),
                eff(
                    2,
                    "protect",
                    effect_type="ongoing",
                    duration="this_turn",
                    target=sel("automatic_all", "both", ["in_play", "battle"], "character", testament="NT"),
                    protection_filter=pf(actions=["ignore"]),
                ),
                eff(3, "return to hand", duration="this_turn", target=sel("chained_target", "controller", ["in_play"], "card", ref_step=1), destination="hand"),
            ],
        ),
    ]),
    "737482411_top": side([
        ab(
            "protect_contents_from_all_effects",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_all", "both", ["territory"], "card", identifiers=["contents"]),
                    protection_filter=pf(from_harm=True, actions=["all effects"]),
                ),
            ],
        ),
        ab(
            "goshen_hold_genesis_exodus_hero_instead",
            activation_mode="triggered",
            is_optional=True,
            trigger_event="discard",
            trigger_filter=sel("automatic_all", "controller", ["battle", "in_play"], "hero", "good", references=["Genesis", "Exodus"], stat_filters=[{"stat": "toughness", "operator": "<=", "value": 0}]),
            effects=[
                eff(
                    1,
                    "place",
                    target=sel("automatic_all", "controller", ["battle", "in_play"], "hero", "good", references=["Genesis", "Exodus"], stat_filters=[{"stat": "toughness", "operator": "<=", "value": 0}], count=dv_int(1)),
                    destination="territory",
                ),
            ],
            modifiers=[mod("instead", trigger_event="discard", replace_with_action="place")],
        ),
    ]),
    "-838332033_top": side([
        ab(
            "place_in_land_of_redemption",
            activation_mode="immediate",
            effects=[eff(1, "place", target=sel("automatic_self", "controller", ["in_play", "hand"], "card"), destination="land_of_redemption")],
        ),
        ab(
            "protect_redeemed_souls",
            activation_mode="static",
            conditions=[cond("zone_check", sel("automatic_all", "controller", ["land_of_redemption"], "card", card_titles=["Guardian Of Your Souls"]), ">=", 1)],
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel("automatic_all", "controller", ["land_of_redemption"], "lost_soul"),
                    protection_filter=pf(actions=["withdraw", "remove from the game"], qualifiers=["Fall Away"]),
                ),
            ],
        ),
    ]),
    "264801956_top": side([
        ab(
            "martha_draw_1_each",
            activation_mode="immediate",
            choice_group="martha_draw",
            effects=[eff(1, "draw", target=sel("automatic_next", "both", ["deck"], "card", count=dv_int(1)), destination="hand")],
        ),
        ab(
            "martha_draw_3_each_female",
            activation_mode="immediate",
            choice_group="martha_draw",
            conditions=[cond("zone_check", sel("automatic_all", "controller", ["battle"], "hero", "good", gender="female"), ">=", 1)],
            effects=[eff(1, "draw", target=sel("automatic_next", "both", ["deck"], "card", count=dv_int(3)), destination="hand")],
        ),
        ab(
            "protect_cards_from_shuffle",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_all", "both", ["hand", "territory"], "card"),
                    protection_filter=pf(actions=["shuffle"]),
                ),
            ],
        ),
        ab(
            "band_nt_hero",
            activation_mode="immediate",
            effects=[eff(1, "band", target=sel("manual_controller", "controller", ["territory", "hand"], "hero", "good", testament="NT", count=dv_int(1)), destination="battle")],
        ),
    ]),
    "-595114592_shared": side([
        ab(
            "protect_holders_heroes_from_ability_reduction",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_all", "controller", ["in_play"], "hero", "good"),
                    protection_filter=pf(actions=["decrease", "modify_stats"], qualifiers=["abilities reduced"]),
                ),
            ],
        ),
        ab(
            "restore_holders_heroes_to_full_abilities",
            activation_mode="immediate",
            effects=[eff(1, "heal", target=sel("automatic_all", "controller", ["in_play"], "hero", "good", count=dv_all()))],
        ),
    ]),
    "2066407389_top": side([
        ab(
            "star_protect_out_of_play",
            is_star=True,
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="until_end_of_phase",
                    target=sel("automatic_all", "both", ["hand", "deck", "discard_pile", "reserve_pile", "set_aside"], "card"),
                    protection_filter=pf(from_harm=True, qualifiers=["from players"]),
                ),
            ],
        ),
        ab(
            "ge_banish_to_banish_evil",
            activation_mode="manually_triggered",
            is_optional=True,
            conditions=[cond("zone_check", sel("automatic_all", "controller", ["battle", "in_play"], "hero", "good", testament="OT"), ">=", 1)],
            costs=[eff(1, "banish", target=sel("automatic_self", "controller", ["in_play", "battle"], "enhancement", "good", count=dv_int(1)), destination="banish_pile")],
            effects=[eff(2, "banish", target=sel("automatic_all", "both", ["battle"], "card", alignment="evil"), destination="banish_pile", dependency="if_previous_successful")],
        ),
    ]),
}
