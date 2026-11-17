"""Curated REG v11.1.0 AST definitions for missing card sides (Part 3)."""

from __future__ import annotations

from typing import Any, Dict

from scripts.migrations.phase2_ast_builders import (
    ab,
    cond,
    dv_all,
    dv_int,
    dv_x,
    eff,
    mod,
    sel,
    side,
)

MISSING_ASTS_PART3: Dict[str, Dict[str, Any]] = {
    "-482711692_top": {
        "card_id": "-482711692",
        "card_name": "Teaching in Parables (GoC)",
        "side": "top",
        "raw_ability": "Negate a card in a territory this turn. Reserve an evil card (except a Dominant) from opponent's hand or an evil card in battle.",
        "ast": side([
            ab(
                "teaching_in_parables_negate",
                effects=[
                    eff(
                        1,
                        "negate",
                        effect_type="ongoing",
                        duration="this_turn",
                        target=sel("manual_controller", "either", ["territory"], "card", count=dv_int(1)),
                    )
                ],
            ),
            ab(
                "teaching_in_parables_reserve_hand",
                choice_group="teaching_in_parables_zone",
                effects=[
                    eff(
                        1,
                        "reserve",
                        destination="reserve_pile",
                        target=sel(
                            "manual_controller",
                            "opponent",
                            ["hand"],
                            "card",
                            "evil",
                            identifiers=["except Dominant"],
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
            ab(
                "teaching_in_parables_reserve_battle",
                choice_group="teaching_in_parables_zone",
                effects=[
                    eff(
                        1,
                        "reserve",
                        destination="reserve_pile",
                        target=sel("manual_controller", "both", ["battle"], "card", "evil", count=dv_int(1)),
                    )
                ],
            ),
        ]),
    },
    "611498000_top": {
        "card_id": "611498000",
        "card_name": "Terah, the Delayed (LoC)",
        "side": "top",
        "raw_ability": "You may reserve your meek Hero to discard an Artifact or evil Enhancement. You may bounce a patriarch in a territory.",
        "ast": side([
            ab(
                "terah_reserve_to_discard",
                is_optional=True,
                costs=[
                    eff(
                        1,
                        "reserve",
                        destination="reserve_pile",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["in_play"],
                            "hero",
                            "good",
                            identifiers=["Meek"],
                            count=dv_int(1),
                        ),
                    )
                ],
                effects=[
                    eff(
                        2,
                        "discard",
                        destination="discard_pile",
                        dependency="if_you_do",
                        target=sel(
                            "manual_controller",
                            "either",
                            ["in_play", "battle"],
                            "artifact",
                            identifiers=["or evil Enhancement"],
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
            ab(
                "terah_bounce_patriarch",
                is_optional=True,
                effects=[
                    eff(
                        1,
                        "bounce",
                        destination="hand",
                        target=sel(
                            "manual_controller",
                            "either",
                            ["territory"],
                            "hero",
                            "good",
                            identifiers=["Patriarch"],
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
        ]),
    },
    "782890259_top": {
        "card_id": "782890259",
        "card_name": "The Afflicted",
        "side": "top",
        "raw_ability": "If opponent puts a Hero in play (except their first one each turn), that player must discard a card from hand.",
        "ast": side([
            ab(
                "the_afflicted_discard",
                activation_mode="triggered",
                trigger_event="opponent_puts_hero_in_play",
                trigger_filter=sel(
                    "automatic_all",
                    "opponent",
                    ["in_play"],
                    "hero",
                    "good",
                    identifiers=["except their first one each turn"],
                ),
                effects=[
                    eff(
                        1,
                        "discard",
                        destination="discard_pile",
                        target=sel("manual_opponent", "opponent", ["hand"], "card", count=dv_int(1)),
                    )
                ],
            )
        ]),
    },
    "428492436_top": {
        "card_id": "428492436",
        "card_name": "The Outcasts",
        "side": "top",
        "raw_ability": "If an opponent puts a Hero in play (except their first one each turn), discard the top or bottom card of their deck.",
        "ast": side([
            ab(
                "the_outcasts_discard_top",
                activation_mode="triggered",
                trigger_event="opponent_puts_hero_in_play",
                trigger_filter=sel(
                    "automatic_all",
                    "opponent",
                    ["in_play"],
                    "hero",
                    "good",
                    identifiers=["except their first one each turn"],
                ),
                choice_group="the_outcasts_deck_pos",
                effects=[
                    eff(
                        1,
                        "discard",
                        destination="discard_pile",
                        destination_position="top",
                        target=sel("automatic_next", "opponent", ["deck"], "card", count=dv_int(1)),
                    )
                ],
            ),
            ab(
                "the_outcasts_discard_bottom",
                activation_mode="triggered",
                trigger_event="opponent_puts_hero_in_play",
                trigger_filter=sel(
                    "automatic_all",
                    "opponent",
                    ["in_play"],
                    "hero",
                    "good",
                    identifiers=["except their first one each turn"],
                ),
                choice_group="the_outcasts_deck_pos",
                effects=[
                    eff(
                        1,
                        "discard",
                        destination="discard_pile",
                        destination_position="bottom",
                        target=sel("automatic_last", "opponent", ["deck"], "card", count=dv_int(1)),
                    )
                ],
            ),
        ]),
    },
    "-449802040_top": {
        "card_id": "-449802040",
        "card_name": "The Ascension (GoC)",
        "side": "top",
        "raw_ability": "Interrupt the battle. You may play a clay Hero from Reserve. Hero may band to any number of N.T. Heroes. Cannot be negated if used by a meek Hero.",
        "ast": side([
            ab(
                "the_ascension_interrupt",
                effects=[eff(1, "interrupt", target=sel("automatic_all", "both", ["battle"], None))],
            ),
            ab(
                "the_ascension_play_band",
                is_optional=True,
                effects=[
                    eff(
                        1,
                        "play",
                        destination="battle",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["reserve_pile"],
                            "hero",
                            "good",
                            brigades=["Clay"],
                            count=dv_int(1),
                        ),
                    ),
                    eff(
                        2,
                        "band",
                        dependency="if_previous_successful",
                        target=sel(
                            "manual_controller",
                            "both",
                            ["in_play", "hand"],
                            "hero",
                            "good",
                            testament="NT",
                            count=dv_all(),
                        ),
                    ),
                ],
            ),
            ab(
                "ab_3_cannot_be_negated",
                activation_mode="static",
                conditions=[
                    cond(
                        "zone_check",
                        sel("automatic_all", "controller", ["battle"], "hero", "good", identifiers=["Meek"]),
                        ">=",
                        1,
                    )
                ],
                effects=[],
                modifiers=[mod("cannot_be_negated", "this_side")],
            ),
        ]),
    },
    "-968459161_top": {
        "card_id": "-968459161",
        "card_name": "The Child is Born (GoC)",
        "side": "top",
        "raw_ability": "Interrupt the battle. You may take a nativity Hero from Reserve. Hero may band to any number of N.T. Heroes.",
        "ast": side([
            ab(
                "the_child_is_born_interrupt",
                effects=[eff(1, "interrupt", target=sel("automatic_all", "both", ["battle"], None))],
            ),
            ab(
                "the_child_is_born_take_band",
                is_optional=True,
                effects=[
                    eff(
                        1,
                        "take",
                        destination="hand",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["reserve_pile"],
                            "hero",
                            "good",
                            identifiers=["Nativity"],
                            count=dv_int(1),
                        ),
                    ),
                    eff(
                        2,
                        "band",
                        target=sel(
                            "manual_controller",
                            "both",
                            ["in_play", "hand"],
                            "hero",
                            "good",
                            testament="NT",
                            count=dv_all(),
                        ),
                    ),
                ],
            ),
        ]),
    },
    "1809872195_top": {
        "card_id": "1809872195",
        "card_name": "The Emmaus Road",
        "side": "top",
        "raw_ability": "You may take a good * card from deck or Reserve. Add it to battle, reserve an evil card in battle or shuffle this card.",
        "ast": side([
            ab(
                "the_emmaus_road_take",
                is_optional=True,
                effects=[
                    eff(
                        1,
                        "take",
                        destination="hand",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["deck", "reserve_pile"],
                            "card",
                            "good",
                            identifiers=["Star"],
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
            ab(
                "the_emmaus_road_add_battle",
                is_optional=True,
                choice_group="emmaus_road_follow",
                effects=[
                    eff(
                        1,
                        "add to battle",
                        destination="battle",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["hand", "territory"],
                            "card",
                            "good",
                            identifiers=["Star"],
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
            ab(
                "the_emmaus_road_reserve_evil",
                is_optional=True,
                choice_group="emmaus_road_follow",
                effects=[
                    eff(
                        1,
                        "reserve",
                        destination="reserve_pile",
                        target=sel("manual_controller", "both", ["battle"], "card", "evil", count=dv_int(1)),
                    )
                ],
            ),
            ab(
                "the_emmaus_road_shuffle_self",
                is_optional=True,
                choice_group="emmaus_road_follow",
                effects=[
                    eff(
                        1,
                        "shuffle",
                        destination="deck",
                        destination_position="random",
                        target=sel("automatic_self", "controller", ["in_play"], "card"),
                    )
                ],
            ),
        ]),
    },
    "1799464164_top": {
        "card_id": "1799464164",
        "card_name": "The Manger (GoC)",
        "side": "top",
        "raw_ability": "Negate an evil or neutral card in play or a set-aside area. If your nativity Hero is blocked, you may draw 1.",
        "ast": side([
            ab(
                "the_manger_negate",
                effects=[
                    eff(
                        1,
                        "negate",
                        target=sel(
                            "manual_controller",
                            "either",
                            ["in_play", "set_aside"],
                            "card",
                            "evil",
                            identifiers=["or neutral"],
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
            ab(
                "the_manger_draw_on_blocked",
                activation_mode="triggered",
                trigger_event="hero_blocked",
                is_optional=True,
                conditions=[
                    cond(
                        "zone_check",
                        sel("automatic_all", "controller", ["battle"], "hero", "good", identifiers=["Nativity"]),
                        ">=",
                        1,
                    )
                ],
                effects=[
                    eff(
                        1,
                        "draw",
                        destination="hand",
                        target=sel("automatic_next", "controller", ["deck"], "card", count=dv_int(1)),
                    )
                ],
            ),
        ]),
    },
    "-1110570060_top": {
        "card_id": "-1110570060",
        "card_name": "Walking on Water (GoC)",
        "side": "top",
        "raw_ability": "Negate an evil card. You may take a good card from Reserve (or add it to battle if you reveal a good Dominant from hand).",
        "ast": side([
            ab(
                "walking_on_water_negate",
                effects=[
                    eff(
                        1,
                        "negate",
                        target=sel("manual_controller", "either", ["in_play", "battle"], "card", "evil", count=dv_int(1)),
                    )
                ],
            ),
            ab(
                "walking_on_water_take_reserve",
                is_optional=True,
                choice_group="walking_on_water_follow",
                effects=[
                    eff(
                        1,
                        "take",
                        destination="hand",
                        target=sel("manual_controller", "controller", ["reserve_pile"], "card", "good", count=dv_int(1)),
                    )
                ],
            ),
            ab(
                "walking_on_water_add_battle",
                is_optional=True,
                choice_group="walking_on_water_follow",
                costs=[
                    eff(
                        1,
                        "reveal",
                        target=sel("manual_controller", "controller", ["hand"], "dominant", "good", count=dv_int(1)),
                    )
                ],
                effects=[
                    eff(
                        2,
                        "add to battle",
                        destination="battle",
                        dependency="if_you_do",
                        target=sel("manual_controller", "controller", ["reserve_pile"], "card", "good", count=dv_int(1)),
                    )
                ],
            ),
        ]),
    },
    "1990914571_top": {
        "card_id": "1990914571",
        "card_name": "Wheat and Tares (GoC)",
        "side": "top",
        "raw_ability": "If used by a Gospel Hero, bounce all Evil Characters. If played in battle, you may draw X (limit 3).",
        "ast": side([
            ab(
                "wheat_and_tares_bounce",
                conditions=[
                    cond(
                        "zone_check",
                        sel("automatic_all", "controller", ["battle"], "hero", "good", identifiers=["Gospel"]),
                        ">=",
                        1,
                    )
                ],
                effects=[
                    eff(
                        1,
                        "bounce",
                        destination="hand",
                        target=sel("automatic_all", "both", ["in_play", "battle"], "evil_character", "evil"),
                    )
                ],
            ),
            ab(
                "wheat_and_tares_draw",
                is_optional=True,
                conditions=[cond("zone_check", sel("automatic_self", "controller", ["battle"], "enhancement"), "==", 1)],
                effects=[
                    eff(
                        1,
                        "draw",
                        destination="hand",
                        target=sel("automatic_next", "controller", ["deck"], "card", count=dv_x(limit=3)),
                    )
                ],
            ),
        ]),
    },
    "-2074729076_top": {
        "card_id": "-2074729076",
        "card_name": "Zechariah, the Renewer",
        "side": "top",
        "raw_ability": "If you control another minor prophet, negate characters (except * cards). If you control another Temple priest, negate Enhancements (except * cards).",
        "ast": side([
            ab(
                "zechariah_negate_chars",
                activation_mode="static",
                conditions=[
                    cond(
                        "zone_check",
                        sel("automatic_all", "controller", ["in_play"], "character", identifiers=["Minor Prophet", "another"]),
                        ">=",
                        1,
                    )
                ],
                effects=[
                    eff(
                        1,
                        "negate",
                        effect_type="ongoing",
                        duration="while_condition",
                        target=sel(
                            "automatic_all",
                            "both",
                            ["in_play", "battle"],
                            "character",
                            identifiers=["except * cards"],
                        ),
                    )
                ],
            ),
            ab(
                "zechariah_negate_enhancements",
                activation_mode="static",
                conditions=[
                    cond(
                        "zone_check",
                        sel("automatic_all", "controller", ["in_play"], "character", identifiers=["Temple Priest", "another"]),
                        ">=",
                        1,
                    )
                ],
                effects=[
                    eff(
                        1,
                        "negate",
                        effect_type="ongoing",
                        duration="while_condition",
                        target=sel(
                            "automatic_all",
                            "both",
                            ["in_play", "battle"],
                            "enhancement",
                            identifiers=["except * cards"],
                        ),
                    )
                ],
            ),
        ]),
    },
    "-2131581443_top": {
        "card_id": "-2131581443",
        "card_name": "Zerubbabel's Plumb Line (LoC)",
        "side": "top",
        "raw_ability": "Topdeck a good card from Reserve (or deck if used by a meek Hero). You may banish up to X evil cards in battle.",
        "ast": side([
            ab(
                "plumb_line_topdeck_reserve",
                choice_group="plumb_line_zone",
                effects=[
                    eff(
                        1,
                        "topdeck",
                        destination="deck",
                        destination_position="top",
                        target=sel("manual_controller", "controller", ["reserve_pile"], "card", "good", count=dv_int(1)),
                    )
                ],
            ),
            ab(
                "plumb_line_topdeck_deck",
                choice_group="plumb_line_zone",
                conditions=[
                    cond(
                        "zone_check",
                        sel("automatic_all", "controller", ["battle"], "hero", "good", identifiers=["Meek"]),
                        ">=",
                        1,
                    )
                ],
                effects=[
                    eff(
                        1,
                        "topdeck",
                        destination="deck",
                        destination_position="top",
                        target=sel("manual_controller", "controller", ["deck"], "card", "good", count=dv_int(1)),
                    )
                ],
            ),
            ab(
                "plumb_line_banish",
                is_optional=True,
                effects=[
                    eff(
                        1,
                        "banish",
                        destination="banish_pile",
                        target=sel("manual_controller", "both", ["battle"], "card", "evil", count=dv_x(min_value=0)),
                    )
                ],
            ),
        ]),
    },
    "1217409452_top": {
        "card_id": "1217409452",
        "card_name": "Star of Bethlehem [Fundraiser]",
        "side": "top",
        "raw_ability": "*: Draw up to X. / D: You may reveal discard pile and up to X cards from hand: Activate up to X good * abilities on those cards and/or cards you control. Limit twice per game.",
        "ast": side([
            ab(
                "star_of_bethlehem_fundraiser_star_draw",
                is_star=True,
                effects=[
                    eff(
                        1,
                        "draw",
                        destination="hand",
                        target=sel("automatic_next", "controller", ["deck"], "card", count=dv_x(min_value=0)),
                    )
                ],
            ),
            ab(
                "bethlehem_star_fundraiser_dominant_activate",
                is_optional=True,
                modifiers=[mod("limit", "this_ability", limit_count=2, limit_per="game")],
                costs=[
                    eff(
                        1,
                        "reveal",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["discard_pile", "hand"],
                            "card",
                            count=dv_x(min_value=0),
                        ),
                    )
                ],
                effects=[
                    eff(
                        2,
                        "activate an ability",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["in_play", "discard_pile", "hand"],
                            "card",
                            "good",
                            identifiers=["Star"],
                            count=dv_x(min_value=0),
                        ),
                    )
                ],
            ),
        ]),
    },
    "-299906329_top": {
        "card_id": "-299906329",
        "card_name": "Out of Egypt",
        "side": "top",
        "raw_ability": "Take a Hero from Reserve. Discard the bottom card of an opponent's deck.",
        "ast": side([
            ab(
                "out_of_egypt_take",
                effects=[
                    eff(
                        1,
                        "take",
                        destination="hand",
                        target=sel("manual_controller", "controller", ["reserve_pile"], "hero", "good", count=dv_int(1)),
                    )
                ],
            ),
            ab(
                "out_of_egypt_discard_bottom",
                effects=[
                    eff(
                        1,
                        "discard",
                        destination="discard_pile",
                        destination_position="bottom",
                        target=sel("automatic_last", "opponent", ["deck"], "card", count=dv_int(1)),
                    )
                ],
            ),
        ]),
    },
    "1824516505_top": {
        "card_id": "1824516505",
        "card_name": "Redeeming Branch",
        "side": "top",
        "raw_ability": "Look at the top 6 cards of deck: Take a Hero or * card.",
        "ast": side([
            ab(
                "redeeming_branch_look_take",
                effects=[
                    eff(
                        1,
                        "look",
                        creates_context_scope=True,
                        target=sel("automatic_next", "controller", ["deck"], "card", count=dv_int(6)),
                    ),
                    eff(
                        2,
                        "take",
                        destination="hand",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["context_scope"],
                            "hero",
                            "good",
                            identifiers=["or Star card"],
                            count=dv_int(1),
                        ),
                    ),
                ],
            )
        ]),
    },
    "2041975464_top": {
        "card_id": "2041975464",
        "card_name": "Judah, the Leader (LoC)",
        "side": "top",
        "raw_ability": "Negate an evil or neutral card in play or set aside area. May band to a patriarch. Cannot be interrupted.",
        "ast": side(
            [
                ab(
                    "judah_leader_negate",
                    is_interruptible=False,
                    effects=[
                        eff(
                            1,
                            "negate",
                            target=sel(
                                "manual_controller",
                                "either",
                                ["in_play", "set_aside"],
                                "card",
                                "evil",
                                identifiers=["or neutral"],
                                count=dv_int(1),
                            ),
                        )
                    ],
                ),
                ab(
                    "judah_leader_band",
                    is_optional=True,
                    is_interruptible=False,
                    effects=[
                        eff(
                            1,
                            "band",
                            target=sel(
                                "manual_controller",
                                "both",
                                ["in_play", "hand"],
                                "hero",
                                "good",
                                identifiers=["Patriarch"],
                                count=dv_int(1),
                            ),
                        )
                    ],
                ),
            ],
            modifiers=[mod("cannot_be_interrupted", "this_side")],
        ),
    },
    "-475807847_top": {
        "card_id": "-475807847",
        "card_name": "Restoring the Afflicted (GoC)",
        "side": "top",
        "raw_ability": "If used by a Gospel Hero, negate and reserve an evil or neutral card. You may draw 1.",
        "ast": side([
            ab(
                "restoring_afflicted_negate_reserve",
                conditions=[
                    cond(
                        "zone_check",
                        sel("automatic_all", "controller", ["battle"], "hero", "good", identifiers=["Gospel"]),
                        ">=",
                        1,
                    )
                ],
                effects=[
                    eff(
                        1,
                        "negate",
                        target=sel(
                            "manual_controller",
                            "either",
                            ["in_play", "battle"],
                            "card",
                            "evil",
                            identifiers=["or neutral"],
                            count=dv_int(1),
                        ),
                    ),
                    eff(
                        2,
                        "reserve",
                        destination="reserve_pile",
                        dependency="if_previous_successful",
                        target=sel("chained_target", "either", ["in_play"], "card", ref_step=1),
                    ),
                ],
            ),
            ab(
                "restoring_afflicted_draw",
                is_optional=True,
                effects=[
                    eff(
                        1,
                        "draw",
                        destination="hand",
                        target=sel("automatic_next", "controller", ["deck"], "card", count=dv_int(1)),
                    )
                ],
            ),
        ]),
    },
}
