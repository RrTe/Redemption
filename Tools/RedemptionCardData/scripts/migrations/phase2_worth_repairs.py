"""Curated REG v11.1.0 AST repairs for Worth X/Y conditions and truncated Stage-08 instead cards."""

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


def _giant_spear_ast(strength: int, toughness: int, with_goliath_retain: bool = False) -> Dict[str, Any]:
    """Builds Worth S/T if used by a giant Enhancement AST."""
    abilities = [
        ab(
            "worth_if_used_by_giant",
            activation_mode="static",
            conditions=[
                cond("zone_check", sel("automatic_all", "controller", ["battle"], "evil_character", "evil", identifiers=["Giant"]), ">=", 1),
            ],
            effects=[
                eff(
                    1,
                    "modify_stats",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel("automatic_self", "controller", ["in_play", "battle"], "enhancement"),
                    strength_mod=strength,
                    toughness_mod=toughness,
                ),
            ],
        ),
    ]
    if with_goliath_retain:
        abilities.append(
            ab(
                "goliaths_spear_retain",
                activation_mode="static",
                is_optional=True,
                conditions=[cond("zone_check", sel("automatic_all", "controller", ["in_play"], "evil_character", "evil", card_titles=["Goliath"]), ">=", 1)],
                effects=[
                    eff(1, "hold", effect_type="ongoing", duration="permanent", target=sel("automatic_self", "controller", ["in_play"], "enhancement"), destination="territory"),
                ],
            ),
        )
    return side(abilities)


def _lions_ast() -> Dict[str, Any]:
    """Builds the Lions / Lions (CoW AB) replacement AST."""
    return side([
        ab(
            "lions_discard_human",
            activation_mode="immediate",
            choice_group="lions_choice",
            effects=[
                eff(1, "discard", target=sel("manual_controller", "both", ["in_play"], "character", is_human=True, count=dv_int(1)), destination="discard_pile"),
            ],
        ),
        ab(
            "lions_reveal_dominant_instead",
            activation_mode="immediate",
            is_optional=True,
            choice_group="lions_choice",
            effects=[
                eff(1, "reveal", target=sel("manual_opponent", "opponent", ["hand"], "dominant", "good", count=dv_int(1))),
            ],
            modifiers=[mod("instead", trigger_event="discard", replace_with_action="reveal")],
        ),
    ])


WORTH_AND_STAGE08_INSTEAD_REPAIRS: Dict[str, Dict[str, Any]] = {
    "1139075416_top": _giant_spear_ast(8, 10, with_goliath_retain=True),
    "-836397942_top": _giant_spear_ast(8, 10, with_goliath_retain=False),
    "-1786602524_top": _giant_spear_ast(8, 4, with_goliath_retain=False),
    "1101784356_top": side([
        ab(
            "glittering_spear_worth",
            activation_mode="static",
            conditions=[
                cond("zone_check", sel("automatic_all", "controller", ["battle"], "evil_character", "evil", classes=["Warrior"], identifiers=["Assyrian"]), ">=", 1),
            ],
            effects=[
                eff(1, "modify_stats", effect_type="ongoing", duration="while_condition", target=sel("automatic_self", "controller", ["in_play", "battle"], "enhancement"), strength_mod=9, toughness_mod=3),
            ],
        ),
    ]),
    "-389033207_top": side([
        ab(
            "buckler_worth_6_4",
            activation_mode="static",
            conditions=[
                cond("zone_check", sel("automatic_all", "opponent", ["battle"], "evil_character", "evil", identifiers=["fought in an earthly battle"]), ">=", 1),
            ],
            effects=[
                eff(1, "modify_stats", effect_type="ongoing", duration="while_condition", target=sel("automatic_self", "controller", ["in_play", "battle"], "enhancement"), strength_mod=6, toughness_mod=4),
            ],
        ),
    ]),
    "-2053406169_top": side([
        ab(
            "amorite_invasion_worth_2_10",
            activation_mode="static",
            conditions=[
                cond("zone_check", sel("automatic_all", "opponent", ["battle"], "hero", "good", identifiers=["fought in an earthly battle"]), ">=", 1),
            ],
            effects=[
                eff(1, "modify_stats", effect_type="ongoing", duration="while_condition", target=sel("automatic_self", "controller", ["in_play", "battle"], "enhancement"), strength_mod=2, toughness_mod=10),
            ],
        ),
    ]),
    "621899785_top": side([
        ab(
            "helmet_of_brass_worth_6_8",
            activation_mode="static",
            conditions=[cond("zone_check", sel("automatic_all", "opponent", ["battle"], "card", brigades=["Crimson"]), ">=", 1)],
            effects=[
                eff(1, "modify_stats", effect_type="ongoing", duration="while_condition", target=sel("automatic_self", "controller", ["in_play", "battle"], "enhancement"), strength_mod=6, toughness_mod=8),
            ],
        ),
    ]),
    "694973377_top": side([
        ab(
            "greek_scholars_worth_7_9",
            activation_mode="static",
            conditions=[cond("zone_check", sel("automatic_all", "opponent", ["battle"], "hero", "good", testament="NT"), ">=", 1)],
            effects=[
                eff(1, "modify_stats", effect_type="ongoing", duration="while_condition", target=sel("automatic_self", "controller", ["in_play", "battle"], "evil_character", "evil"), strength_mod=7, toughness_mod=9),
            ],
        ),
    ]),
    "-573600504_top": side([
        ab(
            "tormentors_triple_face_value",
            activation_mode="immediate",
            effects=[
                eff(
                    1,
                    "modify_stats",
                    effect_type="ongoing",
                    duration="until_end_of_battle",
                    target=sel(
                        "automatic_all", "both", ["in_play", "battle"], "enhancement", "evil",
                        identifiers=["worth triple face value"],
                        stat_filters=[{"stat": "strength", "operator": "<", "value": 3}, {"stat": "toughness", "operator": "<", "value": 3}],
                        count=dv_x("stat_value", multiplier=3),
                    ),
                ),
            ],
        ),
    ]),
    "-2108859648_top": side([
        ab(
            "strength_in_weakness_negate_prevent_thorn",
            activation_mode="immediate",
            effects=[
                eff(1, "negate", target=sel("automatic_all", "both", ["in_play", "battle"], "card", card_titles=["Thorn in the Flesh"])),
                eff(2, "prevent", target=sel("chained_target", "both", ["in_play", "battle"], "card", ref_step=1)),
            ],
        ),
        ab(
            "strength_in_weakness_triple_enhancements",
            activation_mode="immediate",
            effects=[
                eff(
                    1,
                    "modify_stats",
                    effect_type="ongoing",
                    duration="until_end_of_battle",
                    target=sel(
                        "automatic_all", "both", ["battle"], "enhancement", "good",
                        identifiers=["worth triple face value"],
                        stat_filters=[{"stat": "strength", "operator": "<=", "value": 1}, {"stat": "toughness", "operator": "<=", "value": 1}],
                        count=dv_x("stat_value", multiplier=3),
                    ),
                ),
            ],
        ),
    ]),
    "218903353_top": side([
        ab(
            "mace_wa_triple_evil_enhancements",
            activation_mode="immediate",
            effects=[
                eff(
                    1,
                    "modify_stats",
                    effect_type="ongoing",
                    duration="until_end_of_battle",
                    target=sel(
                        "automatic_all", "both", ["battle"], "enhancement", "evil",
                        identifiers=["worth triple face value"],
                        stat_filters=[{"stat": "toughness", "operator": "<", "value": 3}],
                        count=dv_x("stat_value", multiplier=3),
                    ),
                ),
            ],
        ),
    ]),
    "390226218_top": _lions_ast(),
    "1437823639_top": _lions_ast(),
    "-116432607_top": side([
        ab(
            "peters_mother_in_law_topdeck_instead",
            activation_mode="triggered",
            is_optional=True,
            trigger_event="defeat",
            effects=[eff(1, "topdeck", target=sel("automatic_self", "controller", ["in_play", "battle"], "hero", "good"), destination="deck", destination_position="top")],
            modifiers=[mod("instead", trigger_event="defeat", replace_with_action="topdeck")],
        ),
        ab(
            "peters_mother_in_law_underdeck",
            activation_mode="immediate",
            is_optional=True,
            effects=[
                eff(1, "underdeck", target=sel("manual_controller", "controller", ["discard_pile"], "enhancement", brigades=["White"], identifiers=["Gospel"], count=dv_int(1)), destination="deck", destination_position="bottom"),
            ],
        ),
    ]),
    "-938969275_top": side([
        ab(
            "ram_the_exalter_discard_top_or_take",
            activation_mode="immediate",
            is_optional=True,
            effects=[
                eff(1, "discard", target=sel("automatic_next", "both", ["deck"], "card", count=dv_int(1)), destination="discard_pile", creates_context_scope=True),
                eff(2, "take", target=sel("chained_target", "both", ["discard_pile"], "card", alignment="good", ref_step=1), destination="hand", dependency="if_previous_successful"),
            ],
            modifiers=[mod("instead", trigger_event="discard", replace_with_action="take")],
        ),
        ab(
            "ram_the_exalter_band",
            activation_mode="immediate",
            is_optional=True,
            effects=[eff(1, "band", target=sel("manual_controller", "controller", ["in_play", "hand"], "hero", "good", brigades=["White"], identifiers=["Meek"], count=dv_int(1)))],
        ),
    ]),
    "1676019505_top": side(
        [
            ab(
                "persistent_widow_draw",
                activation_mode="immediate",
                is_optional=True,
                is_negatable=False,
                effects=[eff(1, "draw", target=sel("automatic_next", "controller", ["deck"], "card", count=dv_int(2)), destination="hand")],
                modifiers=[mod("cannot_be_negated")],
            ),
            ab(
                "persistent_widow_topdeck_instead",
                activation_mode="triggered",
                is_optional=True,
                is_negatable=False,
                trigger_event="defeat",
                effects=[eff(1, "topdeck", target=sel("automatic_self", "controller", ["in_play", "battle"], "hero", "good"), destination="deck", destination_position="top")],
                modifiers=[mod("cannot_be_negated"), mod("instead", trigger_event="defeat", replace_with_action="topdeck")],
            ),
        ],
        modifiers=[mod("cannot_be_negated", applies_to="this_side")],
    ),
    "-1675807482_top": side([
        ab(
            "uproar_in_jerusalem_withdraw",
            activation_mode="immediate",
            choice_group="uproar_choice",
            effects=[eff(1, "withdraw", target=sel("manual_controller", "both", ["battle"], "hero", "good", count=dv_int(1)), destination="territory")],
        ),
        ab(
            "uproar_in_jerusalem_capture_instead",
            activation_mode="immediate",
            is_optional=True,
            choice_group="uproar_choice",
            conditions=[cond("zone_check", sel("automatic_all", "both", ["in_play"], "evil_character", "evil", classes=["Warrior"], identifiers=["Roman"]), ">=", 1)],
            effects=[eff(1, "capture", target=sel("manual_controller", "both", ["battle"], "hero", "good", count=dv_int(1)), destination="land_of_bondage")],
            modifiers=[mod("instead", trigger_event="withdraw", replace_with_action="capture")],
        ),
    ]),
    "234399770_top": side([
        ab(
            "men_of_judah_rr2_topdeck_instead",
            activation_mode="triggered",
            is_optional=True,
            trigger_event="on_harmed_or_defeated",
            effects=[eff(1, "topdeck", target=sel("automatic_self", "controller", ["in_play", "battle"], "character"), destination="deck", destination_position="top")],
            modifiers=[mod("instead", trigger_event="harm_or_defeat", replace_with_action="topdeck")],
        ),
        ab(
            "men_of_judah_rr2_band",
            activation_mode="immediate",
            is_optional=True,
            effects=[eff(1, "band", target=sel("manual_controller", "controller", ["in_play", "hand"], "character", brigades=["Gold"], classes=["Warrior"], testament="OT", count=dv_int(1)))],
        ),
    ]),
    "-768984537_top": side([
        ab(
            "blindness_poc_random_take",
            activation_mode="triggered",
            trigger_event="search",
            trigger_filter=sel("automatic_all", "opponent", ["deck"], "card"),
            effects=[eff(1, "take", target=sel("random", "opponent", ["deck"], "card", count=dv_int(1)), destination="hand")],
            modifiers=[mod("instead", trigger_event="search", replace_with_action="take")],
        ),
    ]),
}
