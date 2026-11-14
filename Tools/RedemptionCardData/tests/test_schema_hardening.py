"""Unit tests verifying schema and parser hardening in RedemptionCardData.

Covers:
- StatFilter model validation and serialization
- Accurate _map_zone_token mappings for 'discard pile', 'draw pile', and 'card pile'
- parse_target_zone_suffix default owner resolution for private vs public zones
- Regression tests for Samuel, The Murdering Pharaoh, and Pharaoh's Officials
"""

import json
import unittest
from pathlib import Path

from models.enums.zone import Zone
from models.logic.stat_filter import StatFilter, parse_stat_filters
from scripts.utils.target_parser import _map_zone_token, parse_target_zone_suffix

BASE_DIR = Path(__file__).resolve().parent.parent


class TestSchemaHardening(unittest.TestCase):
    """Test suite for StatFilter models, target parser zone mapping, and card AST integrity."""

    def test_stat_filter_model_and_parsing(self):
        """Tests parsing and validation of various numeric and dynamic stat filter conditions."""
        # Fixed strength >=
        sf_list = parse_stat_filters("strength 10 or greater")
        self.assertIsNotNone(sf_list)
        self.assertEqual(len(sf_list), 1)
        self.assertEqual(sf_list[0].stat, "strength")
        self.assertEqual(sf_list[0].operator, ">=")
        self.assertEqual(sf_list[0].value, 10)

        # Fixed toughness <=
        sf_list = parse_stat_filters("toughness 5 or less")
        self.assertIsNotNone(sf_list)
        self.assertEqual(sf_list[0].stat, "toughness")
        self.assertEqual(sf_list[0].operator, "<=")
        self.assertEqual(sf_list[0].value, 5)

        # Dual stat 6/6 or less
        sf_list = parse_stat_filters("6/6 or less")
        self.assertIsNotNone(sf_list)
        self.assertEqual(sf_list[0].stat, "both")
        self.assertEqual(sf_list[0].operator, "<=")
        self.assertEqual(sf_list[0].value, 6)

        # Variable toughness < X
        sf_list = parse_stat_filters("toughness less than X")
        self.assertIsNotNone(sf_list)
        self.assertEqual(sf_list[0].stat, "toughness")
        self.assertEqual(sf_list[0].operator, "<")
        self.assertEqual(sf_list[0].variable, "X")

        # Variable strength >= X
        sf_list = parse_stat_filters("strength X or greater")
        self.assertIsNotNone(sf_list)
        self.assertEqual(sf_list[0].stat, "strength")
        self.assertEqual(sf_list[0].operator, ">=")
        self.assertEqual(sf_list[0].variable, "X")

        # Slashed star toughness */5 or less
        sf_list = parse_stat_filters("*/5 or less")
        self.assertIsNotNone(sf_list)
        self.assertEqual(sf_list[0].stat, "toughness")
        self.assertEqual(sf_list[0].operator, "<=")
        self.assertEqual(sf_list[0].value, 5)

    def test_map_zone_token_substring_bug_fixed(self):
        """Tests that 'discard pile' resolves to Zone.DISCARD_PILE and not Zone.DECK."""
        self.assertEqual(_map_zone_token("discard pile"), Zone.DISCARD_PILE)
        self.assertEqual(_map_zone_token("discard"), Zone.DISCARD_PILE)
        self.assertEqual(_map_zone_token("draw pile"), Zone.DECK)
        self.assertEqual(_map_zone_token("deck"), Zone.DECK)
        self.assertEqual(_map_zone_token("card pile"), Zone.DECK)
        self.assertEqual(_map_zone_token("reserve pile"), Zone.RESERVE_PILE)
        self.assertEqual(_map_zone_token("reserve"), Zone.RESERVE_PILE)

    def test_parse_target_zone_suffix_ownership_defaults(self):
        """Tests owner resolution on private vs explicit generic zone phrases."""
        # Unspecified owner on private zone defaults to 'controller'
        _, scopes, owner, _ = parse_target_zone_suffix("from Reserve")
        self.assertEqual(scopes, [Zone.RESERVE_PILE])
        self.assertEqual(owner, "controller")

        _, scopes, owner, _ = parse_target_zone_suffix("from discard pile")
        self.assertEqual(scopes, [Zone.DISCARD_PILE])
        self.assertEqual(owner, "controller")

        # Explicit 'a / an / any / either' retains 'either'
        _, scopes, owner, _ = parse_target_zone_suffix("from a Reserve")
        self.assertEqual(scopes, [Zone.RESERVE_PILE])
        self.assertEqual(owner, "either")

        _, scopes, owner, _ = parse_target_zone_suffix("from a discard pile")
        self.assertEqual(scopes, [Zone.DISCARD_PILE])
        self.assertEqual(owner, "either")

        # Explicit 'opponent's' sets 'opponent'
        _, scopes, owner, _ = parse_target_zone_suffix("from opponent's Reserve")
        self.assertEqual(scopes, [Zone.RESERVE_PILE])
        self.assertEqual(owner, "opponent")

    def test_regression_samuel_discard_pile_and_controller(self):
        """Tests that Samuel (-1708238440) targets discard_pile + reserve_pile with controller owner."""
        raw_file = BASE_DIR / "data" / "card_abilities_raw.json"
        raw_data = json.loads(raw_file.read_text(encoding="utf-8"))
        samuel_node = raw_data.get("-1708238440")
        self.assertIsNotNone(samuel_node)

        effects = samuel_node["sides"]["top"]["abilities"][0]["effects"]
        target = effects[0]["target"]
        self.assertIn("discard_pile", target["scope"])
        self.assertNotIn("deck", target["scope"])
        self.assertIn("reserve_pile", target["scope"])
        self.assertEqual(target["zone_owner"], "controller")

    def test_regression_murdering_pharaoh_controller(self):
        """Tests that The Murdering Pharaoh (-1600364962) targets Reserve with controller owner."""
        raw_file = BASE_DIR / "data" / "card_abilities_raw.json"
        raw_data = json.loads(raw_file.read_text(encoding="utf-8"))
        pharaoh_node = raw_data.get("-1600364962")
        self.assertIsNotNone(pharaoh_node)

        effects = pharaoh_node["sides"]["top"]["abilities"][0]["effects"]
        target = effects[0]["target"]
        self.assertEqual(target["scope"], ["reserve_pile"])
        self.assertEqual(target["zone_owner"], "controller")

    def test_regression_pharaohs_officials_stat_filter(self):
        """Tests that Pharaoh's Officials (593869575) isolates 'Egyptian' and has strength >= 10 filter."""
        ai_file = BASE_DIR / "data" / "ai_generated_abilities.json"
        ai_data = json.loads(ai_file.read_text(encoding="utf-8"))
        officials_entry = ai_data.get("593869575_top")
        self.assertIsNotNone(officials_entry)

        target = officials_entry["ast"]["abilities"][0]["effects"][0]["target"]
        self.assertEqual(target["identifiers"], ["Egyptian"])
        self.assertEqual(len(target["stat_filters"]), 1)
        self.assertEqual(target["stat_filters"][0]["stat"], "strength")
        self.assertEqual(target["stat_filters"][0]["operator"], ">=")
        self.assertEqual(target["stat_filters"][0]["value"], 10)


if __name__ == "__main__":
    unittest.main()
