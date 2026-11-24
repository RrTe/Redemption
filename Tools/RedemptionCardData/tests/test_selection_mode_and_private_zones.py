"""Unit and dataset-wide tests for selection_mode + count and private-zone zone_owner."""

from __future__ import annotations

import importlib
import json
import sys
import unittest
from pathlib import Path
from typing import Any, Dict

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(ROOT_DIR / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "scripts"))

from models.enums import SelectionMode

STAGE08 = importlib.import_module("scripts.08_parse_abilities")
STAGE10 = importlib.import_module("scripts.10_verify_logic")
DIST_LOGIC_PATH = ROOT_DIR / "data" / "dist" / "cards_logic.json"

_EXEMPT_ACTIONS = {"restrict", "change hand size", "create a token"}


def _find_effect(card_entry: Dict[str, Any], ab_id: str, action: str | None = None) -> Dict[str, Any]:
    """Finds a serialized effect dictionary on top side by ability_id and optional action."""
    for ab in card_entry["sides"]["top"]["abilities"]:
        if ab["ability_id"] != ab_id:
            continue
        for ef in ab["effects"]:
            if action is None or ef["action"] == action:
                return ef
    raise AssertionError(f"Effect not found: ab_id={ab_id}, action={action}")


class TestSelectionModeAndPrivateZones(unittest.TestCase):
    """Validates Stage 08 parse_colon_clause and Stage 10 selection_mode/zone_owner gates."""

    def test_parse_colon_clause_uses_automatic_next_last_for_deck_and_all_for_hand(self) -> None:
        """Top-deck look uses automatic_next, bottom-deck uses automatic_last, hand uses automatic_all without count."""
        ab_top = STAGE08.parse_colon_clause("You may look at the top 3 cards of deck: Take up to 1 and underdeck the rest.", 1)
        self.assertIsNotNone(ab_top)
        self.assertEqual(ab_top.effects[0].target.selection_mode, SelectionMode.AUTOMATIC_NEXT)
        self.assertEqual(ab_top.effects[0].target.count.fixed_value, 3)

        ab_bot = STAGE08.parse_colon_clause("Look at the bottom 6 cards of deck: Topdeck 1.", 1)
        self.assertIsNotNone(ab_bot)
        self.assertEqual(ab_bot.effects[0].target.selection_mode, SelectionMode.AUTOMATIC_LAST)
        self.assertEqual(ab_bot.effects[0].target.count.fixed_value, 6)

        ab_hand = STAGE08.parse_colon_clause("Look at opponent's hand: Discard 1.", 1)
        self.assertIsNotNone(ab_hand)
        self.assertEqual(ab_hand.effects[0].target.selection_mode, SelectionMode.AUTOMATIC_ALL)
        self.assertIsNone(ab_hand.effects[0].target.count)

    def test_stage10_rejects_contradictory_automatic_all_and_private_both(self) -> None:
        """Stage 10 flags automatic_all+count and invalid private-zone both, while allowing valid dynamic/multiplayer cases."""
        bad_take = {
            "card_identifier": "TEST_BAD_TAKE",
            "sides": {
                "top": {
                    "abilities": [{
                        "ability_id": "take_reserve",
                        "activation_mode": "immediate",
                        "effects": [{
                            "step": 1,
                            "action": "take",
                            "target": {
                                "selection_mode": "automatic_all",
                                "zone_owner": "both",
                                "scope": ["reserve_pile"],
                                "target_type": "card",
                                "count": {"fixed_value": 1},
                            },
                        }],
                    }]
                }
            },
        }
        issues_take, _ = STAGE10.verify_card_logic(
            "TEST_BAD_TAKE",
            bad_take,
            raw_abilities={"top": "You may take a good O.T. card from Reserve."},
        )
        self.assertTrue(any("Contradictory selection_mode='automatic_all' with count" in m for m in issues_take))
        self.assertTrue(any("Invalid zone_owner='both' on private zone" in m for m in issues_take))

        bad_all = {
            "card_identifier": "TEST_BAD_ALL",
            "sides": {
                "top": {
                    "abilities": [{
                        "ability_id": "discard_all",
                        "activation_mode": "immediate",
                        "effects": [{
                            "step": 1,
                            "action": "discard",
                            "target": {
                                "selection_mode": "automatic_all",
                                "zone_owner": "both",
                                "scope": ["battle"],
                                "target_type": "evil_character",
                                "count": {"fixed_value": "all"},
                            },
                        }],
                    }]
                }
            },
        }
        issues_all, _ = STAGE10.verify_card_logic(
            "TEST_BAD_ALL",
            bad_all,
            raw_abilities={"top": "Discard all Evil Characters in battle."},
        )
        self.assertTrue(any("Contradictory selection_mode='automatic_all' with count" in m for m in issues_all))

        valid_dynamic_and_multi = {
            "card_identifier": "TEST_VALID",
            "sides": {
                "top": {
                    "abilities": [
                        {
                            "ability_id": "withdraw_except_one",
                            "activation_mode": "immediate",
                            "effects": [{
                                "step": 1,
                                "action": "withdraw",
                                "target": {
                                    "selection_mode": "automatic_all",
                                    "zone_owner": "both",
                                    "scope": ["battle"],
                                    "target_type": "hero",
                                    "count": {"dynamic": {"source": "count_cards", "operation": "add", "multiplier": 1, "offset": -1}},
                                },
                            }],
                        },
                        {
                            "ability_id": "search_each_discard",
                            "activation_mode": "immediate",
                            "effects": [{
                                "step": 1,
                                "action": "search",
                                "target": {
                                    "selection_mode": "manual_controller",
                                    "zone_owner": "both",
                                    "scope": ["discard_pile"],
                                    "target_type": "hero",
                                    "count": {"fixed_value": 1},
                                },
                            }],
                        },
                    ]
                }
            },
        }
        issues_ok, _ = STAGE10.verify_card_logic(
            "TEST_VALID",
            valid_dynamic_and_multi,
            raw_abilities={"top": "Withdraw all Heroes (except 1). Search each discard pile for a Hero."},
        )
        self.assertEqual(issues_ok, [])


class TestExportedSelectionModeInvariants(unittest.TestCase):
    """Validates dataset-wide invariants and Coliseum-reported cards in data/dist/cards_logic.json."""

    cards_logic: Dict[str, Any]

    @classmethod
    def setUpClass(cls) -> None:
        cls.cards_logic = json.loads(DIST_LOGIC_PATH.read_text(encoding="utf-8"))

    def test_zero_contradictory_automatic_all_with_bounded_count_across_dataset(self) -> None:
        """No effect or cost outside exempt actions may pair automatic_all with fixed_value or max_value."""
        violations = []
        for cid, entry in self.cards_logic.items():
            for sk, sd in entry.get("sides", {}).items():
                for ab in sd.get("abilities", []):
                    for ef in ab.get("costs", []) + ab.get("effects", []):
                        tgt = ef.get("target") or {}
                        cnt = tgt.get("count")
                        if tgt.get("selection_mode") != "automatic_all" or not cnt:
                            continue
                        if ef.get("action") in _EXEMPT_ACTIONS:
                            continue
                        is_pure_dynamic = (
                            cnt.get("dynamic") is not None
                            and cnt.get("fixed_value") is None
                            and cnt.get("max_value") is None
                        )
                        if not is_pure_dynamic:
                            violations.append((cid, sk, ab["ability_id"], ef.get("action"), cnt))
        self.assertEqual(violations, [])

    def test_coliseum_reported_cards_fixed(self) -> None:
        """Spot-checks Miriam, Abiathar, Egyptian Horsemen, Caleb, Eliakim, Book of the Covenant, David's Descendant, Herodias' Daughter."""
        for cid in ("-327281604", "-831730478", "2117585467", "660351859"):
            ef = _find_effect(self.cards_logic[cid], "take_good_ot_card_from_reserve", "take")
            self.assertEqual(ef["target"]["selection_mode"], "manual_controller")
            self.assertEqual(ef["target"]["zone_owner"], "controller")
            self.assertEqual(ef["target"]["scope"], ["reserve_pile"])
            self.assertEqual(ef["target"]["count"], {"fixed_value": 1})

        ef_eh = _find_effect(self.cards_logic["477447149"], "take_evil_exodus_from_reserve", "take")
        self.assertEqual(ef_eh["target"]["selection_mode"], "manual_controller")
        self.assertEqual(ef_eh["target"]["zone_owner"], "controller")

        caleb = self.cards_logic["266388578"]
        ef_c1 = _find_effect(caleb, "underdeck_evil_giant", "underdeck")
        self.assertEqual(ef_c1["target"]["selection_mode"], "manual_controller")
        self.assertEqual(ef_c1["target"]["zone_owner"], "either")
        self.assertEqual(ef_c1["target"]["scope"], ["in_play"])

        ef_c2 = _find_effect(caleb, "take_and_play_city", "take")
        self.assertEqual(ef_c2["target"]["selection_mode"], "manual_controller")
        self.assertEqual(ef_c2["target"]["zone_owner"], "controller")

        for aid in ("take_good_weapon_reserve", "equip_good_weapon_reserve"):
            ef_cw = _find_effect(caleb, aid)
            self.assertEqual(ef_cw["target"]["selection_mode"], "manual_controller")
            self.assertEqual(ef_cw["target"]["zone_owner"], "controller")
            self.assertEqual(ef_cw["target"]["scope"], ["reserve_pile"])

        ef_el_neg = _find_effect(self.cards_logic["607734591"], "negate_brown_humans", "negate")
        self.assertEqual(ef_el_neg["target"]["selection_mode"], "automatic_all")
        self.assertIsNone(ef_el_neg["target"].get("count"))
        for aid in ("take_ezra_from_reserve", "take_ezra_from_deck_if_evil_in_opponent_banish"):
            self.assertEqual(_find_effect(self.cards_logic["607734591"], aid, "take")["target"]["selection_mode"], "manual_controller")

        for aid in ("ability_1", "ability_2"):
            self.assertEqual(_find_effect(self.cards_logic["730133816"], aid, "take")["target"]["selection_mode"], "manual_controller")

        for aid in ("ge_take_fortress_deck", "ge_take_fortress_reserve"):
            self.assertEqual(_find_effect(self.cards_logic["-328585832"], aid, "take")["target"]["selection_mode"], "manual_controller")

        for aid in ("take_dance_of_death_discard", "take_dance_of_death_reserve"):
            self.assertEqual(_find_effect(self.cards_logic["-469707056"], aid, "take")["target"]["selection_mode"], "manual_controller")


if __name__ == "__main__":
    unittest.main()
