"""Unit and dataset integrity tests for IsHuman/is_human and Classes/classes."""

from __future__ import annotations

import json
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, Iterable, List, Set

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_SCRIPTS_DIR = _PROJECT_ROOT / "scripts"
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from models.enums import CHARACTER_SIDE_TYPES  # noqa: E402
from models.logic.target_decomposer import try_decompose_phrase  # noqa: E402
from models.logic.target_selector import TargetSelector  # noqa: E402
from utils.card_helpers import get_side_field  # noqa: E402
from utils.human_resolver import (  # noqa: E402
    apply_is_human_to_card_sides,
    normalize_card_classes,
    resolve_is_human,
)

_DATA_DIR = _PROJECT_ROOT / "data"
_EXTENDED_PATH = _DATA_DIR / "cards_extended.json"
_FUZZY_PATH = _DATA_DIR / "cards_extended_with_ordir_fuzzy.json"
_DIST_FUZZY_PATH = _DATA_DIR / "dist" / "cards_extended_with_ordir_fuzzy.json"
_DIST_LOGIC_PATH = _DATA_DIR / "dist" / "cards_logic.json"
_DIST_CONSTANTS_PATH = _DATA_DIR / "dist" / "ast_constants.json"

_FORBIDDEN_STANDALONE_IDENTIFIERS: Set[str] = {
    "human",
    "humans",
    "non-human",
    "non-humans",
    "warrior",
    "warriors",
    "warrior class",
    "warrior-class",
    "weapon",
    "weapons",
    "weapon class",
    "weapon-class",
    "depicting a weapon",
    "depicting weapons",
    "illustration depicting a weapon",
    "territory class",
    "territory-class",
}


def _iter_selectors(node: Any) -> Iterable[Dict[str, Any]]:
    """Recursively yields TargetSelector dictionaries from a CardLogic node.

    Args:
        node: Arbitrary JSON dict or list inside CardLogic.

    Yields:
        TargetSelector dictionaries containing identifiers or target_type.
    """
    if isinstance(node, dict):
        if "identifiers" in node or "target_type" in node:
            yield node
        for value in node.values():
            yield from _iter_selectors(value)
    elif isinstance(node, list):
        for item in node:
            yield from _iter_selectors(item)


class TestHumanResolver(unittest.TestCase):
    """Tests ORDIR 7.0.0 character human resolution logic."""

    def test_standard_human_hero_and_evil_character(self) -> None:
        """Standard Heroes and Evil Characters without non-human traits resolve to True."""
        hero = {
            "CardSides": {
                "top": {
                    "Name": "Moses",
                    "Type": "Hero",
                    "Brigades": ["White"],
                    "ORDIR": ["Prophet", "Israelite"],
                }
            }
        }
        ec = {
            "CardSides": {
                "top": {
                    "Name": "Haman",
                    "Type": "Evil Character",
                    "Brigades": ["Black"],
                    "ORDIR": ["Agagite"],
                }
            }
        }
        self.assertIs(resolve_is_human(hero, "top"), True)
        self.assertIs(resolve_is_human(ec, "top"), True)

    def test_giants_resolve_as_human(self) -> None:
        """Giants such as Goliath and Rapha of Gath resolve as human per ORDIR."""
        goliath = {
            "Identifier": "Philistine Giant",
            "CardSides": {
                "top": {
                    "Name": "Goliath",
                    "Type": "Evil Character",
                    "Brigades": ["Black"],
                    "ORDIR": ["Giant", "Philistine"],
                }
            },
        }
        rapha = {
            "Identifier": "Philistine Giant",
            "CardSides": {
                "top": {
                    "Name": "Rapha of Gath",
                    "Type": "Evil Character",
                    "Brigades": ["Black"],
                    "ORDIR": ["Giant", "II Samuel Card", "Philistine"],
                }
            },
        }
        self.assertIs(resolve_is_human(goliath, "top"), True)
        self.assertIs(resolve_is_human(rapha, "top"), True)

    def test_dual_role_great_multitude(self) -> None:
        """Great Multitude with explicit 'Human, Angel' identifier resolves to True."""
        great_multitude = {
            "Identifier": "Genderless, Generic, Human, Angel, X = # of Heroes in play",
            "CardSides": {
                "top": {
                    "Name": "Great Multitude",
                    "Type": "Hero",
                    "Brigades": ["Silver"],
                    "ORDIR": ["Angel", "Generic Character", "Revelation Card"],
                }
            },
        }
        self.assertIs(resolve_is_human(great_multitude, "top"), True)

    def test_identifier_false_positive_traps(self) -> None:
        """Variable equations and parenthetical Taunt notes do not misclassify cards."""
        the_bear = {
            "Identifier": "X = # of brigades on your humans",
            "CardSides": {
                "top": {
                    "Name": "The Bear (PoC)",
                    "Type": "Evil Character",
                    "Brigades": ["Brown"],
                    "ORDIR": ["Animal"],
                }
            },
        }
        adam = {
            "Identifier": "X = # of humans in play",
            "CardSides": {
                "top": {
                    "Name": "Adam (FoM)",
                    "Type": "Hero",
                    "Brigades": ["Red"],
                    "ORDIR": ["Genesis Card", "Human"],
                }
            },
        }
        lamech = {
            "Identifier": "Taunt (Discard a human.)",
            "CardSides": {
                "top": {
                    "Name": "Lamech, the Avenged",
                    "Type": "Evil Character",
                    "Brigades": ["Black"],
                    "ORDIR": ["Antediluvian"],
                }
            },
        }
        self.assertIs(resolve_is_human(the_bear, "top"), False)
        self.assertIs(resolve_is_human(adam, "top"), True)
        self.assertIs(resolve_is_human(lamech, "top"), True)

    def test_non_human_categories_and_non_characters(self) -> None:
        """Angels, Demons, Beasts, Animals, Symbolic Characters -> False; non-chars -> None."""
        silver_angel = {
            "CardSides": {
                "top": {
                    "Name": "Unnamed Silver Hero",
                    "Type": "Hero",
                    "Brigades": ["Silver"],
                    "ORDIR": [],
                }
            }
        }
        orange_demon = {
            "CardSides": {
                "top": {
                    "Name": "Unnamed Orange Fiend",
                    "Type": "Evil Character",
                    "Brigades": ["Orange"],
                    "ORDIR": [],
                }
            }
        }
        beast_card = {
            "CardSides": {
                "top": {
                    "Name": "Leopard",
                    "Type": "Evil Character",
                    "Brigades": ["Pale Green"],
                    "ORDIR": ["Beast"],
                }
            }
        }
        revelation_angel = {
            "CardSides": {
                "top": {
                    "Name": "Michael",
                    "Type": "Hero",
                    "Brigades": ["Silver", "White"],
                    "ORDIR": ["Revelation Angel"],
                }
            }
        }
        symbolic_names = [
            ("Hope", "Hero"),
            ("Mighty Warrior", "Hero"),
            ("Fourth Seal, Death (RoJ)", "Evil Character"),
            ("Doubt", "Evil Character"),
            ("Self (Roots)", "Evil Character"),
            ("Roaring Lion", "Evil Character"),
        ]

        self.assertIs(resolve_is_human(silver_angel, "top"), False)
        self.assertIs(resolve_is_human(orange_demon, "top"), False)
        self.assertIs(resolve_is_human(beast_card, "top"), False)
        self.assertIs(resolve_is_human(revelation_angel, "top"), False)

        for name, card_type in symbolic_names:
            card = {
                "CardSides": {
                    "top": {
                        "Name": name,
                        "Type": card_type,
                        "Brigades": ["White"] if card_type == "Hero" else ["Black"],
                        "ORDIR": [],
                    }
                }
            }
            self.assertIs(resolve_is_human(card, "top"), False, msg=f"Failed for {name}")

        non_char = {
            "CardSides": {
                "top": {
                    "Name": "Chariot of Fire",
                    "Type": "GE",
                    "Brigades": ["Silver"],
                }
            }
        }
        apply_is_human_to_card_sides(non_char)
        self.assertIsNone(resolve_is_human(non_char, "top"))
        self.assertNotIn("IsHuman", non_char["CardSides"]["top"])


class TestClassesNormalization(unittest.TestCase):
    """Tests splitting of compound classes and dual-card Territory placement."""

    def test_slash_separated_classes_split(self) -> None:
        """Slash-separated class strings split into distinct canonical classes."""
        card = {
            "CardSides": {
                "top": {
                    "Name": "Test Warrior",
                    "Type": "Evil Character",
                    "Classes": ["Territory / Warrior"],
                }
            }
        }
        normalize_card_classes(card)
        self.assertEqual(card["CardSides"]["top"]["Classes"], ["Territory", "Warrior"])

    def test_dual_card_character_territory_class(self) -> None:
        """Dual cards with 'Character is territory class' assign Territory only to character side."""
        dual = {
            "Identifier": "Symbolic, Character is territory class, Generic",
            "CardSides": {
                "shared": {"Name": "Sixth Seal, Terror (RoJ)", "Classes": ["Territory"]},
                "top": {"Type": "GE"},
                "bottom": {"Type": "Evil Character"},
            },
        }
        normalize_card_classes(dual)
        self.assertEqual(get_side_field(dual, "bottom", "Classes"), ["Territory"])
        self.assertFalse(get_side_field(dual, "top", "Classes"))
        self.assertNotIn("Classes", dual["CardSides"]["shared"])


class TestTargetSelectorHumanAndClasses(unittest.TestCase):
    """Tests TargetSelector and phrase decomposer migration for is_human and classes."""

    def test_auto_migration_phrases_into_selector(self) -> None:
        """Human and class qualifiers auto-migrate out of identifiers cleanly."""
        cases = [
            ("human", {"is_human": True, "classes": [], "target_type": "character"}),
            ("non-human", {"is_human": False, "classes": [], "target_type": "character"}),
            ("warrior", {"is_human": None, "classes": ["Warrior"], "target_type": "character"}),
            ("warrior class", {"is_human": None, "classes": ["Warrior"], "target_type": None}),
            ("weapon", {"is_human": None, "classes": ["Weapon"], "target_type": "enhancement"}),
            ("weapon class", {"is_human": None, "classes": ["Weapon"], "target_type": None}),
            ("weapon-class", {"is_human": None, "classes": ["Weapon"], "target_type": None}),
            ("depicting a weapon", {"is_human": None, "classes": ["Weapon"], "target_type": "enhancement"}),
            ("depicting weapons", {"is_human": None, "classes": ["Weapon"], "target_type": "enhancement"}),
            ("illustration depicting a weapon", {"is_human": None, "classes": ["Weapon"], "target_type": "enhancement"}),
            ("territory class", {"is_human": None, "classes": ["Territory"], "target_type": None}),
        ]
        for phrase, expected in cases:
            sel = TargetSelector(identifiers=[phrase])
            self.assertEqual(sel.identifiers, [], msg=f"Leftover identifier for {phrase!r}: {sel.identifiers}")
            self.assertIs(sel.is_human, expected["is_human"], msg=f"is_human mismatch for {phrase!r}")
            self.assertEqual(sel.classes, expected["classes"], msg=f"classes mismatch for {phrase!r}")
            self.assertEqual(sel.target_type, expected["target_type"], msg=f"target_type mismatch for {phrase!r}")

    def test_compound_phrases_decompose_correctly(self) -> None:
        """Qualified and conjoined human/class phrases populate attributes accurately."""
        sel_nt = TargetSelector(identifiers=["N.T. warrior class"])
        self.assertEqual(sel_nt.testament, "NT")
        self.assertEqual(sel_nt.classes, ["Warrior"])
        self.assertEqual(sel_nt.identifiers, [])

        sel_evil_wpn = TargetSelector(identifiers=["evil weapon"])
        self.assertEqual(sel_evil_wpn.alignment, "evil")
        self.assertEqual(sel_evil_wpn.classes, ["Weapon"])
        self.assertEqual(sel_evil_wpn.target_type, "enhancement")
        self.assertEqual(sel_evil_wpn.identifiers, [])

        dec_conj = try_decompose_phrase("good weapon or red warrior")
        self.assertIsNotNone(dec_conj)
        self.assertEqual(dec_conj["classes"], ["Weapon", "Warrior"])
        self.assertEqual(dec_conj["brigades"], ["Red"])

        dec_single_brig = try_decompose_phrase("green prophet or single-brigade red warrior")
        self.assertIsNotNone(dec_single_brig)
        self.assertEqual(dec_single_brig["classes"], ["Warrior"])
        self.assertEqual(dec_single_brig["brigades"], ["Green", "Red"])
        self.assertIn("Prophet", dec_single_brig["identifiers"])
        self.assertIn("single-brigade", dec_single_brig["identifiers"])

    def test_negative_and_exception_identifiers_preserved(self) -> None:
        """Negative and exception clauses are preserved in identifiers rather than conflated."""
        for phrase in (
            "non-warrior",
            "non-weapon",
            "except warrior class",
            "except a human",
            "except good weapons",
        ):
            sel = TargetSelector(identifiers=[phrase])
            self.assertEqual(sel.identifiers, [phrase], msg=f"Phrase modified unexpectedly: {phrase!r}")
            self.assertEqual(sel.classes, [], msg=f"Negative/exception set classes for {phrase!r}")
            self.assertIsNone(sel.is_human, msg=f"Negative/exception set is_human for {phrase!r}")


class TestDatasetHumanAndClassesIntegrity(unittest.TestCase):
    """Dataset-wide verification against cards_extended, dist fuzzy JSON, and cards_logic.json."""

    @classmethod
    def setUpClass(cls) -> None:
        """Loads extended card datasets and compiled cards_logic.json once."""
        cls.ext_cards: List[Dict[str, Any]] = json.loads(
            _EXTENDED_PATH.read_text(encoding="utf-8")
        )["cards"]
        cls.fuzzy_bytes: bytes = _FUZZY_PATH.read_bytes()
        cls.dist_fuzzy_bytes: bytes = _DIST_FUZZY_PATH.read_bytes()
        cls.fuzzy_cards: List[Dict[str, Any]] = json.loads(
            cls.fuzzy_bytes.decode("utf-8")
        )["cards"]
        cls.fuzzy_by_id: Dict[str, Dict[str, Any]] = {
            str(c["Id"]): c for c in cls.fuzzy_cards
        }
        cls.logic_cards: Dict[str, Any] = json.loads(
            _DIST_LOGIC_PATH.read_text(encoding="utf-8")
        )

    def test_dist_fuzzy_file_matches_primary(self) -> None:
        """data/dist/cards_extended_with_ordir_fuzzy.json is byte-identical to data/."""
        self.assertEqual(self.dist_fuzzy_bytes, self.fuzzy_bytes)

    def test_ast_constants_includes_card_classes(self) -> None:
        """data/dist/ast_constants.json exports the canonical card_classes list."""
        constants = json.loads(_DIST_CONSTANTS_PATH.read_text(encoding="utf-8"))
        self.assertEqual(constants.get("card_classes"), ["Warrior", "Weapon", "Territory"])

    def test_real_dataset_specific_classes_and_dual_cards(self) -> None:
        """Checks slash-split classes and dual-card Territory sides on real dataset records."""
        for cid in ("1337599264", "-1276287509"):
            card = self.fuzzy_by_id[cid]
            self.assertEqual(get_side_field(card, "top", "Classes"), ["Territory", "Warrior"])

        dual_territory_ids = (
            "-1456985059",
            "1545506899",
            "1765230277",
            "-559013149",
            "514471354",
            "199706146",
        )
        for cid in dual_territory_ids:
            card = self.fuzzy_by_id[cid]
            sides = card["CardSides"]
            for sk, sdata in sides.items():
                if sk == "shared" or not isinstance(sdata, dict):
                    continue
                st = get_side_field(card, sk, "Type")
                cls_val = get_side_field(card, sk, "Classes") or []
                if st in CHARACTER_SIDE_TYPES:
                    self.assertIn("Territory", cls_val, msg=f"{cid}.{sk} missing Territory")
                else:
                    self.assertNotIn("Territory", cls_val, msg=f"{cid}.{sk} ({st}) leaked Territory")

    def test_no_slash_or_comma_in_classes_and_all_chars_have_ishuman(self) -> None:
        """Every character side has boolean IsHuman and no Classes value contains '/' or ','."""
        for label, cards in (("cards_extended", self.ext_cards), ("fuzzy", self.fuzzy_cards)):
            for card in cards:
                cid = str(card.get("Id"))
                sides = card.get("CardSides") or {}
                for sk, sdata in sides.items():
                    if not isinstance(sdata, dict):
                        continue
                    for cls_item in sdata.get("Classes") or []:
                        self.assertNotIn("/", cls_item, msg=f"{label} {cid}.{sk} unsplit class {cls_item!r}")
                        self.assertNotIn(",", cls_item, msg=f"{label} {cid}.{sk} comma class {cls_item!r}")
                    if sk == "shared":
                        continue
                    if get_side_field(card, sk, "Type") in CHARACTER_SIDE_TYPES:
                        self.assertIsInstance(
                            get_side_field(card, sk, "IsHuman"),
                            bool,
                            msg=f"{label} {cid}.{sk} missing boolean IsHuman",
                        )

    def test_cards_logic_matches_extended_metadata_and_has_zero_unmigrated_tokens(self) -> None:
        """CardSideLogic.is_human/classes match fuzzy data and no standalone human/class tokens remain."""
        matched_cards = 0
        for cid, logic_entry in self.logic_cards.items():
            ext_card = self.fuzzy_by_id.get(cid)
            sides_logic = logic_entry.get("sides") or {}
            if ext_card is not None:
                matched_cards += 1
                ext_sides = ext_card.get("CardSides") or {}
                real_ext_keys = [
                    k for k, v in ext_sides.items() if k != "shared" and isinstance(v, dict)
                ] or ["top"]

                for sk, sdata in sides_logic.items():
                    if sk == "shared":
                        expected_humans = {
                            get_side_field(ext_card, rk, "IsHuman")
                            for rk in real_ext_keys
                            if get_side_field(ext_card, rk, "Type") in CHARACTER_SIDE_TYPES
                        }
                        char_real_keys = [
                            rk for rk in real_ext_keys
                            if get_side_field(ext_card, rk, "Type") in CHARACTER_SIDE_TYPES
                        ]
                        if len(expected_humans) == 1 and len(real_ext_keys) == len(char_real_keys):
                            self.assertEqual(
                                sdata.get("is_human"),
                                next(iter(expected_humans)),
                                msg=f"{cid}.shared is_human mismatch",
                            )

                        expected_cls_tuples = {
                            tuple(get_side_field(ext_card, rk, "Classes") or [])
                            for rk in real_ext_keys
                        }
                        if len(expected_cls_tuples) == 1:
                            self.assertEqual(
                                sdata.get("classes", []),
                                list(next(iter(expected_cls_tuples))),
                                msg=f"{cid}.shared classes mismatch",
                            )
                    else:
                        if sk in ext_sides:
                            lookup_key = sk
                        elif len(real_ext_keys) == 1:
                            lookup_key = real_ext_keys[0]
                        else:
                            lookup_key = sk

                        if get_side_field(ext_card, lookup_key, "Type") in CHARACTER_SIDE_TYPES:
                            self.assertIs(
                                sdata.get("is_human"),
                                get_side_field(ext_card, lookup_key, "IsHuman"),
                                msg=f"{cid}.{sk} is_human mismatch",
                            )
                        self.assertEqual(
                            sdata.get("classes", []),
                            list(get_side_field(ext_card, lookup_key, "Classes") or []),
                            msg=f"{cid}.{sk} classes mismatch",
                        )

            for sk, sdata in sides_logic.items():
                for sel in _iter_selectors(sdata):
                    for ident in sel.get("identifiers") or []:
                        self.assertNotIn(
                            ident.strip().lower(),
                            _FORBIDDEN_STANDALONE_IDENTIFIERS,
                            msg=f"Unmigrated identifier {ident!r} remaining in {cid}.{sk}",
                        )
        self.assertGreater(matched_cards, 5000)


if __name__ == "__main__":
    unittest.main()
