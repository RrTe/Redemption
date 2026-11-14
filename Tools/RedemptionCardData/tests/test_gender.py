"""Comprehensive unit and data-integrity tests for typed gender support."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List

from pydantic import ValidationError

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from models.card_side import CardSide
from models.enums.gender import CHARACTER_SIDE_TYPES, GENDERS
from models.logic.card_logic import CardSideLogic
from models.logic.target_selector import TargetSelector
from scripts.ability_decompiler import decompile_target
from scripts.migrations.migrate_gender import migrate_card_ast, scan_gender_identifiers
from scripts.utils.card_helpers import get_side_field
from scripts.utils.gender_resolver import apply_gender_to_card_sides, resolve_gender
from scripts.utils.target_parser import build_target_selector


def _make_card(
    name: str,
    card_type: str = "Hero",
    identifier: str = "",
    reference: str = "",
    special_ability: str = "",
    card_set: str = "Test",
    card_id: str = "1",
) -> Dict[str, Any]:
    """Builds a minimal extended card fixture for GenderResolver tests."""
    return {
        "Id": card_id,
        "Set": card_set,
        "Identifier": identifier,
        "Reference": reference,
        "IsCharacter": card_type in CHARACTER_SIDE_TYPES,
        "CardSides": {
            "top": {
                "Name": name,
                "Type": card_type,
                "SpecialAbility": special_ability,
            }
        },
    }


class TestGenderResolver(unittest.TestCase):
    """Tests all 4 stages of the central ORDIR GenderResolver."""

    def test_tier1_ordir_dual_gender(self) -> None:
        self.assertEqual(resolve_gender(_make_card("Amram & Jochebed")), "both")
        self.assertEqual(resolve_gender(_make_card("Moses' Parents")), "both")
        self.assertEqual(resolve_gender(_make_card("Moses’ Parents (CoW AB)")), "both")

    def test_tier1_ordir_genderless_closed_list(self) -> None:
        genderless_names = [
            "Bride of Christ (RoJ)",
            "Angry Mob [Black]",
            "Every Tribe (RoJ)",
            "Faithful Witness (RoJ)",
            "Great Multitude (RoJ)",
            "Priests of Christ (RoJ)",
            "Prophets of Gibeath (Promo)",
            "Lions in the Den [T2C AB]",
            "Wandering Israelites",
            "Fire Foxes (CoW)",
            "Boaz' Reapers (LoC)",
            "Citizens of Sychar (GoC)",
            "The Jeering Youths [RR2]",
        ]
        for cname in genderless_names:
            with self.subTest(card=cname):
                self.assertEqual(resolve_gender(_make_card(cname)), "genderless")

        children = _make_card("Children [RR2]", identifier="Generic, Genderless", reference="Matthew 19:14")
        self.assertEqual(resolve_gender(children), "genderless")

    def test_tier2_keywords_female_and_male(self) -> None:
        self.assertEqual(resolve_gender(_make_card("Queen of Sheba")), "female")
        self.assertEqual(resolve_gender(_make_card("Tekoan Woman")), "female")
        self.assertEqual(resolve_gender(_make_card("The Persistent Widow")), "female")
        self.assertEqual(resolve_gender(_make_card("Mary Mother of Mark")), "female")
        self.assertEqual(resolve_gender(_make_card("Christian Soldier (Female)")), "female")

        # Possessive traps must still evaluate the actual character noun ('Daughter', 'Maid', 'Wife').
        self.assertEqual(resolve_gender(_make_card("King's Daughter")), "female")
        self.assertEqual(resolve_gender(_make_card("Pharaoh's Daughter")), "female")
        self.assertEqual(resolve_gender(_make_card("High Priest's Maid")), "female")
        self.assertEqual(resolve_gender(_make_card("Widow of a Prophet")), "female")
        self.assertEqual(resolve_gender(_make_card("Anna, the Widow", identifier="Prophet")), "female")

        self.assertEqual(resolve_gender(_make_card("Roman Centurion", "Evil Character")), "male")
        self.assertEqual(resolve_gender(_make_card("High Priest Ananias", "Evil Character")), "male")
        self.assertEqual(resolve_gender(_make_card("Prince of Persia", "Evil Character")), "male")
        self.assertEqual(resolve_gender(_make_card("Angel at Shur")), "male")

    def test_tier3_biblical_lexicon_and_pronouns(self) -> None:
        # Biblical names without explicit role keywords.
        self.assertEqual(resolve_gender(_make_card("Ruth")), "female")
        self.assertEqual(resolve_gender(_make_card("Esther")), "female")
        self.assertEqual(resolve_gender(_make_card("Deborah", identifier="Judge, Musician, Prophet")), "female")
        self.assertEqual(resolve_gender(_make_card("Naamah")), "female")

        self.assertEqual(resolve_gender(_make_card("David")), "male")
        self.assertEqual(resolve_gender(_make_card("Peter")), "male")
        self.assertEqual(resolve_gender(_make_card("Elishama the Priest")), "male")
        self.assertEqual(resolve_gender(_make_card("Noah")), "male")

        # Pronoun and Reference heuristics.
        female_pronoun_card = _make_card(
            "Unknown Biblical Figure",
            special_ability="When she enters battle, you may draw 1.",
        )
        self.assertEqual(resolve_gender(female_pronoun_card), "female")

        male_pronoun_card = _make_card(
            "Unknown Biblical Figure",
            special_ability="When he is discarded, banish an artifact.",
        )
        self.assertEqual(resolve_gender(male_pronoun_card), "male")

        # Opponent possessive pronouns must not override clear female Reference cues.
        opp_pronoun_card = _make_card(
            "Unnamed Verse Card",
            reference="Proverbs 31:10",
            special_ability="Opponent discards his hand.",
        )
        self.assertEqual(resolve_gender(opp_pronoun_card), "female")

    def test_tier4_overrides_and_errata(self) -> None:
        # Live overrides: The Bear (RoA Errata -> male vs Bear CoW -> genderless).
        the_bear = _make_card("The Bear", "Evil Character", identifier="Genderless, Beast (Demon)", card_set="RoA")
        cow_bear = _make_card("Bear (CoW)", "Evil Character", identifier="Animal, Genderless", card_set="CoW")
        self.assertEqual(resolve_gender(the_bear), "male")
        self.assertEqual(resolve_gender(cow_bear), "genderless")

        self.assertEqual(resolve_gender(_make_card("Arianna")), "female")
        self.assertEqual(resolve_gender(_make_card("Babylon the Great", "Evil Character")), "female")
        self.assertEqual(resolve_gender(_make_card("Sixth Seal (Terror) (RoJ AB)")), "genderless")

        # Custom override dict beats lower heuristic tiers.
        custom_overrides = {
            "by_card_id": {"999": "female"},
            "by_set_and_name": {"test::king override": "female"},
            "by_base_name": {"custom symbolic": "genderless"},
        }
        self.assertEqual(
            resolve_gender(_make_card("David", card_id="999"), overrides=custom_overrides),
            "female",
        )
        self.assertEqual(
            resolve_gender(_make_card("King Override", card_set="Test"), overrides=custom_overrides),
            "female",
        )
        self.assertEqual(
            resolve_gender(_make_card("Custom Symbolic"), overrides=custom_overrides),
            "genderless",
        )


class TestTargetSelectorGender(unittest.TestCase):
    """Tests TargetSelector.gender schema validation and auto-healing."""

    def test_explicit_gender_and_validation(self) -> None:
        sel_m = TargetSelector(target_type="hero", gender="male")
        sel_f = TargetSelector(target_type="evil_character", gender="female")
        self.assertEqual(sel_m.gender, "male")
        self.assertEqual(sel_f.gender, "female")

        with self.assertRaises(ValidationError):
            TargetSelector(target_type="character", gender="genderless")  # type: ignore[arg-type]

        with self.assertRaises(ValidationError):
            TargetSelector(target_type="character", gender="both")  # type: ignore[arg-type]

    def test_auto_healing_moves_gender_out_of_identifiers(self) -> None:
        sel1 = TargetSelector(target_type="hero", identifiers=["male"])
        self.assertEqual(sel1.gender, "male")
        self.assertEqual(sel1.identifiers, [])

        sel2 = TargetSelector(target_type="evil_character", identifiers=["FEMALE", "Assyrian"])
        self.assertEqual(sel2.gender, "female")
        self.assertEqual(sel2.identifiers, ["Assyrian"])

        sel3 = TargetSelector(identifiers=["male human"])
        self.assertEqual(sel3.gender, "male")
        self.assertEqual(sel3.target_type, "character")
        self.assertIn("Human", sel3.identifiers)
        self.assertNotIn("male", [i.lower() for i in sel3.identifiers])

    def test_preserves_relational_and_exception_identifiers(self) -> None:
        sel = TargetSelector(target_type="hero", identifiers=["except female Hero", "opposite gender"])
        self.assertIsNone(sel.gender)
        self.assertEqual(sel.identifiers, ["except female Hero", "opposite gender"])


class TestTargetParserAndMigration(unittest.TestCase):
    """Tests target_parser mapping, decompiler output, CardSide schema, and AST migration."""

    def test_target_parser_maps_gender_directly(self) -> None:
        sel_male_human = build_target_selector("male human")
        self.assertEqual(sel_male_human.gender, "male")
        self.assertEqual(sel_male_human.target_type, "character")
        self.assertIn("Human", sel_male_human.identifiers)
        self.assertNotIn("male", [i.lower() for i in sel_male_human.identifiers])

        sel_female_ec = build_target_selector("female evil character")
        self.assertEqual(sel_female_ec.gender, "female")
        self.assertEqual(sel_female_ec.target_type, "evil_character")
        self.assertEqual(sel_female_ec.alignment, "evil")
        self.assertNotIn("female", [i.lower() for i in sel_female_ec.identifiers])

        sel_exc = build_target_selector("good Heroes (except female Heroes)")
        self.assertIsNone(sel_exc.gender)
        self.assertEqual(sel_exc.target_type, "hero")
        self.assertIn("except female Heroes", sel_exc.identifiers)

    def test_decompiler_includes_gender(self) -> None:
        sel = TargetSelector(target_type="hero", alignment="good", gender="female", brigades=["White"])
        text = decompile_target(sel)
        self.assertIn("female", text)

    def test_card_side_and_dual_side_enrichment(self) -> None:
        cs = CardSide(Name="Esther", Type="Hero", Gender="female").to_dict()
        self.assertEqual(cs["Gender"], "female")

        # Dual character card: Hero / Hero sharing female gender -> Gender deduplicated into shared.
        dual_heroes = {
            "Id": "10",
            "Set": "LoC",
            "IsCharacter": True,
            "CardSides": {
                "shared": {"Alignment": "Good", "Type": "Hero"},
                "top": {"Name": "Ruth, the Devoted", "Brigades": ["Gold"]},
                "bottom": {"Name": "Ruth, the Redeemed", "Brigades": ["Silver"]},
            },
        }
        apply_gender_to_card_sides(dual_heroes)
        self.assertEqual(get_side_field(dual_heroes, "top", "Gender"), "female")
        self.assertEqual(get_side_field(dual_heroes, "bottom", "Gender"), "female")

        # Mixed dual card: Evil Character / Fortress -> Gender ONLY on character side, never Fortress.
        mixed_camp = {
            "Id": "11",
            "Set": "LoC",
            "IsCharacter": True,
            "CardSides": {
                "shared": {"Name": "Assyrian Camp (LoC)", "Alignment": "Evil"},
                "top": {"Type": "Evil Character"},
                "bottom": {"Type": "Fortress"},
            },
        }
        apply_gender_to_card_sides(mixed_camp)
        self.assertEqual(get_side_field(mixed_camp, "top", "Gender"), "male")
        self.assertIsNone(get_side_field(mixed_camp, "bottom", "Gender"))
        self.assertNotIn("Gender", mixed_camp["CardSides"].get("shared", {}))

    def test_ast_migration_roundtrip(self) -> None:
        raw_ast = {
            "modifiers": [],
            "abilities": [
                {
                    "ability_id": "ab_1_discard",
                    "activation_mode": "immediate",
                    "conditions": [],
                    "costs": [],
                    "effects": [
                        {
                            "step": 1,
                            "action": "discard",
                            "target": {
                                "selection_mode": "manual_controller",
                                "zone_owner": "opponent",
                                "scope": ["battle"],
                                "target_type": "hero",
                                "identifiers": ["male", "Human"],
                            },
                        }
                    ],
                }
            ],
        }
        migrated, hits = migrate_card_ast(raw_ast)
        self.assertEqual(hits, ["male"])
        tgt = migrated["abilities"][0]["effects"][0]["target"]
        self.assertEqual(tgt["gender"], "male")
        self.assertEqual(tgt["identifiers"], ["Human"])
        self.assertEqual(scan_gender_identifiers(migrated), [])


class TestDataIntegrityGender(unittest.TestCase):
    """Validates migrated production datasets on disk."""

    def test_all_character_cards_have_valid_gender(self) -> None:
        ext_path = BASE_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"
        with ext_path.open("r", encoding="utf-8") as handle:
            cards: List[Dict[str, Any]] = json.load(handle)["cards"]

        char_card_count = 0
        char_side_count = 0
        for card in cards:
            sides = card.get("CardSides") or {}
            real_keys = [k for k, v in sides.items() if k != "shared" and isinstance(v, dict)] or ["top"]
            if card.get("IsCharacter"):
                char_card_count += 1
                has_char_side = False
                for sk in real_keys:
                    stype = get_side_field(card, sk, "Type")
                    gender = get_side_field(card, sk, "Gender")
                    if stype in CHARACTER_SIDE_TYPES:
                        has_char_side = True
                        char_side_count += 1
                        self.assertIn(gender, GENDERS, f"Invalid gender on {card.get('Id')} ({sk}): {gender}")
                    else:
                        self.assertIsNone(gender, f"Non-character side {sk} on {card.get('Id')} must not have Gender")
                self.assertTrue(has_char_side, f"Character card {card.get('Id')} has no character side")
            else:
                for sk in real_keys:
                    self.assertIsNone(
                        get_side_field(card, sk, "Gender"),
                        f"Non-character card {card.get('Id')} ({sk}) should not have Gender",
                    )

        self.assertEqual(char_card_count, 2339)
        self.assertEqual(char_side_count, 2459)

    def test_asts_and_dist_exports_are_migrated(self) -> None:
        # 1. Verify no stale male/female inside TargetSelector.identifiers across AST files.
        for rel_path in (
            "data/ai_generated_abilities.json",
            "data/card_abilities_raw.json",
            "data/dist/cards_logic.json",
        ):
            fpath = BASE_DIR / rel_path
            with fpath.open("r", encoding="utf-8") as handle:
                data = json.load(handle)
            leaked = scan_gender_identifiers(data)
            self.assertEqual(leaked, [], f"Unmigrated gender identifiers in {rel_path}: {leaked[:10]}")

        # 2. Verify cardHierarchy.json exports canonical gender list.
        hier_path = BASE_DIR / "data" / "dist" / "cardHierarchy.json"
        with hier_path.open("r", encoding="utf-8") as handle:
            hier = json.load(handle)
        self.assertEqual(hier.get("genders"), ["male", "female", "both", "genderless"])

        # 3. Verify character entries in cards_logic.json carry gender on character sides.
        logic_path = BASE_DIR / "data" / "dist" / "cards_logic.json"
        ext_path = BASE_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"
        with logic_path.open("r", encoding="utf-8") as lh, ext_path.open("r", encoding="utf-8") as eh:
            logic_map = json.load(lh)
            ext_cards = {str(c["Id"]): c for c in json.load(eh)["cards"]}

        checked_char_sides = 0
        for cid, entry in logic_map.items():
            ext_card = ext_cards.get(cid)
            if not ext_card or not ext_card.get("IsCharacter"):
                continue
            for sk, side_obj in (entry.get("sides") or {}).items():
                if sk in ("top", "bottom") and get_side_field(ext_card, sk, "Type") in CHARACTER_SIDE_TYPES:
                    checked_char_sides += 1
                    self.assertIn(
                        side_obj.get("gender"),
                        GENDERS,
                        f"cards_logic.json missing/invalid gender on {cid}.{sk}",
                    )
        self.assertGreater(checked_char_sides, 2000)


if __name__ == "__main__":
    unittest.main()
