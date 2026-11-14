"""Unit tests for StatFilter model, TargetSelector integration, and data migration.

Validates:
1. Pydantic schema validation for StatFilter (fixed values, 'both'/'either', dynamic variables).
2. Natural-language and LLM parsing heuristics in parse_stat_filters.
3. Automatic TargetSelector decomposition and model serialization.
4. Correctness of migrated production card ASTs (e.g. Pharaoh's Officials [K]).
5. AST constants export completeness.
"""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR / "scripts"))
sys.path.append(str(BASE_DIR))

from models.logic.card_logic import CardSideLogic
from models.logic.stat_filter import StatFilter, parse_stat_filters
from models.logic.target_selector import TargetSelector
from scripts.migrations.migrate_stat_filters import migrate_card_ast


class TestStatFilter(unittest.TestCase):
    """Test suite for StatFilter models, TargetSelector integration, and migration logic."""

    def test_stat_filter_direct_validation(self) -> None:
        """Verifies direct Pydantic instantiation and field constraints of StatFilter."""
        sf_fixed = StatFilter(stat="strength", operator=">=", value=10)
        self.assertEqual(sf_fixed.stat, "strength")
        self.assertEqual(sf_fixed.operator, ">=")
        self.assertEqual(sf_fixed.value, 10)
        self.assertIsNone(sf_fixed.variable)

        sf_both = StatFilter(stat="both", operator="<=", value=6)
        self.assertEqual(sf_both.stat, "both")
        self.assertEqual(sf_both.operator, "<=")
        self.assertEqual(sf_both.value, 6)

        sf_var = StatFilter(stat="toughness", operator="<=", variable="X")
        self.assertEqual(sf_var.stat, "toughness")
        self.assertEqual(sf_var.operator, "<=")
        self.assertIsNone(sf_var.value)
        self.assertEqual(sf_var.variable, "X")

        sf_either = StatFilter(stat="either", operator="==", value=3)
        self.assertEqual(sf_either.stat, "either")
        self.assertEqual(sf_either.operator, "==")
        self.assertEqual(sf_either.value, 3)

    def test_parse_stat_filters_heuristics(self) -> None:
        """Verifies parsing of various natural-language stat patterns into StatFilters."""
        # Standard strength comparisons
        res = parse_stat_filters("strength 10 or greater")
        self.assertIsNotNone(res)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0], StatFilter(stat="strength", operator=">=", value=10))

        res = parse_stat_filters("strength 6 or less")
        self.assertIsNotNone(res)
        self.assertEqual(res[0], StatFilter(stat="strength", operator="<=", value=6))

        # Standard toughness comparisons
        res = parse_stat_filters("toughness 5 or less")
        self.assertIsNotNone(res)
        self.assertEqual(res[0], StatFilter(stat="toughness", operator="<=", value=5))

        res = parse_stat_filters("toughness 4 or greater")
        self.assertIsNotNone(res)
        self.assertEqual(res[0], StatFilter(stat="toughness", operator=">=", value=4))

        # Dual stats (both)
        res = parse_stat_filters("6/6 or less")
        self.assertIsNotNone(res)
        self.assertEqual(len(res), 1)
        self.assertEqual(res[0], StatFilter(stat="both", operator="<=", value=6))

        res = parse_stat_filters("worth 3/3 or less")
        self.assertIsNotNone(res)
        self.assertEqual(res[0], StatFilter(stat="both", operator="<=", value=3))

        # Asterisk notations
        res = parse_stat_filters("strength 6/* or lower")
        self.assertIsNotNone(res)
        self.assertEqual(res[0], StatFilter(stat="strength", operator="<=", value=6))

        res = parse_stat_filters("toughness */4 or less")
        self.assertIsNotNone(res)
        self.assertEqual(res[0], StatFilter(stat="toughness", operator="<=", value=4))

        res = parse_stat_filters("toughness of */5 or less")
        self.assertIsNotNone(res)
        self.assertEqual(res[0], StatFilter(stat="toughness", operator="<=", value=5))

        # Dynamic variable comparisons
        res = parse_stat_filters("strength X or greater")
        self.assertIsNotNone(res)
        self.assertEqual(res[0], StatFilter(stat="strength", operator=">=", variable="X"))

        res = parse_stat_filters("with strength X or greater")
        self.assertIsNotNone(res)
        self.assertEqual(res[0], StatFilter(stat="strength", operator=">=", variable="X"))

        res = parse_stat_filters("toughness X or less")
        self.assertIsNotNone(res)
        self.assertEqual(res[0], StatFilter(stat="toughness", operator="<=", variable="X"))

        res = parse_stat_filters("toughness_X_or_less")
        self.assertIsNotNone(res)
        self.assertEqual(res[0], StatFilter(stat="toughness", operator="<=", variable="X"))

        res = parse_stat_filters("toughness less than X")
        self.assertIsNotNone(res)
        self.assertEqual(res[0], StatFilter(stat="toughness", operator="<", variable="X"))

        res = parse_stat_filters("toughness greater than X")
        self.assertIsNotNone(res)
        self.assertEqual(res[0], StatFilter(stat="toughness", operator=">", variable="X"))

        # Explicit math operator
        res = parse_stat_filters("strength > 2")
        self.assertIsNotNone(res)
        self.assertEqual(res[0], StatFilter(stat="strength", operator=">", value=2))

        # Either stat
        res = parse_stat_filters("strength or toughness 3")
        self.assertIsNotNone(res)
        self.assertEqual(res[0], StatFilter(stat="either", operator="==", value=3))

        # Non-stat identifiers should return None
        self.assertIsNone(parse_stat_filters("Egyptian"))
        self.assertIsNone(parse_stat_filters("Priest"))
        self.assertIsNone(parse_stat_filters("human"))

    def test_target_selector_decomposition_and_integration(self) -> None:
        """Verifies that TargetSelector automatically extracts stat strings into stat_filters."""
        sel = TargetSelector(
            target_type="character",
            identifiers=["Egyptian", "strength 10 or greater"],
        )
        self.assertEqual(sel.identifiers, ["Egyptian"])
        self.assertEqual(len(sel.stat_filters), 1)
        self.assertEqual(sel.stat_filters[0].stat, "strength")
        self.assertEqual(sel.stat_filters[0].operator, ">=")
        self.assertEqual(sel.stat_filters[0].value, 10)

        # Multiple stat filters and traits
        sel_multi = TargetSelector(
            target_type="hero",
            identifiers=["Human", "strength 4 or greater", "toughness 5 or less"],
        )
        self.assertEqual(sel_multi.identifiers, ["Human"])
        self.assertEqual(len(sel_multi.stat_filters), 2)
        self.assertEqual(sel_multi.stat_filters[0].stat, "strength")
        self.assertEqual(sel_multi.stat_filters[0].value, 4)
        self.assertEqual(sel_multi.stat_filters[1].stat, "toughness")
        self.assertEqual(sel_multi.stat_filters[1].value, 5)

        # Model serialization exclude_none
        dumped = sel.model_dump(exclude_none=True)
        self.assertIn("stat_filters", dumped)
        self.assertEqual(dumped["stat_filters"], [{"stat": "strength", "operator": ">=", "value": 10}])

        # Deserialization from dictionary with existing stat_filters
        restored = TargetSelector.model_validate(dumped)
        self.assertEqual(restored.identifiers, ["Egyptian"])
        self.assertEqual(len(restored.stat_filters), 1)
        self.assertEqual(restored.stat_filters[0].value, 10)

    def test_example_card_migration_pharaohs_officials(self) -> None:
        """Verifies that 593869575 Pharaoh's Officials [K] has clean identifiers and typed stat_filters."""
        abilities_file = BASE_DIR / "data" / "ai_generated_abilities.json"
        self.assertTrue(abilities_file.exists(), f"File not found: {abilities_file}")

        with abilities_file.open("r", encoding="utf-8") as f:
            data = json.load(f)

        card_entry = data.get("593869575_top")
        self.assertIsNotNone(card_entry, "Card 593869575_top not found in ai_generated_abilities.json")

        ast = card_entry["ast"]
        band_effect = ast["abilities"][0]["effects"][0]
        target = band_effect["target"]

        # 'strength 10 or greater' must be extracted, leaving only 'Egyptian'
        self.assertEqual(target["identifiers"], ["Egyptian"])
        self.assertEqual(
            target["stat_filters"],
            [{"stat": "strength", "operator": ">=", "value": 10}],
        )

    def test_migration_roundtrip_function(self) -> None:
        """Verifies migrate_card_ast performs expected transformation on raw AST dict."""
        sample_ast = {
            "modifiers": [],
            "abilities": [
                {
                    "ability_id": "test_band",
                    "activation_mode": "immediate",
                    "effects": [
                        {
                            "step": 1,
                            "action": "band",
                            "target": {
                                "target_type": "character",
                                "identifiers": ["Philistine", "strength 10 or greater"],
                            },
                        }
                    ],
                }
            ],
        }
        migrated, records = migrate_card_ast(sample_ast)
        self.assertEqual(len(records), 1)
        self.assertEqual(records[0][0], "strength 10 or greater")
        self.assertEqual(records[0][1][0].stat, "strength")
        self.assertEqual(records[0][1][0].value, 10)

        target = migrated["abilities"][0]["effects"][0]["target"]
        self.assertEqual(target["identifiers"], ["Philistine"])
        self.assertEqual(target["stat_filters"], [{"stat": "strength", "operator": ">=", "value": 10}])

    def test_ast_constants_export_contains_stat_filters(self) -> None:
        """Verifies that ast_constants.json includes stat_filter_stats and stat_filter_operators."""
        constants_file = BASE_DIR / "data" / "dist" / "ast_constants.json"
        self.assertTrue(constants_file.exists(), f"Constants file not found: {constants_file}")

        with constants_file.open("r", encoding="utf-8") as f:
            consts = json.load(f)

        self.assertIn("stat_filter_stats", consts)
        self.assertEqual(consts["stat_filter_stats"], ["strength", "toughness", "both", "either"])

        self.assertIn("stat_filter_operators", consts)
        self.assertEqual(consts["stat_filter_operators"], [">=", "<=", "==", ">", "<", "!="])


if __name__ == "__main__":
    unittest.main()
