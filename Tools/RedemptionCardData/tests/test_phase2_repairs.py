"""Phase 2 regression tests for legacy STAR migration, missing sides, and semantic repairs."""

from __future__ import annotations

import importlib
import json
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List

ROOT_DIR = Path(__file__).resolve().parents[1]
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))

from models.enums.action_verb import ActionVerb
from models.enums.zone import Zone
from models.logic.ability import Ability
from models.logic.action_effect import ActionEffect
from models.logic.card_logic import CardSideLogic
from models.logic.protection_filter import ProtectionFilter
from models.logic.target_selector import TargetSelector
from scripts.fact_matrix import extract_ast_facts, verify_fact_matrix
from scripts.utils.ability_splitter import split_card_abilities

STAGE09 = importlib.import_module("scripts.09_generate_ai_abilities")
STAGE10 = importlib.import_module("scripts.10_verify_logic")

EXT_PATH = ROOT_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"
AI_PATH = ROOT_DIR / "data" / "ai_generated_abilities.json"
DIST_PATH = ROOT_DIR / "data" / "dist" / "cards_logic.json"

STALE_DUAL_CIDS = ("973131797", "-1782881223", "1381610582", "2020698611", "2047453172", "-1594853387")


def _has_nonempty_pf(pf_obj: Any) -> bool:
    """Checks whether a protection_filter dict contains at least one active constraint."""
    if not isinstance(pf_obj, dict):
        return False
    return bool(
        pf_obj.get("from_harm")
        or pf_obj.get("actions")
        or pf_obj.get("except_actions")
        or pf_obj.get("card_sources")
        or pf_obj.get("qualifiers")
    )


class TestPhase2Repairs(unittest.TestCase):
    """Validates Phase 2 Star migration, coverage closure, fact_matrix rules, and AST repairs."""

    ext_cards: List[Dict[str, Any]]
    ext_by_id: Dict[str, Dict[str, Any]]
    ai_data: Dict[str, Any]
    cards_logic: Dict[str, Any]

    @classmethod
    def setUpClass(cls) -> None:
        """Loads production datasets once for Phase 2 regression assertions."""
        cls.ext_cards = json.loads(EXT_PATH.read_text(encoding="utf-8"))["cards"]
        cls.ext_by_id = {str(c.get("Id") or c.get("id")): c for c in cls.ext_cards}
        cls.ai_data = json.loads(AI_PATH.read_text(encoding="utf-8"))
        cls.cards_logic = json.loads(DIST_PATH.read_text(encoding="utf-8"))

    def test_stage09_is_pure_star_and_is_entry_done(self) -> None:
        """Ensures pure STAR entries under _top never block regular top side generation."""
        pure_star_top = {
            "card_id": "1864837258",
            "side": "top",
            "raw_ability": "STAR: Play a Lost Soul from each deck.",
            "ast": {"abilities": [{"ability_id": "star_ls", "is_star": True, "effects": []}]},
        }
        regular_top = {
            "card_id": "1864837258",
            "side": "top",
            "raw_ability": "Bounce an Evil Character.",
            "ast": {"abilities": [{"ability_id": "bounce_ec", "is_star": False, "effects": []}]},
        }
        self.assertTrue(STAGE09.is_pure_star_entry(pure_star_top))
        self.assertFalse(STAGE09.is_pure_star_entry(regular_top))

        results = {"1864837258_top": pure_star_top}
        done_keys = STAGE09.compute_done_entry_keys(results)
        star_done_cids = STAGE09.compute_star_done_cids(results)

        self.assertFalse(STAGE09.is_entry_done("1864837258", "top", done_keys, star_done_cids, results))
        self.assertTrue(STAGE09.is_entry_done("1864837258", "star", done_keys, star_done_cids, results))

        results["1864837258_top"] = regular_top
        done_keys = STAGE09.compute_done_entry_keys(results)
        self.assertTrue(STAGE09.is_entry_done("1864837258", "top", done_keys, star_done_cids, results))

    def test_fact_matrix_capture_and_protect_rules(self) -> None:
        """Verifies new fact_matrix checks catch protect/capture misclassified as restrict."""
        bad_ast = CardSideLogic(
            abilities=[
                Ability(
                    ability_id="bad_restrict",
                    effects=[
                        ActionEffect(
                            step=1,
                            action=ActionVerb.RESTRICT,
                            target=TargetSelector(target_type="hero", identifiers=["capture"]),
                        )
                    ],
                )
            ]
        )
        ok_capture, err_capture = verify_fact_matrix("Elisabeth cannot be taken prisoner.", extract_ast_facts(bad_ast))
        self.assertFalse(ok_capture)
        self.assertTrue(any("protect" in msg.lower() for msg in err_capture))

        ok_protect, err_protect = verify_fact_matrix("Protect your Hero from evil cards.", extract_ast_facts(bad_ast))
        self.assertFalse(ok_protect)
        self.assertTrue(any("restrict" in msg.lower() for msg in err_protect))

        good_ast = CardSideLogic(
            abilities=[
                Ability(
                    ability_id="good_protect",
                    effects=[
                        ActionEffect(
                            step=1,
                            action=ActionVerb.PROTECT,
                            target=TargetSelector(target_type="hero"),
                            protection_filter=ProtectionFilter(actions=[ActionVerb.CAPTURE]),
                        )
                    ],
                )
            ]
        )
        passed, issues = verify_fact_matrix("Elisabeth cannot be taken prisoner.", extract_ast_facts(good_ast))
        self.assertTrue(passed, f"Expected pass, got {issues}")

    def test_ai_abilities_star_and_dual_cleanup(self) -> None:
        """Verifies production ai_generated_abilities.json has 0 legacy STAR keys and 0 stale dual keys."""
        lingering = [
            key
            for key, entry in self.ai_data.items()
            if not key.endswith("_star") and isinstance(entry, dict) and STAGE09.is_pure_star_entry(entry)
        ]
        self.assertEqual(lingering, [])
        for cid in STALE_DUAL_CIDS:
            self.assertNotIn(f"{cid}_shared", self.ai_data)
            sides = self.cards_logic[cid]["sides"]
            self.assertNotIn("shared", sides)
            self.assertIn("top", sides)
            self.assertIn("bottom", sides)
        self.assertNotIn("168335151_bottom", self.ai_data)
        self.assertIn("168335151_shared", self.ai_data)
        self.assertIn("168335151_star", self.ai_data)

    def test_splitter_compound_shared_tag_prefix(self) -> None:
        """Verifies compound X/Y: tags like GE/EE: map to all sides without polluting StarAbility."""
        raw = "STAR: Discard the top card of each opponent's deck. GE/EE: Activate an Artifact from deck (or Reserve if you control an Egyptian)."
        sides = [
            {"key": "top", "type": "GE", "alignment": "Good"},
            {"key": "bottom", "type": "EE", "alignment": "Evil"},
        ]
        side_map, star_text = split_card_abilities(raw, sides)
        self.assertEqual(star_text, "Discard the top card of each opponent's deck.")
        expected_shared = "Activate an Artifact from deck (or Reserve if you control an Egyptian)."
        self.assertEqual(side_map.get("top"), expected_shared)
        self.assertEqual(side_map.get("bottom"), expected_shared)

    def test_production_dist_phase2_cards_and_invariants(self) -> None:
        """Verifies repaired StarAbilities, semantic fixes, draw scopes, and protection filters in dist."""
        repudiating = self.cards_logic["1864837258"]["sides"]["top"]["abilities"]
        self.assertTrue(any(a["is_star"] for a in repudiating))
        self.assertTrue(any(not a["is_star"] for a in repudiating))

        for beelzebub_id in ("-1954555198", "-2025746467"):
            abilities = self.cards_logic[beelzebub_id]["sides"]["top"]["abilities"]
            self.assertTrue(any(a["is_star"] and a["ability_id"] == "star_beelzebub_discard" for a in abilities))

        bethlehem_fund = self.cards_logic["1217409452"]["sides"]["top"]["abilities"]
        self.assertTrue(any(a["is_star"] for a in bethlehem_fund))
        self.assertTrue(any(not a["is_star"] and a["ability_id"] == "bethlehem_star_fundraiser_dominant_activate" for a in bethlehem_fund))

        delivered = self.cards_logic["168335151"]["sides"]
        self.assertEqual(set(delivered.keys()), {"shared"})
        self.assertTrue(any(a["is_star"] for a in delivered["shared"]["abilities"]))
        self.assertTrue(any(not a["is_star"] for a in delivered["shared"]["abilities"]))

        elisabeth_eff = self.cards_logic["2120594931"]["sides"]["top"]["abilities"][0]["effects"][0]
        self.assertEqual(elisabeth_eff["action"], "protect")
        self.assertIn("capture", elisabeth_eff["protection_filter"]["actions"])

        enoch_actions = [e["action"] for a in self.cards_logic["-860753876"]["sides"]["top"]["abilities"] for e in a["effects"]]
        self.assertEqual(enoch_actions, ["protect", "withdraw"])

        burial_tgt = self.cards_logic["-1557092137"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]
        self.assertEqual(burial_tgt["identifiers"], [])
        self.assertTrue(burial_tgt["targets_abilities"])
        self.assertIn("rescue", burial_tgt["ability_target_actions"])

        for cid in ("-950214778", "551003852", "-1270964017", "-727034140", "-1726785984", "-1574426638", "793883426"):
            self.assertIn("abilities", self.cards_logic[cid]["sides"]["top"])
            self.assertGreater(len(self.cards_logic[cid]["sides"]["top"]["abilities"]), 0)

        bad_draw_scopes: List[str] = []
        empty_pf_cards: List[str] = []
        for cid, card in self.cards_logic.items():
            for sname, sdata in (card.get("sides") or {}).items():
                for ab in sdata.get("abilities", []):
                    for eff in ab.get("effects", []):
                        if eff.get("action") == ActionVerb.DRAW.value and eff.get("target", {}).get("scope") != [Zone.DECK.value]:
                            bad_draw_scopes.append(f"{cid}_{sname}")
                        if eff.get("action") in (ActionVerb.PROTECT.value, ActionVerb.IMMUNE.value) and not _has_nonempty_pf(eff.get("protection_filter")):
                            empty_pf_cards.append(f"{cid}_{sname}")
        self.assertEqual(bad_draw_scopes, [])
        self.assertEqual(empty_pf_cards, [])

    def test_production_coverage_zero_missing_sides_and_stars(self) -> None:
        """Verifies Stage 10 audit reports 0 missing sides, 0 missing stars, 0 unresolved titles, and 18 single-side sites."""
        raw_map = json.loads((ROOT_DIR / "data" / "card_abilities_raw.json").read_text(encoding="utf-8"))
        audit = STAGE10.audit_ext_coverage(self.ext_cards, raw_map, self.cards_logic)
        self.assertEqual(audit["missing_from_logic"], [])
        self.assertEqual(audit["orphaned_ids"], [])
        self.assertEqual(audit["missing_regular_sides"], [])
        self.assertEqual(audit["missing_star_abilities"], [])
        self.assertEqual(audit["unresolved_card_titles"], [])
        self.assertEqual(len(audit["shared_vs_top_deviations"]), 18)


if __name__ == "__main__":
    unittest.main()
