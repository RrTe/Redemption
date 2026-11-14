"""Unit tests for Stage 10 Pipeline & Schema Hardening.

Tests:
1. DynamicValue range support (`min_value`, `max_value`, `DynamicValue.up_to`).
2. TargetSelector 6-bucket decomposition (`testament`, `references`, `target_type`,
   `identifiers`, `brigades`, `card_titles`).
3. Stage 10 verification rules (`shared`/`top` collision checks, Banding scope
   normalization, Banding alignment hallucination checks, and 'up to N' fact matrix checks).
"""

from __future__ import annotations

import sys
import unittest
from pathlib import Path

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.append(str(BASE_DIR / "scripts"))
sys.path.append(str(BASE_DIR))

from models.enums import ActionVerb, ActivationMode, SelectionMode, Zone
from models.logic.ability import Ability
from models.logic.action_effect import ActionEffect
from models.logic.card_logic import CardLogic, CardSideLogic
from models.logic.dynamic_value import DynamicValue
from models.logic.target_selector import TargetSelector
from scripts.fact_matrix import extract_ast_facts, verify_fact_matrix

import importlib.util

_spec = importlib.util.spec_from_file_location(
    "verify_logic_mod", BASE_DIR / "scripts" / "10_verify_logic.py"
)
assert _spec and _spec.loader
_verify_mod = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(_verify_mod)
verify_card_logic = _verify_mod.verify_card_logic


class TestStage10Hardening(unittest.TestCase):
    """Tests schema normalization and Stage 10 verification invariants."""

    def test_dynamic_value_up_to_and_range(self) -> None:
        """Verifies DynamicValue.up_to(N) and DynamicValue.from_range(min, max)."""
        dv_up_to = DynamicValue.up_to(3)
        self.assertIsNone(dv_up_to.fixed_value)
        self.assertEqual(dv_up_to.min_value, 0)
        self.assertEqual(dv_up_to.max_value, 3)

        dv_range = DynamicValue.from_range(1, 2)
        self.assertIsNone(dv_range.fixed_value)
        self.assertEqual(dv_range.min_value, 1)
        self.assertEqual(dv_range.max_value, 2)

    def test_target_selector_testament_and_plural_decomposition(self) -> None:
        """Verifies 'O.T. Egyptians' and 'Old Testament' decompose into testament + singular identifier."""
        sel = TargetSelector(
            target_type="character",
            identifiers=["O.T. Egyptians"],
            count=DynamicValue.up_to(3),
        )
        self.assertEqual(sel.testament, "OT")
        self.assertEqual(sel.identifiers, ["Egyptian"])
        self.assertEqual(sel.target_type, "character")

        sel_ot = TargetSelector(
            target_type="hero",
            identifiers=["Old Testament"],
        )
        self.assertEqual(sel_ot.testament, "OT")
        self.assertEqual(sel_ot.identifiers, [])

    def test_target_selector_book_reference_and_subtype_decomposition(self) -> None:
        """Verifies biblical reference composites like 'Revelation Angels' and 'I Samuel Hero'."""
        sel_rev = TargetSelector(
            identifiers=["Revelation Angels"],
        )
        self.assertEqual(sel_rev.references, ["Revelation"])
        self.assertEqual(sel_rev.identifiers, ["Angel"])
        self.assertEqual(sel_rev.target_type, "character")
        self.assertEqual(sel_rev.selection_mode, SelectionMode.AUTOMATIC_ALL)

        sel_rev_title = TargetSelector(
            card_titles=["Revelation Angel"],
        )
        self.assertEqual(sel_rev_title.references, ["Revelation"])
        self.assertEqual(sel_rev_title.identifiers, ["Angel"])
        self.assertEqual(sel_rev_title.card_titles, [])
        self.assertEqual(sel_rev_title.target_type, "character")

        sel_sam = TargetSelector(
            identifiers=["I Samuel Hero"],
        )
        self.assertEqual(sel_sam.references, ["I Samuel"])
        self.assertEqual(sel_sam.target_type, "hero")
        self.assertEqual(sel_sam.identifiers, [])

    def test_target_selector_ordir_composite_and_character_subtype_target_type(self) -> None:
        """Verifies official ORDIR location composites stay intact and character subtypes move to identifiers."""
        sel_tab = TargetSelector(
            target_type="priest",
            identifiers=["Tabernacle Priests"],
        )
        self.assertEqual(sel_tab.target_type, "character")
        self.assertIn("Tabernacle Priest", sel_tab.identifiers)

        sel_joseph = TargetSelector(
            target_type="hero",
            card_titles=["O.T. Joseph"],
        )
        self.assertEqual(sel_joseph.testament, "OT")
        self.assertEqual(sel_joseph.card_titles, ["Joseph"])

    def test_shared_top_collision_and_orphan_detection(self) -> None:
        """Verifies single-sided cards strictly reject 'shared' sides while Dual cards allow them."""
        raw_card_data = {
            "card_identifier": "1943086376",
            "sides": {
                "shared": {"abilities": []},
                "top": {"abilities": []},
            },
        }
        # Single-sided standard card rejects shared
        issues, _ = verify_card_logic(
            "1943086376",
            raw_card_data,
            has_star_ability=False,
            is_dual_card=False,
        )
        self.assertTrue(
            any("Conflicting 'shared' and 'top' sides" in i for i in issues),
            f"Expected conflicting shared/top issue, got: {issues}",
        )

        # Single-sided Star card also rejects shared (must be in top)
        issues_star_single, _ = verify_card_logic(
            "1943086376",
            raw_card_data,
            has_star_ability=True,
            is_dual_card=False,
        )
        self.assertTrue(
            any("Conflicting 'shared' and 'top' sides" in i for i in issues_star_single),
            f"Single-sided star card should reject shared side, got: {issues_star_single}",
        )

        # Dual card is permitted to have shared side
        issues_dual, _ = verify_card_logic(
            "1943086376",
            raw_card_data,
            has_star_ability=True,
            is_dual_card=True,
        )
        self.assertFalse(
            any("Conflicting 'shared' and 'top' sides" in i for i in issues_dual),
            f"Dual card should allow shared side, got: {issues_dual}",
        )

    def test_banding_scope_and_alignment_hallucination_validation(self) -> None:
        """Verifies Banding scope normalization and alignment hallucination detection."""
        side_logic = CardSideLogic(
            abilities=[
                Ability(
                    ability_id="hallucinated_band",
                    activation_mode=ActivationMode.IMMEDIATE,
                    effects=[
                        ActionEffect(
                            step=1,
                            action=ActionVerb.BAND,
                            target=TargetSelector(
                                target_type="hero",
                                scope=[Zone.IN_PLAY],
                                identifiers=["O.T. Egyptians"],
                                count=DynamicValue.up_to(3),
                            ),
                        )
                    ],
                )
            ]
        )
        card_data = {
            "card_identifier": "1943086376",
            "sides": {"top": side_logic.model_dump(exclude_none=True)},
        }
        issues, compiled = verify_card_logic(
            "1943086376",
            card_data,
            side_types={"top": "EE"},
            raw_abilities={"top": "Egyptian may band to up to 3 O.T. Egyptians."},
        )
        self.assertTrue(
            any("Banding alignment hallucination" in i for i in issues),
            f"Expected banding alignment hallucination issue, got: {issues}",
        )
        assert compiled is not None
        compiled_scope = compiled["sides"]["top"]["abilities"][0]["effects"][0]["target"]["scope"]
        self.assertEqual(compiled_scope, ["in_play", "hand"])

    def test_up_to_fact_matrix_check(self) -> None:
        """Verifies fact matrix flags rigid fixed_value on 'up to N' text and accepts DynamicValue.up_to(N)."""
        raw_text = "Egyptian may band to up to 3 O.T. Egyptians."
        rigid_side = CardSideLogic(
            abilities=[
                Ability(
                    ability_id="band_rigid",
                    activation_mode=ActivationMode.IMMEDIATE,
                    effects=[
                        ActionEffect(
                            step=1,
                            action=ActionVerb.BAND,
                            target=TargetSelector(
                                target_type="evil_character",
                                identifiers=["O.T. Egyptians"],
                                count=DynamicValue.from_int(3),
                            ),
                        )
                    ],
                )
            ]
        )
        is_valid_rigid, issues_rigid = verify_fact_matrix(raw_text, extract_ast_facts(rigid_side))
        self.assertFalse(is_valid_rigid)
        self.assertTrue(any("up to 3" in i for i in issues_rigid))

        range_side = CardSideLogic(
            abilities=[
                Ability(
                    ability_id="band_range",
                    activation_mode=ActivationMode.IMMEDIATE,
                    effects=[
                        ActionEffect(
                            step=1,
                            action=ActionVerb.BAND,
                            target=TargetSelector(
                                target_type="evil_character",
                                identifiers=["O.T. Egyptians"],
                                count=DynamicValue.up_to(3),
                            ),
                        )
                    ],
                )
            ]
        )
        is_valid_range, issues_range = verify_fact_matrix(raw_text, extract_ast_facts(range_side))
        self.assertTrue(is_valid_range, f"Expected valid range facts, got: {issues_range}")


if __name__ == "__main__":
    unittest.main()
