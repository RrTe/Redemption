"""Regression and export integrity tests for protection_filter polarity and exclusions."""

from __future__ import annotations

import importlib
import json
import sys
import unittest
from pathlib import Path
from typing import Any, Dict

ROOT_DIR = Path(__file__).resolve().parent.parent
if str(ROOT_DIR) not in sys.path:
    sys.path.insert(0, str(ROOT_DIR))
if str(ROOT_DIR / "scripts") not in sys.path:
    sys.path.insert(0, str(ROOT_DIR / "scripts"))

from models.enums import ActionVerb, Zone
from utils.target_parser import parse_protection_filter

STAGE10 = importlib.import_module("scripts.10_verify_logic")
DIST_LOGIC_PATH = ROOT_DIR / "data" / "dist" / "cards_logic.json"


def _find_effect(card_entry: Dict[str, Any], ab_id: str, step: int | None = None) -> Dict[str, Any]:
    """Finds a serialized effect dictionary on top side by ability_id and optional step."""
    for ab in card_entry["sides"]["top"]["abilities"]:
        if ab["ability_id"] != ab_id:
            continue
        for ef in ab["effects"]:
            if step is None or ef["step"] == step:
                return ef
    raise AssertionError(f"Effect not found: ab_id={ab_id}, step={step}")


class TestProtectionFilterParsingAndStage10(unittest.TestCase):
    """Validates Stage 08 parse_protection_filter and Stage 10 polarity audit gates."""

    def test_parse_protection_filter_rescue_and_brigade_exceptions(self) -> None:
        """Except-by and except-class clauses become card_sources[].exclude rather than positive sources."""
        pf_ot = parse_protection_filter("rescue (except by an O.T. Hero)")
        self.assertEqual(pf_ot.actions, [ActionVerb.RESCUE])
        self.assertEqual(pf_ot.qualifiers, [])
        self.assertEqual(len(pf_ot.card_sources), 1)
        src_ot = pf_ot.card_sources[0]
        self.assertEqual(src_ot.target_type, "card")
        self.assertIsNotNone(src_ot.exclude)
        self.assertEqual(src_ot.exclude.target_type, "hero")
        self.assertEqual(src_ot.exclude.testament, "OT")

        pf_meek = parse_protection_filter("rescue (except by a meek Hero)")
        self.assertIsNotNone(pf_meek.card_sources[0].exclude)
        self.assertTrue(pf_meek.card_sources[0].exclude.is_meek)
        self.assertEqual(pf_meek.card_sources[0].exclude.target_type, "hero")

        pf_prophet = parse_protection_filter("rescue (except by a prophet)")
        self.assertIsNotNone(pf_prophet.card_sources[0].exclude)
        self.assertEqual(pf_prophet.card_sources[0].exclude.target_type, "character")
        self.assertEqual(pf_prophet.card_sources[0].exclude.identifiers, ["Prophet"])

        pf_female = parse_protection_filter("rescue (except by a female)")
        self.assertIsNotNone(pf_female.card_sources[0].exclude)
        self.assertEqual(pf_female.card_sources[0].exclude.target_type, "character")
        self.assertEqual(pf_female.card_sources[0].exclude.gender, "female")

        pf_silver = parse_protection_filter("silver brigade (except warrior class)")
        self.assertEqual(len(pf_silver.card_sources), 1)
        self.assertEqual(pf_silver.card_sources[0].brigades, ["Silver"])
        self.assertIsNotNone(pf_silver.card_sources[0].exclude)
        self.assertEqual(pf_silver.card_sources[0].exclude.classes, ["Warrior"])

    def test_parse_protection_filter_preserves_player_condition_and_except_actions(self) -> None:
        """Player-condition exceptions stay qualifiers; pure action exceptions stay except_actions."""
        pf_player = parse_protection_filter("rescue, except by a player with a human Hero in play or set-aside area")
        self.assertEqual(pf_player.actions, [ActionVerb.RESCUE])
        self.assertEqual(pf_player.card_sources, [])
        self.assertEqual(pf_player.qualifiers, ["except by a player with a human Hero in play or set-aside area"])

        pf_act = parse_protection_filter("special abilities on evil cards (except discard)")
        self.assertEqual(pf_act.except_actions, [ActionVerb.DISCARD])
        self.assertEqual(len(pf_act.card_sources), 1)
        self.assertEqual(pf_act.card_sources[0].alignment, "evil")
        self.assertIsNone(pf_act.card_sources[0].exclude)

    def test_stage10_rejects_inverted_polarity_and_misplaced_filters(self) -> None:
        """Stage 10 catches missing rescue excludes, except qualifiers, misplaced card_sources, and orphan except_actions."""
        inverted_card = {
            "card_identifier": "TEST_INV",
            "sides": {
                "top": {
                    "abilities": [{
                        "ability_id": "test_protect",
                        "activation_mode": "static",
                        "effects": [{
                            "step": 1,
                            "action": "protect",
                            "effect_type": "ongoing",
                            "duration": "permanent",
                            "target": {"selection_mode": "automatic_self", "zone_owner": "controller", "scope": ["in_play"], "target_type": "lost_soul"},
                            "protection_filter": {
                                "actions": ["rescue"],
                                "card_sources": [{"selection_mode": "automatic_all", "zone_owner": "both", "scope": ["in_play"], "target_type": "hero", "gender": "female"}],
                                "qualifiers": ["except by a female Hero"],
                            },
                        }],
                    }]
                }
            },
        }
        issues_inv, _ = STAGE10.verify_card_logic(
            "TEST_INV",
            inverted_card,
            raw_abilities={"top": "This Lost Soul is protected from rescue except by a female Hero."},
        )
        self.assertTrue(any("Unstructured card-source exception qualifier" in msg for msg in issues_inv))
        self.assertTrue(any("Inverted or missing card_sources[].exclude" in msg for msg in issues_inv))

        misplaced_card = {
            "card_identifier": "TEST_MIS",
            "sides": {
                "top": {
                    "abilities": [
                        {
                            "ability_id": "test_discard",
                            "activation_mode": "immediate",
                            "effects": [{
                                "step": 1,
                                "action": "discard",
                                "target": {"selection_mode": "manual_controller", "zone_owner": "either", "scope": ["in_play"], "target_type": "character", "count": {"fixed_value": 1}},
                                "protection_filter": {"card_sources": [{"selection_mode": "automatic_all", "zone_owner": "both", "scope": ["in_play"], "target_type": "character", "identifiers": ["Roman"]}]},
                            }],
                        },
                        {
                            "ability_id": "test_orphan_except",
                            "activation_mode": "static",
                            "effects": [{
                                "step": 1,
                                "action": "protect",
                                "effect_type": "ongoing",
                                "duration": "permanent",
                                "target": {"selection_mode": "automatic_all", "zone_owner": "both", "scope": ["in_play"], "target_type": "card"},
                                "protection_filter": {"except_actions": ["discard"]},
                            }],
                        },
                    ]
                }
            },
        }
        issues_mis, _ = STAGE10.verify_card_logic("TEST_MIS", misplaced_card)
        self.assertTrue(any("Unexpected protection_filter.card_sources on discard effect" in msg for msg in issues_mis))
        self.assertTrue(any("except_actions without base actions or card_sources" in msg for msg in issues_mis))


class TestExportedProtectionFilterIntegrity(unittest.TestCase):
    """Validates repaired polarity and exclusions in exported data/dist/cards_logic.json."""

    cards_logic: Dict[str, Any]

    @classmethod
    def setUpClass(cls) -> None:
        cls.cards_logic = json.loads(DIST_LOGIC_PATH.read_text(encoding="utf-8"))

    def test_coliseum_reported_cards_fixed(self) -> None:
        """All 8 cards reported by Coliseum wrap exceptions cleanly in exclude and resolve IDs."""
        # 1 & 2: Jeremiah 7:18 Female Only
        for cid in ("1163275753", "1529202396"):
            ef = _find_effect(self.cards_logic[cid], "protect_from_rescue_except_female_or_son_of_god")
            srcs = ef["protection_filter"]["card_sources"]
            self.assertEqual(len(srcs), 1)
            self.assertEqual(srcs[0]["target_type"], "card")
            excl = srcs[0]["exclude"]
            self.assertEqual(len(excl["any_of"]), 2)
            self.assertEqual(excl["any_of"][0]["gender"], "female")
            self.assertEqual(excl["any_of"][1]["card_titles"], ["Son of God"])
            self.assertGreater(len(excl["any_of"][1]["target_card_ids"]), 10)

        # 3: Lost Soul "6/*"
        ef_6 = _find_effect(self.cards_logic["1248648766"], "protect_from_rescue")
        self.assertEqual(ef_6["protection_filter"]["qualifiers"], [])
        excl_6 = ef_6["protection_filter"]["card_sources"][0]["exclude"]
        self.assertEqual(excl_6["stat_filters"], [{"stat": "strength", "operator": "<=", "value": 6}])

        # 4: Lost Soul "Lost Boy"
        ef_lb = _find_effect(self.cards_logic["1338729139"], "protect_from_rescue")
        self.assertEqual(ef_lb["protection_filter"]["qualifiers"], [])
        excl_lb = ef_lb["protection_filter"]["card_sources"][0]["exclude"]
        self.assertEqual(excl_lb["state_filters"], ["lone"])

        # 5: Treason! Treason!
        ef_tt = _find_effect(self.cards_logic["-366948712"], "treason_treason_protect_meek_lost_souls")
        self.assertEqual(ef_tt["protection_filter"]["qualifiers"], [])
        excl_tt = ef_tt["protection_filter"]["card_sources"][0]["exclude"]
        self.assertTrue(excl_tt["is_meek"])
        self.assertEqual(excl_tt["target_type"], "hero")

        # 6: Merodach Worship
        ef_mw = _find_effect(self.cards_logic["1500984443"], "characters_gain_immune")
        self.assertFalse(ef_mw["protection_filter"]["from_harm"])
        self.assertEqual(ef_mw["protection_filter"]["actions"], ["capture", "convert"])
        excl_mw = ef_mw["protection_filter"]["card_sources"][0]["exclude"]
        self.assertTrue(excl_mw["is_human"])
        self.assertEqual(excl_mw["references"], ["Daniel"])

        # 7: The gods of Egypt
        ef_ge = _find_effect(self.cards_logic["2043850347"], "gods_of_egypt_set_aside", step=2)
        excl_ge = ef_ge["protection_filter"]["card_sources"][0]["exclude"]
        self.assertEqual(excl_ge["testament"], "OT")
        self.assertEqual(excl_ge["card_titles"], ["Joseph"])
        self.assertGreater(len(excl_ge["target_card_ids"]), 10)

        # 8: Demetrius the Silversmith
        ef_dem = _find_effect(self.cards_logic["1448661694"], "protect_idol_cards")
        self.assertEqual(ef_dem["target"]["target_type"], "card")
        self.assertEqual(ef_dem["target"]["identifiers"], ["Idol"])
        self.assertEqual(ef_dem["target"]["exclude"]["target_type"], "character")
        self.assertEqual(ef_dem["protection_filter"]["actions"], ["discard"])
        self.assertEqual(ef_dem["protection_filter"]["except_actions"], [])
        self.assertEqual(ef_dem["protection_filter"]["card_sources"], [])

    def test_additional_repaired_cards_across_dataset(self) -> None:
        """All other repaired AI and Stage-08 cards enforce proper exclude polarity and IDs."""
        # Prince Jonathan PoC
        ef_pj = _find_effect(self.cards_logic["725938908"], "prince_jonathan_poc_exchange", step=2)
        self.assertEqual(ef_pj["protection_filter"]["card_sources"][0]["exclude"]["scope"], ["battle"])

        # Prince of Tyrus PI & WA
        ef_pt1 = _find_effect(self.cards_logic["-769950488"], "prince_of_tyrus_pi_immune")
        self.assertEqual(ef_pt1["protection_filter"]["qualifiers"], [])
        self.assertEqual(ef_pt1["protection_filter"]["card_sources"][0]["brigades"], ["Silver"])
        excl_pt1 = ef_pt1["protection_filter"]["card_sources"][0]["exclude"]
        self.assertEqual(excl_pt1["card_titles"], ["Michael", "Gabriel", "Captain of the Host"])
        self.assertGreater(len(excl_pt1["target_card_ids"]), 10)

        ef_pt2 = _find_effect(self.cards_logic["1197793737"], "prince_of_tyrus_wa_immune")
        self.assertEqual(ef_pt2["protection_filter"]["qualifiers"], [])
        excl_pt2 = ef_pt2["protection_filter"]["card_sources"][0]["exclude"]
        self.assertEqual(excl_pt2["card_titles"], ["Michael", "Gabriel"])
        self.assertGreater(len(excl_pt2["target_card_ids"]), 10)

        # Philetus
        ef_ph = _find_effect(self.cards_logic["-1801360804"], "philetus_remove_good_protect_lost_souls")
        self.assertEqual(ef_ph["protection_filter"]["qualifiers"], [])
        excl_ph = ef_ph["protection_filter"]["card_sources"][0]["exclude"]
        self.assertEqual(excl_ph["relative_filters"][0]["relation"], "same")

        # Arrest in Gethsemane
        ef_ag = _find_effect(self.cards_logic["184024256"], "arrest_in_getsemane_ability", step=3)
        self.assertEqual(ef_ag["action"], "protect")
        excl_ag = ef_ag["protection_filter"]["card_sources"][0]["exclude"]
        self.assertTrue(excl_ag["is_human"])
        self.assertEqual(excl_ag["target_type"], "hero")

        # Non-protection card exclusions moved to target.exclude
        ef_sa = _find_effect(self.cards_logic["-1312784881"], "servants_of_achish_withdraw", step=1)
        self.assertNotIn("protection_filter", ef_sa)
        self.assertTrue(ef_sa["target"]["exclude"]["is_meek"])

        ef_tb = _find_effect(self.cards_logic["2133357549"], "terrifying_beast_discard_or_underdeck", step=1)
        self.assertNotIn("protection_filter", ef_tb)
        self.assertEqual(ef_tb["target"]["exclude"]["identifiers"], ["Roman"])

        ef_sr = _find_effect(self.cards_logic["745842231"], "serug_prevent_enhancement", step=1)
        self.assertNotIn("protection_filter", ef_sr)
        self.assertTrue(ef_sr["target"]["exclude"]["used_by"]["is_meek"])

        # Uniform outer card wrapper on -843075176 and -21558269
        ef_nt = _find_effect(self.cards_logic["-843075176"], "protect_from_rescue_except_nt_hero")
        self.assertEqual(ef_nt["protection_filter"]["card_sources"][0]["target_type"], "card")
        self.assertEqual(ef_nt["protection_filter"]["card_sources"][0]["exclude"]["testament"], "NT")

        ef_fr = _find_effect(self.cards_logic["-21558269"], "first_round_protect_from_rescue")
        self.assertEqual(ef_fr["protection_filter"]["card_sources"][0]["target_type"], "card")
        self.assertEqual(ef_fr["protection_filter"]["card_sources"][0]["scope"], ["in_play"])

        # Raw Stage-08 cards
        raw_checks = [
            ("-945890825", "ab_1_protect", lambda e: e["testament"] == "OT"),
            ("603695604", "ab_1_protect", lambda e: e["is_meek"] is True),
            ("-2107344663", "ab_2_protect", lambda e: e["is_meek"] is True),
            ("-1263621356", "ab_1_protect", lambda e: "Prophet" in e["identifiers"]),
            ("847157302", "ab_1_protect", lambda e: "Prophet" in e["identifiers"]),
            ("-245930235", "ab_1_protect", lambda e: e["gender"] == "female"),
            ("-1718727257", "ab_1_protect", lambda e: e["testament"] == "NT"),
            ("-987557636", "ab_1_immune", lambda e: "Warrior" in e["classes"]),
        ]
        for cid, ab_id, pred in raw_checks:
            ef_r = _find_effect(self.cards_logic[cid], ab_id)
            excl_r = ef_r["protection_filter"]["card_sources"][0]["exclude"]
            self.assertTrue(pred(excl_r), msg=f"Failed raw check on {cid}: {excl_r}")

        ef_pl = _find_effect(self.cards_logic["-1883173486"], "ab_1_protect")
        self.assertEqual(ef_pl["protection_filter"]["card_sources"], [])
        self.assertIn("player with", ef_pl["protection_filter"]["qualifiers"][0])


if __name__ == "__main__":
    unittest.main()
