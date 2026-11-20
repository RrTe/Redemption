"""Regression tests for Phase 4 modal choice_group parsing, verification, and migration."""

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
if str(ROOT_DIR / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "scripts"))

from models.enums import ActionVerb, ActivationMode
from models.logic.ability import Ability
from models.logic.action_effect import ActionEffect
from models.logic.card_logic import CardSideLogic
from scripts.migrations.migrate_phase4_choice_groups import migrate_ai_data
from scripts.utils.card_helpers import get_side_field, get_star_ability
from scripts.utils.choice_group_helper import find_missing_choice_groups, split_modal_or_clauses

STAGE08 = importlib.import_module("scripts.08_parse_abilities")
STAGE09 = importlib.import_module("scripts.09_generate_ai_abilities")
STAGE10 = importlib.import_module("scripts.10_verify_logic")

EXT_PATH = ROOT_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"
AI_PATH = ROOT_DIR / "data" / "ai_generated_abilities.json"
DIST_PATH = ROOT_DIR / "data" / "dist" / "cards_logic.json"


class TestPhase4ChoiceGroups(unittest.TestCase):
    """Validates Phase 4 modal choice_group integrity across Stage 08/09/10 and export."""

    ext_by_id: Dict[str, Dict[str, Any]]
    cards_logic: Dict[str, Any]

    @classmethod
    def setUpClass(cls) -> None:
        """Loads extended card DB and exported cards_logic.json once for the suite."""
        ext_cards = json.loads(EXT_PATH.read_text(encoding="utf-8"))["cards"]
        cls.ext_by_id = {str(c.get("Id") or c.get("id")): c for c in ext_cards}
        cls.cards_logic = json.loads(DIST_PATH.read_text(encoding="utf-8"))

    def test_reported_modal_cards_and_stage08_repairs_in_export(self) -> None:
        """Checks reported Coliseum cards and Stage 08 modal cards carry exact choice_groups."""
        for cid in ("1830061607", "-1542044403", "848128688", "-219258088"):
            side_key = "bottom" if cid == "-219258088" else "top"
            abs_list = self.cards_logic[cid]["sides"][side_key]["abilities"]
            self.assertEqual(len(abs_list), 2)
            self.assertIsNotNone(abs_list[0].get("choice_group"))
            self.assertEqual(abs_list[0].get("choice_group"), abs_list[1].get("choice_group"))

        # Mixed 3-ability cards: [0] stays ungrouped, [1] & [2] share one choice_group
        for cid in ("-627605698", "-888694675"):
            abs_list = self.cards_logic[cid]["sides"]["top"]["abilities"]
            self.assertEqual(len(abs_list), 3)
            self.assertIsNone(abs_list[0].get("choice_group"))
            self.assertIsNotNone(abs_list[1].get("choice_group"))
            self.assertEqual(abs_list[1].get("choice_group"), abs_list[2].get("choice_group"))

        # Stage 08 modal-OR parses Stricken and Covenant with Abraham cleanly
        stricken = {a["ability_id"]: a for a in self.cards_logic["278813735"]["sides"]["top"]["abilities"]}
        self.assertIsNone(stricken["star_ab_1_protect"].get("choice_group"))
        self.assertIsNotNone(stricken["ab_1_negate"].get("choice_group"))
        self.assertEqual(stricken["ab_1_negate"].get("choice_group"), stricken["ab_2_reserve"].get("choice_group"))

        cov_abr = self.cards_logic["-1265515809"]["sides"]["top"]["abilities"]
        self.assertEqual([a["ability_id"] for a in cov_abr], ["ab_1_take", "ab_2_reserve"])
        self.assertIsNotNone(cov_abr[0].get("choice_group"))
        self.assertEqual(cov_abr[0].get("choice_group"), cov_abr[1].get("choice_group"))

        # Haggai (PoC): [0, 1] receive choice_2 while [2, 3] retain choice_1
        haggai_cgs = [a.get("choice_group") for a in self.cards_logic["-706183812"]["sides"]["top"]["abilities"]]
        self.assertEqual(haggai_cgs, ["choice_2", "choice_2", "choice_1", "choice_1"])

    def test_false_positives_remain_ungrouped_and_zero_singletons_in_export(self) -> None:
        """Verifies and/or, universal all-OR, Tartaros, singletons, and missing groups are clean."""
        for cid in ("-1777999383", "402956708", "-198798044", "-560458496", "457222444", "1195661714", "459749679", "-2124300825", "-1206252778"):
            cgs = [a.get("choice_group") for a in self.cards_logic[cid]["sides"]["top"]["abilities"]]
            self.assertTrue(all(cg is None for cg in cgs), msg=f"Unexpected choice_group on {cid}: {cgs}")

        elhanan_cgs = [a.get("choice_group") for a in self.cards_logic["1501337366"]["sides"]["top"]["abilities"]]
        self.assertIsNotNone(elhanan_cgs[0])
        self.assertEqual(elhanan_cgs[0], elhanan_cgs[1])
        self.assertIsNone(elhanan_cgs[2])

        singleton_hits: List[str] = []
        missing_hits: List[str] = []
        for cid, card in self.cards_logic.items():
            ext = self.ext_by_id[cid]
            star_sa = get_star_ability(ext)
            for sname, sdata in (card.get("sides") or {}).items():
                side_model = CardSideLogic.model_validate(sdata)
                singletons = side_model.find_singleton_choice_groups()
                if singletons:
                    singleton_hits.append(f"{cid}_{sname}:{singletons}")
                raw_sa = get_side_field(ext, "top" if sname == "shared" else sname, "SpecialAbility") or ext.get("SpecialAbility") or ""
                missing = find_missing_choice_groups(
                    side_model, raw_sa, star_sa if sname in ("top", "shared") else ""
                )
                if missing:
                    missing_hits.append(f"{cid}_{sname}:{[m.ability_indices for m in missing]}")
        self.assertEqual(singleton_hits, [])
        self.assertEqual(missing_hits, [])

    def test_stage08_deterministic_modal_or_splitting(self) -> None:
        """Stage 08 assigns choice_group strictly to modal-OR branches and ignores non-modal ORs."""
        mixed_side, err = STAGE08.parse_side_ability(
            "Synthetic Prophet",
            "top",
            "Protect Heroes from evil cards. May band to a generic prophet, or you may draw 2.",
        )
        self.assertIsNone(err)
        assert mixed_side is not None
        self.assertEqual(len(mixed_side.abilities), 3)
        self.assertIsNone(mixed_side.abilities[0].choice_group)
        self.assertEqual(mixed_side.abilities[1].choice_group, "choice_1")
        self.assertEqual(mixed_side.abilities[2].choice_group, "choice_1")
        self.assertTrue(mixed_side.abilities[2].is_optional)

        # Negative controls: and/or and single-ability zone OR must not split into modal groups
        self.assertEqual(split_modal_or_clauses("May band to Joab and/or Asahel"), ["May band to Joab and/or Asahel"])
        zone_side, z_err = STAGE08.parse_side_ability("Zone Card", "top", "You may take a Hero from deck or Reserve.")
        self.assertIsNone(z_err)
        assert zone_side is not None
        self.assertEqual(len(zone_side.abilities), 1)
        self.assertIsNone(zone_side.abilities[0].choice_group)

    def test_stage09_postprocessing_repairs_missing_and_clears_singletons(self) -> None:
        """Stage 09 post-processing adds missing choice_groups and strips singleton groups."""
        raw_text = "Protect this card from evil cards. May band to a prophet, or you may draw 2."
        llm_ast = {
            "modifiers": [],
            "abilities": [
                {"ability_id": "protect_self", "activation_mode": "static", "choice_group": "stray_singleton", "effects": [{"step": 1, "action": "protect"}]},
                {"ability_id": "band_prophet", "activation_mode": "immediate", "is_optional": True, "effects": [{"step": 1, "action": "band"}]},
                {"ability_id": "draw_two", "activation_mode": "immediate", "is_optional": True, "effects": [{"step": 1, "action": "draw"}]},
            ],
        }
        repaired = STAGE09._normalize_side_ast_dict(llm_ast, "top", raw_text)
        self.assertIsNone(repaired["abilities"][0]["choice_group"])
        self.assertEqual(repaired["abilities"][1]["choice_group"], "choice_1")
        self.assertEqual(repaired["abilities"][2]["choice_group"], "choice_1")

    def test_stage10_verifier_catches_singleton_and_missing_choice_groups(self) -> None:
        """Stage 10 verify_card_logic flags singleton/missing choice_groups while allowing valid ASTs."""
        broken_singleton = {
            "card_identifier": "999001",
            "sides": {
                "top": {
                    "abilities": [
                        {"ability_id": "ab_1", "activation_mode": "immediate", "choice_group": "choice_1", "effects": [{"step": 1, "action": "draw"}]},
                    ]
                }
            },
        }
        issues_single, _ = STAGE10.verify_card_logic("999001", broken_singleton, raw_abilities={"top": "Draw 1."})
        self.assertTrue(any("Singleton choice_group" in i for i in issues_single))

        broken_missing = {
            "card_identifier": "999002",
            "sides": {
                "top": {
                    "abilities": [
                        {"ability_id": "band_prophet", "activation_mode": "immediate", "is_optional": True, "effects": [{"step": 1, "action": "band"}]},
                        {"ability_id": "draw_two", "activation_mode": "immediate", "is_optional": True, "effects": [{"step": 1, "action": "draw"}]},
                    ]
                }
            },
        }
        issues_missing, _ = STAGE10.verify_card_logic(
            "999002", broken_missing, raw_abilities={"top": "May band to a generic prophet, or you may draw 2."}
        )
        self.assertTrue(any("Missing choice_group" in i for i in issues_missing))

        # Valid mixed card (-627605698) and and/or card (-1777999383) must pass cleanly
        for cid in ("-627605698", "-888694675", "-1777999383", "-198798044"):
            raw_top = get_side_field(self.ext_by_id[cid], "top", "SpecialAbility") or ""
            issues_ok, _ = STAGE10.verify_card_logic(
                cid, {"card_identifier": cid, "sides": self.cards_logic[cid]["sides"]}, raw_abilities={"top": raw_top}
            )
            self.assertEqual(issues_ok, [], msg=f"Unexpected Stage 10 issues on {cid}: {issues_ok}")

    def test_phase4_migration_is_idempotent(self) -> None:
        """Re-running Phase 4 migration on migrated ai_generated_abilities.json changes 0 entries."""
        ai_data = json.loads(AI_PATH.read_text(encoding="utf-8"))
        _, counts, errors = migrate_ai_data(ai_data, self.ext_by_id)
        self.assertEqual(errors, [])
        self.assertEqual(counts["modified_entries"], 0)


if __name__ == "__main__":
    unittest.main()
