"""Curated REG v11.1.0 AST repairs for protection_filter and protect target bugs."""

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


def _dragonraid_site_ast() -> Dict[str, Any]:
    """Builds the canonical DragonRaid-protection Site AST."""
    return side([
        ab(
            "protect_evil_cards_from_dragonraid",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_all", "both", ["in_play", "territory"], "card", alignment="evil", identifiers=["on this site"]),
                    protection_filter=pf(
                        from_harm=True,
                        card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "card", identifiers=["DragonRaid"])],
                    ),
                ),
            ],
        ),
    ])


def _daniel_cow_ast() -> Dict[str, Any]:
    """Builds the canonical Daniel (CoW / CoW AB) AST."""
    return side(
        [
            ab(
                "protect_daniel_from_animals",
                activation_mode="static",
                is_negatable=False,
                effects=[
                    eff(
                        1,
                        "protect",
                        effect_type="ongoing",
                        duration="permanent",
                        target=sel("automatic_all", "controller", ["in_play"], "hero", "good", card_titles=["Daniel"]),
                        protection_filter=pf(
                            from_harm=True,
                            card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "card", identifiers=["Animal"])],
                        ),
                    ),
                ],
                modifiers=[mod("cannot_be_negated")],
            ),
            ab(
                "shuffle_good_daniel_or_cloud",
                activation_mode="immediate",
                is_optional=True,
                is_negatable=False,
                choice_group="daniel_shuffle",
                effects=[
                    eff(
                        1,
                        "shuffle",
                        target=sel("manual_controller", "controller", ["discard_pile"], "card", "good", card_titles=["Daniel"], count=dv_int(1)),
                        destination="deck",
                    ),
                ],
                modifiers=[mod("cannot_be_negated")],
            ),
            ab(
                "shuffle_cloud_card",
                activation_mode="immediate",
                is_optional=True,
                is_negatable=False,
                choice_group="daniel_shuffle",
                effects=[
                    eff(
                        1,
                        "shuffle",
                        target=sel("manual_controller", "controller", ["discard_pile"], "card", identifiers=["Cloud"], count=dv_int(1)),
                        destination="deck",
                    ),
                ],
                modifiers=[mod("cannot_be_negated")],
            ),
        ],
        modifiers=[mod("cannot_be_negated", applies_to="this_side")],
    )


def _restored_land_ast() -> Dict[str, Any]:
    """Builds the canonical Restored Land AST."""
    return side([
        ab(
            "restored_land_discard_evil_character",
            activation_mode="triggered",
            is_optional=True,
            trigger_event="character_attacks",
            trigger_filter=sel("automatic_all", "controller", ["battle"], "hero", "good", testament="OT", identifiers=["Prophet"]),
            effects=[
                eff(
                    1,
                    "discard",
                    target=sel("manual_controller", "either", ["deck"], "evil_character", "evil", count=dv_int(1)),
                    destination="discard_pile",
                ),
            ],
        ),
        ab(
            "restored_land_protect_prophets",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_all", "controller", ["territory"], "hero", "good", testament="OT", identifiers=["Prophet"]),
                    protection_filter=pf(
                        from_harm=True,
                        card_sources=[sel("automatic_all", "opponent", ["in_play", "battle"], "card")],
                    ),
                ),
            ],
        ),
    ])


PROTECT_AND_WORTH_REPAIRS: Dict[str, Dict[str, Any]] = {
    "452296863_top": side([
        ab(
            "esther_immune_to_hamans_plot",
            activation_mode="static",
            is_negatable=False,
            conditions=[cond("zone_check", sel("automatic_all", "controller", ["in_play"], "hero", "good", card_titles=["Esther"]), ">=", 1)],
            effects=[
                eff(
                    1,
                    "immune",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel("automatic_all", "both", ["in_play"], "character", identifiers=["except Haman"]),
                    protection_filter=pf(card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "card", card_titles=["Haman's Plot"])]),
                ),
            ],
            modifiers=[mod("cannot_be_negated")],
        ),
    ]),
    "68669474_top": side([
        ab(
            "archippus_protect_christ_enhancements",
            activation_mode="static",
            conditions=[cond("zone_check", sel("automatic_all", "both", ["in_play"], "evil_character", "evil", identifiers=["Heretic"]), ">=", 1)],
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="while_condition",
                    target=sel(
                        "automatic_all", "both", ["in_play", "battle"], "enhancement",
                        brigades=["Clay"], card_titles=["Christ", "Jesus"], identifiers=["used by Colossae Heroes"],
                    ),
                    protection_filter=pf(
                        actions=["negate"],
                        card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "card", alignment="evil")],
                    ),
                ),
            ],
            modifiers=[mod("cannot_be_negated", applies_to="target_cards")],
        ),
    ]),
    "-1048862073_top": side([
        ab(
            "site_access_any",
            activation_mode="static",
            is_preventable=False,
            is_interruptible=False,
            is_negatable=False,
            effects=[eff(1, "site access", effect_type="ongoing", duration="permanent", target=sel("automatic_self", "controller", ["in_play"], "hero", "good"))],
        ),
        ab(
            "immune_to_gray_brigade",
            activation_mode="static",
            is_preventable=False,
            is_interruptible=False,
            is_negatable=False,
            effects=[
                eff(
                    1,
                    "immune",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_self", "controller", ["in_play"], "hero", "good"),
                    protection_filter=pf(card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "card", brigades=["Gray"])]),
                ),
            ],
        ),
    ]),
    "-1819609847_top": side([
        ab(
            "helmet_of_salvation_immune_to_confusion",
            activation_mode="static",
            is_preventable=False,
            is_interruptible=False,
            is_negatable=False,
            effects=[
                eff(
                    1,
                    "immune",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_self", "controller", ["in_play"], "hero", "good"),
                    protection_filter=pf(card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "card", card_titles=["Confusion"])]),
                ),
            ],
        ),
    ]),
    "-1825485405_top": side([
        ab(
            "eleazars_sword_immune_male_philistines",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "immune",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_all", "controller", ["in_play"], "hero", "good"),
                    protection_filter=pf(
                        card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "evil_character", "evil", gender="male", identifiers=["Philistine"])],
                    ),
                ),
            ],
        ),
    ]),
    "-1977529248_shared": side([
        ab(
            "incurable_protect_heroes_from_healing",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_all", "both", ["territory"], "hero", "good"),
                    protection_filter=pf(actions=["heal"]),
                ),
            ],
        ),
        ab(
            "incurable_opponent_discard_to_discard",
            activation_mode="manually_triggered",
            is_optional=True,
            costs=[eff(1, "discard", target=sel("manual_opponent", "opponent", ["hand"], "enhancement", "good", count=dv_int(2)), destination="discard_pile")],
            effects=[eff(2, "discard", target=sel("automatic_self", "controller", ["in_play"], "card", count=dv_int(1)), destination="discard_pile", dependency="if_previous_successful")],
        ),
    ]),
    "-1278295935_top": side(
        [
            ab(
                "assyrian_survivor_protect_from_discard",
                activation_mode="static",
                is_interruptible=False,
                effects=[
                    eff(
                        1,
                        "protect",
                        effect_type="ongoing",
                        duration="permanent",
                        target=sel("automatic_self", "controller", ["in_play"], "evil_character", "evil"),
                        protection_filter=pf(
                            actions=["discard"],
                            card_sources=[sel("automatic_all", "opponent", ["in_play", "battle"], "card")],
                        ),
                    ),
                ],
                modifiers=[mod("cannot_be_interrupted")],
            ),
            ab(
                "assyrian_survivor_capture_if_defeated",
                activation_mode="triggered",
                is_interruptible=False,
                trigger_event="defeat",
                effects=[
                    eff(
                        1,
                        "capture",
                        target=sel("automatic_self", "controller", ["in_play", "battle"], "evil_character", "evil"),
                        destination="land_of_bondage",
                    ),
                ],
                modifiers=[mod("cannot_be_interrupted")],
            ),
        ],
        modifiers=[mod("cannot_be_interrupted", applies_to="this_side")],
    ),
    "-1146133057_top": side([
        ab(
            "book_of_the_law_protect_ot_enhancements",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_all", "controller", ["in_play", "deck", "discard_pile", "set_aside"], "enhancement", "good", testament="OT"),
                    protection_filter=pf(actions=["remove from the game", "banish"]),
                ),
            ],
        ),
    ]),
    "-519903135_top": side([
        ab(
            "emperor_claudius_immune_to_nt_heroes",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "immune",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_self", "controller", ["in_play"], "evil_character", "evil"),
                    protection_filter=pf(card_sources=[sel("automatic_all", "both", ["in_play", "battle"], "hero", "good", testament="NT")]),
                ),
            ],
        ),
    ]),
    "1958295081_top": side([
        ab(
            "angel_of_the_waters_protect_silver_heroes",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="this_turn",
                    target=sel("automatic_all", "both", ["in_play"], "hero", "good", brigades=["Silver"]),
                    protection_filter=pf(actions=["capture"]),
                ),
            ],
        ),
    ]),
    "-476621636_top": side(
        [
            ab(
                "oak_angel_draw_exchange",
                activation_mode="immediate",
                is_optional=True,
                is_negatable=False,
                effects=[
                    eff(1, "draw", target=sel("automatic_next", "controller", ["deck"], "card", count=dv_int(2)), destination="hand"),
                    eff(
                        2,
                        "exchange",
                        target=sel("manual_controller", "controller", ["hand", "deck", "territory", "discard_pile"], "hero", "good", brigades=["Gold"], identifiers=["Judge"], count=dv_int(1)),
                    ),
                ],
                modifiers=[mod("cannot_be_negated")],
            ),
            ab(
                "oak_angel_protect_gideon",
                activation_mode="static",
                is_negatable=False,
                effects=[
                    eff(
                        1,
                        "protect",
                        effect_type="ongoing",
                        duration="permanent",
                        target=sel("automatic_all", "controller", ["in_play"], "hero", "good", card_titles=["Gideon"]),
                        protection_filter=pf(
                            from_harm=True,
                            card_sources=[sel("automatic_all", "opponent", ["in_play", "battle"], "card")],
                        ),
                    ),
                ],
                modifiers=[mod("cannot_be_negated")],
            ),
        ],
        modifiers=[mod("cannot_be_negated", applies_to="this_side")],
    ),
    "1395548722_top": _daniel_cow_ast(),
    "-427782989_top": _daniel_cow_ast(),
    "1824885318_top": side([
        ab(
            "flee_from_enemies_protect_bounce",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_all", "both", ["in_play"], "character"),
                    protection_filter=pf(actions=["bounce", "return to hand"]),
                ),
            ],
        ),
    ]),
    "-433165408_top": side([
        ab(
            "nazareth_protect_hand_territory_shuffle",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_all", "controller", ["territory", "hand"], "card"),
                    protection_filter=pf(
                        actions=["shuffle"],
                        card_sources=[sel("automatic_all", "opponent", ["in_play", "battle"], "card")],
                    ),
                ),
            ],
        ),
        ab(
            "nazareth_protect_decks_search",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="permanent",
                    target=sel("automatic_all", "both", ["deck"], "card"),
                    protection_filter=pf(actions=["search"]),
                ),
            ],
        ),
    ]),
    "569433926_top": side([
        ab(
            "swift_protect_sites",
            activation_mode="static",
            effects=[
                eff(
                    1,
                    "protect",
                    effect_type="ongoing",
                    duration="this_turn",
                    target=sel("automatic_all", "controller", ["in_play"], "site"),
                    protection_filter=pf(actions=["discard", "remove from the game", "banish"]),
                ),
            ],
        ),
    ]),
    "-931890752_top": _dragonraid_site_ast(),
    "737058433_top": _dragonraid_site_ast(),
    "-1254444557_top": _dragonraid_site_ast(),
    "1909960815_top": _dragonraid_site_ast(),
    "525237275_top": _dragonraid_site_ast(),
    "-1535804406_top": _dragonraid_site_ast(),
    "-379872457_top": _restored_land_ast(),
    "-1458902925_top": _restored_land_ast(),
}
