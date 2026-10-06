"""Unit tests for dual-card side generation and brigade parsing.

Validates that flip cards, dual-alignment cards, and multi-brigade splits
are correctly parsed and assigned to top and bottom sides.
"""

import importlib
import unittest

extend_cards_mod = importlib.import_module("scripts.03_extend_cards")
is_dual_sided = extend_cards_mod.is_dual_sided
parse_brigades = extend_cards_mod.parse_brigades
parse_flip_int = extend_cards_mod.parse_flip_int
build_card_sides = extend_cards_mod.build_card_sides


class TestDualCardSides(unittest.TestCase):
    """Test suite covering dual-card detection and brigade distribution."""

    def test_mary_brigade_split(self) -> None:
        """Verifies that Mary, Mother of James gets White on top and Clay on bottom.

        Args:
            None

        Returns:
            None
        """
        raw = {
            "Name": "Mary, Mother of James / Mary, the Caregiver (GoC)",
            "Type": "Hero",
            "Brigade": "White/Clay",
            "Strength": "3 (10)",
            "Toughness": "10 (3)",
            "Alignment": "Good",
            "SpecialAbility": "If blocked from hand, good Gospel Enhancements cannot be negated."
        }

        self.assertTrue(is_dual_sided(raw))
        brigades = parse_brigades(raw, ["Hero"], is_dual=True)
        self.assertEqual(brigades.get("top"), ["White"])
        self.assertEqual(brigades.get("bottom"), ["Clay"])

        sides = build_card_sides(raw, ["Hero"])
        self.assertEqual(sides["top"]["Brigades"], ["White"])
        self.assertEqual(sides["bottom"]["Brigades"], ["Clay"])
        self.assertEqual(sides["top"]["Strength"], 3)
        self.assertEqual(sides["bottom"]["Strength"], 10)

    def test_disciple_clay_split(self) -> None:
        """Verifies that 3-brigade cards with Clay allocate Clay to bottom.

        Args:
            None

        Returns:
            None
        """
        raw = {
            "Name": "Simon Peter / Peter, the Rock (GoC)",
            "Type": "Hero",
            "Brigade": "Purple/Clay/Green",
            "Strength": "12 (10)",
            "Toughness": "10 (12)",
            "Alignment": "Good"
        }

        self.assertTrue(is_dual_sided(raw))
        brigades = parse_brigades(raw, ["Hero"], is_dual=True)
        self.assertEqual(brigades.get("top"), ["Purple", "Green"])
        self.assertEqual(brigades.get("bottom"), ["Clay"])

    def test_single_card_brigades_stay_on_top(self) -> None:
        """Verifies that standard single-sided cards do not create a bottom side.

        Args:
            None

        Returns:
            None
        """
        raw = {
            "Name": "Egyptian Horsemen (1st Print - K)",
            "Type": "Evil Character",
            "Brigade": "Gold",
            "Strength": "2",
            "Toughness": "3",
            "Alignment": "Evil"
        }

        self.assertFalse(is_dual_sided(raw))
        brigades = parse_brigades(raw, ["Evil Character"], is_dual=False)
        self.assertEqual(brigades.get("top"), ["Gold"])
        self.assertNotIn("bottom", brigades)

        sides = build_card_sides(raw, ["Evil Character"])
        self.assertNotIn("bottom", sides)

    def test_parse_flip_int_formats(self) -> None:
        """Verifies numeric stat parsing across parenthesized, slashed, and single values.

        Args:
            None

        Returns:
            None
        """
        paren_res = parse_flip_int("3 (10)")
        self.assertEqual(paren_res, {"top": 3, "bottom": 10})

        slash_res = parse_flip_int("5/10")
        self.assertEqual(slash_res, {"top": 5, "bottom": 10})

        single_res = parse_flip_int("7")
        self.assertEqual(single_res, {"top": 7, "bottom": 7})

        empty_res = parse_flip_int("")
        self.assertEqual(empty_res, {})

    def test_split_flip_name_behavior(self) -> None:
        """Verifies that split_flip_name splits dual cards and ignores bracketed slashes.

        Args:
            None

        Returns:
            None
        """
        split_func = extend_cards_mod.split_flip_name

        mary_res = split_func("Mary, Mother of James / Mary, the Caregiver (GoC)")
        self.assertEqual(mary_res, ("Mary, Mother of James (GoC)", "Mary, the Caregiver (GoC)"))

        outsiders_res = split_func("Outsiders (Black/Gold) (RoJ AB)")
        self.assertIsNone(outsiders_res)

        philosophy_res = split_func("Philosophy (Roots)")
        self.assertIsNone(philosophy_res)

        lost_soul_res = split_func('Lost Soul [James 4:6 / Proverbs 3:34 - RoJ]')
        self.assertIsNone(lost_soul_res)

        legacy_res = split_func("Saul/Paul")
        self.assertEqual(legacy_res, ("Saul", "Paul"))

    def test_build_card_sides_assigns_split_names(self) -> None:
        """Verifies that build_card_sides assigns split names to top and bottom sides.

        Args:
            None

        Returns:
            None
        """
        raw = {
            "Name": "Mary, Mother of James / Mary, the Caregiver (GoC)",
            "Type": "Hero",
            "Brigade": "White/Clay",
            "Strength": "3 (10)",
            "Toughness": "10 (3)",
            "Alignment": "Good"
        }
        sides = build_card_sides(raw, ["Hero"])
        self.assertEqual(sides["top"]["Name"], "Mary, Mother of James (GoC)")
        self.assertEqual(sides["bottom"]["Name"], "Mary, the Caregiver (GoC)")


if __name__ == "__main__":
    unittest.main()

