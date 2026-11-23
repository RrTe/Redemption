"""Regression and export audit tests for Phase 1 action and stat-mod normalization."""

from __future__ import annotations

import importlib
import json
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from models.enums import ActionVerb, SelectionMode, Zone
from models.enums.action_verb import NON_CANONICAL_EFFECT_ACTIONS
from models.logic.action_effect import ActionEffect, TARGET_PHASES
from models.logic.card_logic import CardSideLogic
from models.logic.dynamic_value import DynamicValue, DynamicValueCalculation
from models.logic.protection_filter import ProtectionFilter
from models.logic.target_selector import TargetSelector
from scripts.fact_matrix import extract_ast_facts, verify_fact_matrix
from scripts.utils.card_linker import CardLinker, link_side_logic_targets

STAGE10 = importlib.import_module("scripts.10_verify_logic")

EXT_PATH = ROOT_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"
DIST_LOGIC_PATH = ROOT_DIR / "data" / "dist" / "cards_logic.json"
DIST_CONSTANTS_PATH = ROOT_DIR / "data" / "dist" / "ast_constants.json"


class TestPhase1ModelContracts(unittest.TestCase):
    """Validates Phase 1 Pydantic model normalizations, DynamicValue formulas, and Stage 10 gates."""

    def test_action_effect_normalizes_synonyms_and_enforces_negative_decrease_mods(self) -> None:
        """Legacy effect verbs normalize to canonical verbs and decrease signs flip negative."""
        bounce_eff = ActionEffect.model_validate({"step": 1, "action": "return to hand"})
        self.assertEqual(bounce_eff.action, ActionVerb.BOUNCE)

        banish_eff = ActionEffect.model_validate({"step": 1, "action": "remove from the game"})
        self.assertEqual(banish_eff.action, ActionVerb.BANISH)

        deact_eff = ActionEffect.model_validate({"step": 1, "action": "deactivate an artifact"})
        self.assertEqual(deact_eff.action, ActionVerb.DEACTIVATE)

        inc_eff = ActionEffect.model_validate({
            "step": 1, "action": "increase", "strength_mod": 2, "toughness_mod": 3,
        })
        self.assertEqual(inc_eff.action, ActionVerb.MODIFY_STATS)
        self.assertEqual(inc_eff.strength_mod, 2)
        self.assertEqual(inc_eff.toughness_mod, 3)

        dec_eff = ActionEffect.model_validate({
            "step": 1, "action": "decrease", "strength_mod": 2, "toughness_mod": -4,
        })
        self.assertEqual(dec_eff.action, ActionVerb.MODIFY_STATS)
        self.assertEqual(dec_eff.strength_mod, -2)
        self.assertEqual(dec_eff.toughness_mod, -4)

    def test_protection_filter_normalizes_banish_bounce_and_retains_decrease(self) -> None:
        """ProtectionFilter maps legacy banish/bounce while keeping decrease as directional predicate."""
        pf = ProtectionFilter(actions=["remove from the game", "return to hand", "decrease", "increase"])
        self.assertEqual(
            pf.actions,
            [ActionVerb.BANISH, ActionVerb.BOUNCE, ActionVerb.DECREASE, ActionVerb.INCREASE],
        )

    def test_dynamic_value_stat_mods_and_selector_card_linking(self) -> None:
        """DynamicValue supports signed float multipliers, nested selectors, and CardLinker resolution."""
        eff = ActionEffect(
            step=1,
            action=ActionVerb.MODIFY_STATS,
            strength_mod=DynamicValue(
                dynamic=DynamicValueCalculation(
                    source="target_stat",
                    operation="multiply",
                    multiplier=0.5,
                )
            ),
            toughness_mod=DynamicValue(
                dynamic=DynamicValueCalculation(
                    source="count_cards",
                    operation="add",
                    multiplier=-1,
                    selector=TargetSelector(card_titles=["Son of God"]),
                )
            ),
        )
        side = CardSideLogic(abilities=[
            {
                "ability_id": "test_dyn_link",
                "activation_mode": "immediate",
                "effects": [eff],
            }
        ])
        linker = CardLinker([
            {"Id": "42", "CardSides": {"top": {"Name": "Son of God (Promo)", "Type": "Dominant"}}},
        ])
        link_side_logic_targets(side, linker)
        t_dyn = side.abilities[0].effects[0].toughness_mod
        assert isinstance(t_dyn, DynamicValue) and t_dyn.dynamic and t_dyn.dynamic.selector
        self.assertEqual(t_dyn.dynamic.selector.target_card_ids, ["42"])
        self.assertEqual(side.abilities[0].effects[0].strength_mod.dynamic.multiplier, 0.5)  # type: ignore[union-attr]

        ok_fm, fm_issues = verify_fact_matrix("Decrease a Hero 0/3 (limit 11).", extract_ast_facts(
            CardSideLogic(abilities=[{
                "ability_id": "fm_dyn",
                "activation_mode": "immediate",
                "effects": [{
                    "step": 1,
                    "action": "modify_stats",
                    "strength_mod": 0,
                    "toughness_mod": {"dynamic": {"source": "card_x_identifier", "operation": "add", "multiplier": -1, "limit": 11}},
                    "target": {"target_type": "hero", "count": {"fixed_value": 3}},
                }],
            }])
        ))
        self.assertTrue(ok_fm, fm_issues)

    def test_stage10_verifier_rejects_unknown_non_canonical_and_missing_phase(self) -> None:
        """verify_card_logic must reject unknown, missing target_phase, and empty modify_stats."""
        bad_unknown = {
            "card_identifier": "99901",
            "sides": {
                "top": {
                    "abilities": [{
                        "ability_id": "bad_unk",
                        "activation_mode": "immediate",
                        "effects": [{"step": 1, "action": "unknown"}],
                    }]
                }
            },
        }
        issues_unk, _ = STAGE10.verify_card_logic("99901", bad_unknown)
        self.assertTrue(any("unknown" in i.lower() for i in issues_unk), issues_unk)

        bad_phase = {
            "card_identifier": "99902",
            "sides": {
                "top": {
                    "abilities": [{
                        "ability_id": "bad_phase",
                        "activation_mode": "immediate",
                        "effects": [{"step": 1, "action": "begin a new phase"}],
                    }]
                }
            },
        }
        issues_phase, _ = STAGE10.verify_card_logic("99902", bad_phase)
        self.assertTrue(any("target_phase" in i for i in issues_phase), issues_phase)

        bad_mod = {
            "card_identifier": "99903",
            "sides": {
                "top": {
                    "abilities": [{
                        "ability_id": "bad_mod",
                        "activation_mode": "immediate",
                        "effects": [{"step": 1, "action": "modify_stats"}],
                    }]
                }
            },
        }
        issues_mod, _ = STAGE10.verify_card_logic("99903", bad_mod)
        self.assertTrue(any("modify_stats" in i for i in issues_mod), issues_mod)


class TestPhase1DistExports(unittest.TestCase):
    """Audits production data/dist/ exports and migration idempotency after Phase 1."""

    constants: Dict[str, Any]
    cards_logic: Dict[str, Any]

    @classmethod
    def setUpClass(cls) -> None:
        """Loads dist ast_constants.json and cards_logic.json once."""
        cls.constants = json.loads(DIST_CONSTANTS_PATH.read_text(encoding="utf-8"))
        cls.cards_logic = json.loads(DIST_LOGIC_PATH.read_text(encoding="utf-8"))

    def test_ast_constants_phase1_schema(self) -> None:
        """ast_constants.json exports deactivate, canonical action_verbs, ability_filter_actions, and target_phases."""
        action_verbs = set(self.constants.get("action_verbs", []))
        self.assertIn("deactivate", action_verbs)
        for forbidden in ("unknown", "return to hand", "remove from the game", "increase", "decrease"):
            self.assertNotIn(forbidden, action_verbs)

        filter_actions = set(self.constants.get("ability_filter_actions", []))
        self.assertTrue({"deactivate", "decrease", "increase"}.issubset(filter_actions))
        for forbidden in ("unknown", "return to hand", "remove from the game"):
            self.assertNotIn(forbidden, filter_actions)

        self.assertEqual(tuple(self.constants.get("target_phases", [])), TARGET_PHASES)
        self.assertEqual(self.constants.get("battle_restrictions"), ["rescue_attempt", "battle_challenge"])
        self.assertEqual(self.constants.get("stat_mod_operations"), ["add", "multiply", "set"])
        self.assertIn("player_choice", self.constants.get("dynamic_value_sources", []))
        self.assertIn("count_brigades", self.constants.get("dynamic_value_sources", []))

    def test_cards_logic_has_zero_legacy_verbs_missing_phases_or_empty_modify_stats(self) -> None:
        """Production cards_logic.json satisfies all Phase 1 structural invariants."""
        forbidden_actions = {a.value for a in NON_CANONICAL_EFFECT_ACTIONS}
        bad_actions: List[str] = []
        missing_phases: List[str] = []
        empty_modify: List[str] = []
        bad_pf_actions: List[str] = []

        for cid, card in self.cards_logic.items():
            for sname, sdata in (card.get("sides") or {}).items():
                for ab in sdata.get("abilities") or []:
                    ab_id = ab.get("ability_id")
                    for eff in list(ab.get("effects") or []) + list(ab.get("costs") or []):
                        act = eff.get("action")
                        if act in forbidden_actions:
                            bad_actions.append(f"{cid}_{sname}.{ab_id}:{act}")
                        if act == "begin a new phase" and not eff.get("target_phase"):
                            missing_phases.append(f"{cid}_{sname}.{ab_id}")
                        if act == "modify_stats" and eff.get("strength_mod") is None and eff.get("toughness_mod") is None:
                            empty_modify.append(f"{cid}_{sname}.{ab_id}")
                        pf = eff.get("protection_filter") or {}
                        for pa in list(pf.get("actions") or []) + list(pf.get("except_actions") or []):
                            if pa in ("unknown", "return to hand", "remove from the game"):
                                bad_pf_actions.append(f"{cid}_{sname}.{ab_id}:{pa}")

        self.assertEqual(bad_actions, [])
        self.assertEqual(missing_phases, [])
        self.assertEqual(empty_modify, [])
        self.assertEqual(bad_pf_actions, [])

    def test_representative_migrated_cards_in_dist(self) -> None:
        """Verifies all key Phase 1 cards in cards_logic.json."""
        # 1. Deactivate cards (former unknown)
        for cid in ("868887774", "278140191", "1514466594", "-2065445572", "-85107037", "586612795", "-1996231490"):
            acts = [
                e["action"]
                for s in self.cards_logic[cid]["sides"].values()
                for ab in s.get("abilities", [])
                for e in ab.get("effects", [])
            ]
            self.assertIn("deactivate", acts, f"Expected deactivate on {cid}")

        two_wit = self.cards_logic["586612795"]["sides"]["top"]["abilities"]
        deact_eff = next(e for ab in two_wit for e in ab["effects"] if e["action"] == "deactivate")
        self.assertEqual(deact_eff["target"]["target_type"], "curse")

        # 2. begin a new phase variants
        grapes = self.cards_logic["780421164"]["sides"]["top"]["abilities"][1]
        self.assertEqual(grapes["activation_mode"], "immediate")
        self.assertEqual(grapes["effects"][0]["action"], "begin a new phase")
        self.assertEqual(grapes["effects"][0]["target_phase"], "battle_phase")

        ambush = self.cards_logic["791959658"]["sides"]["top"]["abilities"][0]["effects"][1]
        self.assertEqual(ambush["action"], "begin a new phase")
        self.assertEqual(ambush["target_phase"], "battle_phase")
        self.assertEqual(ambush["battle_restriction"], "rescue_attempt")
        self.assertTrue(ambush["resumes_previous_phase"])

        christs_triumph = self.cards_logic["38114992"]["sides"]["top"]["abilities"][1]["effects"][0]
        self.assertEqual(christs_triumph["target_phase"], "battle_phase")
        self.assertEqual(christs_triumph["battle_restriction"], "rescue_attempt")

        provoked_effs = self.cards_logic["-461971196"]["sides"]["top"]["abilities"][0]["effects"]
        self.assertEqual(provoked_effs[0]["strength_mod"]["dynamic"]["multiplier"], -1)
        self.assertEqual(provoked_effs[1]["strength_mod"]["dynamic"]["multiplier"], 1)

        new_beg = next(
            e
            for ab in self.cards_logic["1689524727"]["sides"]["top"]["abilities"]
            for e in ab["effects"]
            if e["action"] == "begin a new phase"
        )
        self.assertEqual(new_beg["target_phase"], "draw_phase")

        # 3. Harvest Time & Falling Away
        harvest = self.cards_logic["957979145"]["sides"]["top"]["abilities"][0]["effects"]
        self.assertEqual(len(harvest), 1)
        self.assertEqual(harvest[0]["action"], "play")
        self.assertEqual(harvest[0]["target"]["count"]["dynamic"]["source"], "player_choice")

        falling = self.cards_logic["-1474676710"]["sides"]["top"]["abilities"][0]["effects"]
        self.assertEqual(len(falling), 2)
        self.assertEqual(falling[0]["target"]["scope"], ["land_of_redemption"])
        self.assertEqual(falling[0]["destination"], "land_of_bondage")

        # 4. Dynamic stat mods & protection_filter decrease retention
        betrayal = self.cards_logic["1609027840"]["sides"]["top"]["abilities"][0]["effects"][0]
        self.assertEqual(betrayal["action"], "modify_stats")
        self.assertEqual(betrayal["strength_mod"]["dynamic"]["operation"], "multiply")
        self.assertEqual(betrayal["strength_mod"]["dynamic"]["multiplier"], 0.5)

        worked = self.cards_logic["1351563776"]["sides"]["top"]["abilities"][0]["effects"][0]
        self.assertEqual(worked["strength_mod"]["dynamic"]["operation"], "set")
        self.assertEqual(worked["strength_mod"]["dynamic"]["fixed_value"], 1)
        self.assertEqual(worked["toughness_mod"]["dynamic"]["fixed_value"], 3)

        potter_abs = [
            ab for ab in self.cards_logic["-112531310"]["sides"]["top"]["abilities"]
            if not ab.get("is_star")
        ]
        self.assertEqual(len(potter_abs), 4)
        self.assertEqual({ab["choice_group"] for ab in potter_abs}, {"choice_1", "choice_2"})

        jair_pf = next(
            e["protection_filter"]
            for ab in self.cards_logic["1387834434"]["sides"]["top"]["abilities"]
            for e in ab["effects"]
            if e.get("protection_filter")
        )
        self.assertEqual(jair_pf["actions"], ["decrease"])


if __name__ == "__main__":
    unittest.main()
