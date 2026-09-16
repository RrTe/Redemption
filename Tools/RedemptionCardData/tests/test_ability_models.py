"""Unit tests for REG v11-compliant ability logic models.

Verifies Pydantic serialization/deserialization, modifier propagation,
chained target references, and validation rules using standard unittest.
"""

import unittest
from models.enums.activation_mode import ActivationMode
from models.enums.action_verb import ActionVerb
from models.enums.zone import Zone
from models.enums.duration import Duration
from models.enums.modifier_type import ModifierType
from models.enums.selection_mode import SelectionMode
from models.logic.dynamic_value import DynamicValue
from models.logic.target_selector import TargetSelector
from models.logic.action_effect import ActionEffect
from models.logic.modifier import Modifier, LimitParams, ReplacementParams
from models.logic.ability import Ability
from models.logic.card_logic import CardSideLogic, CardLogic


class TestAbilityModels(unittest.TestCase):
    """Test suite covering core logic models, modifiers, and AST validation."""

    def test_basic_ability_serialization(self):
        """Tests creating and serializing a basic draw ability."""
        ability = Ability(
            ability_id="test_draw",
            activation_mode=ActivationMode.IMMEDIATE,
            is_optional=False,
            effects=[
                ActionEffect(
                    step=1,
                    action=ActionVerb.DRAW,
                    target=TargetSelector(
                        selection_mode=SelectionMode.AUTOMATIC_ALL,
                        zone_owner="controller",
                        count=DynamicValue.from_int(2)
                    )
                )
            ]
        )

        data = ability.model_dump()
        self.assertEqual(data["ability_id"], "test_draw")
        self.assertEqual(data["effects"][0]["action"], "draw")
        self.assertEqual(data["effects"][0]["target"]["count"]["fixed_value"], 2)

        # Round-trip deserialization
        reloaded = Ability.model_validate(data)
        self.assertTrue(reloaded.is_preventable)
        self.assertTrue(reloaded.is_interruptible)
        self.assertTrue(reloaded.is_negatable)

    def test_side_modifier_propagation(self):
        """Tests that side-wide modifiers automatically flip O(1) ability flags."""
        side_logic = CardSideLogic(
            modifiers=[
                Modifier(modifier_type=ModifierType.CANNOT_BE_NEGATED, applies_to="this_side"),
                Modifier(modifier_type=ModifierType.CANNOT_BE_INTERRUPTED, applies_to="this_side")
            ],
            abilities=[
                Ability(
                    ability_id="test_ab",
                    activation_mode=ActivationMode.IMMEDIATE,
                    effects=[
                        ActionEffect(step=1, action=ActionVerb.DISCARD)
                    ]
                )
            ]
        )

        # Before propagation
        self.assertTrue(side_logic.abilities[0].is_negatable)
        self.assertTrue(side_logic.abilities[0].is_interruptible)

        # Propagate
        side_logic.propagate_side_modifiers()

        # After propagation
        self.assertFalse(side_logic.abilities[0].is_negatable)
        self.assertFalse(side_logic.abilities[0].is_interruptible)
        self.assertTrue(side_logic.abilities[0].is_preventable)

    def test_chained_target_and_context_scope(self):
        """Tests modeling a complex look + discard + underdeck the rest sequence."""
        side_logic = CardSideLogic(
            abilities=[
                Ability(
                    ability_id="look_and_underdeck_remainder",
                    activation_mode=ActivationMode.IMMEDIATE,
                    effects=[
                        ActionEffect(
                            step=1,
                            action=ActionVerb.REVEAL,
                            creates_context_scope=True,
                            target=TargetSelector(
                                selection_mode=SelectionMode.AUTOMATIC_ALL,
                                scope=Zone.DECK,
                                count=DynamicValue.from_int(3)
                            )
                        ),
                        ActionEffect(
                            step=2,
                            action=ActionVerb.DISCARD,
                            target=TargetSelector(
                                selection_mode=SelectionMode.MANUAL_CONTROLLER,
                                scope=Zone.CONTEXT_SCOPE,
                                count=DynamicValue.from_int(1)
                            )
                        ),
                        ActionEffect(
                            step=3,
                            action=ActionVerb.UNDERDECK,
                            target=TargetSelector(
                                selection_mode=SelectionMode.CONTEXT_REMAINDER,
                                scope=Zone.CONTEXT_SCOPE,
                                count=DynamicValue.all_targets()
                            ),
                            destination=Zone.DECK,
                            destination_position="bottom"
                        )
                    ]
                )
            ]
        )

        data = side_logic.model_dump()
        self.assertEqual(len(data["abilities"][0]["effects"]), 3)
        self.assertTrue(data["abilities"][0]["effects"][0]["creates_context_scope"])
        self.assertEqual(data["abilities"][0]["effects"][2]["target"]["selection_mode"], "context_remainder")
        self.assertEqual(data["abilities"][0]["effects"][2]["destination_position"], "bottom")

    def test_card_logic_full_roundtrip(self):
        """Tests full CardLogic model with top and bottom dual-sided cards."""
        card = CardLogic(
            card_identifier="Dual_Test_001",
            sides={
                "top": CardSideLogic(
                    abilities=[
                        Ability(
                            ability_id="top_ability",
                            effects=[ActionEffect(step=1, action=ActionVerb.HEAL)]
                        )
                    ]
                ),
                "bottom": CardSideLogic(
                    modifiers=[
                        Modifier(
                            modifier_type=ModifierType.LIMIT,
                            applies_to="this_side",
                            limit_params=LimitParams(count=1, per="turn")
                        )
                    ]
                )
            }
        )

        dumped = card.model_dump()
        loaded = CardLogic.model_validate(dumped)
        self.assertEqual(loaded.card_identifier, "Dual_Test_001")
        self.assertIn("top", loaded.sides)
        self.assertIn("bottom", loaded.sides)
        self.assertEqual(loaded.sides["bottom"].modifiers[0].limit_params.count, 1)

    def test_zone_in_play_and_abbreviation_patterns(self):
        """Tests that Zone.IN_PLAY is valid and abbreviations with periods are parsed cleanly."""
        from scripts.utils.ability_patterns import (
            protect_abbreviations,
            restore_abbreviations,
            extract_condition_prefix,
            parse_target_zone_suffix,
        )

        # Zone IN_PLAY check
        target = TargetSelector(scope=Zone.IN_PLAY, target_type="hero")
        self.assertEqual(target.scope, Zone.IN_PLAY)

        # Parse target zone suffix with in play
        clean, zone, owner = parse_target_zone_suffix("all heroes in play")
        self.assertEqual(zone, Zone.IN_PLAY)
        self.assertEqual(clean, "all heroes")

        # Abbreviation protection & condition extraction
        raw = "If used by an O.T. Hero, discard a card."
        masked = protect_abbreviations(raw)
        rem, cond = extract_condition_prefix(masked)
        self.assertIsNotNone(cond)
        self.assertEqual(cond.selector.target_type, "o.t. hero")
        self.assertEqual(restore_abbreviations(rem), "discard a card.")


    def test_llm_normalization(self):
        """Tests field validators that normalize common LLM phrasing variations."""
        # Activation mode normalization: manual_triggered -> manually_triggered
        ab_data = {
            "ability_id": "test_norm",
            "activation_mode": "manual_triggered"
        }
        ab = Ability.model_validate(ab_data)
        self.assertEqual(ab.activation_mode, ActivationMode.MANUALLY_TRIGGERED)

        # Zone owner normalization: context_scope -> controller, any -> either, all -> both
        target_context = TargetSelector.model_validate({"zone_owner": "context_scope"})
        self.assertEqual(target_context.zone_owner, "controller")

        target_any = TargetSelector.model_validate({"zone_owner": "any"})
        self.assertEqual(target_any.zone_owner, "either")

        target_all = TargetSelector.model_validate({"zone_owner": "all"})
        self.assertEqual(target_all.zone_owner, "both")


if __name__ == "__main__":
    unittest.main()
