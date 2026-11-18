"""Curated REG v11.1.0 AST semantic repairs (Part 3: remaining high-impact cards)."""

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

SEMANTIC_REPAIRS_PART3: Dict[str, Dict[str, Any]] = {
    "1623033832_top": side([
        ab(
            "table_of_showbread_place",
            activation_mode="triggered",
            trigger_event="on_activation",
            effects=[
                eff(
                    1,
                    "place",
                    target=sel(
                        "manual_controller", "controller", ["hand"],
                        "enhancement", "good", testament="OT", count=dv_int(1),
                    ),
                    destination="in_play",
                    creates_context_scope=True,
                ),
            ],
        ),
        ab(
            "table_of_showbread_use_enhancements",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "use other enhancements",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel(
                        "automatic_all", "controller", ["in_play"], "hero", "good",
                        identifiers=["Priest", "regardless of brigade"],
                    ),
                ),
            ],
            modifiers=[mod("regardless")],
        ),
        ab(
            "table_of_showbread_deactivate",
            activation_mode="triggered",
            trigger_event="on_deactivation",
            effects=[
                eff(
                    1,
                    "bounce",
                    target=sel(
                        "automatic_all", "controller", ["in_play"], "enhancement",
                        identifiers=["contents"],
                    ),
                    destination="hand",
                ),
            ],
        ),
    ]),
    "-1988870646_top": side([
        ab(
            "babylonian_banquet_hall_hold",
            activation_mode="static",
            is_optional=True,
            effects=[
                eff(
                    1,
                    "hold",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel(
                        "manual_controller", "both", ["in_play"], "lost_soul",
                        identifiers=["for each Babylonian Site"],
                        count=dv_x("count_cards", scope="in_play", target_type="site", multiplier=1),
                    ),
                ),
            ],
        ),
    ]),
    "210518074_top": side([
        ab(
            "potiphar_protect_capture_and_banding",
            activation_mode="static",
            conditions=[
                cond(
                    "zone_check",
                    sel(
                        "automatic_all", "controller", ["in_play"], "site",
                        card_titles=["Pharaoh's Prison"],
                    ),
                    ">=",
                    1,
                ),
            ],
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel(
                        "automatic_all", "both", ["in_play"], "card", alignment="evil",
                        identifiers=["capture ability", "banding ability"],
                    ),
                    protection_filter=pf(actions=["negate"]),
                ),
            ],
            modifiers=[mod("cannot_be_negated", applies_to="target_cards")],
        ),
        ab(
            "potiphar_band",
            activation_mode="immediate",
            is_optional=True,
            effects=[
                eff(
                    1,
                    "band",
                    target=sel(
                        "manual_controller", "controller", ["territory", "hand"],
                        "evil_character", "evil", card_titles=["Potiphar's Wife"],
                        count=dv_int(1),
                    ),
                ),
            ],
        ),
    ]),
    "-615683020_top": side([
        ab(
            "potiphars_wife_capture",
            activation_mode="triggered",
            trigger_event="defeat",
            trigger_filter=sel(
                "automatic_all", "opponent", ["battle"], "hero", "good", gender="male",
            ),
            effects=[
                eff(
                    1,
                    "capture",
                    target=sel(
                        "manual_controller", "opponent", ["battle"], "hero", "good",
                        gender="male", identifiers=["treated as a Lost Soul"],
                        count=dv_int(1),
                    ),
                    destination="land_of_bondage",
                ),
            ],
        ),
    ]),
    "1548481979_top": side([
        ab(
            "angelic_rebellion_convert",
            activation_mode="immediate",
            effects=[
                eff(
                    1,
                    "convert",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel(
                        "manual_controller", "both", ["in_play"], "hero", "good",
                        identifiers=["Angel", "excluding Michael", "excluding Gabriel", "becomes Crimson Evil Character"],
                        count=dv_int(1),
                    ),
                ),
            ],
        ),
    ]),
    "1105788373_top": side([
        ab(
            "compassion_of_jeremiah_ignore",
            activation_mode="immediate",
            effects=[
                eff(
                    1,
                    "ignore",
                    effect_type="ongoing",
                    duration="until_end_of_battle",
                    target=sel(
                        "automatic_all", "opponent", ["in_play", "battle"], "card",
                        brigades=["Crimson"],
                    ),
                ),
            ],
        ),
    ]),
    "-1898184372_bottom": side([
        ab(
            "edomite_camp_block_draw",
            activation_mode="triggered",
            is_optional=True,
            trigger_event="block",
            trigger_filter=sel(
                "automatic_all", "controller", ["battle"], "evil_character", "evil",
                identifiers=["Edomite"],
            ),
            conditions=[
                cond(
                    "count_comparison",
                    sel("automatic_all", "controller", ["hand"], "card"),
                    "<=",
                    6,
                ),
            ],
            effects=[
                eff(
                    1,
                    "draw",
                    target=sel("automatic_next", "controller", ["deck"], "card", count=dv_int(2)),
                    destination="hand",
                ),
            ],
        ),
    ]),
    "1647783366_top": side([
        ab(
            "the_coming_prophet_place",
            activation_mode="immediate",
            effects=[
                eff(
                    1,
                    "place",
                    target=sel("automatic_self", "controller", ["hand", "battle"], "enhancement", count=dv_int(1)),
                    destination="territory",
                ),
            ],
        ),
        ab(
            "the_coming_prophet_take_from_reserve",
            activation_mode="triggered",
            is_optional=True,
            trigger_event="play_card",
            trigger_filter=sel(
                "automatic_all", "controller", ["hand"], "hero", "good",
                brigades=["Green"], identifiers=["Prophet"],
            ),
            effects=[
                eff(
                    1,
                    "take",
                    target=sel(
                        "manual_controller", "controller", ["reserve_pile"], "card",
                        identifiers=["Star"], count=dv_int(1),
                    ),
                    destination="hand",
                ),
            ],
            modifiers=[mod("limit", limit_count=1, limit_per="turn")],
        ),
    ]),
    "474295183_top": side([
        ab(
            "sisera_commander_block_protect",
            activation_mode="static",
            conditions=[
                cond("zone_check", sel("automatic_self", "controller", ["battle"], "evil_character", "evil"), "==", 1),
            ],
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel("automatic_all", "both", ["in_play", "battle"], "enhancement", testament="OT"),
                    protection_filter=pf(actions=["negate"]),
                ),
            ],
            modifiers=[mod("cannot_be_negated", applies_to="target_cards")],
        ),
    ]),
    "-640065073_top": side([
        ab(
            "destructive_sin_place_and_negate",
            activation_mode="immediate",
            effects=[
                eff(
                    1,
                    "place",
                    target=sel("manual_controller", "both", ["in_play"], "hero", "good", count=dv_int(1)),
                    destination="in_play",
                ),
                eff(
                    2,
                    "negate",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel("chained_target", "both", ["in_play"], "hero", "good", ref_step=1),
                ),
                eff(
                    3,
                    "negate",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel("automatic_all", "opponent", ["in_play"], "fortress", "good"),
                ),
                eff(
                    4,
                    "negate",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel(
                        "automatic_all", "opponent", ["in_play"], "card", "good",
                        identifiers=["Covenant"],
                    ),
                ),
            ],
        ),
    ]),
    "-115958239_top": side([
        ab(
            "bad_decision_capture",
            activation_mode="immediate",
            conditions=[
                cond(
                    "zone_check",
                    sel(
                        "automatic_all", "opponent", ["territory"], "site",
                        identifiers=["empty", "single color"],
                    ),
                    ">=",
                    1,
                ),
            ],
            effects=[
                eff(
                    1,
                    "capture",
                    target=sel("manual_controller", "both", ["in_play"], "hero", "good", count=dv_int(1)),
                    destination="in_play",
                ),
                eff(
                    2,
                    "place",
                    target=sel(
                        "chained_target", "both", ["in_play"], "hero", "good",
                        identifiers=["empty single color site"], ref_step=1,
                    ),
                    destination="territory",
                    dependency="if_previous_successful",
                ),
            ],
        ),
    ]),
    "1600689221_top": side([
        ab(
            "spiritual_gifts_play_regardless",
            activation_mode="immediate",
            effects=[
                eff(
                    1,
                    "play",
                    effect_type="ongoing",
                    duration="this_turn",
                    target=sel(
                        "manual_controller", "controller", ["hand"], "enhancement",
                        identifiers=["Spiritual Gift"],
                    ),
                    destination="battle",
                ),
            ],
            modifiers=[mod("regardless")],
        ),
    ]),
    "1459960641_top": side([
        ab(
            "goshen_c_place_remove_or_exchange",
            activation_mode="triggered",
            is_optional=True,
            trigger_event="after_draw_phase",
            effects=[
                eff(
                    1,
                    "place",
                    target=sel(
                        "manual_controller", "controller", ["in_play", "territory"], "hero", "good",
                        identifiers=["in this site"], count=dv_up_to(3),
                    ),
                    destination="territory",
                ),
            ],
        ),
        ab(
            "goshen_c_protect",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel(
                        "automatic_all", "controller", ["territory"], "hero", "good",
                        identifiers=["in this site", "not in Field of Battle"],
                        count=dv_up_to(3),
                    ),
                    protection_filter=pf(from_harm=True, actions=["all effects"]),
                ),
            ],
        ),
    ]),
    "-390508071_top": side([
        ab(
            "goshen_wa_place_remove_or_exchange",
            activation_mode="triggered",
            is_optional=True,
            trigger_event="after_draw_phase",
            effects=[
                eff(
                    1,
                    "place",
                    target=sel(
                        "manual_controller", "controller", ["in_play", "territory"], "hero", "good",
                        identifiers=["in this site"], count=dv_up_to(3),
                    ),
                    destination="territory",
                ),
            ],
        ),
        ab(
            "goshen_wa_protect",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel(
                        "automatic_all", "controller", ["territory"], "hero", "good",
                        identifiers=["in this site", "not in Field of Battle"],
                        count=dv_up_to(3),
                    ),
                    protection_filter=pf(from_harm=True, actions=["all effects"]),
                ),
            ],
        ),
    ]),
    "1724947058_top": side([
        ab(
            "chamber_of_angels_set_aside",
            activation_mode="immediate",
            effects=[
                eff(
                    1,
                    "set-aside",
                    target=sel("automatic_self", "controller", ["in_play"], "fortress", count=dv_int(1)),
                    destination="set_aside",
                ),
            ],
        ),
        ab(
            "chamber_of_angels_place_instead",
            activation_mode="triggered",
            trigger_event="discard",
            trigger_filter=sel(
                "automatic_all", "controller", ["battle", "in_play"], "hero", "good",
                identifiers=["Angel"],
            ),
            effects=[
                eff(
                    1,
                    "place",
                    target=sel(
                        "automatic_all", "controller", ["battle", "in_play"], "hero", "good",
                        identifiers=["Angel"], count=dv_int(1),
                    ),
                    destination="set_aside",
                ),
            ],
            modifiers=[mod("instead", trigger_event="discard", replace_with_action="place")],
        ),
        ab(
            "chamber_of_angels_return_after_two_turns",
            activation_mode="triggered",
            trigger_event="after_two_turns",
            effects=[
                eff(
                    1,
                    "topdeck",
                    target=sel(
                        "automatic_all", "controller", ["set_aside"], "hero", "good",
                        identifiers=["held here", "after 2 turns"], count=dv_int(1),
                    ),
                    destination="deck",
                    destination_position="top",
                ),
            ],
            modifiers=[mod("limit", limit_count=2, limit_per="turn")],
        ),
    ]),
    "459315001_top": side([
        ab(
            "chamber_of_angels_goc_hold",
            activation_mode="triggered",
            is_optional=True,
            trigger_event="on_harmed_or_defeated",
            trigger_filter=sel(
                "automatic_all", "controller", ["battle", "in_play"], "hero", "good",
                identifiers=["Angel"],
            ),
            effects=[
                eff(
                    1,
                    "hold",
                    target=sel(
                        "automatic_all", "controller", ["battle", "in_play"], "hero", "good",
                        identifiers=["Angel"], count=dv_int(1),
                    ),
                    destination="in_play",
                ),
            ],
            modifiers=[mod("instead", trigger_event="harm_or_defeat", replace_with_action="hold")],
        ),
        ab(
            "chamber_of_angels_goc_negate",
            activation_mode="static",
            conditions=[
                cond(
                    "zone_check",
                    sel(
                        "automatic_all", "controller", ["in_play"], "hero", "good",
                        identifiers=["occupying this Fortress"],
                    ),
                    ">=",
                    1,
                ),
            ],
            effects=[
                eff(
                    1,
                    "negate",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel("automatic_all", "opponent", ["territory"], "card", alignment="evil"),
                ),
            ],
        ),
    ]),
    "1205477770_top": side([
        ab(
            "every_mans_sword_cow_discard",
            activation_mode="immediate",
            is_optional=True,
            effects=[
                eff(
                    1,
                    "discard",
                    target=sel(
                        "manual_controller", "both", ["in_play"], "card",
                        brigades=["Multi"], count=dv_int(1),
                    ),
                    destination="discard_pile",
                ),
            ],
        ),
    ]),
    "494103683_top": side([
        ab(
            "haman_promo_set_aside",
            activation_mode="immediate",
            effects=[
                eff(
                    1,
                    "set-aside",
                    duration="while_condition",
                    target=sel(
                        "manual_controller", "opponent", ["territory"], "hero", "good",
                        gender="male", testament="OT", identifiers=["for 4 turns"],
                        count=dv_up_to(3),
                    ),
                    destination="set_aside",
                    creates_context_scope=True,
                ),
            ],
            modifiers=[mod("limit", limit_count=4, limit_per="turn")],
        ),
        ab(
            "haman_promo_discard_after_4_turns",
            activation_mode="triggered",
            trigger_event="turn_end",
            conditions=[
                cond(
                    "zone_check",
                    sel(
                        "automatic_all", "opponent", ["land_of_redemption"], "hero", "good",
                        gender="female", identifiers=["successful rescue during 4 turns"],
                    ),
                    "==",
                    0,
                ),
            ],
            effects=[
                eff(
                    1,
                    "discard",
                    target=sel(
                        "automatic_all", "opponent", ["set_aside"], "hero", "good",
                        gender="male", testament="OT",
                    ),
                    destination="discard_pile",
                ),
            ],
        ),
    ]),
    "606515729_top": side([
        ab(
            "child_of_great_wisdom_ignore",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "ignore",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel(
                        "automatic_all", "both", ["in_play"], "evil_character", "evil",
                        identifiers=["Pharisee", "Sadducee"],
                    ),
                ),
            ],
        ),
    ]),
    "1434629132_top": side([
        ab(
            "evicted_discard_2_heroes",
            activation_mode="immediate",
            choice_group="evicted_choice",
            effects=[
                eff(
                    1,
                    "discard",
                    target=sel("manual_controller", "both", ["in_play"], "hero", "good", count=dv_int(2)),
                    destination="discard_pile",
                ),
            ],
        ),
        ab(
            "evicted_opponent_withdraw_instead",
            activation_mode="immediate",
            is_optional=True,
            choice_group="evicted_choice",
            effects=[
                eff(
                    1,
                    "withdraw",
                    target=sel("automatic_all", "opponent", ["battle"], "hero", "good", count=dv_all()),
                    destination="territory",
                ),
            ],
            modifiers=[mod("instead", trigger_event="discard", replace_with_action="withdraw")],
        ),
        ab(
            "evicted_cannot_be_negated",
            activation_mode="static",
            conditions=[
                cond(
                    "zone_check",
                    sel("automatic_all", "controller", ["battle"], "evil_character", "evil", identifiers=["Pharaoh"]),
                    ">=",
                    1,
                ),
            ],
            effects=[],
            modifiers=[mod("cannot_be_negated", applies_to="this_side")],
        ),
    ]),
    "1017262242_top": side([
        ab(
            "valley_of_salt_interrupt_and_discard",
            activation_mode="immediate",
            choice_group="valley_of_salt_choice",
            effects=[
                eff(
                    1,
                    "interrupt",
                    target=sel("automatic_all", "both", ["battle"], "card"),
                ),
                eff(
                    2,
                    "discard",
                    target=sel(
                        "manual_controller", "opponent", ["in_play", "battle"],
                        "evil_character", "evil",
                        count=dv_x("count_cards", scope="battle", target_type="evil_character", min_value=0),
                    ),
                    destination="discard_pile",
                ),
            ],
        ),
        ab(
            "valley_of_salt_underdeck_instead",
            activation_mode="immediate",
            is_optional=True,
            choice_group="valley_of_salt_choice",
            effects=[
                eff(
                    1,
                    "underdeck",
                    target=sel(
                        "manual_opponent", "opponent", ["in_play", "battle"],
                        "evil_character", "evil",
                        count=dv_x("count_cards", scope="battle", target_type="evil_character", min_value=0),
                    ),
                    destination="deck",
                    destination_position="bottom",
                ),
            ],
            modifiers=[mod("instead", trigger_event="discard", replace_with_action="underdeck")],
        ),
        ab(
            "valley_of_salt_cannot_be_negated",
            activation_mode="static",
            conditions=[
                cond(
                    "zone_check",
                    sel("automatic_all", "controller", ["battle"], "hero", "good", card_titles=["King Amaziah"]),
                    ">=",
                    1,
                ),
            ],
            effects=[],
            modifiers=[mod("cannot_be_negated", applies_to="this_side")],
        ),
    ]),
    "-811903860_shared": side([
        ab(
            "covenant_of_abraham_use_as_artifact",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "activate an artifact",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel(
                        "automatic_self", "controller", ["in_play"], "card",
                        identifiers=["use as an enhancement or an Artifact"],
                    ),
                ),
            ],
        ),
        ab(
            "covenant_of_abraham_restrict_set_aside",
            activation_mode="static",
            conditions=[
                cond(
                    "zone_check",
                    sel(
                        "automatic_self", "controller", ["in_play"], "card",
                        card_titles=["Covenant of Abraham"],
                    ),
                    ">=",
                    1,
                ),
            ],
            effects=[
                eff(
                    1,
                    "restrict",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel(
                        "automatic_all", "both", ["in_play"], "evil_character", "evil",
                        identifiers=["set-aside"],
                    ),
                ),
            ],
        ),
    ]),
    "734422323_top": side([
        ab(
            "eleazar_protect_weapons",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel(
                        "automatic_all", "controller", ["battle", "in_play"], "enhancement",
                        classes=["Weapon"], identifiers=["used by Eleazar"],
                    ),
                    protection_filter=pf(actions=["negate", "discard"]),
                ),
            ],
            modifiers=[mod("cannot_be_negated", applies_to="target_cards")],
        ),
    ]),
    "1804190925_top": side([
        ab(
            "confused_languages_restrict_band",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "restrict",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel(
                        "automatic_all", "both", ["in_play"], "evil_character", "evil",
                        identifiers=["band", "banding"],
                    ),
                ),
            ],
        ),
        ab(
            "confused_languages_withdraw_banded",
            activation_mode="immediate",
            effects=[
                eff(
                    1,
                    "withdraw",
                    target=sel(
                        "automatic_all", "both", ["battle"], "evil_character", "evil",
                        identifiers=["already banded"],
                    ),
                    destination="territory",
                ),
            ],
        ),
    ]),
    "-1690118569_top": side([
        ab(
            "three_nails_prevent_demon_block",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "prevent",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel(
                        "automatic_all", "both", ["in_play", "battle"], "evil_character", "evil",
                        identifiers=["Demon"],
                    ),
                ),
            ],
        ),
    ]),
}
