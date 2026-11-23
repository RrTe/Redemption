"""Unit and dataset integrity tests for Phase 2 group booleans, Royalty, and Temple fixes."""

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

from models.logic.card_logic import CardSideLogic  # noqa: E402
from models.logic.target_decomposer import try_decompose_phrase  # noqa: E402
from models.logic.target_selector import TargetSelector, TargetSelectorBranch  # noqa: E402
from utils.card_helpers import get_side_field  # noqa: E402
from utils.group_resolver import (  # noqa: E402
    apply_is_cloud_to_card_sides,
    apply_is_meek_to_card_sides,
    apply_rule_based_ordir_tags,
    resolve_is_cloud,
    resolve_is_meek,
)

_DATA_DIR = _PROJECT_ROOT / "data"
_DIST_FUZZY_PATH = _DATA_DIR / "dist" / "cards_extended_with_ordir_fuzzy.json"
_DIST_LOGIC_PATH = _DATA_DIR / "dist" / "cards_logic.json"


def _iter_all_selectors_and_branches(node: Any) -> Iterable[Dict[str, Any]]:
    """Yields every serialized TargetSelector or any_of branch dict recursively.

    Args:
        node: Arbitrary JSON subtree inside CardSideLogic.

    Yields:
        Selector dictionaries containing filter attributes.
    """
    if isinstance(node, dict):
        if "identifiers" in node or "target_type" in node or "any_of" in node:
            yield node
        for val in node.values():
            yield from _iter_all_selectors_and_branches(val)
    elif isinstance(node, list):
        for item in node:
            yield from _iter_all_selectors_and_branches(item)


class TestGroupResolvers(unittest.TestCase):
    """Tests IsCloud, IsMeek, and rule-based ORDIR tag resolution."""

    def test_resolve_is_cloud_from_ordir_and_classes(self) -> None:
        """Resolves IsCloud whether sourced from ORDIR 'Cloud Card' or Classes 'Cloud'."""
        ordir_only = {
            "CardSides": {"top": {"Name": "Abel (CoW)", "Type": "Hero", "ORDIR": ["Cloud Card"]}},
            "ORDIR": ["Cloud Card"],
        }
        cls_only = {
            "CardSides": {"top": {"Name": "David the Psalmist", "Type": "Hero", "Classes": ["Cloud"]}},
            "ORDIR": [],
        }
        plain = {
            "CardSides": {"top": {"Name": "Moses", "Type": "Hero", "Classes": ["Warrior"]}},
            "ORDIR": ["Prophet"],
        }
        self.assertIs(resolve_is_cloud(ordir_only, "top"), True)
        self.assertIs(resolve_is_cloud(cls_only, "top"), True)
        self.assertIs(resolve_is_cloud(plain, "top"), False)

    def test_resolve_is_meek_single_dual_and_star_cases(self) -> None:
        """Handles vanilla/Meek, single-sided Star Meek, dual flip sides, and Reminder Token."""
        dual_meek = {
            "StarAbility": "Topdeck a gold card from Reserve.",
            "CardSides": {
                "top": {"Name": "Abihud, the Progeny", "Type": "Hero", "SpecialAbility": "Draw 1."},
                "bottom": {"Name": "Abihud, the Exilarch", "Type": "Hero", "SpecialAbility": "Meek"},
            },
        }
        apply_is_meek_to_card_sides(dual_meek)
        self.assertIsNone(dual_meek["IsMeek"])
        self.assertIs(dual_meek["CardSides"]["top"]["IsMeek"], False)
        self.assertIs(dual_meek["CardSides"]["bottom"]["IsMeek"], True)

        saint_patrick = {
            "StarAbility": "Topdeck a green card from deck.",
            "CardSides": {"top": {"Name": "Saint Patrick (GoC)", "Type": "Hero", "SpecialAbility": "Meek"}},
        }
        self.assertIs(resolve_is_meek(saint_patrick, "top"), True)

        stricken_token = {
            "StarAbility": "Protect all decks and Reserves.",
            "CardSides": {"top": {"Name": "Stricken Reminder Token", "Type": "EE"}},
        }
        self.assertIs(resolve_is_meek(stricken_token, "top"), False)

        apply_is_cloud_to_card_sides(saint_patrick)
        self.assertIs(saint_patrick["IsCloud"], False)

    def test_rule_based_ordir_tags_temple_tabernacle_and_royalty(self) -> None:
        """Assigns Temple only to Fortress/Site, Tabernacle to Fortress, and shortens Royalty."""
        herod_site = {
            "ORDIR": ["Mark Card", "Royalty (or Royal or Member of a Royal Family)"],
            "CardSides": {
                "top": {
                    "Name": "Herod's Temple (G)",
                    "Type": "Site",
                    "Alignment": "Neutral",
                    "ORDIR": ["Mark Card", "Royalty (or Royal or Member of a Royal Family)"],
                }
            },
        }
        apply_rule_based_ordir_tags(herod_site)
        self.assertIn("Temple", herod_site["ORDIR"])
        self.assertIn("Royalty", herod_site["ORDIR"])
        self.assertNotIn("Royalty (or Royal or Member of a Royal Family)", herod_site["ORDIR"])
        self.assertEqual(herod_site["CardSides"]["top"]["Alignment"], "Neutral")
        self.assertEqual(herod_site["CardSides"]["top"]["Type"], "Site")

        temple_veil = {
            "ORDIR": [],
            "CardSides": {"top": {"Name": "Temple Veil", "Type": "Artifact", "ORDIR": []}},
        }
        apply_rule_based_ordir_tags(temple_veil)
        self.assertNotIn("Temple", temple_veil["ORDIR"])


class TestDecomposerAndAnyOfModel(unittest.TestCase):
    """Tests TargetDecomposer, TargetSelector, and TargetSelectorBranch normalization."""

    def test_decomposes_group_booleans_lamb_icon_and_royal(self) -> None:
        """Extracts is_meek, is_gospel, is_cloud, is_star, lamb icon, and canonical Royalty."""
        lamb_sel = TargetSelector(identifiers=["lamb icon"])
        self.assertEqual(lamb_sel.target_type, "dominant")
        self.assertEqual(lamb_sel.alignment, "good")
        self.assertEqual(lamb_sel.identifiers, [])

        meek_sel = TargetSelector(target_type="hero", identifiers=["Meek", "Disciple"])
        self.assertIs(meek_sel.is_meek, True)
        self.assertEqual(meek_sel.identifiers, ["Disciple"])

        gospel_sel = TargetSelector(identifiers=["Gospel", "Angel"])
        self.assertIs(gospel_sel.is_gospel, True)
        self.assertEqual(gospel_sel.identifiers, ["Angel"])

        cloud_sel = TargetSelector(identifiers=["Cloud"])
        self.assertIs(cloud_sel.is_cloud, True)
        self.assertEqual(cloud_sel.identifiers, [])

        star_sel = TargetSelector(target_type="card", identifiers=["*"])
        self.assertIs(star_sel.is_star, True)
        self.assertEqual(star_sel.identifiers, [])

        royal_sel = TargetSelector(target_type="character", identifiers=["member of any royal family", "Royal"])
        self.assertEqual(royal_sel.identifiers, ["Royalty"])

    def test_preserves_star_abilities_non_royal_and_leading_or(self) -> None:
        """Never corrupts '* abilities', 'non-royal', or disjunctive leading 'or ...'."""
        star_ab = TargetSelector(target_type="card", identifiers=["* abilities", "other"])
        self.assertIsNone(star_ab.is_star)
        self.assertIn("* abilities", star_ab.identifiers)

        self.assertIsNone(try_decompose_phrase("non-royal"))
        self.assertIsNone(try_decompose_phrase("or a meek blue Hero"))
        self.assertIsNone(try_decompose_phrase("or Star card"))

    def test_any_of_branch_forbids_selection_mode_and_count(self) -> None:
        """Ensures TargetSelectorBranch serializes minimal filters and rejects mode/count."""
        sel = TargetSelector(
            selection_mode="manual_controller",
            zone_owner="controller",
            scope=["deck"],
            any_of=[
                {"target_type": "fortress", "card_titles": ["The Tabernacle"]},
                {"target_type": "city", "identifiers": ["Temple"]},
            ],
        )
        dumped = sel.model_dump(exclude_none=True)
        self.assertEqual(len(dumped["any_of"]), 2)
        self.assertNotIn("selection_mode", dumped["any_of"][0])
        self.assertNotIn("count", dumped["any_of"][1])

        with self.assertRaises(ValueError):
            TargetSelectorBranch(selection_mode="automatic_all", target_type="city")  # type: ignore[call-arg]
        with self.assertRaises(ValueError):
            TargetSelectorBranch(count={"fixed_value": 1}, target_type="city")  # type: ignore[call-arg]


class TestDistPhase2DatasetIntegrity(unittest.TestCase):
    """Verifies dataset invariants across exported dist databases."""

    @classmethod
    def setUpClass(cls) -> None:
        """Loads production dist JSON files once for all dataset assertions."""
        with _DIST_FUZZY_PATH.open("r", encoding="utf-8") as f:
            cls.ext_cards: List[Dict[str, Any]] = json.load(f)["cards"]
        cls.ext_by_id: Dict[str, Dict[str, Any]] = {str(c["Id"]): c for c in cls.ext_cards}
        with _DIST_LOGIC_PATH.open("r", encoding="utf-8") as f:
            cls.logic_cards: Dict[str, Dict[str, Any]] = json.load(f)

    def test_extended_metadata_tags_and_herods_temple(self) -> None:
        """Checks Royalty rename, 12 Temple cards, 2 Tabernacle cards, and Herod's Temple (G)."""
        temple_ids = [str(c["Id"]) for c in self.ext_cards if "Temple" in (c.get("ORDIR") or [])]
        tabernacle_ids = [str(c["Id"]) for c in self.ext_cards if "Tabernacle" in (c.get("ORDIR") or [])]
        long_royalty = [
            c["Id"]
            for c in self.ext_cards
            if "Royalty (or Royal or Member of a Royal Family)" in (c.get("ORDIR") or [])
        ]
        self.assertEqual(long_royalty, [])
        self.assertEqual(len(temple_ids), 12, msg=f"Unexpected Temple count: {temple_ids}")
        self.assertEqual(len(tabernacle_ids), 2, msg=f"Unexpected Tabernacle count: {tabernacle_ids}")

        herod_g = self.ext_by_id["691417922"]
        self.assertIn("Temple", herod_g["ORDIR"])
        self.assertEqual(get_side_field(herod_g, "top", "Alignment"), "Neutral")
        self.assertEqual(get_side_field(herod_g, "top", "Type"), "Site")

        for cid, card in self.ext_by_id.items():
            self.assertIsInstance(card.get("IsCloud"), bool, msg=f"{cid} missing bool IsCloud")
            self.assertIn("IsMeek", card, msg=f"{cid} missing IsMeek key")
            sides = card.get("CardSides") or {}
            real = [k for k, v in sides.items() if k != "shared" and isinstance(v, dict)] or ["shared"]
            for sk in real:
                self.assertIsInstance(get_side_field(card, sk, "IsCloud"), bool, msg=f"{cid}.{sk} missing IsCloud")
                self.assertIsInstance(get_side_field(card, sk, "IsMeek"), bool, msg=f"{cid}.{sk} missing IsMeek")

    def test_cards_logic_has_zero_unmigrated_phase2_tokens(self) -> None:
        """Ensures zero legacy Meek/Gospel/Cloud/Star/lamb/Royal/Temple errors remain in dist logic."""
        forbidden = {
            "meek", "gospel", "cloud", "cloud card", "cloud cards",
            "star", "star card", "star cards", "*", "* card", "* cards",
            "lamb icon", "lamb icon card", "lamb icon cards",
            "royal", "royals", "royal family", "member of any royal family",
            "royalty (or royal or member of a royal family)",
        }
        for cid, entry in self.logic_cards.items():
            for sk, sdata in (entry.get("sides") or {}).items():
                self.assertIsInstance(sdata.get("is_gospel"), bool, msg=f"{cid}.{sk} missing is_gospel")
                self.assertIsInstance(sdata.get("is_star"), bool, msg=f"{cid}.{sk} missing is_star")
                if sk != "shared":
                    self.assertIsInstance(sdata.get("is_cloud"), bool, msg=f"{cid}.{sk} missing is_cloud")
                    self.assertIsInstance(sdata.get("is_meek"), bool, msg=f"{cid}.{sk} missing is_meek")
                for sel in _iter_all_selectors_and_branches(sdata):
                    idents_low = {str(i).strip().lower() for i in (sel.get("identifiers") or [])}
                    bad = idents_low & forbidden
                    self.assertEqual(bad, set(), msg=f"Forbidden Phase 2 identifier {bad} in {cid}.{sk}")
                    if sel.get("target_type") == "artifact":
                        self.assertNotIn("temple", idents_low, msg=f"Artifact+Temple remaining in {cid}.{sk}")
                    if sel.get("target_type") == "site":
                        self.assertNotIn("temple", idents_low, msg=f"Site+Temple remaining in {cid}.{sk}")
                    if sel.get("target_type") in ("character", "hero") and "priest" in idents_low:
                        self.assertFalse(
                            bool(idents_low & {"temple", "tabernacle", "zerubbabel's temple"}),
                            msg=f"Split Priest+Temple identifier in {cid}.{sk}",
                        )

    def test_specific_repaired_temple_cards(self) -> None:
        """Verifies repaired AST shapes for key Temple and mixed-OR cards."""
        royal_priesthood = self.logic_cards["1553336041"]["sides"]["top"]["abilities"]
        star_targets = [
            ab["effects"][0]["target"] for ab in royal_priesthood if ab.get("is_star")
        ]
        self.assertEqual(len(star_targets), 2)
        for tgt in star_targets:
            self.assertEqual(tgt["card_titles"], [])
            self.assertEqual(tgt["target_card_ids"], [])
            self.assertEqual(len(tgt["any_of"]), 2)
            self.assertEqual(tgt["any_of"][0]["card_titles"], ["The Tabernacle"])
            self.assertEqual(sorted(tgt["any_of"][0]["target_card_ids"]), ["-2130586086", "924363819"])
            self.assertEqual(tgt["any_of"][1]["target_type"], "city")
            self.assertEqual(tgt["any_of"][1]["identifiers"], ["Temple"])

        for z_id in ("-888694675", "-1123206957"):
            z_eff = self.logic_cards[z_id]["sides"]["shared"]["abilities"][0]["effects"][0]["target"]
            self.assertEqual(z_eff["target_type"], "fortress")
            self.assertEqual(z_eff["alignment"], "good")
            self.assertEqual(z_eff["identifiers"], ["Temple"])

        td_abs = self.logic_cards["-1928692553"]["sides"]["top"]["abilities"]
        td_search = td_abs[0]["effects"][0]["target"]
        self.assertEqual(len(td_search["any_of"]), 2)
        self.assertEqual(td_search["any_of"][0]["card_titles"], ["Solomon's Temple"])
        self.assertEqual(td_search["any_of"][1]["target_type"], "artifact")
        self.assertEqual(td_search["any_of"][1]["identifiers"], ["Temple Artifact"])

        capt_cond = self.logic_cards["-39757696"]["sides"]["top"]["abilities"][0]["conditions"][0]["selector"]
        self.assertEqual(len(capt_cond["any_of"]), 2)
        self.assertEqual(capt_cond["any_of"][0]["card_titles"], ["Jerusalem"])
        self.assertGreater(len(capt_cond["any_of"][0]["target_card_ids"]), 30)
        self.assertEqual(capt_cond["any_of"][1]["target_type"], "site")
        self.assertIn("691417922", capt_cond["any_of"][1]["target_card_ids"])


if __name__ == "__main__":
    unittest.main()
