"""Curated REG v11.1.0 AST definitions for missing card sides (Part 2)."""

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

MISSING_ASTS_PART2: Dict[str, Dict[str, Any]] = {
    "822529001_top": {
        "card_id": "822529001",
        "card_name": "Life in the Son (GoC)",
        "side": "top",
        "raw_ability": "You may convert a Hero to meek or bounce a character. You may draw X (limit 3 unless played in battle). Cannot be prevented if played in battle.",
        "ast": side([
            ab(
                "life_in_the_son_convert_meek",
                is_optional=True,
                choice_group="life_in_the_son_mode",
                effects=[
                    eff(
                        1,
                        "convert",
                        target=sel(
                            "manual_controller",
                            "either",
                            ["in_play", "battle"],
                            "hero",
                            "good",
                            identifiers=["Meek"],
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
            ab(
                "life_in_the_son_bounce",
                is_optional=True,
                choice_group="life_in_the_son_mode",
                effects=[
                    eff(
                        1,
                        "bounce",
                        destination="hand",
                        target=sel("manual_controller", "either", ["in_play", "battle"], "character", count=dv_int(1)),
                    )
                ],
            ),
            ab(
                "life_in_the_son_draw_limit3",
                is_optional=True,
                choice_group="life_in_the_son_draw",
                effects=[
                    eff(
                        1,
                        "draw",
                        destination="hand",
                        target=sel("automatic_next", "controller", ["deck"], "card", count=dv_x(limit=3, min_value=0)),
                    )
                ],
            ),
            ab(
                "life_in_the_son_draw_in_battle",
                is_optional=True,
                choice_group="life_in_the_son_draw",
                conditions=[cond("zone_check", sel("automatic_self", "controller", ["battle"], "enhancement"), "==", 1)],
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
                "ab_5_cannot_be_prevented",
                activation_mode="static",
                conditions=[cond("zone_check", sel("automatic_self", "controller", ["battle"], "enhancement"), "==", 1)],
                effects=[],
                modifiers=[mod("cannot_be_prevented", "this_side")],
            ),
        ]),
    },
    "394306278_top": {
        "card_id": "394306278",
        "card_name": "Nahshon, the Blacksmith (LoC)",
        "side": "top",
        "raw_ability": "You may underdeck an Artifact or activate an Artifact. May band to an Exodus or meek Hero.",
        "ast": side([
            ab(
                "nahshon_underdeck_artifact",
                is_optional=True,
                choice_group="nahshon_art_choice",
                effects=[
                    eff(
                        1,
                        "underdeck",
                        destination="deck",
                        destination_position="bottom",
                        target=sel("manual_controller", "either", ["in_play"], "artifact", count=dv_int(1)),
                    )
                ],
            ),
            ab(
                "nahshon_activate_artifact",
                is_optional=True,
                choice_group="nahshon_art_choice",
                effects=[
                    eff(
                        1,
                        "activate an artifact",
                        destination="in_play",
                        target=sel("manual_controller", "controller", ["in_play"], "artifact", count=dv_int(1)),
                    )
                ],
            ),
            ab(
                "nahshon_band",
                is_optional=True,
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
                            references=["Exodus"],
                            identifiers=["or Meek"],
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
        ]),
    },
    "-300185486_top": {
        "card_id": "-300185486",
        "card_name": "Numerous as the Stars (PoC)",
        "side": "top",
        "raw_ability": "Reveal any number of * cards from hand. Take up to X human Heroes from deck, discard pile and/or Reserve.",
        "ast": side([
            ab(
                "numerous_as_the_stars_top",
                effects=[
                    eff(
                        1,
                        "reveal",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["hand"],
                            "card",
                            identifiers=["Star"],
                            count=dv_x(min_value=0),
                        ),
                    ),
                    eff(
                        2,
                        "take",
                        destination="hand",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["deck", "discard_pile", "reserve_pile"],
                            "hero",
                            "good",
                            is_human=True,
                            count=dv_x(min_value=0),
                        ),
                    ),
                ],
            )
        ]),
    },
    "1864837258_top": {
        "card_id": "1864837258",
        "card_name": "Repudiating Rulers (GoC)",
        "side": "top",
        "raw_ability": "Bounce a character in a territory. You may take an evil N.T. gray card from Reserve (or deck if you control a meek Lost Soul).",
        "ast": side([
            ab(
                "repudiating_rulers_bounce",
                effects=[
                    eff(
                        1,
                        "bounce",
                        destination="hand",
                        target=sel("manual_controller", "either", ["territory"], "character", count=dv_int(1)),
                    )
                ],
            ),
            ab(
                "repudiating_rulers_take_reserve",
                is_optional=True,
                choice_group="repudiating_rulers_zone",
                effects=[
                    eff(
                        1,
                        "take",
                        destination="hand",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["reserve_pile"],
                            "card",
                            "evil",
                            brigades=["Gray"],
                            testament="NT",
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
            ab(
                "repudiating_rulers_take_deck",
                is_optional=True,
                choice_group="repudiating_rulers_zone",
                conditions=[
                    cond(
                        "zone_check",
                        sel("automatic_all", "controller", ["in_play"], "lost_soul", identifiers=["Meek"]),
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
                            ["deck"],
                            "card",
                            "evil",
                            brigades=["Gray"],
                            testament="NT",
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
        ]),
    },
    "-1850265351_bottom": {
        "card_id": "-1850265351",
        "card_name": "Second Seal (War) (RoJ AB)",
        "side": "bottom",
        "raw_ability": "You may discard an Enhancement or search deck, discard pile or Reserve for an evil weapon.",
        "ast": side([
            ab(
                "second_seal_war_discard_enh",
                is_optional=True,
                choice_group="second_seal_war_bot",
                effects=[
                    eff(
                        1,
                        "discard",
                        destination="discard_pile",
                        target=sel("manual_controller", "either", ["in_play", "battle"], "enhancement", count=dv_int(1)),
                    )
                ],
            ),
            ab(
                "second_seal_war_search_weapon",
                is_optional=True,
                choice_group="second_seal_war_bot",
                effects=[
                    eff(
                        1,
                        "search",
                        destination="hand",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["deck", "discard_pile", "reserve_pile"],
                            "enhancement",
                            "evil",
                            classes=["Weapon"],
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
        ]),
    },
    "523544979_bottom": {
        "card_id": "523544979",
        "card_name": "Second Seal, War (RoJ)",
        "side": "bottom",
        "raw_ability": "You may discard an enhancement or search deck, discard pile or Reserve for an evil weapon.",
        "ast": side([
            ab(
                "second_seal_war_discard_enh",
                is_optional=True,
                choice_group="second_seal_war_bot",
                effects=[
                    eff(
                        1,
                        "discard",
                        destination="discard_pile",
                        target=sel("manual_controller", "either", ["in_play", "battle"], "enhancement", count=dv_int(1)),
                    )
                ],
            ),
            ab(
                "second_seal_war_search_weapon",
                is_optional=True,
                choice_group="second_seal_war_bot",
                effects=[
                    eff(
                        1,
                        "search",
                        destination="hand",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["deck", "discard_pile", "reserve_pile"],
                            "enhancement",
                            "evil",
                            classes=["Weapon"],
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
        ]),
    },
    "1248341543_top": {
        "card_id": "1248341543",
        "card_name": "Solomon's Dream (LoC)",
        "side": "top",
        "raw_ability": "If used by Solomon or a meek Hero, you may take a good card from deck. If played in battle, you may draw X (limit 3).",
        "ast": side([
            ab(
                "solomons_dream_take",
                is_optional=True,
                conditions=[
                    cond(
                        "zone_check",
                        sel(
                            "automatic_all",
                            "controller",
                            ["battle"],
                            "hero",
                            "good",
                            identifiers=["Meek"],
                            card_titles=["Solomon"],
                        ),
                        ">=",
                        1,
                    )
                ],
                effects=[
                    eff(
                        1,
                        "take",
                        destination="hand",
                        target=sel("manual_controller", "controller", ["deck"], "card", "good", count=dv_int(1)),
                    )
                ],
            ),
            ab(
                "solomons_dream_draw",
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
    "-1043513106_top": {
        "card_id": "-1043513106",
        "card_name": "Talitha Kum! (GoC)",
        "side": "top",
        "raw_ability": "Interrupt the battle. You may resurrect a Gospel human Hero. Hero may band to up to 5 Gospel Heroes.",
        "ast": side([
            ab(
                "talitha_kum_interrupt",
                effects=[eff(1, "interrupt", target=sel("automatic_all", "both", ["battle"], None))],
            ),
            ab(
                "talitha_kum_resurrect_band",
                is_optional=True,
                effects=[
                    eff(
                        1,
                        "resurrect",
                        destination="territory",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["discard_pile"],
                            "hero",
                            "good",
                            is_human=True,
                            identifiers=["Gospel"],
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
                            identifiers=["Gospel"],
                            count=dv_up_to(5),
                        ),
                    ),
                ],
            ),
        ]),
    },
    "1693574528_top": {
        "card_id": "1693574528",
        "card_name": "Tamar, the Widow (LoC)",
        "side": "top",
        "raw_ability": "After battle, discard an evil male. May band to Judah and/or you may play meek Perez from deck or Reserve.",
        "ast": side([
            ab(
                "tamar_after_battle_discard",
                activation_mode="triggered",
                trigger_event="after_battle",
                effects=[
                    eff(
                        1,
                        "discard",
                        destination="discard_pile",
                        target=sel(
                            "manual_controller",
                            "either",
                            ["in_play", "battle"],
                            "evil_character",
                            "evil",
                            gender="male",
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
            ab(
                "tamar_band_judah",
                is_optional=True,
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
                            card_titles=["Judah"],
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
            ab(
                "tamar_play_perez",
                is_optional=True,
                effects=[
                    eff(
                        1,
                        "play",
                        destination="territory",
                        target=sel(
                            "manual_controller",
                            "controller",
                            ["deck", "reserve_pile"],
                            "hero",
                            "good",
                            identifiers=["Meek"],
                            card_titles=["Perez"],
                            count=dv_int(1),
                        ),
                    )
                ],
            ),
        ]),
    },
}
