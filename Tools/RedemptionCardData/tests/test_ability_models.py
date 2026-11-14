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

        # Zone IN_PLAY check (wrapped in List[Zone])
        target = TargetSelector(scope=Zone.IN_PLAY, target_type="hero")
        self.assertEqual(target.scope, [Zone.IN_PLAY])

        # Parse target zone suffix with in play
        clean, zones, owner, _ = parse_target_zone_suffix("all heroes in play")
        self.assertEqual(zones, [Zone.IN_PLAY])
        self.assertEqual(clean, "all heroes")

        # Abbreviation protection & condition extraction
        raw = "If used by an O.T. Hero, discard a card."
        masked = protect_abbreviations(raw)
        rem, cond = extract_condition_prefix(masked)
        self.assertIsNotNone(cond)
        self.assertEqual(cond.selector.target_type, "hero")
        self.assertEqual(cond.selector.testament, "OT")
        self.assertEqual(restore_abbreviations(rem), "discard a card.")

    def test_llm_normalization(self):
        """Tests field validators that normalize common LLM phrasing variations."""
        # Activation mode normalization: manual_triggered -> manually_triggered
        ab_data = {
            "ability_id": "test_norm",
            "activation_mode": "manual_triggered",
            "effects": [{"step": 1, "action": "draw"}]
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

    def test_target_parsing_and_classification(self):
        """Tests REG v11 target zone, owner, and alignment resolution."""
        from scripts.utils.target_parser import build_target_selector
        t1 = build_target_selector("an evil card")
        self.assertEqual(t1.scope, [Zone.IN_PLAY])
        self.assertEqual(t1.zone_owner, "either")
        self.assertEqual(t1.alignment, "evil")
        self.assertEqual(t1.target_type, "card")
        self.assertEqual(t1.count.fixed_value, 1)

        t2 = build_target_selector("all Demons in Play", cnt_token="all")
        self.assertEqual(t2.scope, [Zone.IN_PLAY])
        self.assertEqual(t2.zone_owner, "both")
        self.assertEqual(t2.alignment, "evil")
        self.assertEqual(t2.target_type, "evil_character")
        self.assertEqual(t2.identifiers, ["Demon"])

        t3 = build_target_selector("an evil card from opponent's hand")
        self.assertEqual(t3.scope, [Zone.HAND])
        self.assertEqual(t3.zone_owner, "opponent")

    def test_multi_zone_and_plural_target_semantics(self):
        """Tests multi-zone scope lists, plural target_type preservation, and 4-way separation."""
        from scripts.utils.target_parser import build_target_selector
        from scripts.utils.reg_vocabulary import is_action_prohibited

        # 1. Explicit multi-zone suffix
        t_multi = build_target_selector("a good card from deck or Reserve")
        self.assertEqual(t_multi.scope, [Zone.DECK, Zone.RESERVE_PILE])
        self.assertEqual(t_multi.alignment, "good")
        self.assertEqual(t_multi.target_type, "card")

        t_set_aside = build_target_selector("any Silver Brigade Hero in play or set-aside area")
        self.assertEqual(t_set_aside.scope, [Zone.IN_PLAY, Zone.SET_ASIDE])
        self.assertEqual(t_set_aside.brigades, ["Silver"])
        self.assertEqual(t_set_aside.target_type, "hero")

        # 2. Plural target_type preservation (AUTOMATIC_ALL, count=None, zone_owner='both')
        t_plural = build_target_selector("Evil Characters", cnt_token=None)
        self.assertEqual(t_plural.target_type, "evil_character")
        self.assertEqual(t_plural.selection_mode, SelectionMode.AUTOMATIC_ALL)
        self.assertIsNone(t_plural.count)
        self.assertEqual(t_plural.zone_owner, "both")

        # 3. Named card banding (Samuel -> card_titles)
        t_samuel = build_target_selector("Samuel", default_scope=[Zone.IN_PLAY], default_owner="both")
        self.assertEqual(t_samuel.card_titles, ["Samuel"])
        self.assertEqual(t_samuel.identifiers, [])
        self.assertEqual(t_samuel.scope, [Zone.IN_PLAY])
        self.assertEqual(t_samuel.zone_owner, "both")

        # 4. Multi-item protection and negation prohibition checks
        self.assertTrue(is_action_prohibited("Protect Job from capture and discard.", "discard"))
        self.assertTrue(is_action_prohibited("Negate band, draw and play abilities.", "draw"))
        self.assertTrue(is_action_prohibited("Negate all special abilities (except band abilities).", "band"))

    def test_stage08_cost_benefit_and_named_banding(self):
        """Tests deterministic parsing of cost-benefit and named banding clauses."""
        import importlib.util
        from pathlib import Path
        spec = importlib.util.spec_from_file_location(
            "stage08", Path(__file__).resolve().parent.parent / "scripts" / "08_parse_abilities.py"
        )
        stage08 = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(stage08)

        # Goliath's Spear [L]: 'You may discard this card to discard a Hero.'
        gs_logic, gs_err = stage08.parse_side_ability(
            "Goliath's Spear [L]", "shared", "You may discard this card to discard a Hero."
        )
        self.assertIsNone(gs_err)
        self.assertIsNotNone(gs_logic)
        ab_gs = gs_logic.abilities[0]
        self.assertEqual(len(ab_gs.costs), 1)
        self.assertEqual(ab_gs.costs[0].action, ActionVerb.DISCARD)
        self.assertEqual(ab_gs.costs[0].target.selection_mode, SelectionMode.AUTOMATIC_SELF)
        self.assertEqual(len(ab_gs.effects), 1)
        self.assertEqual(ab_gs.effects[0].action, ActionVerb.DISCARD)
        self.assertEqual(ab_gs.effects[0].target.target_type, "hero")

        # Eli the Priest: 'May band to Samuel.'
        eli_logic, eli_err = stage08.parse_side_ability(
            "Eli the Priest", "shared", "May band to Samuel."
        )
        self.assertIsNone(eli_err)
        self.assertIsNotNone(eli_logic)
        ab_eli = eli_logic.abilities[0]
        self.assertEqual(ab_eli.effects[0].action, ActionVerb.BAND)
        self.assertEqual(ab_eli.effects[0].target.card_titles, ["Samuel"])
        self.assertEqual(ab_eli.effects[0].target.identifiers, [])
        self.assertEqual(ab_eli.effects[0].target.scope, [Zone.IN_PLAY, Zone.HAND])
        self.assertEqual(ab_eli.effects[0].target.zone_owner, "both")

    def test_card_hierarchy_export(self):
        """Tests deterministic JSON export of CardType, TYPE_GROUPS, and TYPE_IS_A."""
        import tempfile
        from pathlib import Path
        import json
        from scripts.utils.card_hierarchy_exporter import export_card_hierarchy

        with tempfile.TemporaryDirectory() as tmp_dir:
            out_path = Path(tmp_dir) / "cardHierarchy.json"
            payload = export_card_hierarchy(out_path)
            self.assertTrue(out_path.exists())

            loaded = json.loads(out_path.read_text(encoding="utf-8"))
            self.assertEqual(loaded, payload)
            self.assertIn("Hero", loaded["card_types"])
            self.assertEqual(loaded["type_groups"]["Enhancement"], ["GE", "EE"])
            self.assertEqual(
                loaded["type_groups"]["Character"],
                ["Hero", "Evil Character", "Hero Token", "Evil Character Token"]
            )
            self.assertEqual(loaded["type_groups"]["City"], ["Fortress", "Site"])
            self.assertEqual(loaded["type_is_a"]["Covenant"], ["Artifact", "GE"])
            self.assertEqual(loaded["type_is_a"]["Curse"], ["Artifact", "EE"])

    def test_star_ability_splitting_and_ast_normalization(self):
        """Tests Star ability extraction across single/dual cards and AST normalization."""
        from scripts.utils.ability_splitter import split_card_abilities
        from models.logic.ability import Ability
        from models.logic.action_effect import ActionEffect
        from models.enums.action_verb import ActionVerb
        from models.enums.activation_mode import ActivationMode

        # 1. Single-sided card with (Star) and (HE)
        sides, star = split_card_abilities(
            "(Star) Look at the bottom 6 cards of deck: You may topdeck a good card. (HE) Interrupt the battle.",
            [{"key": "top", "type": "GE", "alignment": "Good"}]
        )
        self.assertEqual(star, "Look at the bottom 6 cards of deck: You may topdeck a good card.")
        self.assertEqual(sides["top"], "Interrupt the battle.")

        # 2. Single-sided card with dot-adjacent tag (Hungry Lion)
        sides_hl, star_hl = split_card_abilities(
            "STAR: Take an animal or topdeck an animal from Reserve.EC: You may discard an Enhancement.",
            [{"key": "top", "type": "Evil Character", "alignment": "Evil"}]
        )
        self.assertEqual(star_hl, "Take an animal or topdeck an animal from Reserve.")
        self.assertEqual(sides_hl["top"], "You may discard an Enhancement.")

        # 3. Dual-sided GoC Star card with STAR: and H:
        sides_goc, star_goc = split_card_abilities(
            "STAR: Play Fishing Boat from Reserve. / H: While you control a meek disciple, negate neutral cards.",
            [
                {"key": "top", "type": "Hero", "alignment": "Good"},
                {"key": "bottom", "type": "Hero", "alignment": "Good"},
            ]
        )
        self.assertEqual(star_goc, "Play Fishing Boat from Reserve.")
        self.assertEqual(sides_goc["top"], "While you control a meek disciple, negate neutral cards.")
        self.assertEqual(sides_goc["bottom"], "")

        # 4. Ability AST normalization when is_star=True
        ab = Ability(
            ability_id="draw_card",
            is_star=True,
            activation_mode=ActivationMode.IMMEDIATE,
            effects=[ActionEffect(step=1, action=ActionVerb.DRAW)]
        )
        self.assertTrue(ab.is_star)
        self.assertEqual(ab.trigger_event, "star_phase")
        self.assertEqual(ab.ability_id, "star_draw_card")
        self.assertEqual(ab.activation_mode, ActivationMode.TRIGGERED)

    def test_protection_filter_model_and_parsing(self):
        """Tests ProtectionFilter model validation and parser extraction from REG clauses."""
        from models.logic.protection_filter import ProtectionFilter
        from scripts.utils.target_parser import parse_protection_filter

        # 1. Action protection
        pf1 = parse_protection_filter("discard and capture abilities")
        self.assertFalse(pf1.from_harm)
        self.assertIn(ActionVerb.DISCARD, pf1.actions)
        self.assertIn(ActionVerb.CAPTURE, pf1.actions)
        self.assertEqual(len(pf1.card_sources), 0)

        # 2. Harm protection per REG p. 106
        pf2 = parse_protection_filter("harm")
        self.assertTrue(pf2.from_harm)
        self.assertEqual(len(pf2.actions), 0)

        # 3. Multi-source protection (Goliath style)
        pf3 = parse_protection_filter("lone Heroes and opponents' Dominants")
        self.assertFalse(pf3.from_harm)
        self.assertEqual(len(pf3.card_sources), 2)
        hero_src = next(cs for cs in pf3.card_sources if cs.target_type == "hero")
        dom_src = next(cs for cs in pf3.card_sources if cs.target_type == "dominant")
        self.assertIn("lone", hero_src.identifiers)
        self.assertEqual(dom_src.zone_owner, "opponent")

        # 4. Exception clause (Abel style: except discard)
        pf4 = parse_protection_filter("special abilities on evil cards (except discard)")
        self.assertIn(ActionVerb.DISCARD, pf4.except_actions)
        self.assertNotIn(ActionVerb.DISCARD, pf4.actions)
        self.assertTrue(any(cs.alignment == "evil" for cs in pf4.card_sources))

        # 5. Full roundtrip in ActionEffect
        eff = ActionEffect(
            step=1,
            action=ActionVerb.PROTECT,
            effect_type="ongoing",
            duration=Duration.PERMANENT,
            target=TargetSelector(selection_mode=SelectionMode.AUTOMATIC_SELF, scope=[Zone.IN_PLAY]),
            protection_filter=pf3,
        )
        dumped = eff.model_dump()
        self.assertIn("protection_filter", dumped)
        self.assertEqual(len(dumped["protection_filter"]["card_sources"]), 2)
        loaded = ActionEffect.model_validate(dumped)
        self.assertEqual(loaded.protection_filter.card_sources[0].target_type, "hero")


if __name__ == "__main__":
    unittest.main()

