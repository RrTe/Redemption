"""Curated REG v11.1.0 AST definitions for missing card sides and StarAbilities (Part 1)."""

from __future__ import annotations

from typing import Any, Dict

from scripts.migrations.phase2_ast_builders import (
    ab,
    cond,
    dv_all,
    dv_int,
    dv_up_to,
    dv_x,
    eff,
    mod,
    sel,
    side,
)

MISSING_ASTS_PART1: Dict[str, Dict[str, Any]] = {
    "-1954555198_star": {
        "card_id": "-1954555198",
        "card_name": "Beelzebub (GoC)",
        "side": "star",
        "raw_ability": "STAR: Discard top card of deck and a Hero.",
        "ast": side([
            ab(
                "star_beelzebub_discard",
                is_star=True,
                effects=[
                    eff(
                        1,
                        "discard",
                        destination="discard_pile",
                        destination_position="top",
                        target=sel("automatic_next", "controller", ["deck"], "card", count=dv_int(1)),
                    ),
                    eff(
                        2,
                        "discard",
                        destination="discard_pile",
                        target=sel("manual_controller", "both", ["in_play"], "hero", "good", count=dv_int(1)),
                    ),
                ],
            )
        ]),
    },
    "-2025746467_star": {
        "card_id": "-2025746467",
        "card_name": "Beelzebub [UR+] (GoC)",
        "side": "star",
        "raw_ability": "STAR: Discard top card of deck and a Hero.",
        "ast": side([
            ab(
                "star_beelzebub_discard",
                is_star=True,
                effects=[
                    eff(
                        1,
                        "discard",
                        destination="discard_pile",
                        destination_position="top",
                        target=sel("automatic_next", "controller", ["deck"], "card", count=dv_int(1)),
                    ),
                    eff(
                        2,
                        "discard",
                        destination="discard_pile",
                        target=sel("manual_controller", "both", ["in_play"], "hero", "good", count=dv_int(1)),
                    ),
                ],
            )
        ]),
    },
    "2122692611_star": {
        "card_id": "2122692611",
        "card_name": "Assyrian Laborers",
        "side": "star",
        "raw_ability": "STAR: Play this character.",
        "ast": side([
            ab(
                "star_play_self",
                is_star=True,
                effects=[
                    eff(
                        1,
                        "play",
                        destination="territory",
                        target=sel("automatic_self", "controller", ["hand"], "evil_character", "evil"),
                    )
                ],
            )
        ]),
    },
    "2122692611_top": {
        "card_id": "2122692611",
        "card_name": "Assyrian Laborers",
        "side": "top",
        "raw_ability": "If played from hand, you may reserve a card from hand to activate a pale green Curse from Reserve on this card.",
        "ast": side([
            ab(
                "assyrian_laborers_activate_curse",
                activation_mode="triggered",
                trigger_event="played_from_hand",
                is_optional=True,
                costs=[
                    eff(
                        1,
                        "reserve",
                        destination="reserve_pile",
                        target=sel("manual_controller", "controller", ["hand"], "card", count=dv_int(1)),
                    )
                ],
                effects=[
                    eff(
                        2,
                        "activate an artifact",
                        destination="in_play",
                        dependency="if_you_do",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["reserve_pile"],
                            "curse",
                            "evil",
                            brigades=["Pale Green"],
                            identifiers=["on this card"],
                            count=dv_int(1),
                        ),
                    )
                ],
            )
        ]),
    },
    "-967245192_top": {
        "card_id": "-967245192",
        "card_name": "Transgressors",
        "side": "top",
        "raw_ability": "If played from hand, you may reserve a card from hand to activate a brown Curse from Reserve on this card.",
        "ast": side([
            ab(
                "transgressors_activate_curse",
                activation_mode="triggered",
                trigger_event="played_from_hand",
                is_optional=True,
                costs=[
                    eff(
                        1,
                        "reserve",
                        destination="reserve_pile",
                        target=sel("manual_controller", "controller", ["hand"], "card", count=dv_int(1)),
                    )
                ],
                effects=[
                    eff(
                        2,
                        "activate an artifact",
                        destination="in_play",
                        dependency="if_you_do",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["reserve_pile"],
                            "curse",
                            "evil",
                            brigades=["Brown"],
                            identifiers=["on this card"],
                            count=dv_int(1),
                        ),
                    )
                ],
            )
        ]),
    },
    "973131797_top": {
        "card_id": "973131797",
        "card_name": "Covenant of Eden (PoC)",
        "side": "top",
        "raw_ability": "Negate other dual icon cards. If you play another one, discard this card.",
        "ast": side([
            ab(
                "covenant_of_eden_negate_dual",
                activation_mode="static",
                effects=[
                    eff(
                        1,
                        "negate",
                        effect_type="ongoing",
                        duration="permanent",
                        target=sel(
                            "automatic_all",
                            "both",
                            ["in_play"],
                            "card",
                            identifiers=["other", "dual icon"],
                        ),
                    )
                ],
            ),
            ab(
                "covenant_of_eden_self_discard",
                activation_mode="triggered",
                trigger_event="play_card",
                trigger_filter=sel(
                    "automatic_all",
                    "controller",
                    ["in_play"],
                    "card",
                    identifiers=["another", "dual icon"],
                ),
                effects=[
                    eff(
                        1,
                        "discard",
                        destination="discard_pile",
                        target=sel("automatic_self", "controller", ["in_play"], "covenant", "good"),
                    )
                ],
            ),
        ]),
    },
    "973131797_bottom": {
        "card_id": "973131797",
        "card_name": "Covenant of Eden (PoC)",
        "side": "bottom",
        "raw_ability": "Take a Genesis human from deck (or Reserve if used by Adam or Eve).",
        "ast": side([
            ab(
                "covenant_of_eden_take_deck",
                choice_group="covenant_of_eden_zone",
                effects=[
                    eff(
                        1,
                        "take",
                        destination="hand",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["deck"],
                            "character",
                            is_human=True,
                            references=["Genesis"],
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
            ab(
                "covenant_of_eden_take_reserve",
                choice_group="covenant_of_eden_zone",
                conditions=[
                    cond(
                        "zone_check",
                        sel("automatic_all", "controller", ["battle"], "hero", "good", card_titles=["Adam", "Eve"]),
                        ">=",
                        1,
                    )
                ],
                effects=[
                    eff(
                        1,
                        "take",
                        destination="hand",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["reserve_pile"],
                            "character",
                            is_human=True,
                            references=["Genesis"],
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
        ]),
    },
    "-1782881223_top": {
        "card_id": "-1782881223",
        "card_name": "Covenant of Palestine (PoC)",
        "side": "top",
        "raw_ability": "Discard an evil card from Reserve to take a Site or City and play it.",
        "ast": side([
            ab(
                "covenant_palestine_top",
                costs=[
                    eff(
                        1,
                        "discard",
                        destination="discard_pile",
                        target=sel("manual_controller", "controller", ["reserve_pile"], "card", "evil", count=dv_int(1)),
                    )
                ],
                effects=[
                    eff(
                        2,
                        "take",
                        destination="hand",
                        dependency="if_you_do",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["deck"],
                            "site",
                            identifiers=["or City"],
                            count=dv_int(1),
                        ),
                    ),
                    eff(
                        3,
                        "play",
                        destination="territory",
                        dependency="if_previous_successful",
                        target=sel("chained_target", "controller", ["hand"], "site", ref_step=2, count=dv_int(1)),
                    ),
                ],
            )
        ]),
    },
    "-1782881223_bottom": {
        "card_id": "-1782881223",
        "card_name": "Covenant of Palestine (PoC)",
        "side": "bottom",
        "raw_ability": "Release all captured Heroes to discard up to X evil cards.",
        "ast": side([
            ab(
                "covenant_palestine_bottom",
                costs=[
                    eff(
                        1,
                        "release",
                        destination="territory",
                        target=sel("automatic_all", "both", ["land_of_bondage"], "hero", "good"),
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
                            "card",
                            "evil",
                            count=dv_x(min_value=0),
                        ),
                    )
                ],
            )
        ]),
    },
    "1381610582_bottom": {
        "card_id": "1381610582",
        "card_name": "Covenant with Adam (PoC)",
        "side": "bottom",
        "raw_ability": "Negate an evil card. You may reveal a good Dominant from hand to return this card to hand after battle.",
        "ast": side([
            ab(
                "covenant_adam_negate",
                effects=[
                    eff(
                        1,
                        "negate",
                        target=sel("manual_controller", "either", ["in_play", "battle"], "card", "evil", count=dv_int(1)),
                    )
                ],
            ),
            ab(
                "covenant_adam_bounce",
                is_optional=True,
                activation_mode="triggered",
                trigger_event="after_battle",
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
                        "bounce",
                        destination="hand",
                        dependency="if_you_do",
                        target=sel("automatic_self", "controller", ["in_play"], "enhancement", "good"),
                    )
                ],
            ),
        ]),
    },
    "2020698611_top": {
        "card_id": "2020698611",
        "card_name": "Covenant with David (PoC)",
        "side": "top",
        "raw_ability": "If you do not control a king, you may take a king from deck.",
        "ast": side([
            ab(
                "covenant_david_take_king",
                is_optional=True,
                conditions=[
                    cond(
                        "zone_check",
                        sel("automatic_all", "controller", ["in_play"], "character", identifiers=["King"]),
                        "==",
                        0,
                    )
                ],
                effects=[
                    eff(
                        1,
                        "take",
                        destination="hand",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["deck"],
                            "character",
                            identifiers=["King"],
                            count=dv_int(1),
                        ),
                    )
                ],
            )
        ]),
    },
    "2020698611_bottom": {
        "card_id": "2020698611",
        "card_name": "Covenant with David (PoC)",
        "side": "bottom",
        "raw_ability": "You may play a Site or good Fortress from deck (or Reserve if used by David).",
        "ast": side([
            ab(
                "covenant_david_play_deck",
                is_optional=True,
                choice_group="covenant_david_zone",
                effects=[
                    eff(
                        1,
                        "play",
                        destination="territory",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["deck"],
                            "site",
                            identifiers=["or good Fortress"],
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
            ab(
                "covenant_david_play_reserve",
                is_optional=True,
                choice_group="covenant_david_zone",
                conditions=[
                    cond(
                        "zone_check",
                        sel("automatic_all", "controller", ["battle"], "hero", "good", card_titles=["David"]),
                        ">=",
                        1,
                    )
                ],
                effects=[
                    eff(
                        1,
                        "play",
                        destination="territory",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["reserve_pile"],
                            "site",
                            identifiers=["or good Fortress"],
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
        ]),
    },
    "2047453172_top": {
        "card_id": "2047453172",
        "card_name": "Covenant with Moses (PoC)",
        "side": "top",
        "raw_ability": "You may take a Tabernacle Artifact from deck or a Curse from Reserve.",
        "ast": side([
            ab(
                "covenant_moses_take_artifact",
                is_optional=True,
                choice_group="covenant_moses_top",
                effects=[
                    eff(
                        1,
                        "take",
                        destination="hand",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["deck"],
                            "artifact",
                            identifiers=["Tabernacle"],
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
            ab(
                "covenant_moses_take_curse",
                is_optional=True,
                choice_group="covenant_moses_top",
                effects=[
                    eff(
                        1,
                        "take",
                        destination="hand",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["reserve_pile"],
                            "curse",
                            "evil",
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
        ]),
    },
    "2047453172_bottom": {
        "card_id": "2047453172",
        "card_name": "Covenant with Moses (PoC)",
        "side": "bottom",
        "raw_ability": "Draw up to X (limit 3 unless played in battle). Cannot be prevented.",
        "ast": side(
            [
                ab(
                    "covenant_moses_draw_limit3",
                    is_preventable=False,
                    choice_group="covenant_moses_draw",
                    effects=[
                        eff(
                            1,
                            "draw",
                            destination="hand",
                            target=sel(
                                "automatic_next",
                                "controller",
                                ["deck"],
                                "card",
                                count=dv_x(limit=3, min_value=0),
                            ),
                        )
                    ],
                ),
                ab(
                    "covenant_moses_draw_in_battle",
                    is_preventable=False,
                    choice_group="covenant_moses_draw",
                    conditions=[
                        cond("zone_check", sel("automatic_self", "controller", ["battle"], "enhancement"), "==", 1)
                    ],
                    effects=[
                        eff(
                            1,
                            "draw",
                            destination="hand",
                            target=sel(
                                "automatic_next",
                                "controller",
                                ["deck"],
                                "card",
                                count=dv_x(min_value=0),
                            ),
                        )
                    ],
                ),
            ],
            modifiers=[mod("cannot_be_prevented", "this_side")],
        ),
    },
    "-1594853387_top": {
        "card_id": "-1594853387",
        "card_name": "Cursed Ground",
        "side": "top",
        "raw_ability": "If attacked and you control no evil humans, you may underdeck this card to take an evil human from deck or Reserve.",
        "ast": side([
            ab(
                "cursed_ground_top",
                activation_mode="triggered",
                trigger_event="attacked",
                is_optional=True,
                conditions=[
                    cond(
                        "zone_check",
                        sel("automatic_all", "controller", ["in_play"], "evil_character", "evil", is_human=True),
                        "==",
                        0,
                    )
                ],
                costs=[
                    eff(
                        1,
                        "underdeck",
                        destination="deck",
                        destination_position="bottom",
                        target=sel("automatic_self", "controller", ["in_play"], "curse", "evil"),
                    )
                ],
                effects=[
                    eff(
                        2,
                        "take",
                        destination="hand",
                        dependency="if_you_do",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["deck", "reserve_pile"],
                            "evil_character",
                            "evil",
                            is_human=True,
                            count=dv_int(1),
                        ),
                    )
                ],
            )
        ]),
    },
    "-1594853387_bottom": {
        "card_id": "-1594853387",
        "card_name": "Cursed Ground",
        "side": "bottom",
        "raw_ability": "Decrease opponent's humans X/X.",
        "ast": side([
            ab(
                "cursed_ground_decrease_humans",
                effects=[
                    eff(
                        1,
                        "decrease",
                        effect_type="ongoing",
                        duration="this_turn",
                        target=sel(
                            "automatic_all",
                            "opponent",
                            ["in_play", "battle"],
                            "character",
                            is_human=True,
                            count=dv_x(),
                        ),
                    )
                ],
            )
        ]),
    },
    "168335151_star": {
        "card_id": "168335151",
        "card_name": "Delivered",
        "side": "star",
        "raw_ability": "STAR: Discard the top card of each opponent's deck.",
        "ast": side([
            ab(
                "star_delivered_discard_top",
                is_star=True,
                effects=[
                    eff(
                        1,
                        "discard",
                        destination="discard_pile",
                        destination_position="top",
                        target=sel("automatic_next", "opponent", ["deck"], "card", count=dv_int(1)),
                    )
                ],
            )
        ]),
    },
    "168335151_shared": {
        "card_id": "168335151",
        "card_name": "Delivered",
        "side": "shared",
        "raw_ability": "Activate an Artifact from deck (or Reserve if you control an Egyptian).",
        "ast": side([
            ab(
                "delivered_activate_deck",
                choice_group="delivered_zone",
                effects=[
                    eff(
                        1,
                        "activate an artifact",
                        destination="in_play",
                        target=sel("manual_controller", "controller", ["deck"], "artifact", count=dv_int(1)),
                    )
                ],
            ),
            ab(
                "delivered_activate_reserve",
                choice_group="delivered_zone",
                conditions=[
                    cond(
                        "zone_check",
                        sel("automatic_all", "controller", ["in_play"], "character", identifiers=["Egyptian"]),
                        ">=",
                        1,
                    )
                ],
                effects=[
                    eff(
                        1,
                        "activate an artifact",
                        destination="in_play",
                        target=sel("manual_controller", "controller", ["reserve_pile"], "artifact", count=dv_int(1)),
                    )
                ],
            ),
        ]),
    },
    "1765230277_bottom": {
        "card_id": "1765230277",
        "card_name": "Hope",
        "side": "bottom",
        "raw_ability": "Interrupt the battle. Look at the top 7 cards of deck: Take a good card (or add it to battle).",
        "ast": side([
            ab(
                "hope_interrupt",
                effects=[
                    eff(1, "interrupt", target=sel("automatic_all", "both", ["battle"], None))
                ],
            ),
            ab(
                "hope_look_take",
                choice_group="hope_look_choice",
                effects=[
                    eff(
                        1,
                        "look",
                        creates_context_scope=True,
                        target=sel("automatic_next", "controller", ["deck"], "card", count=dv_int(7)),
                    ),
                    eff(
                        2,
                        "take",
                        destination="hand",
                        target=sel("manual_controller", "controller", ["context_scope"], "card", "good", count=dv_int(1)),
                    ),
                ],
            ),
            ab(
                "hope_look_add_battle",
                choice_group="hope_look_choice",
                effects=[
                    eff(
                        1,
                        "look",
                        creates_context_scope=True,
                        target=sel("automatic_next", "controller", ["deck"], "card", count=dv_int(7)),
                    ),
                    eff(
                        2,
                        "add to battle",
                        destination="battle",
                        target=sel("manual_controller", "controller", ["context_scope"], "card", "good", count=dv_int(1)),
                    ),
                ],
            ),
        ]),
    },
    "-1545433795_bottom": {
        "card_id": "-1545433795",
        "card_name": "Joash, Child King (LoC)",
        "side": "bottom",
        "raw_ability": "You may underdeck up to X Artifacts and/or good Enhancements.",
        "ast": side([
            ab(
                "joash_underdeck_artifacts_enhancements",
                is_optional=True,
                effects=[
                    eff(
                        1,
                        "underdeck",
                        destination="deck",
                        destination_position="bottom",
                        target=sel(
                            "manual_controller",
                            "either",
                            ["in_play"],
                            "card",
                            identifiers=["Artifact or good Enhancement"],
                            count=dv_x(min_value=0),
                        ),
                    )
                ],
            )
        ]),
    },
}
