"""Curated REG v11.1.0 AST repairs for incomplete 'instead' replacement cards."""

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


def _entrapping_pharisee_ast() -> Dict[str, Any]:
    """Builds the canonical Entrapping Pharisee (GoC / TxP) AST."""
    return side(
        [
            ab(
                "entrapping_pharisee_capture",
                activation_mode="immediate",
                is_optional=True,
                is_negatable=False,
                choice_group="entrapping_pharisee_choice",
                costs=[
                    eff(1, "reveal", target=sel("manual_controller", "controller", ["hand"], "card", brigades=["Gray"], testament="NT", count=dv_int(1))),
                ],
                effects=[
                    eff(
                        2,
                        "capture",
                        target=sel("manual_controller", "opponent", ["battle"], "hero", "good", is_human=True, count=dv_int(1)),
                        destination="land_of_bondage",
                        dependency="if_previous_successful",
                    ),
                ],
                modifiers=[mod("cannot_be_negated")],
            ),
            ab(
                "entrapping_pharisee_discard_instead",
                activation_mode="immediate",
                is_optional=True,
                is_negatable=False,
                choice_group="entrapping_pharisee_choice",
                effects=[
                    eff(
                        1,
                        "discard",
                        target=sel("manual_opponent", "opponent", ["hand"], "card", identifiers=["matching Hero's brigade"], count=dv_int(1)),
                        destination="discard_pile",
                    ),
                ],
                modifiers=[mod("cannot_be_negated"), mod("instead", trigger_event="capture", replace_with_action="discard")],
            ),
        ],
        modifiers=[mod("cannot_be_negated", applies_to="this_side")],
    )


INSTEAD_REPAIRS: Dict[str, Dict[str, Any]] = {
    "-1158902381_top": _entrapping_pharisee_ast(),
    "1510607174_top": _entrapping_pharisee_ast(),
    "102020009_top": side([
        ab(
            "ram_in_thicket_replace_discard",
            activation_mode="triggered",
            trigger_event="discard",
            trigger_filter=sel("automatic_all", "controller", ["in_play", "battle"], "hero", "good", card_titles=["Isaac"]),
            effects=[
                eff(1, "discard", target=sel("automatic_self", "controller", ["in_play"], "hero", "good"), destination="discard_pile"),
            ],
            modifiers=[mod("instead", trigger_event="discard", replace_with_action="discard")],
        ),
        ab(
            "ram_in_thicket_place_site",
            activation_mode="immediate",
            is_optional=True,
            effects=[
                eff(1, "place", target=sel("manual_controller", "controller", ["in_play"], "site", count=dv_int(1)), destination="in_play"),
            ],
        ),
        ab(
            "ram_in_thicket_add_to_battle",
            activation_mode="triggered",
            is_optional=True,
            trigger_event="rescue_attempt",
            effects=[
                eff(1, "add to battle", target=sel("automatic_self", "controller", ["territory"], "hero", "good"), destination="battle"),
            ],
        ),
    ]),
    "1167084845_top": side([
        ab(
            "assyria_conquers_israel_discard_site_or_fortress",
            activation_mode="immediate",
            choice_group="assyria_conquers_choice",
            effects=[
                eff(
                    1,
                    "discard",
                    target=sel("manual_controller", "both", ["in_play"], "card", testament="OT", identifiers=["Site", "Fortress"], count=dv_int(1)),
                    destination="discard_pile",
                ),
            ],
        ),
        ab(
            "assyria_conquers_israel_mill_instead",
            activation_mode="immediate",
            is_optional=True,
            choice_group="assyria_conquers_choice",
            effects=[
                eff(
                    1,
                    "discard",
                    target=sel(
                        "automatic_next", "opponent", ["deck"], "card",
                        count=dv_x("count_cards", scope="deck", target_type="card"),
                    ),
                    destination="discard_pile",
                    destination_position="top",
                    creates_context_scope=True,
                ),
                eff(
                    2,
                    "place",
                    target=sel("automatic_all", "opponent", ["context_scope", "deck"], "lost_soul"),
                    destination="in_play",
                    dependency="always",
                ),
            ],
            modifiers=[mod("instead", trigger_event="discard", replace_with_action="discard")],
        ),
    ]),
    "-660213726_top": side([
        ab(
            "doom_speakers_bounce_heroes",
            activation_mode="immediate",
            choice_group="doom_speakers_choice",
            effects=[
                eff(
                    1,
                    "bounce",
                    target=sel(
                        "manual_controller", "both", ["in_play"], "hero", "good",
                        count=dv_x("count_cards", scope="in_play", target_type="hero", min_value=0),
                    ),
                    destination="hand",
                ),
            ],
        ),
        ab(
            "doom_speakers_reveal_instead",
            activation_mode="immediate",
            is_optional=True,
            choice_group="doom_speakers_choice",
            effects=[
                eff(1, "reveal", target=sel("manual_opponent", "opponent", ["hand"], "card", alignment="good", count=dv_int(2))),
            ],
            modifiers=[mod("instead", trigger_event="bounce", replace_with_action="reveal")],
        ),
        ab(
            "doom_speakers_exchange_pharisee",
            activation_mode="immediate",
            is_optional=True,
            effects=[
                eff(1, "exchange", target=sel("manual_controller", "controller", ["reserve_pile"], "evil_character", "evil", identifiers=["Pharisee"], count=dv_int(1))),
            ],
        ),
    ]),
    "-1428017905_top": side(
        [
            ab(
                "antiochus_iv_discard_hero",
                activation_mode="immediate",
                is_negatable=False,
                choice_group="antiochus_choice",
                conditions=[cond("zone_check", sel("automatic_all", "controller", ["in_play"], "evil_character", "evil", identifiers=["Greek"]), ">=", 1)],
                effects=[
                    eff(1, "discard", target=sel("manual_controller", "both", ["in_play"], "hero", "good", count=dv_int(1)), destination="discard_pile"),
                ],
                modifiers=[mod("cannot_be_negated")],
            ),
            ab(
                "antiochus_iv_discard_matching_instead",
                activation_mode="immediate",
                is_optional=True,
                is_negatable=False,
                choice_group="antiochus_choice",
                effects=[
                    eff(1, "discard", target=sel("manual_opponent", "opponent", ["hand", "territory"], "card", identifiers=["matching brigade"], count=dv_int(1)), destination="discard_pile"),
                ],
                modifiers=[mod("cannot_be_negated"), mod("instead", trigger_event="discard", replace_with_action="discard")],
            ),
        ],
        modifiers=[mod("cannot_be_negated", applies_to="this_side")],
    ),
    "1454249214_top": side([
        ab(
            "moabite_messenger_bounce_heroes",
            activation_mode="immediate",
            choice_group="moabite_messenger_choice",
            effects=[
                eff(1, "bounce", target=sel("manual_controller", "both", ["in_play", "battle"], "hero", "good", testament="OT", count=dv_up_to(2)), destination="hand"),
            ],
        ),
        ab(
            "moabite_messenger_topdeck_instead",
            activation_mode="immediate",
            is_optional=True,
            choice_group="moabite_messenger_choice",
            effects=[
                eff(
                    1,
                    "topdeck",
                    target=sel("manual_opponent", "opponent", ["hand"], "card", count=dv_x("count_cards", scope="hand", target_type="card", min_value=0)),
                    destination="deck",
                    destination_position="top",
                ),
            ],
            modifiers=[mod("instead", trigger_event="bounce", replace_with_action="topdeck")],
        ),
        ab(
            "moabite_messenger_cannot_be_negated",
            activation_mode="static",
            conditions=[cond("zone_check", sel("automatic_all", "opponent", ["in_play"], "card", identifiers=["used search ability this turn"]), ">=", 1)],
            effects=[],
            modifiers=[mod("cannot_be_negated", applies_to="this_side")],
        ),
    ]),
    "-1761739075_top": side([
        ab(
            "rash_oath_mill_or_place_ls",
            activation_mode="immediate",
            choice_group="rash_oath_choice",
            costs=[
                eff(1, "discard", target=sel("manual_controller", "controller", ["land_of_bondage", "in_play"], "hero", "good", identifiers=["captured"], count=dv_int(1)), destination="discard_pile"),
            ],
            effects=[
                eff(2, "discard", target=sel("automatic_next", "opponent", ["deck"], "card", count=dv_int(1)), destination="discard_pile", destination_position="top", creates_context_scope=True, dependency="if_previous_successful"),
                eff(3, "place", target=sel("automatic_all", "opponent", ["context_scope", "deck"], "lost_soul"), destination="in_play", dependency="always"),
            ],
            modifiers=[mod("instead", trigger_event="discard", replace_with_action="place")],
        ),
        ab(
            "rash_oath_mill_herod_place_ls",
            activation_mode="immediate",
            choice_group="rash_oath_choice",
            conditions=[cond("zone_check", sel("automatic_all", "controller", ["battle"], "evil_character", "evil", identifiers=["Herod"]), ">=", 1)],
            costs=[
                eff(1, "discard", target=sel("manual_controller", "controller", ["land_of_bondage", "in_play"], "hero", "good", identifiers=["captured"], count=dv_int(1)), destination="discard_pile"),
            ],
            effects=[
                eff(2, "discard", target=sel("automatic_next", "opponent", ["deck"], "card", count=dv_int(2)), destination="discard_pile", destination_position="top", creates_context_scope=True, dependency="if_previous_successful"),
                eff(3, "place", target=sel("automatic_all", "opponent", ["context_scope", "deck"], "lost_soul"), destination="in_play", dependency="always"),
            ],
            modifiers=[mod("instead", trigger_event="discard", replace_with_action="place")],
        ),
    ]),
    "157462427_top": side(
        [
            ab(
                "persian_conquerors_discard",
                activation_mode="immediate",
                is_interruptible=False,
                choice_group="persian_conquerors_choice",
                conditions=[cond("zone_check", sel("automatic_all", "controller", ["in_play"], "evil_character", "evil", identifiers=["Persian"]), ">=", 1)],
                effects=[
                    eff(1, "discard", target=sel("manual_controller", "both", ["in_play"], "card", identifiers=["Fortress", "Site", "Artifact"], count=dv_int(1)), destination="discard_pile"),
                ],
                modifiers=[mod("cannot_be_interrupted")],
            ),
            ab(
                "persian_conquerors_set_aside_instead",
                activation_mode="immediate",
                is_optional=True,
                is_interruptible=False,
                choice_group="persian_conquerors_choice",
                effects=[
                    eff(1, "set-aside", effect_type="ongoing", duration="this_turn", target=sel("automatic_all", "both", ["battle"], "hero", "good", count=dv_all()), destination="set_aside"),
                ],
                modifiers=[mod("cannot_be_interrupted"), mod("instead", trigger_event="discard", replace_with_action="set-aside"), mod("limit", limit_count=1, limit_per="turn")],
            ),
        ],
        modifiers=[mod("cannot_be_interrupted", applies_to="this_side")],
    ),
}
