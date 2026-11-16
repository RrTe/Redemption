"""Unit and integration regression tests for Redemption REG v11.1.0 conformance.

Covers:
- Centralized REG v11.1.0 vocabulary synonyms and prohibition patterns.
- Fact matrix verification rules for 'has no effect', 'paralyze', and 'release'.
- Stage 08 deterministic parser support for REG v11.1.0 mechanics.
- Production export conformance (`data/dist/ast_constants.json` and `cards_logic.json`).
"""

from __future__ import annotations

import importlib
import json
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, Iterable, List, Optional

BASE_DIR = Path(__file__).resolve().parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))
if str(BASE_DIR / "scripts") not in sys.path:
    sys.path.insert(0, str(BASE_DIR / "scripts"))

from models.enums.action_verb import ActionVerb
from models.enums.activation_mode import ActivationMode
from models.enums.duration import Duration
from models.enums.zone import Zone
from scripts.fact_matrix import verify_fact_matrix
from scripts.utils.reg_vocabulary import (
    BATTLE_ENTRY_PROHIBITIONS,
    CARD_PREVENTION_PATTERNS,
    CARD_PROTECTION_PATTERNS,
    PARALYZE_PROHIBITIONS,
    REG_LEGACY_SYNONYMS,
)


def _make_ast_facts(
    actions: Iterable[str] = (),
    identifiers: Iterable[str] = (),
    modifiers: Iterable[str] = (),
    target_types: Iterable[str] = (),
    numbers: Iterable[int] = (),
    max_values: Iterable[int] = (),
) -> Dict[str, Any]:
    """Constructs a minimal ast_facts payload for verify_fact_matrix unit tests.

    Args:
        actions: Action verb strings present in the mock AST.
        identifiers: Identifier tokens present in the mock AST targets.
        modifiers: Modifier type strings present in the mock AST.
        target_types: Target type strings present in the mock AST targets.
        numbers: Numeric count values extracted from the mock AST.
        max_values: Upper bound count values extracted from the mock AST.

    Returns:
        Dictionary structured identically to fact_matrix AST extractions.
    """
    return {
        "numbers": set(numbers),
        "max_values": set(max_values),
        "actions": set(actions),
        "modifiers": set(modifiers),
        "entities": set(),
        "identifiers": set(identifiers),
        "restrict_identifiers": set(),
        "target_types": set(target_types),
    }


def _collect_actions(card_entry: Dict[str, Any], side: str = "top") -> List[str]:
    """Collects all ActionVerb strings from effects on a card side in cards_logic.json.

    Args:
        card_entry: Single card record from ``data/dist/cards_logic.json``.
        side: Card side key ('top', 'bottom', or 'shared').

    Returns:
        List of action strings in effect traversal order.
    """
    side_obj = (card_entry.get("sides") or {}).get(side) or {}
    return [
        eff.get("action")
        for ab in side_obj.get("abilities", [])
        for eff in ab.get("effects", [])
        if eff.get("action")
    ]


class TestRegV111Vocabulary(unittest.TestCase):
    """Validates REG v11.1.0 updates in scripts/utils/reg_vocabulary.py."""

    def test_legacy_synonyms_include_reg_11_1_additions(self) -> None:
        """Verifies new REG v11.1.0 synonym mappings for bounce, topdeck, and underdeck."""
        self.assertEqual(REG_LEGACY_SYNONYMS.get("remove to owner's hand"), "bounce")
        self.assertEqual(REG_LEGACY_SYNONYMS.get("remove to hand"), "bounce")
        self.assertEqual(REG_LEGACY_SYNONYMS.get("return to top of deck"), "topdeck")
        self.assertEqual(REG_LEGACY_SYNONYMS.get("return to bottom of deck"), "underdeck")
        self.assertEqual(REG_LEGACY_SYNONYMS.get("repel"), "withdraw")

    def test_paralyze_prohibitions_exclude_repel(self) -> None:
        """Verifies PARALYZE_PROHIBITIONS covers entry/block bans without absorbing 'repel'."""
        self.assertIs(BATTLE_ENTRY_PROHIBITIONS, PARALYZE_PROHIBITIONS)
        for phrase in (
            "David cannot enter battle",
            "N.T. Heroes may not enter battle",
            "Cannot be blocked by Pharisees or Sadducees",
            "Character may not be blocked by a female Evil Character",
        ):
            self.assertTrue(
                any(p.search(phrase) for p in PARALYZE_PROHIBITIONS),
                f"Expected PARALYZE_PROHIBITIONS to match: {phrase}",
            )
        self.assertFalse(any(p.search("Repel an Evil Character") for p in PARALYZE_PROHIBITIONS))

    def test_protection_and_prevention_patterns_skip_paralyze_clauses(self) -> None:
        """Verifies passive protection and active prevention patterns do not misclassify paralyze."""
        self.assertFalse(
            any(
                p.search("Character may not be blocked by a female Evil Character.")
                for p in CARD_PROTECTION_PATTERNS
            )
        )
        self.assertFalse(
            any(
                p.search("Female Heroes cannot be blocked by a male Evil Character this battle.")
                for p in CARD_PROTECTION_PATTERNS
            )
        )
        self.assertTrue(
            any(p.search("Characters cannot be discarded.") for p in CARD_PROTECTION_PATTERNS)
        )
        self.assertFalse(
            any(p.search("Heroes may not enter battle.") for p in CARD_PREVENTION_PATTERNS)
        )


class TestRegV111FactMatrix(unittest.TestCase):
    """Validates REG v11.1.0 semantic checks in scripts/fact_matrix.py."""

    def test_has_no_effect_requires_negate_not_withdraw(self) -> None:
        """Verifies 'has no effect' accepts 'negate' and flags legacy 'withdraw'."""
        raw = "Samson and his strength have no effect on Delilah."
        ok_bad, issues_bad = verify_fact_matrix(raw, _make_ast_facts(actions={"withdraw"}))
        self.assertFalse(ok_bad)
        self.assertTrue(any("negate" in msg for msg in issues_bad))

        ok_good, issues_good = verify_fact_matrix(raw, _make_ast_facts(actions={"negate"}))
        self.assertTrue(ok_good, f"Unexpected issues: {issues_good}")

    def test_enter_battle_and_blocked_by_require_paralyze(self) -> None:
        """Verifies 'cannot enter battle' and 'cannot/may not be blocked by' require 'paralyze'."""
        for raw in (
            "While Absalom is in play, David cannot enter battle.",
            "Character may not be blocked by a female Evil Character.",
        ):
            ok_bad, issues_bad = verify_fact_matrix(raw, _make_ast_facts(actions={"withdraw"}))
            self.assertFalse(ok_bad)
            self.assertTrue(any("paralyze" in msg for msg in issues_bad))

            ok_good, issues_good = verify_fact_matrix(raw, _make_ast_facts(actions={"paralyze"}))
            self.assertTrue(ok_good, f"Unexpected issues for '{raw}': {issues_good}")

    def test_release_check_guards_against_hand_bounce_and_instead_replacement(self) -> None:
        """Verifies captured->territory check requires 'release' without false positives."""
        raw_release = "Return all captured Heroes to owner's territory."
        ok_bad, issues_bad = verify_fact_matrix(raw_release, _make_ast_facts(actions={"withdraw"}))
        self.assertFalse(ok_bad)
        self.assertTrue(any("release" in msg for msg in issues_bad))

        ok_good, _ = verify_fact_matrix(raw_release, _make_ast_facts(actions={"release"}))
        self.assertTrue(ok_good)

        # Replacement trigger ('instead') stays withdraw, not release
        raw_legion = "If captured, return to territory instead."
        ok_legion, issues_legion = verify_fact_matrix(
            raw_legion, _make_ast_facts(actions={"withdraw"})
        )
        self.assertTrue(ok_legion, f"Unexpected issues: {issues_legion}")

        # Return captured card to owner's hand stays bounce, not release
        raw_sisera = (
            "Return up to 3 Canaanites in opponent's territory and/or captured Canaanites to owner's hand."
        )
        ok_sisera, issues_sisera = verify_fact_matrix(
            raw_sisera,
            _make_ast_facts(actions={"bounce"}, numbers={3}, max_values={3}),
        )
        self.assertTrue(ok_sisera, f"Unexpected issues: {issues_sisera}")


class TestRegV111DeterministicParser(unittest.TestCase):
    """Validates REG v11.1.0 deterministic parsing in scripts/08_parse_abilities.py."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.parser = importlib.import_module("08_parse_abilities")

    def test_nicodemus_cannot_be_blocked_by_disjunction(self) -> None:
        """Verifies 'Cannot be blocked by Pharisees or Sadducees.' parses to static paralyze."""
        logic, err = self.parser.parse_side_ability(
            "Nicodemus (Blue)", "top", "Cannot be blocked by Pharisees or Sadducees."
        )
        self.assertIsNone(err)
        self.assertIsNotNone(logic)
        self.assertEqual(len(logic.abilities), 1)
        ab = logic.abilities[0]
        self.assertEqual(ab.activation_mode, ActivationMode.STATIC)
        self.assertFalse(ab.is_optional)
        eff = ab.effects[0]
        self.assertEqual(eff.action, ActionVerb.PARALYZE)
        self.assertEqual(eff.effect_type, "ongoing")
        self.assertEqual(eff.duration, Duration.WHILE_CONDITION)
        self.assertEqual(eff.target.zone_owner, "opponent")
        self.assertEqual(eff.target.identifiers, ["Pharisee", "Sadducee"])

    def test_may_not_enter_battle_is_static_paralyze_and_not_optional(self) -> None:
        """Verifies 'may not enter battle' sets paralyze with is_optional=False."""
        logic, err = self.parser.parse_side_ability(
            "Test Card", "top", "Evil Characters may not enter battle."
        )
        self.assertIsNone(err)
        self.assertIsNotNone(logic)
        ab = logic.abilities[0]
        self.assertEqual(ab.activation_mode, ActivationMode.STATIC)
        self.assertFalse(ab.is_optional)
        self.assertEqual(ab.effects[0].action, ActionVerb.PARALYZE)

    def test_return_to_territory_distinguishes_release_and_withdraw(self) -> None:
        """Verifies captive returns parse to RELEASE while in-battle returns parse to WITHDRAW."""
        rel_logic, rel_err = self.parser.parse_side_ability(
            "Release Card", "top", "Return a captured Hero to owner's territory."
        )
        self.assertIsNone(rel_err)
        rel_eff = rel_logic.abilities[0].effects[0]
        self.assertEqual(rel_eff.action, ActionVerb.RELEASE)
        self.assertEqual(rel_eff.destination, Zone.TERRITORY)
        self.assertEqual(rel_eff.target.scope, [Zone.LAND_OF_BONDAGE])

        wdr_logic, wdr_err = self.parser.parse_side_ability(
            "Withdraw Card", "top", "Return an Evil Character to owner's territory."
        )
        self.assertIsNone(wdr_err)
        wdr_eff = wdr_logic.abilities[0].effects[0]
        self.assertEqual(wdr_eff.action, ActionVerb.WITHDRAW)
        self.assertEqual(wdr_eff.destination, Zone.TERRITORY)
        self.assertEqual(wdr_eff.target.scope, [Zone.BATTLE])

    def test_remove_to_hand_and_return_to_deck_positions(self) -> None:
        """Verifies REG v11.1.0 bounce/topdeck/underdeck return phrasings parse deterministically."""
        bounce_logic, err_b = self.parser.parse_side_ability(
            "Bounce Card", "top", "Remove an Evil Character to owner's hand."
        )
        self.assertIsNone(err_b)
        self.assertEqual(bounce_logic.abilities[0].effects[0].action, ActionVerb.BOUNCE)
        self.assertEqual(bounce_logic.abilities[0].effects[0].destination, Zone.HAND)

        top_logic, err_t = self.parser.parse_side_ability(
            "Topdeck Card", "top", "Return a Hero to top of deck."
        )
        self.assertIsNone(err_t)
        self.assertEqual(top_logic.abilities[0].effects[0].action, ActionVerb.TOPDECK)
        self.assertEqual(top_logic.abilities[0].effects[0].destination, Zone.DECK)
        self.assertEqual(top_logic.abilities[0].effects[0].destination_position, "top")

        bot_logic, err_u = self.parser.parse_side_ability(
            "Underdeck Card", "top", "Return a Hero to bottom of draw pile."
        )
        self.assertIsNone(err_u)
        self.assertEqual(bot_logic.abilities[0].effects[0].action, ActionVerb.UNDERDECK)
        self.assertEqual(bot_logic.abilities[0].effects[0].destination, Zone.DECK)
        self.assertEqual(bot_logic.abilities[0].effects[0].destination_position, "bottom")


class TestRegV111DistArtifacts(unittest.TestCase):
    """Validates REG v11.1.0 conformance across exported production artifacts."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.ast_constants = json.loads(
            (BASE_DIR / "data/dist/ast_constants.json").read_text(encoding="utf-8")
        )
        cls.cards_logic = json.loads(
            (BASE_DIR / "data/dist/cards_logic.json").read_text(encoding="utf-8")
        )

    def test_ast_constants_version_is_11_1_0(self) -> None:
        """Verifies ast_constants.json declares REG version 11.1.0 and required verbs."""
        self.assertEqual(self.ast_constants.get("version"), "11.1.0")
        verbs = set(self.ast_constants.get("action_verbs", []))
        self.assertTrue({"paralyze", "release", "bounce", "withdraw", "negate"}.issubset(verbs))

    def test_migrated_cards_in_cards_logic_conform_to_reg_11_1(self) -> None:
        """Verifies representative migrated cards across all REG v11.1.0 rule categories."""
        # Paralyze (enter battle) & consolidated Palsy
        self.assertIn("paralyze", _collect_actions(self.cards_logic["730143821"]))
        palsy_actions = _collect_actions(self.cards_logic["-1594714814"])
        self.assertEqual(palsy_actions, ["paralyze"])
        palsy_idents = self.cards_logic["-1594714814"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]["identifiers"]
        self.assertIn("until healed", palsy_idents)

        # Paralyze (cannot/may not be blocked by) including RAW Nicodemus & Scarlet Line
        self.assertEqual(_collect_actions(self.cards_logic["-27986015"]), ["paralyze"])
        self.assertEqual(_collect_actions(self.cards_logic["-1141879242"]), ["paralyze"])
        scarlet_eff = self.cards_logic["732467072"]["sides"]["top"]["abilities"][0]["effects"][0]
        self.assertEqual(scarlet_eff["action"], "paralyze")
        self.assertNotIn("protection_filter", scarlet_eff)
        self.assertEqual(scarlet_eff["target"]["gender"], "male")
        self.assertEqual(scarlet_eff["target"]["alignment"], "evil")

        # Has no effect -> negate
        self.assertEqual(_collect_actions(self.cards_logic["-1200816243"]), ["negate", "negate"])
        idols_eff = self.cards_logic["1033659989"]["sides"]["top"]["abilities"][1]["effects"][0]
        self.assertEqual(idols_eff["action"], "negate")
        self.assertEqual(idols_eff["target"]["target_type"], "card")

        # Release (captured -> territory) including Freeing Earthquake caught by fact_matrix
        self.assertIn("release", _collect_actions(self.cards_logic["1321962739"]))
        self.assertIn("release", _collect_actions(self.cards_logic["-750855855"]))
        self.assertEqual(_collect_actions(self.cards_logic["-142994480"], "shared"), ["release"])
        ezra_eff1 = self.cards_logic["-1355586689"]["sides"]["top"]["abilities"][0]["effects"][0]
        ezra_eff2 = self.cards_logic["-1355586689"]["sides"]["top"]["abilities"][0]["effects"][1]
        self.assertEqual(ezra_eff1["action"], "release")
        self.assertEqual(ezra_eff1["target"]["scope"], ["land_of_bondage"])
        self.assertEqual(ezra_eff2["action"], "withdraw")

        # Withdraw (in battle -> territory)
        self.assertEqual(_collect_actions(self.cards_logic["-1875886207"]), ["withdraw"])
        self.assertEqual(_collect_actions(self.cards_logic["1879127821"]), ["withdraw"])

        # Bounce (return to hand)
        self.assertIn("bounce", _collect_actions(self.cards_logic["891460711"]))
        self.assertIn("bounce", _collect_actions(self.cards_logic["1381610582"], "shared"))

        # Choose opponent -> opponent + territory
        asahel_eff = self.cards_logic["-1070093237"]["sides"]["top"]["abilities"][1]["effects"][0]
        self.assertEqual(asahel_eff["action"], "choose opponent")
        self.assertEqual(asahel_eff["target"]["zone_owner"], "opponent")
        self.assertEqual(asahel_eff["target"]["scope"], ["territory"])

        # Present -> ['hand', 'territory']
        darkness_present = self.cards_logic["-614244789"]["sides"]["top"]["abilities"][1]["effects"][0]
        self.assertEqual(darkness_present["action"], "present")
        self.assertEqual(darkness_present["target"]["scope"], ["hand", "territory"])


if __name__ == "__main__":
    unittest.main()
