"""Curated REG v11.1.0 AST semantic repairs (Part 2: Protection, restriction, and zone fixes)."""

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
    pf,
    sel,
    side,
)

SEMANTIC_REPAIRS_PART2: Dict[str, Dict[str, Any]] = {
    "-860753876_top": side([
        ab(
            "enoch_protect_discard",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_self", "controller", ["in_play"], "hero", "good"),
                    protection_filter=pf(actions=["discard"], except_actions=["remove from the game"]),
                )
            ],
        ),
        ab(
            "enoch_return_to_territory",
            activation_mode="triggered",
            trigger_event="end_of_battle",
            effects=[
                eff(
                    1,
                    "withdraw",
                    destination="territory",
                    target=sel("automatic_self", "controller", ["battle"], "hero", "good"),
                )
            ],
        ),
    ]),
    "-1270964017_top": side([
        ab(
            "assyrian_camp_prevent_multi",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "prevent",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel(
                        "automatic_all",
                        "both",
                        ["in_play", "battle"],
                        "enhancement",
                        brigades=["Multi"],
                        identifiers=["used by Heroes", "except meek Heroes"],
                    ),
                )
            ],
        )
    ]),
    "-1557092137_top": side([
        ab(
            "burial_shroud_restrictions",
            activation_mode="static",
            modifiers=[mod("limit", "this_ability", limit_count=2, limit_per="game")],
            effects=[
                eff(
                    1,
                    "restrict",
                    effect_type="ongoing",
                    duration="this_turn",
                    target=sel(
                        "automatic_all",
                        "controller",
                        ["in_play"],
                        None,
                        identifiers=["make a rescue attempt", "rescue attempt"],
                    ),
                ),
                eff(
                    2,
                    "restrict",
                    effect_type="ongoing",
                    duration="this_turn",
                    target=sel(
                        "automatic_all",
                        "opponent",
                        ["in_play"],
                        None,
                        identifiers=["attack"],
                    ),
                ),
            ],
        )
    ]),
    "1879127821_top": side([
        ab(
            "tabitha_f_return_instead",
            activation_mode="triggered",
            trigger_event="about_to_be_discarded",
            modifiers=[
                mod("limit", "this_ability", limit_count=1, limit_per="game"),
                mod("instead", "this_ability", trigger_event="discard", replace_with_action="withdraw"),
            ],
            effects=[
                eff(
                    1,
                    "withdraw",
                    destination="territory",
                    target=sel("automatic_self", "controller", ["in_play", "battle"], "hero", "good"),
                )
            ],
        )
    ]),
    "2120594931_top": side([
        ab(
            "elisabeth_protect_capture",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_self", "controller", ["in_play"], "hero", "good"),
                    protection_filter=pf(actions=["capture"]),
                )
            ],
        )
    ]),
    "551003852_top": side([
        ab(
            "city_of_refuge_protect_ot_humans",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel(
                        "automatic_all",
                        "both",
                        ["in_play"],
                        "character",
                        testament="OT",
                        is_human=True,
                    ),
                    protection_filter=pf(actions=["discard"]),
                )
            ],
        ),
        ab(
            "city_of_refuge_hold_instead",
            activation_mode="triggered",
            trigger_event="harmed_by_opponent",
            is_optional=True,
            modifiers=[
                mod("limit", "this_ability", limit_count=1, limit_per="turn"),
                mod("instead", "this_ability", trigger_event="harm", replace_with_action="hold"),
            ],
            effects=[
                eff(
                    1,
                    "hold",
                    effect_type="ongoing",
                    duration="permanent",
                    destination="in_play",
                    target=sel(
                        "manual_controller",
                        "controller",
                        ["in_play", "battle"],
                        "character",
                        testament="OT",
                        is_human=True,
                        count=dv_int(1),
                    ),
                )
            ],
        ),
    ]),
    "-1034125914_top": side([
        ab(
            "amasa_protect_capture",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_self", "controller", ["in_play"], "evil_character", "evil"),
                    protection_filter=pf(actions=["capture"]),
                )
            ],
        ),
        ab(
            "amasa_band_absaloms_soldiers",
            is_optional=True,
            effects=[
                eff(
                    1,
                    "band",
                    target=sel(
                        "manual_controller",
                        "both",
                        ["in_play", "hand"],
                        "evil_character",
                        "evil",
                        card_titles=["Absalom's Soldiers"],
                        count=dv_int(1),
                    ),
                )
            ],
        ),
    ]),
    "-761019419_top": side([
        ab(
            "ahimaaz_look_hand_or_site",
            is_optional=True,
            choice_group="ahimaaz_look",
            effects=[
                eff(
                    1,
                    "look",
                    target=sel("automatic_all", "opponent", ["hand"], "card"),
                )
            ],
        ),
        ab(
            "ahimaaz_look_site",
            is_optional=True,
            choice_group="ahimaaz_look",
            effects=[
                eff(
                    1,
                    "look",
                    target=sel("automatic_all", "opponent", ["in_play"], "card", identifiers=["face down in a Site"]),
                )
            ],
        ),
        ab(
            "ahimaaz_withdraw",
            is_optional=True,
            effects=[
                eff(
                    1,
                    "withdraw",
                    destination="territory",
                    target=sel("automatic_self", "controller", ["battle"], "hero", "good"),
                )
            ],
        ),
        ab(
            "ahimaaz_protect_capture",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_self", "controller", ["in_play"], "hero", "good"),
                    protection_filter=pf(actions=["capture"]),
                )
            ],
        ),
    ]),
    "185508628_top": side([
        ab(
            "idle_gossip_side_battle",
            effects=[
                eff(
                    1,
                    "side battle",
                    target=sel("manual_controller", "both", ["in_play"], "hero", "good", count=dv_int(1)),
                ),
                eff(
                    2,
                    "discard",
                    destination="discard_pile",
                    dependency="if_previous_successful",
                    target=sel(
                        "automatic_all",
                        "both",
                        ["battle"],
                        "hero",
                        "good",
                        identifiers=["loser"],
                        count=dv_int(1),
                    ),
                ),
            ],
        )
    ]),
    "24735900_top": side([
        ab(
            "admiral_negate_kotw_protect",
            effects=[
                eff(
                    1,
                    "negate",
                    effect_type="ongoing",
                    duration="this_turn",
                    target=sel(
                        "automatic_all",
                        "both",
                        ["in_play"],
                        "fortress",
                        identifiers=["protect abilities", "Kingdoms of this World"],
                        card_titles=["Kingdoms of the World"],
                    ),
                )
            ],
        ),
        ab(
            "admiral_release_and_band_demon",
            is_optional=True,
            effects=[
                eff(
                    1,
                    "release",
                    destination="territory",
                    target=sel(
                        "manual_controller",
                        "controller",
                        ["in_play", "set_aside"],
                        "evil_character",
                        "evil",
                        identifiers=["Demon", "from evil fortress"],
                        count=dv_int(1),
                    ),
                ),
                eff(
                    2,
                    "band",
                    dependency="if_previous_successful",
                    target=sel("chained_target", "controller", ["in_play", "hand"], "evil_character", ref_step=1),
                ),
            ],
        ),
    ]),
    "-146932954_top": side([
        ab(
            "defiant_place_on_demon",
            effects=[
                eff(
                    1,
                    "place",
                    destination="in_play",
                    target=sel("automatic_self", "controller", ["in_play"], "enhancement", "evil"),
                ),
                eff(
                    2,
                    "negate",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel("automatic_all", "both", ["in_play"], "artifact", card_titles=["Three Nails"]),
                ),
                eff(
                    3,
                    "cannot be ignored",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel(
                        "manual_controller",
                        "controller",
                        ["in_play", "battle"],
                        "evil_character",
                        "evil",
                        identifiers=["Demon"],
                        count=dv_int(1),
                    ),
                ),
            ],
        )
    ]),
    "684661219_top": side([
        ab(
            "fullness_of_time_protect_decks",
            activation_mode="static",
            conditions=[
                cond("zone_check", sel("automatic_self", "controller", ["in_play"], "site", identifiers=["occupied"]), "==", 1)
            ],
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel("automatic_all", "both", ["deck"], "card"),
                    protection_filter=pf(
                        actions=["look", "reveal"],
                        card_sources=[sel("automatic_all", "opponent", ["in_play"], "card")],
                    ),
                )
            ],
        ),
        ab(
            "fullness_of_time_release_discard_take",
            activation_mode="triggered",
            trigger_event="rescue",
            trigger_filter=sel(
                "automatic_all",
                "controller",
                ["battle"],
                "hero",
                "good",
                brigades=["Green"],
                identifiers=["Prophet"],
            ),
            is_optional=True,
            costs=[
                eff(
                    1,
                    "release",
                    destination="territory",
                    target=sel("automatic_all", "controller", ["in_play"], "card", identifiers=["contents"]),
                ),
                eff(
                    2,
                    "discard",
                    destination="discard_pile",
                    target=sel("automatic_self", "controller", ["in_play"], "site"),
                ),
            ],
            effects=[
                eff(
                    3,
                    "take",
                    destination="hand",
                    dependency="if_you_do",
                    target=sel("manual_controller", "controller", ["deck"], "dominant", "good", count=dv_int(1)),
                )
            ],
        ),
    ]),
    "484231532_top": side([
        ab(
            "solomons_temple_roa_discard_instead",
            activation_mode="triggered",
            trigger_event="captured_or_discarded_by_opponent",
            trigger_filter=sel(
                "automatic_all",
                "controller",
                ["in_play"],
                "character",
                identifiers=["Solomon's Temple Priest", "King of Judah"],
                card_titles=["Solomon"],
            ),
            is_optional=True,
            modifiers=[mod("instead", "this_ability", trigger_event="capture_or_discard", replace_with_action="discard")],
            effects=[
                eff(
                    1,
                    "discard",
                    destination="discard_pile",
                    target=sel(
                        "manual_controller",
                        "controller",
                        ["hand"],
                        "card",
                        brigades=["Teal"],
                        count=dv_int(1),
                    ),
                )
            ],
        )
    ]),
    "-457899472_top": side([
        ab(
            "baggage_capture",
            effects=[
                eff(
                    1,
                    "capture",
                    destination="land_of_bondage",
                    target=sel(
                        "manual_controller",
                        "either",
                        ["in_play", "battle"],
                        "evil_character",
                        "evil",
                        identifiers=["treated as a Lost Soul"],
                        count=dv_int(1),
                    ),
                )
            ],
        )
    ]),
}
