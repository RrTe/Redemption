"""Unit and dataset integrity tests for IsGeneric and TargetSelector.is_generic."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, Iterable, List

_PROJECT_ROOT = Path(__file__).resolve().parents[1]
_SCRIPTS_DIR = _PROJECT_ROOT / "scripts"
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from fact_matrix import extract_ast_facts, verify_fact_matrix  # noqa: E402
from models.enums.gender import CHARACTER_SIDE_TYPES  # noqa: E402
from models.logic.card_logic import CardSideLogic  # noqa: E402
from models.logic.target_decomposer import try_decompose_phrase  # noqa: E402
from models.logic.target_selector import TargetSelector  # noqa: E402
from utils.card_helpers import get_side_field  # noqa: E402
from utils.generic_resolver import apply_is_generic_to_card_sides, resolve_is_generic  # noqa: E402


def _iter_logic_selectors(node: Any) -> Iterable[Dict[str, Any]]:
    """Yields all serialized TargetSelector dicts nested inside a CardSideLogic dict.

    Args:
        node: Arbitrary JSON subtree (dict or list) within CardSideLogic.

    Returns:
        Iterator of selector dictionaries containing an 'identifiers' list.
    """
    if isinstance(node, dict):
        if isinstance(node.get("identifiers"), list) and (
            "selection_mode" in node or "target_type" in node
        ):
            yield node
        for val in node.values():
            yield from _iter_logic_selectors(val)
    elif isinstance(node, list):
        for item in node:
            yield from _iter_logic_selectors(item)


class TestGenericResolver(unittest.TestCase):
    """Tests resolution and side normalization for CardSide.IsGeneric."""

    def test_resolve_is_generic_sources(self) -> None:
        """Verifies ORDIR-only, Identifier-only, unique, and non-character cases.

        Args:
            None.

        Returns:
            None.
        """
        ordir_only_card = {
            "Id": "1",
            "Identifier": "",
            "CardSides": {
                "top": {
                    "Name": "Midwives (G)",
                    "Type": "Hero",
                    "ORDIR": ["Exodus Card", "Generic Character"],
                }
            },
        }
        self.assertIs(resolve_is_generic(ordir_only_card, "top"), True)

        identifier_only_card = {
            "Id": "2",
            "Identifier": "Generic",
            "CardSides": {
                "top": {
                    "Name": "Follower Token",
                    "Type": "Evil Character",
                    "ORDIR": [],
                }
            },
        }
        self.assertIs(resolve_is_generic(identifier_only_card, "top"), True)

        unique_card = {
            "Id": "3",
            "Identifier": "Moses' Sister",
            "CardSides": {
                "top": {
                    "Name": "Miriam",
                    "Type": "Hero",
                    "ORDIR": ["Exodus Card", "Musician", "Prophet"],
                }
            },
        }
        self.assertIs(resolve_is_generic(unique_card, "top"), False)

        non_generic_hyphen_card = {
            "Id": "4",
            "Identifier": "Non-Generic",
            "CardSides": {"top": {"Name": "Sample Hero", "Type": "Hero", "ORDIR": []}},
        }
        self.assertIs(resolve_is_generic(non_generic_hyphen_card, "top"), False)

        non_character_card = {
            "Id": "5",
            "Identifier": "Generic",
            "CardSides": {
                "top": {"Name": "Generic Fortress", "Type": "Fortress", "ORDIR": ["Generic Character"]}
            },
        }
        self.assertIsNone(resolve_is_generic(non_character_card, "top"))

    def test_resolve_is_generic_dual_side_qualifiers(self) -> None:
        """Ensures Evil-specific generic Identifier strings do not leak onto Hero sides.

        Args:
            None.

        Returns:
            None.
        """
        for ident in (
            "Roman Centurion, (Evil) Generic",
            "Evil Character is a Generic, Animal",
            "[Evil Character is generic] Persian",
        ):
            card = {
                "Id": "dual_test",
                "Identifier": ident,
                "CardSides": {
                    "top": {"Name": "Hero Side", "Type": "Hero", "ORDIR": []},
                    "bottom": {"Name": "Evil Side", "Type": "Evil Character", "ORDIR": []},
                },
            }
            self.assertIs(resolve_is_generic(card, "top"), False, msg=f"Failed Hero side for {ident}")
            self.assertIs(resolve_is_generic(card, "bottom"), True, msg=f"Failed Evil side for {ident}")

    def test_apply_is_generic_fixes_lost_sheep_goc_1058469578(self) -> None:
        """Moves ORDIR Generic Character from GE bottom side to Hero top side on 1058469578.

        Args:
            None.

        Returns:
            None.
        """
        card = {
            "Id": "1058469578",
            "Identifier": "",
            "CardSides": {
                "top": {"Name": "Lost Sheep (GoC)", "Type": "Hero", "ORDIR": ["Luke Card"]},
                "bottom": {
                    "Name": "Good Shepherd (GoC)",
                    "Type": "GE",
                    "ORDIR": ["Luke Card", "Generic Character"],
                },
            },
        }
        apply_is_generic_to_card_sides(card)
        self.assertIn("Generic Character", card["CardSides"]["top"]["ORDIR"])
        self.assertNotIn("Generic Character", card["CardSides"]["bottom"]["ORDIR"])
        self.assertIs(card["CardSides"]["top"]["IsGeneric"], True)
        self.assertNotIn("IsGeneric", card["CardSides"]["bottom"])

    def test_apply_is_generic_dedupes_identical_dual_character_sides(self) -> None:
        """Preserves shared IsGeneric=False and splits differing dual character flags.

        Args:
            None.

        Returns:
            None.
        """
        same_unique_dual = {
            "Id": "dual_same",
            "Identifier": "",
            "CardSides": {
                "top": {"Name": "Good Twin", "Type": "Hero", "ORDIR": []},
                "bottom": {"Name": "Evil Twin", "Type": "Evil Character", "ORDIR": []},
            },
        }
        apply_is_generic_to_card_sides(same_unique_dual)
        self.assertIs(same_unique_dual["CardSides"]["shared"]["IsGeneric"], False)
        self.assertNotIn("IsGeneric", same_unique_dual["CardSides"]["top"])
        self.assertNotIn("IsGeneric", same_unique_dual["CardSides"]["bottom"])

        diff_dual = {
            "Id": "dual_diff",
            "Identifier": "(Evil) Generic",
            "CardSides": {
                "top": {"Name": "Hero Side", "Type": "Hero", "ORDIR": []},
                "bottom": {"Name": "Evil Side", "Type": "Evil Character", "ORDIR": []},
            },
        }
        apply_is_generic_to_card_sides(diff_dual)
        self.assertIs(diff_dual["CardSides"]["top"]["IsGeneric"], False)
        self.assertIs(diff_dual["CardSides"]["bottom"]["IsGeneric"], True)
        self.assertNotIn("IsGeneric", diff_dual["CardSides"].get("shared", {}))


class TestTargetSelectorAndFactMatrix(unittest.TestCase):
    """Tests TargetSelector normalization, phrase decomposition, and fact_matrix invariants."""

    def test_target_selector_migrates_generic_and_unique_from_identifiers(self) -> None:
        """Auto-heals 'generic'/'unique' out of identifiers into TargetSelector.is_generic.

        Args:
            None.

        Returns:
            None.
        """
        sel_generic = TargetSelector(target_type="hero", identifiers=["generic"])
        self.assertIs(sel_generic.is_generic, True)
        self.assertEqual(sel_generic.identifiers, [])

        sel_unique = TargetSelector(target_type="evil_character", identifiers=["unique", "Pharisee"])
        self.assertIs(sel_unique.is_generic, False)
        self.assertEqual(sel_unique.identifiers, ["Pharisee"])

    def test_try_decompose_phrase_extracts_is_generic(self) -> None:
        """Decomposes compound generic/unique target phrases with gender and book references.

        Args:
            None.

        Returns:
            None.
        """
        dec = try_decompose_phrase("generic Exodus female")
        self.assertIsNotNone(dec)
        assert dec is not None
        self.assertIs(dec["is_generic"], True)
        self.assertEqual(dec["gender"], "female")
        self.assertIn("Exodus", dec["references"])

        dec_unique = try_decompose_phrase("unique Pharisee")
        self.assertIsNotNone(dec_unique)
        assert dec_unique is not None
        self.assertIs(dec_unique["is_generic"], False)
        self.assertIn("Pharisee", dec_unique["identifiers"])

    def test_fact_matrix_generic_and_unique_checks(self) -> None:
        """Enforces missing generic/unique errors while ignoring 'same unique' comparisons.

        Args:
            None.

        Returns:
            None.
        """
        raw_generic = "May band to a generic Exodus female."
        missing_generic_ast = CardSideLogic.model_validate({
            "abilities": [{
                "ability_id": "band_exodus_female",
                "activation_mode": "immediate",
                "effects": [{
                    "step": 1,
                    "action": "band",
                    "target": {
                        "selection_mode": "manual_controller",
                        "zone_owner": "both",
                        "scope": ["in_play", "hand"],
                        "target_type": "hero",
                        "alignment": "good",
                        "gender": "female",
                        "references": ["Exodus"],
                        "count": {"fixed_value": 1},
                    },
                }],
            }]
        })
        ok, issues = verify_fact_matrix(raw_generic, extract_ast_facts(missing_generic_ast))
        self.assertFalse(ok)
        self.assertIn("Missing generic qualifier: 'is_generic: true'", issues)

        fixed_generic_ast = CardSideLogic.model_validate({
            "abilities": [{
                "ability_id": "band_exodus_female",
                "activation_mode": "immediate",
                "effects": [{
                    "step": 1,
                    "action": "band",
                    "target": {
                        "selection_mode": "manual_controller",
                        "zone_owner": "both",
                        "scope": ["in_play", "hand"],
                        "target_type": "hero",
                        "alignment": "good",
                        "gender": "female",
                        "is_generic": True,
                        "references": ["Exodus"],
                        "count": {"fixed_value": 1},
                    },
                }],
            }]
        })
        ok_fixed, issues_fixed = verify_fact_matrix(raw_generic, extract_ast_facts(fixed_generic_ast))
        self.assertTrue(ok_fixed, msg=f"Unexpected issues: {issues_fixed}")

        raw_unique = "If it is unique, banish this card."
        missing_unique_ast = CardSideLogic.model_validate({
            "abilities": [{
                "ability_id": "banish_self",
                "activation_mode": "immediate",
                "effects": [{
                    "step": 1,
                    "action": "banish",
                    "target": {
                        "selection_mode": "automatic_self",
                        "zone_owner": "controller",
                        "scope": ["in_play"],
                    },
                }],
            }]
        })
        ok_u, issues_u = verify_fact_matrix(raw_unique, extract_ast_facts(missing_unique_ast))
        self.assertFalse(ok_u)
        self.assertIn("Missing unique qualifier: 'is_generic: false'", issues_u)

        raw_same_unique = "Discard an Evil Character with the same unique name."
        same_unique_ast = CardSideLogic.model_validate({
            "abilities": [{
                "ability_id": "discard_same_unique",
                "activation_mode": "immediate",
                "effects": [{
                    "step": 1,
                    "action": "discard",
                    "target": {
                        "selection_mode": "manual_controller",
                        "zone_owner": "opponent",
                        "scope": ["in_play"],
                        "target_type": "evil_character",
                        "alignment": "evil",
                        "count": {"fixed_value": 1},
                    },
                }],
            }]
        })
        ok_su, issues_su = verify_fact_matrix(raw_same_unique, extract_ast_facts(same_unique_ast))
        self.assertTrue(ok_su, msg=f"'same unique' falsely flagged: {issues_su}")


class TestDatasetGenericIntegrity(unittest.TestCase):
    """Validates IsGeneric and is_generic invariants on exported production datasets."""

    @classmethod
    def setUpClass(cls) -> None:
        """Loads extended and logic JSON datasets once for integrity assertions.

        Args:
            None.

        Returns:
            None.
        """
        ext_path = _PROJECT_ROOT / "data" / "cards_extended_with_ordir_fuzzy.json"
        logic_path = _PROJECT_ROOT / "data" / "dist" / "cards_logic.json"
        with ext_path.open("r", encoding="utf-8") as handle:
            ext_raw = json.load(handle)
        cls.ext_cards: List[Dict[str, Any]] = ext_raw["cards"]
        cls.ext_by_id: Dict[str, Dict[str, Any]] = {str(c["Id"]): c for c in cls.ext_cards}
        with logic_path.open("r", encoding="utf-8") as handle:
            cls.logic_cards: Dict[str, Dict[str, Any]] = json.load(handle)

    def test_all_character_sides_have_boolean_is_generic(self) -> None:
        """Confirms IsGeneric in extended JSON and is_generic in cards_logic.json match character sides.

        Args:
            None.

        Returns:
            None.
        """
        for card in self.ext_cards:
            cid = str(card["Id"])
            sides = card.get("CardSides", {})
            real_sides = [k for k in sides if k != "shared" and isinstance(sides[k], dict)] or ["top"]
            for sk in real_sides:
                side_type = get_side_field(card, sk, "Type")
                is_gen = get_side_field(card, sk, "IsGeneric")
                if side_type in CHARACTER_SIDE_TYPES:
                    self.assertIsInstance(
                        is_gen,
                        bool,
                        msg=f"Card {cid} ({sk}) Type={side_type} missing bool IsGeneric",
                    )
                else:
                    self.assertIsNone(
                        is_gen,
                        msg=f"Non-character card {cid} ({sk}) Type={side_type} should not have IsGeneric",
                    )

        for cid, logic_card in self.logic_cards.items():
            ext_card = self.ext_by_id.get(cid)
            if not ext_card:
                continue
            ext_sides = ext_card.get("CardSides", {})
            real_sides = [
                k for k in ext_sides if k != "shared" and isinstance(ext_sides[k], dict)
            ] or ["top"]
            for sk, sdata in logic_card.get("sides", {}).items():
                target_sk = sk if (sk in ext_sides or sk == "shared") else real_sides[0]
                side_type = get_side_field(ext_card, target_sk, "Type")
                if side_type in CHARACTER_SIDE_TYPES:
                    self.assertIsInstance(
                        sdata.get("is_generic"),
                        bool,
                        msg=f"Logic card {cid} ({sk}) missing bool is_generic",
                    )
                elif sk != "shared":
                    self.assertNotIn(
                        "is_generic",
                        sdata,
                        msg=f"Non-character logic side {cid} ({sk}) should not have is_generic",
                    )

    def test_no_generic_or_unique_left_in_selector_identifiers(self) -> None:
        """Ensures zero TargetSelector.identifiers across cards_logic.json retain 'generic' or 'unique'.

        Args:
            None.

        Returns:
            None.
        """
        leftovers: List[str] = []
        for cid, logic_card in self.logic_cards.items():
            for sk, sdata in logic_card.get("sides", {}).items():
                for sel in _iter_logic_selectors(sdata):
                    for ident in sel.get("identifiers", []):
                        if str(ident).strip().lower() in ("generic", "unique"):
                            leftovers.append(f"{cid}:{sk}:{ident}")
        self.assertEqual(leftovers, [], msg=f"Found unmigrated generic/unique identifiers: {leftovers}")

    def test_repaired_cards_have_expected_is_generic_selectors(self) -> None:
        """Checks repaired selectors on Jethro, Plot to Kill, Evil Released, and Lost Sheep (GoC).

        Args:
            None.

        Returns:
            None.
        """
        for jethro_id in ("446819577", "226799305"):
            top = self.logic_cards[jethro_id]["sides"]["top"]
            band_ab = next(a for a in top["abilities"] if a["ability_id"] == "band_to_generic_exodus_female")
            target = band_ab["effects"][0]["target"]
            self.assertIs(target["is_generic"], True)
            self.assertEqual(target["gender"], "female")
            self.assertEqual(target["references"], ["Exodus"])
            self.assertEqual(target["identifiers"], [])

        for plot_id in ("-1278294591", "-557944514"):
            top = self.logic_cards[plot_id]["sides"]["top"]
            self.assertEqual(top.get("modifiers", []), [])
            ab2 = next(a for a in top["abilities"] if a["ability_id"] == "ab_2_cannot_be_prevented")
            self.assertIs(ab2["conditions"][0]["selector"]["is_generic"], False)
            self.assertEqual(ab2["modifiers"][0]["modifier_type"], "cannot_be_prevented")

        er_top = self.logic_cards["-679664345"]["sides"]["top"]
        for ab in er_top["abilities"]:
            self.assertIs(ab["conditions"][0]["selector"]["is_generic"], False)

        lost_sheep_ext = self.ext_by_id["1058469578"]["CardSides"]
        self.assertIs(lost_sheep_ext["top"]["IsGeneric"], True)
        self.assertNotIn("IsGeneric", lost_sheep_ext["bottom"])
        lost_sheep_logic = self.logic_cards["1058469578"]["sides"]
        self.assertIs(lost_sheep_logic["top"]["is_generic"], True)
        self.assertNotIn("is_generic", lost_sheep_logic["bottom"])


if __name__ == "__main__":
    unittest.main()
