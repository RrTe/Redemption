"""Unit and integration tests for Phase 3 (any_of disjunctions and title linking)."""

from __future__ import annotations

import json
import unittest
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple

from models.logic.target_selector import TargetSelector, TargetSelectorBranch
from scripts import fact_matrix  # noqa: F401
from scripts.utils.card_linker import CardLinker, _link_selector_targets
from scripts.utils.target_parser import build_target_selector
import importlib.util

BASE_DIR = Path(__file__).resolve().parent.parent
DATA_DIST_LOGIC = BASE_DIR / "data" / "dist" / "cards_logic.json"
EXTENDED_CARDS_PATH = BASE_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"


def _load_stage10() -> Any:
    """Loads the Stage 10 verifier module dynamically for invariant unit checks.

    Returns:
        Imported module object for scripts/10_verify_logic.py.
    """
    spec = importlib.util.spec_from_file_location("stage10_mod_p3", BASE_DIR / "scripts" / "10_verify_logic.py")
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


def _iter_selectors(node: Any, path: str = "") -> Iterable[Tuple[str, Dict[str, Any]]]:
    """Yields every selector dict in a nested card logic JSON structure.

    Args:
        node: JSON dict or list node.
        path: Hierarchical path string for diagnostic assertions.

    Returns:
        Iterator of (path, selector_dict) tuples.
    """
    if isinstance(node, dict):
        if any(k in node for k in ("selection_mode", "target_type", "card_titles", "identifiers", "target_card_ids", "any_of")):
            yield path, node
        for k, v in node.items():
            sub_path = f"{path}.{k}" if path else k
            yield from _iter_selectors(v, sub_path)
    elif isinstance(node, list):
        for idx, item in enumerate(node):
            yield from _iter_selectors(item, f"{path}[{idx}]")


class TestPhase3TargetLinkerAndBranchSchema(unittest.TestCase):
    """Verifies conjunctive target_card_ids contracts, title-substring resolution, and any_of schema."""

    @classmethod
    def setUpClass(cls) -> None:
        ext_data = json.loads(EXTENDED_CARDS_PATH.read_text(encoding="utf-8"))
        cls.linker = CardLinker(ext_data.get("cards", ext_data))
        cls.stage10 = _load_stage10()

    def test_title_substring_patterns_resolve_to_card_titles_and_ids(self) -> None:
        """All 5 title-substring patterns expand into card_titles + non-empty target_card_ids."""
        for ident_phrase, expected_titles in [
            ("Snare in the title", ["Snare"]),
            ("Trumpet or Trumpets in the title", ["Trumpet", "Trumpets"]),
            ("Trumpet or Censer in the title", ["Trumpet", "Censer"]),
            ("'False' in the title", ["False"]),
            ("ship in the title", ["Ship"]),
        ]:
            sel = TargetSelector(
                selection_mode="manual_controller",
                scope=["deck"],
                target_type="card",
                identifiers=[ident_phrase],
            )
            _link_selector_targets(sel, self.linker)
            self.assertEqual(sel.identifiers, [], f"Pattern '{ident_phrase}' should be removed from identifiers")
            self.assertEqual(sel.card_titles, expected_titles)
            self.assertTrue(sel.target_card_ids, f"Pattern '{ident_phrase}' should resolve target_card_ids")

    def test_ordir_title_tags_stay_identifiers_with_empty_ids(self) -> None:
        """Canonical ORDIR title tags stay in identifiers without resolving partial target_card_ids."""
        for ordir_tag in (
            "Herod in the Title",
            "Gideon in the Title",
            "Paul in the Title",
            "Joseph in the Title or Scripture Verse",
        ):
            sel = TargetSelector(
                selection_mode="manual_controller",
                scope=["deck"],
                target_type="card",
                identifiers=[ordir_tag],
                target_card_ids=["123456"],
            )
            _link_selector_targets(sel, self.linker)
            self.assertEqual(sel.identifiers, [ordir_tag])
            self.assertEqual(sel.card_titles, [])
            self.assertEqual(sel.target_card_ids, [])

    def test_any_of_branch_schema_and_linker_recursion(self) -> None:
        """TargetSelectorBranch forbids count/selection_mode/ref_step/any_of and links nested card_titles."""
        with self.assertRaises(Exception):
            TargetSelectorBranch(selection_mode="automatic_all", target_type="hero")  # type: ignore[call-arg]
        with self.assertRaises(Exception):
            TargetSelectorBranch(count={"fixed_value": 1}, target_type="hero")  # type: ignore[call-arg]
        with self.assertRaises(Exception):
            TargetSelectorBranch(any_of=[TargetSelectorBranch(target_type="hero")])  # type: ignore[call-arg]
        with self.assertRaises(Exception):
            TargetSelectorBranch(ref_step=1, target_type="hero")  # type: ignore[call-arg]

        sel = TargetSelector(
            selection_mode="manual_controller",
            zone_owner="both",
            scope=["in_play"],
            any_of=[
                TargetSelectorBranch(target_type="character", card_titles=["Peter"]),
                TargetSelectorBranch(target_type="character", identifiers=["Centurion"], target_card_ids=["999"]),
            ],
        )
        _link_selector_targets(sel, self.linker)
        self.assertTrue(sel.any_of[0].target_card_ids)
        self.assertIsNone(sel.any_of[1].target_card_ids)
        self.assertEqual(sel.target_card_ids, [])

    def test_stage10_rejects_singleton_any_of_and_orphan_ids(self) -> None:
        """Stage 10 verifier catches len(any_of) == 1 and target_card_ids without card_titles."""
        issues_orphan: List[str] = []
        orphan_sel = TargetSelector(
            selection_mode="automatic_all",
            target_type="hero",
            identifiers=["Prophet"],
            target_card_ids=["123"],
        )
        self.stage10._audit_selector_invariants(orphan_sel, "test_ab", "top", issues_orphan)
        self.assertTrue(any("without card_titles" in msg for msg in issues_orphan))

        issues_single: List[str] = []
        single_sel = TargetSelector(
            selection_mode="automatic_all",
            any_of=[TargetSelectorBranch(target_type="hero")],
        )
        self.stage10._audit_selector_invariants(single_sel, "test_ab", "top", issues_single)
        self.assertTrue(any("any_of must have >= 2 branches" in msg for msg in issues_single))


class TestPhase3TargetParserDisjunctions(unittest.TestCase):
    """Verifies Stage 08 target_parser generates clean any_of branches without free-text ORs."""

    def test_target_parser_phase3_patterns(self) -> None:
        """Covers evil/neutral, Storehouse, class/role/type splits, titles, references, and guards."""
        s_en = build_target_selector("evil or neutral card (except a character)")
        self.assertEqual(s_en.identifiers, [])
        self.assertIsNotNone(s_en.exclude)
        self.assertEqual(s_en.exclude.target_type, "character")
        self.assertEqual([b.alignment for b in s_en.any_of], ["evil", "neutral"])

        s_sh = build_target_selector("an evil Enhancement from opponent's deck or Storehouse")
        self.assertEqual(len(s_sh.any_of), 2)
        self.assertEqual([str(z.value) for z in s_sh.any_of[0].scope], ["deck"])
        self.assertEqual([str(z.value) for z in s_sh.any_of[1].scope], ["territory"])
        self.assertFalse(s_sh.any_of[1].identifiers)
        self.assertIsNotNone(s_sh.any_of[1].used_by)
        self.assertEqual(s_sh.any_of[1].used_by.card_titles, ["Storehouse"])

        s_bk = build_target_selector("good warrior or weapon from deck")
        self.assertEqual(len(s_bk.any_of), 2)
        self.assertEqual(s_bk.any_of[0].classes, ["Warrior"])
        self.assertEqual(s_bk.any_of[0].alignment, "good")
        self.assertEqual(s_bk.any_of[1].target_type, "enhancement")
        self.assertEqual(s_bk.any_of[1].classes, ["Weapon"])
        self.assertEqual(s_bk.any_of[1].alignment, "good")

        s_dv = build_target_selector("giant or warrior class evil character in play")
        self.assertEqual(len(s_dv.any_of), 2)
        self.assertEqual(s_dv.any_of[0].target_type, "evil_character")
        self.assertEqual(s_dv.any_of[0].alignment, "evil")
        self.assertEqual(s_dv.any_of[0].identifiers, ["Giant"])
        self.assertEqual(s_dv.any_of[1].classes, ["Warrior"])

        s_dr = build_target_selector("DragonRaid or New Jerusalem site in play")
        self.assertEqual(s_dr.any_of, [])
        self.assertEqual(s_dr.target_type, "site")
        self.assertEqual(s_dr.card_titles, ["Dragon Raid", "New Jerusalem"])

        s_hl = build_target_selector("a warrior class II Samuel or I Chronicles Hero")
        self.assertEqual(len(s_hl.any_of), 2)
        self.assertEqual(s_hl.any_of[0].references, ["II Samuel"])
        self.assertEqual(s_hl.any_of[1].references, ["I Chronicles"])
        self.assertEqual(s_hl.any_of[0].classes, ["Warrior"])
        self.assertEqual(s_hl.any_of[1].classes, ["Warrior"])

        s_ab = build_target_selector("heal and resurrect abilities")
        self.assertEqual(len(s_ab.any_of), 2)
        self.assertTrue(s_ab.any_of[0].targets_abilities)
        self.assertEqual([a.value for a in (s_ab.any_of[0].ability_target_actions or [])], ["heal"])
        self.assertTrue(s_ab.any_of[1].targets_abilities)
        self.assertEqual([a.value for a in (s_ab.any_of[1].ability_target_actions or [])], ["resurrect"])

        s_th = build_target_selector("evil cards with toughness X or greater")
        self.assertEqual(s_th.card_titles, [])


class TestPhase3ExportedDatasetInvariants(unittest.TestCase):
    """Validates Phase 3 guarantees across the production data/dist/cards_logic.json artifact."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.logic = json.loads(DATA_DIST_LOGIC.read_text(encoding="utf-8"))

    def test_no_orphan_target_card_ids_and_no_unresolved_titles(self) -> None:
        """Every selector must have target_card_ids iff card_titles is non-empty, and any_of len >= 2."""
        for cid, card in self.logic.items():
            for path, sel in _iter_selectors(card.get("sides") or {}):
                titles = sel.get("card_titles") or []
                tcids = sel.get("target_card_ids") or []
                any_of = sel.get("any_of") or []
                if tcids:
                    self.assertTrue(titles, f"{cid} {path} has target_card_ids without card_titles")
                if titles:
                    self.assertTrue(tcids, f"{cid} {path} has unresolved card_titles={titles}")
                self.assertNotEqual(len(any_of), 1, f"{cid} {path} has singleton any_of")

    def test_repaired_phase3_special_cases(self) -> None:
        """Spot-checks critical repaired cards from Section 1, 2, 3, and 5."""
        # King Shallum -> King Zechariah title resolved cleanly
        shallum_t = self.logic["-393048385"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]
        self.assertEqual(shallum_t["card_titles"], ["King Zechariah"])
        self.assertEqual(shallum_t["target_card_ids"], ["428851935"])
        self.assertEqual(shallum_t["identifiers"], [])

        # Ahaz, the Unfaithful -> lost_soul target_type & empty target_card_ids
        ahaz_t = self.logic["968734370"]["sides"]["top"]["abilities"][2]["effects"][0]["target"]
        self.assertEqual(ahaz_t["target_type"], "lost_soul")
        self.assertEqual(ahaz_t["target_card_ids"], [])

        # Broken Covenant -> covenant target_type & empty target_card_ids
        cov_t = self.logic["383853753"]["sides"]["shared"]["abilities"][0]["effects"][0]["target"]
        self.assertEqual(cov_t["target_type"], "covenant")
        self.assertEqual(cov_t["target_card_ids"], [])

        # Ark of the Covenant (RoJ) -> any_of curse vs Idol artifact
        ark_t = self.logic["-229708149"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]
        self.assertEqual(len(ark_t["any_of"]), 2)
        self.assertEqual(ark_t["any_of"][0]["target_type"], "curse")
        self.assertEqual(ark_t["any_of"][1]["target_type"], "artifact")
        self.assertEqual(ark_t["any_of"][1]["identifiers"], ["Idol"])

        # Soldier of God -> Good Samaritan inside card_titles
        sog_t = self.logic["255628321"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]
        self.assertIn("Good Samaritan", sog_t["card_titles"])
        self.assertEqual(sog_t["identifiers"], [])

        # The Heavenly Host (GoC) -> Heavenly Host Token -> 2127233591
        hh_tf = self.logic["-1276287509"]["sides"]["top"]["abilities"][0]["trigger_subject"]
        self.assertEqual(hh_tf["card_titles"], ["Heavenly Host Token"])
        self.assertEqual(hh_tf["target_card_ids"], ["2127233591"])

        # Lost Soul Psalm 35:20 (Site Guard) & Satan Released -> no container card_titles on EC selector
        sg_t = self.logic["-756939123"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]
        self.assertEqual(sg_t["card_titles"], [])
        self.assertEqual(sg_t["target_card_ids"], [])
        self.assertEqual(len(sg_t["any_of"]), 3)

        # Deliverance -> Hero target without Prison Site in card_titles
        deliv_t = self.logic["-766928600"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]
        self.assertEqual(deliv_t["card_titles"], [])
        self.assertEqual(deliv_t["target_card_ids"], [])

        # Lost Soul Jeremiah 7:18 (Female Only) -> female Hero vs Son of God (no gender=female on Son of God)
        lsj_cs = self.logic["1163275753"]["sides"]["top"]["abilities"][0]["effects"][0]["protection_filter"]["card_sources"][0]
        self.assertEqual(len(lsj_cs["any_of"]), 2)
        self.assertEqual(lsj_cs["any_of"][0]["gender"], "female")
        self.assertIsNone(lsj_cs["any_of"][1].get("gender"))
        self.assertEqual(lsj_cs["any_of"][1]["card_titles"], ["Son of God"])

        # Conjurers -> Pale Green / Crimson Enhancement OR Babylonian Character
        conj_t = self.logic["1161413925"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]
        self.assertEqual(len(conj_t["any_of"]), 2)
        self.assertEqual(conj_t["any_of"][0]["target_type"], "enhancement")
        self.assertEqual(conj_t["any_of"][1]["target_type"], "character")

        # Astrologers (PoC) -> choice_group top (automatic_next) vs bottom (automatic_last)
        astro_abs = self.logic["1991486315"]["sides"]["top"]["abilities"]
        self.assertEqual(len(astro_abs), 2)
        self.assertEqual(astro_abs[0]["choice_group"], "choice_1")
        self.assertEqual(astro_abs[0]["effects"][0]["target"]["selection_mode"], "automatic_next")
        self.assertEqual(astro_abs[1]["effects"][0]["target"]["selection_mode"], "automatic_last")


if __name__ == "__main__":
    unittest.main()
