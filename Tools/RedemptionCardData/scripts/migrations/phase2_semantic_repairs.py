"""Curated REG v11.1.0 AST semantic repairs (Part 1: Core truncated/stat/protection fixes)."""

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

SEMANTIC_REPAIRS_PART1: Dict[str, Dict[str, Any]] = {
    "-950214778_top": side([
        ab(
            "of_one_mind_pc_place",
            effects=[
                eff(
                    1,
                    "place",
                    destination="territory",
                    target=sel("automatic_self", "controller", ["in_play"], "enhancement", "good"),
                )
            ],
        ),
        ab(
            "of_one_mind_pc_grant_cannot_negate",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "gain",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel(
                        "automatic_all",
                        "controller",
                        ["in_play", "battle"],
                        "enhancement",
                        "good",
                        brigades=["Clay"],
                        identifiers=["band abilities", "used by clay Heroes"],
                    ),
                )
            ],
            modifiers=[mod("cannot_be_negated", "target_cards")],
        ),
    ]),
    "-1574426638_top": side([
        ab(
            "silly_women_dynamic_stats",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "modify_stats",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel(
                        "automatic_self",
                        "controller",
                        ["in_play", "battle"],
                        "evil_character",
                        "evil",
                        identifiers=["abilities equal to Evil Characters in play"],
                        count=dv_x("count_cards", "in_play", "evil_character"),
                    ),
                )
            ],
        )
    ]),
    "793883426_top": side([
        ab(
            "weapon_of_light_toughness_stat",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "modify_stats",
                    effect_type="ongoing",
                    duration="permanent",
                    toughness_mod=0,
                    target=sel(
                        "automatic_self",
                        "controller",
                        ["in_play", "battle"],
                        "card",
                        identifiers=["toughness equal to opponent's Evil Characters in play"],
                        count=dv_x("count_cards", "in_play", "evil_character"),
                    ),
                )
            ],
        )
    ]),
    "-129942653_top": side([
        ab(
            "angel_secret_name_dynamic_stats",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "modify_stats",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel(
                        "automatic_self",
                        "controller",
                        ["in_play", "battle"],
                        "hero",
                        "good",
                        identifiers=["abilities equal to Silver Brigade Heroes in play"],
                        count=dv_x("count_cards", "in_play", "hero"),
                    ),
                )
            ],
        )
    ]),
    "-889270963_top": side([
        ab(
            "jethros_wisdom_toughness",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "modify_stats",
                    effect_type="ongoing",
                    duration="permanent",
                    toughness_mod=0,
                    target=sel(
                        "automatic_self",
                        "controller",
                        ["in_play", "battle"],
                        "card",
                        identifiers=["toughness equal to combined toughness of O.T. male human Heroes in territory"],
                        count=dv_x("stat_value", "territory", "hero"),
                    ),
                )
            ],
        )
    ]),
    "1358950550_top": side([
        ab(
            "multitude_multiply_stats",
            effects=[
                eff(
                    1,
                    "modify_stats",
                    effect_type="ongoing",
                    duration="until_end_of_battle",
                    target=sel(
                        "manual_controller",
                        "controller",
                        ["battle", "in_play"],
                        "hero",
                        "good",
                        identifiers=["multiply abilities by Evil Characters in battle"],
                        count=dv_x("count_cards", "battle", "evil_character"),
                    ),
                )
            ],
        )
    ]),
    "1409316791_top": side([
        ab(
            "self_copy_hero_stats",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "copy",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel(
                        "manual_controller",
                        "opponent",
                        ["in_play"],
                        "hero",
                        "good",
                        identifiers=["abilities (*/*)"],
                        count=dv_int(1),
                    ),
                ),
                eff(
                    2,
                    "modify_stats",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel(
                        "automatic_self",
                        "controller",
                        ["in_play"],
                        "evil_character",
                        "evil",
                        identifiers=["match copied Hero abilities"],
                        count=dv_x("stat_value", "in_play", "hero"),
                    ),
                ),
            ],
        ),
        ab(
            "self_reset_on_hero_leaves",
            activation_mode="triggered",
            trigger_event="leaves_play",
            effects=[
                eff(
                    1,
                    "modify_stats",
                    effect_type="ongoing",
                    duration="permanent",
                    strength_mod=0,
                    toughness_mod=0,
                    target=sel("automatic_self", "controller", ["in_play"], "evil_character", "evil"),
                )
            ],
        ),
    ]),
    "677725732_top": side([
        ab(
            "fallen_warrior_gain_blocked_stats",
            activation_mode="triggered",
            trigger_event="successful_block",
            effects=[
                eff(
                    1,
                    "gain",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel(
                        "automatic_self",
                        "controller",
                        ["in_play", "battle"],
                        "evil_character",
                        "evil",
                        identifiers=["cumulative abilities of blocked Heroes"],
                        count=dv_x("stat_value", "battle", "hero"),
                    ),
                )
            ],
        )
    ]),
    "-436651304_top": side([
        ab(
            "fallen_warrior_wa_gain_blocked_stats",
            activation_mode="triggered",
            trigger_event="successful_block",
            effects=[
                eff(
                    1,
                    "gain",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel(
                        "automatic_self",
                        "controller",
                        ["in_play", "battle"],
                        "evil_character",
                        "evil",
                        identifiers=["cumulative abilities of blocked Heroes"],
                        count=dv_x("stat_value", "battle", "hero"),
                    ),
                )
            ],
        )
    ]),
    "1609027840_top": side([
        ab(
            "betrayal_half_good_enhancements",
            effects=[
                eff(
                    1,
                    "modify_stats",
                    effect_type="ongoing",
                    duration="this_turn",
                    target=sel(
                        "automatic_all",
                        "both",
                        ["in_play", "battle"],
                        "enhancement",
                        "good",
                        identifiers=["worth half"],
                    ),
                )
            ],
        )
    ]),
    "655449307_top": side([
        ab(
            "gods_provision_equal_stats",
            effects=[
                eff(
                    1,
                    "gain",
                    effect_type="ongoing",
                    duration="until_end_of_battle",
                    target=sel(
                        "automatic_self",
                        "controller",
                        ["battle"],
                        "hero",
                        "good",
                        identifiers=["equal abilities with Evil Character"],
                        count=dv_x("stat_value", "battle", "evil_character"),
                    ),
                )
            ],
        ),
        ab(
            "gods_provision_first_strike",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "first strike",
                    effect_type="ongoing",
                    duration="until_end_of_battle",
                    target=sel("automatic_self", "controller", ["battle"], "hero", "good"),
                )
            ],
        ),
    ]),
    "-727034140_top": side([
        ab(
            "potters_field_set_aside",
            effects=[eff(1, "set-aside", destination="set_aside", target=sel("automatic_self", "controller", ["in_play"], "site"))],
        ),
        ab(
            "potters_field_replace_discard",
            activation_mode="triggered",
            trigger_event="would_be_discarded",
            modifiers=[mod("instead", "this_ability", trigger_event="discard", replace_with_action="place")],
            effects=[
                eff(
                    1,
                    "place",
                    destination="set_aside",
                    target=sel(
                        "automatic_all",
                        "controller",
                        ["in_play", "battle"],
                        "hero",
                        "good",
                        identifiers=["in this Site", "treated as discarded Heroes"],
                    ),
                )
            ],
        ),
    ]),
    "-1726785984_top": side([
        ab(
            "potters_field_set_aside",
            effects=[eff(1, "set-aside", destination="set_aside", target=sel("automatic_self", "controller", ["in_play"], "site"))],
        ),
        ab(
            "potters_field_replace_discard",
            activation_mode="triggered",
            trigger_event="would_be_discarded",
            modifiers=[mod("instead", "this_ability", trigger_event="discard", replace_with_action="place")],
            effects=[
                eff(
                    1,
                    "place",
                    destination="set_aside",
                    target=sel(
                        "automatic_all",
                        "controller",
                        ["in_play", "battle"],
                        "hero",
                        "good",
                        identifiers=["in this Site", "treated as discarded Heroes"],
                    ),
                )
            ],
        ),
    ]),
    "-945112256_top": side(
        [
            ab(
                "conqueror_over_death_resurrect",
                is_negatable=False,
                effects=[
                    eff(
                        1,
                        "resurrect",
                        destination="territory",
                        target=sel(
                            "automatic_all",
                            "controller",
                            ["set_aside"],
                            "hero",
                            "good",
                            identifiers=["in Potter's Field"],
                        ),
                    )
                ],
            )
        ],
        modifiers=[mod("cannot_be_negated", "this_side")],
    ),
    "816165207_top": side([
        ab(
            "resurrection_wa_potters_field",
            effects=[
                eff(
                    1,
                    "place",
                    destination="territory",
                    target=sel(
                        "manual_controller",
                        "controller",
                        ["set_aside"],
                        "hero",
                        "good",
                        identifiers=["in Potter's Field"],
                        count=dv_int(1),
                    ),
                )
            ],
        )
    ]),
    "1468800968_top": side([
        ab(
            "raising_of_saints_potters_field",
            effects=[
                eff(
                    1,
                    "resurrect",
                    destination="territory",
                    target=sel(
                        "automatic_all",
                        "controller",
                        ["set_aside"],
                        "hero",
                        "good",
                        identifiers=["in Potter's Field"],
                    ),
                )
            ],
        )
    ]),
    "-688060094_top": side([
        ab(
            "empty_tomb_potters_field",
            effects=[
                eff(
                    1,
                    "resurrect",
                    destination="territory",
                    target=sel(
                        "automatic_all",
                        "either",
                        ["set_aside"],
                        "hero",
                        "good",
                        identifiers=["in Potter's Field"],
                    ),
                )
            ],
        )
    ]),
    "-897590487_top": side([
        ab(
            "desecration_of_graves_banish",
            effects=[
                eff(
                    1,
                    "banish",
                    destination="banish_pile",
                    target=sel(
                        "manual_controller",
                        "opponent",
                        ["set_aside"],
                        "hero",
                        "good",
                        identifiers=["in Potter's Field"],
                        count=dv_int(2),
                    ),
                )
            ],
        )
    ]),
    "1253133198_top": side([
        ab(
            "profanation_banish_potters_field",
            effects=[
                eff(
                    1,
                    "banish",
                    destination="banish_pile",
                    target=sel(
                        "manual_controller",
                        "opponent",
                        ["set_aside"],
                        "hero",
                        "good",
                        identifiers=["in Potter's Field"],
                        count=dv_int(1),
                    ),
                )
            ],
        )
    ]),
    "2101310065_top": side([
        ab(
            "lay_down_your_life_replace",
            activation_mode="triggered",
            trigger_event="about_to_be_discarded",
            effects=[
                eff(
                    1,
                    "discard",
                    destination="discard_pile",
                    target=sel("manual_controller", "controller", ["battle"], "hero", "good", count=dv_int(1)),
                ),
                eff(
                    2,
                    "place",
                    destination="battle",
                    dependency="if_previous_successful",
                    target=sel(
                        "manual_controller",
                        "controller",
                        ["territory"],
                        "hero",
                        "good",
                        identifiers=["another", "same brigade"],
                        count=dv_int(1),
                    ),
                ),
            ],
        )
    ]),
    "-2098863130_top": side([
        ab(
            "lost_soul_hopper_on_draw",
            activation_mode="triggered",
            trigger_event="on_draw",
            effects=[
                eff(
                    1,
                    "place",
                    destination="land_of_bondage",
                    target=sel("automatic_self", "opponent", ["hand"], "lost_soul", "neutral"),
                )
            ],
        )
    ]),
}
