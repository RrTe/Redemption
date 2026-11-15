"""Unit and dataset integrity tests for conditional 'Cannot be ...' protection clauses."""

from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, List, Set

_PROJECT_ROOT = Path(__file__).resolve().parents[1]
_SCRIPTS_DIR = _PROJECT_ROOT / "scripts"
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from models.enums import ActivationMode, ConditionType, Zone  # noqa: E402
from utils.ability_patterns import (  # noqa: E402
    CONDITIONAL_PROTECTION_SENTENCE_RE,
    PROTECTION_REGEX,
    extract_conditional_protection_abilities,
    extract_modifiers_from_text,
    protect_abbreviations,
)
from utils.card_helpers import get_side_field, get_star_ability  # noqa: E402

_STAGE08_SPEC = importlib.util.spec_from_file_location("stage08", _SCRIPTS_DIR / "08_parse_abilities.py")
assert _STAGE08_SPEC is not None and _STAGE08_SPEC.loader is not None
_STAGE08 = importlib.util.module_from_spec(_STAGE08_SPEC)
_STAGE08_SPEC.loader.exec_module(_STAGE08)

_DATA_DIR = _PROJECT_ROOT / "data"
_FUZZY_PATH = _DATA_DIR / "cards_extended_with_ordir_fuzzy.json"
_RAW_PATH = _DATA_DIR / "card_abilities_raw.json"
_AI_PATH = _DATA_DIR / "ai_generated_abilities.json"
_DIST_LOGIC_PATH = _DATA_DIR / "dist" / "cards_logic.json"

_PROT_MOD_TYPES: Set[str] = {
    "cannot_be_negated",
    "cannot_be_interrupted",
    "cannot_be_prevented",
}


class TestConditionalCannotBeParser(unittest.TestCase):
    """Tests deterministic parsing of conditional vs unconditional protection clauses."""

    def test_extract_modifiers_ignores_conditional_protection(self) -> None:
        """Unconditional clauses extract modifiers; conditional clauses remain untouched.

        Args:
            None.

        Returns:
            None.
        """
        cleaned_u, mods_u = extract_modifiers_from_text("Discard a Hero. Cannot be negated.")
        self.assertEqual(cleaned_u, "Discard a Hero")
        self.assertEqual([m.modifier_type.value for m in mods_u], ["cannot_be_negated"])

        cleaned_multi, mods_multi = extract_modifiers_from_text("Cannot be interrupted or prevented.")
        self.assertEqual(cleaned_multi, "")
        self.assertEqual(
            [m.modifier_type.value for m in mods_multi],
            ["cannot_be_interrupted", "cannot_be_prevented"],
        )

        for raw in (
            "Search deck for a Hero. Cannot be negated if used by a prophet.",
            "Protect Daniel from capture. Cannot be negated by an evil card.",
            "May band to a Hero. Cannot be negated unless Hosea is in play.",
            "Interrupt the battle. Cannot be interrupted by O.T. Evil Characters.",
        ):
            cleaned_c, mods_c = extract_modifiers_from_text(raw)
            self.assertEqual(cleaned_c, raw.rstrip("."))
            self.assertEqual(mods_c, [], msg=f"Incorrectly stripped conditional clause from: {raw}")

    def test_extract_conditional_protection_all_categories(self) -> None:
        """Parses if-used-by, count, hand_advantage, unless, and by-source protection gates.

        Args:
            None.

        Returns:
            None.
        """
        # 1. if used by <actor> (compound titles)
        rem1, abs1 = extract_conditional_protection_abilities(
            "Negate a Hero. Cannot be negated if used by Priscilla or Aquila.",
            start_idx=2,
        )
        self.assertEqual(rem1, "Negate a Hero")
        self.assertEqual(len(abs1), 1)
        self.assertEqual(abs1[0].activation_mode, ActivationMode.STATIC)
        self.assertEqual(abs1[0].conditions[0].condition_type, ConditionType.ZONE_CHECK)
        self.assertEqual(abs1[0].conditions[0].selector.card_titles, ["Priscilla", "Aquila"])
        self.assertEqual(abs1[0].modifiers[0].modifier_type.value, "cannot_be_negated")

        # 2. if more than one Hero is in battle
        _, abs2 = extract_conditional_protection_abilities(
            "Withdraw a Hero. Cannot be negated if more than one Hero is in battle.",
            start_idx=2,
        )
        self.assertEqual(abs2[0].conditions[0].condition_type, ConditionType.COUNT_COMPARISON)
        self.assertEqual(abs2[0].conditions[0].operator, ">")
        self.assertEqual(abs2[0].conditions[0].value, 1)
        self.assertEqual(abs2[0].conditions[0].selector.target_type, "hero")
        self.assertEqual(abs2[0].conditions[0].selector.scope, [Zone.BATTLE])

        # 3. if opponent has more cards in hand than you
        _, abs3 = extract_conditional_protection_abilities(
            "Cannot be negated if opponent has more cards in hand than you.",
            start_idx=3,
        )
        self.assertEqual(abs3[0].conditions[0].condition_type, ConditionType.HAND_ADVANTAGE)
        self.assertEqual(abs3[0].conditions[0].selector.zone_owner, "opponent")
        self.assertEqual(abs3[0].conditions[0].selector.scope, [Zone.HAND])

        # 4. unless Hosea is in play
        _, abs4 = extract_conditional_protection_abilities(
            "May band to an Israelite. Cannot be negated unless Hosea is in play.",
            start_idx=2,
        )
        self.assertEqual(abs4[0].conditions[0].operator, "==")
        self.assertEqual(abs4[0].conditions[0].value, 0)
        self.assertEqual(abs4[0].conditions[0].selector.card_titles, ["Hosea"])

        # 5. by O.T. Evil Characters (abbreviation protection must preserve full phrase)
        _, abs5 = extract_conditional_protection_abilities(
            "Discard a Site. Cannot be interrupted by O.T. Evil Characters.",
            start_idx=2,
        )
        self.assertEqual(abs5[0].modifiers[0].modifier_type.value, "cannot_be_interrupted")
        self.assertEqual(abs5[0].conditions[0].selector.testament, "OT")
        self.assertEqual(abs5[0].conditions[0].selector.target_type, "evil_character")
        self.assertEqual(abs5[0].conditions[0].selector.alignment, "evil")

        # 6. by a human Hero
        _, abs6 = extract_conditional_protection_abilities(
            "Negate an opponent's card. Cannot be prevented by a human Hero.",
            start_idx=2,
        )
        self.assertEqual(abs6[0].modifiers[0].modifier_type.value, "cannot_be_prevented")
        self.assertIs(abs6[0].conditions[0].selector.is_human, True)
        self.assertEqual(abs6[0].conditions[0].selector.target_type, "hero")

        # 7. compound by <source> if <cond>
        _, abs7 = extract_conditional_protection_abilities(
            "Cannot be negated by a good card if the Egypt site is in play.",
            start_idx=2,
        )
        self.assertEqual(len(abs7[0].conditions), 2)
        self.assertEqual(abs7[0].conditions[0].selector.alignment, "good")
        self.assertEqual(abs7[0].conditions[1].selector.card_titles, ["Egypt"])

    def test_parse_side_ability_preserves_main_ability_flags(self) -> None:
        """Stage 8 parser keeps main effects negatable/preventable when protection is gated.

        Args:
            None.

        Returns:
            None.
        """
        side_logic, err = _STAGE08.parse_side_ability(
            "Plot to Kill",
            "top",
            "Negate and discard a good card. Cannot be prevented if used by a unique Pharisee or Sadducee.",
        )
        self.assertIsNone(err)
        self.assertIsNotNone(side_logic)
        assert side_logic is not None
        self.assertEqual(side_logic.modifiers, [])
        self.assertEqual(len(side_logic.abilities), 2)

        main_ab, prot_ab = side_logic.abilities
        self.assertTrue(main_ab.is_preventable)
        self.assertTrue(main_ab.is_negatable)
        self.assertTrue(main_ab.is_interruptible)
        self.assertEqual(prot_ab.ability_id, "ab_2_cannot_be_prevented")
        self.assertEqual(prot_ab.activation_mode, ActivationMode.STATIC)
        self.assertEqual(prot_ab.effects, [])
        self.assertIs(prot_ab.conditions[0].selector.is_generic, False)
        self.assertEqual(prot_ab.conditions[0].selector.identifiers, ["Pharisee", "Sadducee"])


class TestDatasetConditionalCannotBeIntegrity(unittest.TestCase):
    """Validates production AST datasets for conditional 'Cannot be ...' modeling."""

    @classmethod
    def setUpClass(cls) -> None:
        """Loads extended metadata, raw AST cache, AI cache, and dist cards_logic.json.

        Args:
            None.

        Returns:
            None.
        """
        with _FUZZY_PATH.open("r", encoding="utf-8") as handle:
            cls.ext_cards: List[Dict[str, Any]] = json.load(handle)["cards"]
        with _RAW_PATH.open("r", encoding="utf-8") as handle:
            raw_json = json.load(handle)
            cls.raw_cards: Dict[str, Any] = raw_json.get("cards", raw_json)
        with _AI_PATH.open("r", encoding="utf-8") as handle:
            cls.ai_cards: Dict[str, Any] = json.load(handle)
        with _DIST_LOGIC_PATH.open("r", encoding="utf-8") as handle:
            cls.dist_logic: Dict[str, Any] = json.load(handle)

    def _raw_side_texts(self) -> Dict[str, Dict[str, str]]:
        """Maps card IDs to raw per-side special ability texts aligned with Stage 8/10."""
        mapping: Dict[str, Dict[str, str]] = {}
        for card in self.ext_cards:
            cid = str(card["Id"])
            sides = card.get("CardSides", {}) or {}
            has_bottom = isinstance(sides.get("bottom"), dict)
            per_side: Dict[str, List[str]] = {}
            star_sa = (get_star_ability(card) or "").strip()
            shared_sa = (get_side_field(card, "shared", "SpecialAbility") or "").strip()
            top_sa = (get_side_field(card, "top", "SpecialAbility") or "").strip()
            bottom_sa = (get_side_field(card, "bottom", "SpecialAbility") or "").strip() if has_bottom else ""
            if star_sa:
                per_side.setdefault("shared" if has_bottom else "top", []).append(star_sa)
            if shared_sa and not shared_sa.lower().startswith(("star:", "(star)")):
                per_side.setdefault("shared" if has_bottom else "top", []).append(shared_sa)
            if top_sa:
                per_side.setdefault("top", []).append(top_sa)
            if bottom_sa:
                per_side.setdefault("bottom", []).append(bottom_sa)
            mapping[cid] = {sk: ". ".join(parts) for sk, parts in per_side.items()}
        return mapping

    def test_no_pure_conditional_card_retains_unconditional_flags_or_side_modifiers(self) -> None:
        """Checks all pure self-conditional 'Cannot be ...' sides in dist/cards_logic.json.

        Args:
            None.

        Returns:
            None.
        """
        raw_texts = self._raw_side_texts()
        checked = 0
        violations: List[str] = []

        for cid, card_logic in self.dist_logic.items():
            for sk, side_data in (card_logic.get("sides") or {}).items():
                ai_entry = self.ai_cards.get(f"{cid}_{sk}")
                if isinstance(ai_entry, dict) and ai_entry.get("raw_ability"):
                    raw_text = str(ai_entry["raw_ability"])
                else:
                    raw_text = raw_texts.get(cid, {}).get(sk) or raw_texts.get(cid, {}).get("shared") or ""

                if not raw_text:
                    continue
                masked = protect_abbreviations(raw_text)
                cond_matches = list(CONDITIONAL_PROTECTION_SENTENCE_RE.finditer(masked))
                if not cond_matches:
                    continue

                checked += 1
                rem_after_cond = CONDITIONAL_PROTECTION_SENTENCE_RE.sub("", masked)
                if PROTECTION_REGEX.search(rem_after_cond):
                    continue

                expected_mods: Set[str] = set()
                for m in cond_matches:
                    p = m.group(2).lower()
                    if "negat" in p:
                        expected_mods.add("cannot_be_negated")
                    if "interrupt" in p:
                        expected_mods.add("cannot_be_interrupted")
                    if "prevent" in p:
                        expected_mods.add("cannot_be_prevented")

                side_mod_types = {
                    m.get("modifier_type") for m in (side_data.get("modifiers") or []) if isinstance(m, dict)
                }
                if side_mod_types & expected_mods:
                    violations.append(f"{cid}:{sk} still has unconditional side.modifiers={side_mod_types}")

                abilities = side_data.get("abilities") or []
                prot_abs = [
                    ab for ab in abilities
                    if ab.get("activation_mode") == "static"
                    and not ab.get("effects")
                    and ab.get("conditions")
                    and ({m.get("modifier_type") for m in (ab.get("modifiers") or [])} & expected_mods)
                ]
                if not prot_abs:
                    violations.append(f"{cid}:{sk} missing dedicated static conditional protection ability")

                main_abs = [ab for ab in abilities if ab not in prot_abs]
                for mab in main_abs:
                    if "cannot_be_negated" in expected_mods and mab.get("is_negatable") is False:
                        violations.append(f"{cid}:{sk}:{mab.get('ability_id')} has is_negatable=False")
                    if "cannot_be_interrupted" in expected_mods and mab.get("is_interruptible") is False:
                        violations.append(f"{cid}:{sk}:{mab.get('ability_id')} has is_interruptible=False")
                    if "cannot_be_prevented" in expected_mods and mab.get("is_preventable") is False:
                        violations.append(f"{cid}:{sk}:{mab.get('ability_id')} has is_preventable=False")
                    ab_mods = {m.get("modifier_type") for m in (mab.get("modifiers") or [])}
                    if ab_mods & expected_mods:
                        violations.append(f"{cid}:{sk}:{mab.get('ability_id')} retains modifiers={ab_mods}")

                for pab in prot_abs:
                    for cond in pab.get("conditions") or []:
                        sel = cond.get("selector") or {}
                        if sel.get("card_titles") and not sel.get("target_card_ids"):
                            violations.append(
                                f"{cid}:{sk}:{pab.get('ability_id')} unresolved card_titles={sel.get('card_titles')}"
                            )

        self.assertGreater(checked, 300)
        self.assertEqual(violations, [], msg="Conditional Cannot be violations:\n" + "\n".join(violations))

    def test_repaired_reference_cards_across_categories(self) -> None:
        """Checks repaired structures on key cards across all conditional categories.

        Args:
            None.

        Returns:
            None.
        """
        # Plot to Kill (if used by unique Pharisee or Sadducee)
        plot = self.dist_logic["-1278294591"]["sides"]["top"]
        self.assertEqual(plot.get("modifiers", []), [])
        self.assertTrue(plot["abilities"][0]["is_preventable"])
        self.assertIs(plot["abilities"][1]["conditions"][0]["selector"]["is_generic"], False)

        # Search (if used by a prophet)
        search_card = self.dist_logic["639284769"]["sides"]["top"]
        self.assertTrue(search_card["abilities"][0]["is_negatable"])
        self.assertEqual(search_card["abilities"][1]["conditions"][0]["selector"]["identifiers"], ["Prophet"])

        # Gomer (unless Hosea is in play)
        gomer = self.dist_logic["1304409445"]["sides"]["top"]
        self.assertTrue(gomer["abilities"][0]["is_negatable"])
        self.assertEqual(gomer["abilities"][1]["conditions"][0]["value"], 0)
        self.assertEqual(gomer["abilities"][1]["conditions"][0]["selector"]["card_titles"], ["Hosea"])

        # Dragon's Minions & Behemoth & Adam (by human / human Hero)
        dragon = self.dist_logic["872321191"]["sides"]["top"]
        self.assertTrue(all(ab["is_negatable"] for ab in dragon["abilities"]))
        self.assertIs(dragon["abilities"][-1]["conditions"][0]["selector"]["is_human"], True)

        behemoth = self.dist_logic["-1646887871"]["sides"]["shared"]
        self.assertTrue(behemoth["abilities"][0]["is_preventable"])
        self.assertIs(behemoth["abilities"][1]["conditions"][0]["selector"]["is_human"], True)

        adam = self.dist_logic["-381378507"]["sides"]["top"]
        self.assertTrue(all(ab["is_interruptible"] for ab in adam["abilities"]))
        self.assertIs(adam["abilities"][-1]["conditions"][0]["selector"]["is_human"], True)

        # Outsiders (hand_advantage) & Abandonment (count_comparison > 1)
        outsiders = self.dist_logic["-1899569338"]["sides"]["top"]
        self.assertEqual(outsiders["abilities"][-1]["conditions"][0]["condition_type"], "hand_advantage")

        abandonment = self.dist_logic["3752659"]["sides"]["top"]
        self.assertEqual(abandonment["abilities"][-1]["conditions"][0]["condition_type"], "count_comparison")
        self.assertEqual(abandonment["abilities"][-1]["conditions"][0]["value"], 1)

        # Bathsheba & Faith of Barak & Nahum & Beast from the Sea & Beheaded
        bathsheba = self.dist_logic["590591310"]["sides"]["top"]
        self.assertEqual(bathsheba["abilities"][0]["conditions"], [])
        self.assertEqual(bathsheba["abilities"][1]["conditions"], [])
        self.assertEqual(bathsheba["abilities"][2]["conditions"][0]["selector"]["card_titles"], ["Uriah"])

        faith_barak = self.dist_logic["428173092"]["sides"]["top"]
        self.assertEqual(faith_barak["abilities"][1]["conditions"], [])
        self.assertEqual(faith_barak["abilities"][2]["conditions"][0]["value"], 1)

        beast = self.dist_logic["-1356503623"]["sides"]["top"]
        self.assertEqual(len(beast["abilities"]), 2)
        self.assertEqual(beast["abilities"][0]["conditions"], [])

        beheaded = self.dist_logic["1686944990"]["sides"]["top"]
        self.assertEqual(beheaded["abilities"][0]["conditions"], [])
        self.assertEqual(
            [c.get("selector", {}).get("card_titles") for c in beheaded["abilities"][1]["conditions"]],
            [["Beheaded"]],
        )


if __name__ == "__main__":
    unittest.main()
