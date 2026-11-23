"""Regression test suite for Stage 08/09/10/11 fixes, decompiler extensions, and ORDIR 7.1.0 cleanup."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / "scripts"))

from models.enums import ActionVerb, ActivationMode, SelectionMode, TriggerEvent, Zone
from models.logic.ability import Ability
from models.logic.action_effect import ActionEffect
from models.logic.card_logic import CardSideLogic
from models.logic.protection_filter import ProtectionFilter
from models.logic.stat_filter import StatFilter
from models.logic.target_selector import TargetSelector
from scripts.ability_decompiler import decompile_ability, decompile_effect, decompile_target
from scripts.fact_matrix import extract_ast_facts, verify_fact_matrix
from scripts.utils.card_linker import CardLinker, link_side_logic_targets


def _load_script_module(alias: str, filename: str) -> Any:
    """Dynamically loads a numbered pipeline script module for direct unit testing.

    Args:
        alias: Unique module alias for import loader.
        filename: Script filename inside ``scripts/``.

    Returns:
        Loaded Python module object.
    """
    spec = importlib.util.spec_from_file_location(alias, BASE_DIR / "scripts" / filename)
    assert spec and spec.loader
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


_s06 = _load_script_module("stage06_verify_mod", "06_verify.py")
_s08 = _load_script_module("stage08_parse_mod", "08_parse_abilities.py")
_s09 = _load_script_module("stage09_gen_mod", "09_generate_ai_abilities.py")
_s10 = _load_script_module("stage10_verify_mod", "10_verify_logic.py")


class TestStage08PartialAndStarRetention(unittest.TestCase):
    """Tests Stage 08 partial-side retention and collision-free Star/regular logging."""

    def test_dual_card_retains_parsed_top_when_bottom_fails(self) -> None:
        """Deterministically parsed top side must survive even when bottom side fails."""
        card = {
            "Id": "900001",
            "CardSides": {
                "top": {"Name": "Dual Top OK", "SpecialAbility": "Negate an evil card."},
                "bottom": {"Name": "Dual Bot Unparsed", "SpecialAbility": "Do something completely unparseable in xyz phase with foobar."},
            },
        }
        cid, serialized, total, parsed, unparsed = _s08.parse_card_record(card)
        self.assertEqual(cid, "900001")
        self.assertEqual(total, 2)
        self.assertEqual(parsed, 1)
        self.assertIsNotNone(serialized)
        assert serialized is not None
        self.assertIn("top", serialized["sides"])
        self.assertNotIn("bottom", serialized["sides"])
        self.assertEqual(len(unparsed), 1)
        self.assertEqual(unparsed[0]["side"], "bottom")

    def test_star_and_top_separate_without_collision(self) -> None:
        """Failed StarAbility logs side='star' without dropping parsed top (and vice versa)."""
        card_top_ok_star_fail = {
            "Id": "900002",
            "StarAbility": "Perform an unparseable mystical star ritual now.",
            "CardSides": {
                "top": {"Name": "Star Fails Only", "SpecialAbility": "Draw 2."},
            },
        }
        _, ser_a, _, parsed_a, unp_a = _s08.parse_card_record(card_top_ok_star_fail)
        self.assertIsNotNone(ser_a)
        assert ser_a is not None
        self.assertEqual(parsed_a, 1)
        self.assertIn("top", ser_a["sides"])
        self.assertEqual(len(unp_a), 1)
        self.assertEqual(unp_a[0]["side"], "star")
        self.assertTrue(unp_a[0]["raw_ability"].startswith("STAR:"))

        card_star_ok_top_fail = {
            "Id": "900003",
            "StarAbility": "Draw 2.",
            "CardSides": {
                "top": {"Name": "Top Fails Only", "SpecialAbility": "When foobar happens, do zzz."},
            },
        }
        _, ser_b, _, parsed_b, unp_b = _s08.parse_card_record(card_star_ok_top_fail)
        self.assertIsNotNone(ser_b)
        assert ser_b is not None
        self.assertEqual(parsed_b, 1)
        self.assertIn("top", ser_b["sides"])
        self.assertTrue(all(ab["is_star"] for ab in ser_b["sides"]["top"]["abilities"]))
        self.assertEqual(len(unp_b), 1)
        self.assertEqual(unp_b[0]["side"], "top")

    def test_reg_oxford_comma_redirected_and_taken_prisoner(self) -> None:
        """Ensures Oxford-comma modifiers, redirected, and 'Cannot be taken prisoner' parse."""
        c1, _ = _s08.parse_side_ability("A Child is Born", "top", "Discard all Demons in Play. Can [not] be interrupted, negated, or prevented.")
        self.assertIsNotNone(c1)
        c2, _ = _s08.parse_side_ability("Deception Exposed (Ap)", "top", "Discard all Sapphira and Ananias cards in play. Cannot be interrupted, negated, prevented, or redirected.")
        self.assertIsNotNone(c2)
        c3, _ = _s08.parse_side_ability("King Jehoram", "top", "Cannot be taken prisoner. May band to Athaliah.")
        self.assertIsNotNone(c3)
        assert c3 is not None
        self.assertTrue(any(e.protection_filter and ActionVerb.CAPTURE in e.protection_filter.actions for ab in c3.abilities for e in ab.effects))


class TestStage09SkipAndCanonicalIds(unittest.TestCase):
    """Tests Stage 09 side-specific skip filtering and canonical card_id sanitization."""

    def test_top_does_not_skip_bottom_or_star(self) -> None:
        """Presence of '{cid}_top' must never skip '{cid}_bottom' or '{cid}_star'."""
        self.assertFalse(_s09.is_entry_done("100", "bottom", existing={"100_top"}))
        self.assertFalse(_s09.is_entry_done("100", "star", existing={"100_top"}))
        self.assertTrue(_s09.is_entry_done("100", "top", existing={"100_top"}))
        self.assertFalse(_s09.is_entry_done("200", "top", existing={"200_shared"}))
        self.assertTrue(_s09.is_entry_done("300", "star", existing={"300_top"}, star_done_cids={"300"}))

    def test_canonical_card_id_strips_side_suffixes(self) -> None:
        """Card IDs must never carry side suffixes such as '_shared' or '_top'."""
        self.assertEqual(_s09.canonical_card_id("-1587655157_shared"), "-1587655157")
        self.assertEqual(_s09.canonical_card_id("551003852_top"), "551003852")
        self.assertEqual(_s09.canonical_card_id("12345"), "12345")

    def test_load_unparsed_sample_and_auto_resolve_star(self) -> None:
        """Verifies load_unparsed_sample and auto_resolve handle separate bottom/star entries cleanly."""
        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_log = Path(tmpdir) / "unparsed.log"
            tmp_log.write_text(
                "[100] (top) Test Card\n"
                "  Ability: Draw 1.\n"
                "  Reason: test\n\n"
                "[100] (bottom) Test Card\n"
                "  Ability: Discard 1.\n"
                "  Reason: test\n\n"
                "[100] (star) Test Card\n"
                "  Ability: STAR: Draw 2.\n"
                "  Reason: test\n\n",
                encoding="utf-8",
            )
            orig_log = _s09.UNPARSED_LOG
            try:
                _s09.UNPARSED_LOG = tmp_log
                samples = _s09.load_unparsed_sample(offset=0, max_items=10, existing={"100_top"})
                self.assertEqual([s["side"] for s in samples], ["bottom", "star"])

                sample_ast = CardSideLogic(
                    abilities=[Ability(ability_id="draw_2", activation_mode=ActivationMode.IMMEDIATE, effects=[ActionEffect(step=1, action=ActionVerb.DRAW)])]
                ).model_dump()
                results: Dict[str, Any] = {}
                text_cache = {"STAR: Draw 2.": sample_ast}
                count = _s09.auto_resolve_exact_text_matches(results, text_cache)
                self.assertEqual(count, 1)
                self.assertIn("100_star", results)
                self.assertEqual(results["100_star"]["card_id"], "100")
                self.assertTrue(results["100_star"]["ast"]["abilities"][0]["is_star"])
            finally:
                _s09.UNPARSED_LOG = orig_log


class TestStage10MergeLinkAndAudit(unittest.TestCase):
    """Tests Stage 10 side merging, trigger_filter linking, and non-blocking audit checks."""

    def test_merge_side_ast_preserves_star_and_regular_abilities(self) -> None:
        """Merging AI 'top' over Stage 08 Star-only 'top' preserves both Star and regular abilities."""
        star_side = CardSideLogic(
            abilities=[
                Ability(
                    ability_id="star_look_hand",
                    is_star=True,
                    trigger_event="star_phase",
                    activation_mode=ActivationMode.TRIGGERED,
                    effects=[ActionEffect(step=1, action=ActionVerb.LOOK)],
                )
            ]
        ).model_dump()
        ai_reg_side = CardSideLogic(
            abilities=[
                Ability(
                    ability_id="negate_evil",
                    is_star=False,
                    activation_mode=ActivationMode.IMMEDIATE,
                    effects=[ActionEffect(step=1, action=ActionVerb.NEGATE)],
                )
            ]
        ).model_dump()

        merged = _s10.merge_side_ast(star_side, ai_reg_side, is_star_entry=False)
        ids = [ab["ability_id"] for ab in merged["abilities"]]
        stars = [ab["is_star"] for ab in merged["abilities"]]
        self.assertEqual(ids, ["star_look_hand", "negate_evil"])
        self.assertEqual(stars, [True, False])

        merged_star_entry = _s10.merge_side_ast(ai_reg_side, star_side, is_star_entry=True)
        self.assertEqual([ab["ability_id"] for ab in merged_star_entry["abilities"]], ["negate_evil", "star_look_hand"])

    def test_star_only_partial_card_verifies_against_star_raw_text(self) -> None:
        """Star-only parsed side must verify against StarAbility instead of unparsed top SA."""
        card_data = {
            "card_identifier": "777",
            "sides": {
                "top": {
                    "abilities": [
                        {
                            "ability_id": "star_draw_1",
                            "is_star": True,
                            "trigger_event": "star_phase",
                            "activation_mode": "triggered",
                            "effects": [{"step": 1, "action": "draw"}],
                        }
                    ]
                }
            },
        }
        issues, _ = _s10.verify_card_logic(
            "777",
            card_data,
            has_star_ability=True,
            is_dual_card=False,
            raw_abilities={"top": "Complex unparsed discard and banish clause.", "star": "Draw 1."},
        )
        self.assertEqual(issues, [])

    def test_trigger_subject_card_titles_linking_and_set_suffix_strip(self) -> None:
        """Links ability.trigger_subject.card_titles and strips trailing set qualifiers."""
        db_cards = [
            {"Id": "10", "CardSides": {"top": {"Name": "Son of God (Promo)", "Type": "Dominant"}}},
            {"Id": "20", "CardSides": {"top": {"Name": "Faith of Joshua (CoW AB)", "Type": "GE"}}},
        ]
        linker = CardLinker(db_cards)
        self.assertEqual(linker.resolve_title("Faith of Joshua (CoW AB)"), ["20"])

        side = CardSideLogic(
            abilities=[
                Ability(
                    ability_id="on_son",
                    activation_mode=ActivationMode.TRIGGERED,
                    trigger_event=TriggerEvent.ON_PLAY,
                    trigger_subject=TargetSelector(card_titles=["Son of God"]),
                    effects=[ActionEffect(step=1, action=ActionVerb.DRAW)],
                )
            ]
        )
        link_side_logic_targets(side, linker)
        self.assertEqual(side.abilities[0].trigger_subject.target_card_ids, ["10"])  # type: ignore[union-attr]

    def test_audit_ext_coverage_reports_expected_sections(self) -> None:
        """Audit helper surfaces missing sides, missing Star, orphaned IDs, shared/top, and unresolved titles."""
        ext = [
            {"Id": "1", "StarAbility": "Draw 1.", "CardSides": {"top": {"Name": "Card One", "SpecialAbility": "Draw 2."}}},
            {"Id": "2", "CardSides": {"shared": {"Name": "City Card", "SpecialAbility": "Protect Heroes."}}},
            {"Id": "3", "CardSides": {"top": {"Name": "Dual Top", "SpecialAbility": "Negate a card."}, "bottom": {"Name": "Dual Bot", "SpecialAbility": "Draw 1."}}},
        ]
        raw_map = {
            "1": {"card_identifier": "1", "sides": {"top": {"abilities": [{"ability_id": "t", "is_star": False, "effects": [{"step": 1, "action": "draw"}]}]}}},
            "2": {"card_identifier": "2", "sides": {"top": {"abilities": [{"ability_id": "p", "effects": [{"step": 1, "action": "protect", "target": {"card_titles": ["NonexistentCard"], "target_card_ids": []}}]}]}}},
            "3": {"card_identifier": "3", "sides": {"shared": {"abilities": [{"ability_id": "n", "effects": [{"step": 1, "action": "negate"}]}]}}},
            "999": {"card_identifier": "999", "sides": {"top": {"abilities": []}}},
        }
        sections = _s10.audit_ext_coverage(ext, raw_map, raw_map)
        self.assertEqual(len(sections["orphaned_ids"]), 1)
        self.assertEqual(len(sections["missing_star_abilities"]), 1)
        self.assertEqual(len(sections["unresolved_card_titles"]), 1)
        self.assertTrue(any("[2]" in item for item in sections["shared_vs_top_deviations"]))
        self.assertTrue(any("[3]" in item for item in sections["shared_vs_top_deviations"]))


class TestDecompilerExtensions(unittest.TestCase):
    """Tests extended field synthesis in ability_decompiler."""

    def test_decompile_target_all_extended_fields(self) -> None:
        """Includes testament, is_generic, is_human, gender, classes, references, and stat_filters."""
        sel = TargetSelector(
            zone_owner="controller",
            alignment="good",
            testament="OT",
            is_generic=True,
            is_human=True,
            gender="male",
            classes=["Warrior"],
            references=["Genesis"],
            target_type="hero",
            stat_filters=[StatFilter(stat="strength", operator=">=", value=7)],
            scope=[Zone.BATTLE],
        )
        out = decompile_target(sel)
        self.assertIn("O.T.", out)
        self.assertIn("generic", out)
        self.assertIn("human", out)
        self.assertIn("male", out)
        self.assertIn("warrior class", out)
        self.assertIn("Genesis", out)
        self.assertIn("strength 7 or greater", out)

    def test_decompile_effect_protection_filter_and_star(self) -> None:
        """Synthesizes ProtectionFilter clauses and 'STAR:' prefix."""
        eff = ActionEffect(
            step=1,
            action=ActionVerb.PROTECT,
            target=TargetSelector(zone_owner="controller", target_type="hero", scope=[Zone.TERRITORY]),
            protection_filter=ProtectionFilter(
                actions=[ActionVerb.DISCARD],
                card_sources=[TargetSelector(zone_owner="opponent", alignment="evil", target_type="card")],
                qualifiers=["this turn"],
            ),
        )
        eff_txt = decompile_effect(eff)
        self.assertIn("discard abilities", eff_txt)
        self.assertIn("opponent's evil card", eff_txt)
        self.assertIn("this turn", eff_txt)

        ab = Ability(
            ability_id="star_protect",
            is_star=True,
            trigger_event="star_phase",
            activation_mode=ActivationMode.TRIGGERED,
            effects=[eff],
        )
        self.assertTrue(decompile_ability(ab).startswith("STAR: "))


class TestOrdir710FactMatrixAndDatasetIntegrity(unittest.TestCase):
    """Tests ORDIR 7.1.0 fact-matrix rules, 06_verify helpers, and production cards_logic.json parity."""

    def test_fact_matrix_ordir_71_equivalences(self) -> None:
        """Accepts Idol for false religious practice and Orange+Enhancement for connected with demons."""
        idol_side = CardSideLogic(
            abilities=[
                Ability(
                    ability_id="ignore_false_rel",
                    activation_mode=ActivationMode.STATIC,
                    effects=[ActionEffect(step=1, action=ActionVerb.IGNORE, target=TargetSelector(identifiers=["Idol", "special abilities"], target_type="card"))],
                )
            ]
        )
        ok_idol, issues_idol = verify_fact_matrix("Ignore all special abilities on cards depicting a false religious practice.", extract_ast_facts(idol_side))
        self.assertTrue(ok_idol, issues_idol)

        demon_side = CardSideLogic(
            abilities=[
                Ability(
                    ability_id="immune_orange_enh",
                    activation_mode=ActivationMode.STATIC,
                    effects=[
                        ActionEffect(
                            step=1,
                            action=ActionVerb.IMMUNE,
                            target=TargetSelector(selection_mode=SelectionMode.AUTOMATIC_SELF, target_type="character"),
                            protection_filter=ProtectionFilter(
                                card_sources=[TargetSelector(target_type="enhancement", brigades=["Orange"], alignment="evil")]
                            ),
                        )
                    ],
                )
            ]
        )
        ok_dem, issues_dem = verify_fact_matrix("Character is immune from all enhancement cards connected with demons.", extract_ast_facts(demon_side))
        self.assertTrue(ok_dem, issues_dem)

    def test_stage06_extract_values_handles_shared_types(self) -> None:
        """Multi-type cards using CardSides['shared'] / named type sides expose all types."""
        city_card = {
            "CardSides": {
                "shared": {"Alignment": "Neutral", "Type": "Site"},
                "Fortress": {"Type": "Fortress"},
            }
        }
        types = {t.lower() for t in _s06._extract_card_sides_values(city_card, "Type")}
        self.assertEqual(types, {"site", "fortress"})

    def test_production_cards_logic_exact_parity_and_ordir_cleanup(self) -> None:
        """Verifies exact 5692 parity, ghost-key removal, and ORDIR 7.1.0 cleanup in dist."""
        ext_cards = json.loads((BASE_DIR / "data" / "cards_extended_with_ordir_fuzzy.json").read_text("utf-8"))["cards"]
        cards_logic = json.loads((BASE_DIR / "data" / "dist" / "cards_logic.json").read_text("utf-8"))
        ext_ids = {str(c["Id"]) for c in ext_cards}

        self.assertEqual(len(ext_ids), 5692)
        self.assertEqual(set(cards_logic.keys()), ext_ids)
        self.assertNotIn("-1587655157_shared", cards_logic)
        self.assertNotIn("-1587655157_top", cards_logic)

        # Melchizedek retains both Star and regular abilities cleanly
        mel = cards_logic["-1587655157"]["sides"]["top"]["abilities"]
        self.assertTrue(any(ab.get("is_star") for ab in mel))
        self.assertTrue(any(not ab.get("is_star") for ab in mel))

        # Herodian keeps canonical ORDIR 7.1.0 'Herod in the Title'
        herodian = cards_logic["-1787396553"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]
        self.assertEqual(herodian["identifiers"], ["Herod in the Title"])

        # Explicit Musician cards preserve 'Musician'
        chenaniah = cards_logic["-627242579"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]
        self.assertIn("Musician", chenaniah["identifiers"])


if __name__ == "__main__":
    unittest.main()
