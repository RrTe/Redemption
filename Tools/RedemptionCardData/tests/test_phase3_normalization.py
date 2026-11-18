"""Regression tests for Phase 3 identifier, Star, and activation_mode normalizations."""

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

from models.enums import ActivationMode, SelectionMode
from models.logic.ability import Ability
from models.logic.action_effect import ActionEffect
from models.logic.card_logic import CardSideLogic
from models.logic.target_selector import (
    AUTOMATIC_SELF_IDENTIFIER_WHITELIST,
    TargetSelector,
    VERB_ACTION_IDENTIFIER_NOISE,
)
from scripts.fact_matrix import extract_ast_facts, verify_fact_matrix
from scripts.migrations.migrate_phase3_normalization import (
    _resolve_card_type,
    _should_keep_manually_triggered,
    migrate_ai_data,
)
from scripts.utils.card_helpers import get_side_field

STAGE10 = importlib.import_module("scripts.10_verify_logic")

EXT_PATH = ROOT_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"
AI_PATH = ROOT_DIR / "data" / "ai_generated_abilities.json"
DIST_PATH = ROOT_DIR / "data" / "dist" / "cards_logic.json"


class TestPhase3Normalization(unittest.TestCase):
    """Validates Phase 3 cleanup of block/self fragments, Star modes, and immediate entry abilities."""

    ext_by_id: Dict[str, Dict[str, Any]]
    cards_logic: Dict[str, Any]

    @classmethod
    def setUpClass(cls) -> None:
        """Loads extended card DB and production cards_logic.json once for the test suite."""
        ext_cards = json.loads(EXT_PATH.read_text(encoding="utf-8"))["cards"]
        cls.ext_by_id = {str(c.get("Id") or c.get("id")): c for c in ext_cards}
        cls.cards_logic = json.loads(DIST_PATH.read_text(encoding="utf-8"))

    def test_model_strips_block_and_enforces_autoself_effect_whitelist(self) -> None:
        """Ensures TargetSelector drops 'block', ActionEffect enforces self whitelist, and conditions stay intact."""
        sel = TargetSelector(
            selection_mode=SelectionMode.MANUAL_CONTROLLER,
            target_type="evil_character",
            identifiers=["Heretic", "block"],
        )
        self.assertEqual(sel.identifiers, ["Heretic"])

        eff = ActionEffect(
            step=1,
            action="protect",
            target=TargetSelector(
                selection_mode=SelectionMode.AUTOMATIC_SELF,
                target_type="character",
                identifiers=["block", "Meek", "from deck or territory", "Demon"],
            ),
        )
        self.assertEqual(eff.target.identifiers, ["Meek", "Demon"])

        cond_ab = Ability.model_validate({
            "ability_id": "test_cond_kept",
            "activation_mode": "immediate",
            "conditions": [{
                "condition_type": "zone_check",
                "selector": {"selection_mode": "automatic_self", "identifiers": ["Pharisee", "blocking"]},
                "operator": ">=",
                "value": 1,
            }],
            "effects": [{"step": 1, "action": "draw"}],
        })
        self.assertEqual(cond_ab.conditions[0].selector.identifiers, ["Pharisee", "blocking"])

    def test_export_has_zero_block_identifiers_and_clean_block_cases(self) -> None:
        """Verifies all 12 prior 'block' targets are cleaned across protect, prevent/paralyze, and choose."""
        block_hits: List[str] = []
        for cid, card in self.cards_logic.items():
            for sname, sdata in (card.get("sides") or {}).items():
                for ab in sdata.get("abilities", []):
                    for item in ab.get("effects", []) + ab.get("costs", []):
                        idents = (item.get("target") or {}).get("identifiers", [])
                        if any(str(i).strip().lower() in VERB_ACTION_IDENTIFIER_NOISE for i in idents):
                            block_hits.append(f"{cid}_{sname}:{ab['ability_id']}")
        self.assertEqual(block_hits, [])

        for cid in ("-422285470", "-1946607650", "1718830902", "-1147482492", "-431554481", "-208270110"):
            abs_by_id = {a["ability_id"]: a for a in self.cards_logic[cid]["sides"]["top"]["abilities"]}
            self.assertEqual(abs_by_id["protect_from_lone_heroes"]["effects"][0]["target"]["identifiers"], [])
            self.assertEqual(abs_by_id["look_at_hand"]["activation_mode"], ActivationMode.IMMEDIATE.value)

        self.assertEqual(
            self.cards_logic["-1568495204"]["sides"]["top"]["abilities"][1]["effects"][0]["target"]["identifiers"],
            ["Heretic"],
        )
        for cid in ("-1564861084", "-985281279"):
            self.assertEqual(
                self.cards_logic[cid]["sides"]["top"]["abilities"][0]["effects"][0]["target"]["identifiers"],
                ["King of Israel"],
            )
        self.assertEqual(self.cards_logic["747025152"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]["identifiers"], ["Beast"])
        self.assertEqual(self.cards_logic["-1141879242"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]["identifiers"], [])
        self.assertEqual(self.cards_logic["-1690118569"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]["identifiers"], ["Demon"])

    def test_automatic_self_whitelist_invariant_across_export(self) -> None:
        """Verifies automatic_self effect/cost targets only retain atomic whitelisted self traits."""
        violations: List[str] = []
        preserved_traits = set()
        for cid, card in self.cards_logic.items():
            for sname, sdata in (card.get("sides") or {}).items():
                for ab in sdata.get("abilities", []):
                    for item in ab.get("effects", []) + ab.get("costs", []):
                        tgt = item.get("target") or {}
                        if tgt.get("selection_mode") == SelectionMode.AUTOMATIC_SELF.value:
                            for ident in tgt.get("identifiers", []):
                                low = str(ident).strip().lower()
                                if low not in AUTOMATIC_SELF_IDENTIFIER_WHITELIST:
                                    violations.append(f"{cid}_{sname}:{ab['ability_id']}:{ident!r}")
                                else:
                                    preserved_traits.add(low)
        self.assertEqual(violations, [])
        for expected in ("meek", "royalty", "philistine", "demon", "angel", "idol", "cloud", "token"):
            self.assertIn(expected, preserved_traits)

    def test_entry_look_and_star_activation_modes(self) -> None:
        """Checks entry look abilities use 'immediate' and all is_star=True abilities use 'triggered'/'star_phase'."""
        ab_star = Ability.model_validate({
            "ability_id": "star_test_static",
            "is_star": True,
            "activation_mode": "static",
            "effects": [{"step": 1, "action": "protect"}],
        })
        self.assertEqual(ab_star.activation_mode, ActivationMode.TRIGGERED)
        self.assertEqual(ab_star.trigger_event, "star_phase")

        for cid in ("963874993", "518930504", "943652482", "-1262012113", "-1517939798", "134556873", "1440047856", "226021839", "-126073973"):
            abilities = self.cards_logic[cid]["sides"]["top"]["abilities"]
            look_abs = [a for a in abilities if any(e.get("action") == "look" for e in a.get("effects", []))]
            self.assertGreater(len(look_abs), 0, msg=f"Missing look ability on {cid}")
            for lab in look_abs:
                self.assertEqual(lab["activation_mode"], ActivationMode.IMMEDIATE.value)

        for star_cid in ("1237773781", "930278813", "174979637", "192892147"):
            star_abs = [a for a in self.cards_logic[star_cid]["sides"]["top"]["abilities"] if a.get("is_star")]
            self.assertGreater(len(star_abs), 0, msg=f"Missing is_star on {star_cid}")
            for sab in star_abs:
                self.assertEqual(sab["activation_mode"], ActivationMode.TRIGGERED.value)
                self.assertEqual(sab["trigger_event"], "star_phase")

        self.assertEqual(self.cards_logic["604138061"]["sides"]["top"]["abilities"][0]["activation_mode"], ActivationMode.MANUALLY_TRIGGERED.value)
        hozai_abs = {a["ability_id"]: a for a in self.cards_logic["1228725586"]["sides"]["top"]["abilities"]}
        self.assertEqual(hozai_abs["return_any_cards_to_top_of_deck_during_discard_phase"]["activation_mode"], ActivationMode.MANUALLY_TRIGGERED.value)
        destructive_abs = {a["ability_id"]: a for a in self.cards_logic["1273709258"]["sides"]["top"]["abilities"]}
        self.assertEqual(destructive_abs["place_in_territory"]["activation_mode"], ActivationMode.MANUALLY_TRIGGERED.value)

        bad_stars: List[str] = []
        unexpected_manual: List[str] = []
        for cid, card_obj in self.cards_logic.items():
            ext = self.ext_by_id[cid]
            for sname, sdata in (card_obj.get("sides") or {}).items():
                raw_sa = get_side_field(ext, "top" if sname == "shared" else sname, "SpecialAbility") or ""
                ctype = _resolve_card_type(ext, sname)
                for ab in sdata.get("abilities", []):
                    if ab.get("is_star"):
                        if ab.get("activation_mode") != ActivationMode.TRIGGERED.value or ab.get("trigger_event") != "star_phase":
                            bad_stars.append(f"{cid}_{sname}:{ab['ability_id']}:{ab.get('activation_mode')}")
                    elif ab.get("activation_mode") == ActivationMode.MANUALLY_TRIGGERED.value:
                        if not _should_keep_manually_triggered(ab, ctype, raw_sa):
                            unexpected_manual.append(f"{cid}_{sname}:{ab['ability_id']}")
        self.assertEqual(bad_stars, [])
        self.assertEqual(unexpected_manual, [])

        isaiah_abs = {a["ability_id"]: a for a in self.cards_logic["139226334"]["sides"]["top"]["abilities"]}
        self.assertFalse(isaiah_abs["marked_star_cards_cannot_be_negated"]["is_star"])
        self.assertEqual(isaiah_abs["marked_star_cards_cannot_be_negated"]["activation_mode"], ActivationMode.STATIC.value)
        self.assertTrue(isaiah_abs["star_topdeck_isaiah_from_reserve"]["is_star"])
        self.assertEqual(isaiah_abs["star_topdeck_isaiah_from_reserve"]["activation_mode"], ActivationMode.TRIGGERED.value)

        st_patrick_abs = self.cards_logic["-1123127951"]["sides"]["top"]["abilities"]
        self.assertEqual(len(st_patrick_abs), 1)
        self.assertTrue(st_patrick_abs[0]["is_star"])

    def test_fact_matrix_compatibility_and_migration_idempotence(self) -> None:
        """Verifies fact_matrix passes on cleaned cards without 'block' and migration is idempotent."""
        raw_ramses = "Protect this character from lone Heroes. You may look at a hand."
        ramses_side = CardSideLogic.model_validate(self.cards_logic["-422285470"]["sides"]["top"])
        ok_r, issues_r = verify_fact_matrix(raw_ramses, extract_ast_facts(ramses_side))
        self.assertTrue(ok_r, msg=f"Ramses fact_matrix issues: {issues_r}")

        for cid in ("747025152", "-1141879242", "-1690118569", "-1568495204", "-1564861084", "-985281279", "963874993", "139226334"):
            raw_top = get_side_field(self.ext_by_id[cid], "top", "SpecialAbility") or ""
            raw_star = str(self.ext_by_id[cid].get("StarAbility") or "")
            raw_map = {"top": raw_top, **({"star": raw_star} if raw_star else {})}
            side_model = CardSideLogic.model_validate(self.cards_logic[cid]["sides"]["top"])
            _, fact_text = STAGE10._combine_raw_texts_for_side("top", side_model, raw_map)
            ok_fm, issues_fm = verify_fact_matrix(fact_text, extract_ast_facts(side_model))
            self.assertTrue(ok_fm, msg=f"Card {cid} fact_matrix issues: {issues_fm}")

        ai_data = json.loads(AI_PATH.read_text(encoding="utf-8"))
        _, counts, errors = migrate_ai_data(ai_data, self.ext_by_id)
        self.assertEqual(errors, [])
        self.assertEqual(counts["modified_entries"], 0)


if __name__ == "__main__":
    unittest.main()
