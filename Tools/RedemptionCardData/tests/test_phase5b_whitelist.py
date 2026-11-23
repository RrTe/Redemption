"""Unit and dataset-wide verification tests for Phase 5b excludes, ability targets, and ORDIR whitelist."""

from __future__ import annotations

import importlib
import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict, Iterable, List, Set, Tuple
from unittest.mock import patch

_PROJECT_ROOT = Path(__file__).resolve().parent.parent
_SCRIPTS_DIR = _PROJECT_ROOT / "scripts"
if str(_PROJECT_ROOT) not in sys.path:
    sys.path.insert(0, str(_PROJECT_ROOT))
if str(_SCRIPTS_DIR) not in sys.path:
    sys.path.insert(0, str(_SCRIPTS_DIR))

from models.enums.action_verb import ActionVerb  # noqa: E402
from models.logic.target_decomposer import try_decompose_phrase  # noqa: E402
from models.logic.target_selector import TargetSelector, TargetSelectorBranch  # noqa: E402
stage10 = importlib.import_module("scripts.10_verify_logic")  # noqa: E402
from utils import finding_logger  # noqa: E402
from utils.target_parser import build_target_selector  # noqa: E402
from utils.target_phase5b_helper import (  # noqa: E402
    PRINTED_SELECTOR_IDENTIFIERS,
    get_default_ordir_lookup,
)

_DIST_LOGIC = _PROJECT_ROOT / "data" / "dist" / "cards_logic.json"
_DIST_CONSTANTS = _PROJECT_ROOT / "data" / "dist" / "ast_constants.json"


def _iter_all_selectors(node: Any, path: str = "") -> Iterable[Tuple[str, Dict[str, Any]]]:
    """Recursively yields selector dictionaries including exclude, used_by, any_of, and dynamic selectors."""
    if isinstance(node, dict):
        if "identifiers" in node or "target_type" in node or "selection_mode" in node:
            yield path, node
        for key, val in node.items():
            if isinstance(val, (dict, list)):
                yield from _iter_all_selectors(val, f"{path}.{key}" if path else key)
    elif isinstance(node, list):
        for idx, item in enumerate(node):
            yield from _iter_all_selectors(item, f"{path}[{idx}]")


class TestPhase5bSchemaAndNormalization(unittest.TestCase):
    """Tests Pydantic schema rules, parser promotions, and ORDIR atomicity for Phase 5b."""

    def test_ability_filter_actions_preserve_direction_and_reject_unknown(self) -> None:
        """ability_target_actions and exclude_ability_actions normalize verbs and reject 'unknown'."""
        sel = TargetSelector(
            targets_abilities=True,
            ability_target_actions=["band", "repel", "decrease"],
            exclude_ability_actions=["banding", "increase"],
        )
        self.assertTrue(sel.targets_abilities)
        self.assertEqual(
            sel.ability_target_actions,
            [ActionVerb.BAND, ActionVerb.WITHDRAW, ActionVerb.DECREASE],
        )
        self.assertEqual(
            sel.exclude_ability_actions,
            [ActionVerb.BAND, ActionVerb.INCREASE],
        )

        with self.assertRaises(ValueError):
            TargetSelector(ability_target_actions=["unknown"])

        with self.assertRaises(ValueError):
            TargetSelectorBranch(exclude_ability_actions=["not_a_real_verb"])

    def test_exclude_forbids_nesting_and_count(self) -> None:
        """TargetSelector.exclude forbids nested excludes and count constraints."""
        valid = TargetSelector(
            target_type="card",
            exclude=TargetSelector(target_type="lost_soul"),
        )
        self.assertEqual(valid.exclude.target_type, "lost_soul")  # type: ignore[union-attr]

        with self.assertRaises(ValueError):
            TargetSelector(
                target_type="card",
                exclude=TargetSelector(
                    target_type="character",
                    exclude=TargetSelector(is_human=True),
                ),
            )

        with self.assertRaises(ValueError):
            TargetSelector(
                target_type="card",
                exclude=TargetSelector(
                    target_type="hero",
                    count={"fixed_value": 1},
                ),
            )

    def test_ordir_and_printed_identifiers_not_split_by_decomposer(self) -> None:
        """Canonical multi-word ORDIR categories stay atomic in TargetSelector and try_decompose_phrase."""
        for canonical in (
            "Wilderness Character",
            "Nativity Card",
            "Roman Soldier",
            "Hebrews Card",
            "Judges Card",
            "Empty Tomb Hero",
            "Armor of God Enhancement",
        ):
            self.assertIsNone(try_decompose_phrase(canonical), f"Decomposer unexpectedly split {canonical!r}")
            sel = TargetSelector(target_type="hero", identifiers=[canonical])
            self.assertEqual(sel.identifiers, [canonical])

    def test_stage08_parser_promotes_phase5b_excludes_and_abilities(self) -> None:
        """build_target_selector extracts excludes and ability targets cleanly in Stage 08."""
        sel_ex = build_target_selector("an evil card (except a human)")
        self.assertEqual(sel_ex.identifiers, [])
        self.assertIsNotNone(sel_ex.exclude)
        self.assertIs(sel_ex.exclude.is_human, True)  # type: ignore[union-attr]

        sel_ab = build_target_selector("good band abilities")
        self.assertTrue(sel_ab.targets_abilities)
        self.assertEqual(sel_ab.ability_target_actions, [ActionVerb.BAND])
        self.assertEqual(sel_ab.identifiers, [])


class TestPhase5bStage10WhitelistGate(unittest.TestCase):
    """Tests Stage 10 ORDIR whitelist enforcement and finding_logger integration."""

    def _build_card_payload(
        self,
        ident_val: str,
        in_exclude: bool = False,
        card_name: str = "Test Audit Card",
    ) -> Dict[str, Any]:
        """Creates a minimal valid CardLogic payload for Stage 10 auditing."""
        target_dict: Dict[str, Any] = {
            "selection_mode": "automatic_all",
            "zone_owner": "opponent",
            "scope": ["in_play"],
            "target_type": "character",
            "identifiers": [] if in_exclude else [ident_val],
        }
        if in_exclude:
            target_dict["exclude"] = {
                "selection_mode": "automatic_all",
                "zone_owner": "both",
                "scope": ["in_play"],
                "target_type": "character",
                "identifiers": [ident_val],
            }
        return {
            "card_identifier": "9990001",
            "card_name": card_name,
            "set": "Test",
            "sides": {
                "top": {
                    "abilities": [
                        {
                            "ability_id": "ab_1_negate",
                            "activation_mode": "static",
                            "is_optional": False,
                            "effects": [
                                {
                                    "step": 1,
                                    "action": "negate",
                                    "effect_type": "ongoing",
                                    "duration": "permanent",
                                    "target": target_dict,
                                }
                            ],
                        }
                    ]
                }
            },
        }

    def test_stage10_accepts_ordir_and_printed_whitelist(self) -> None:
        """Canonical ORDIR tags and printed allowlist items pass Stage 10 without issues."""
        for valid_ident in ("Angel", "Wilderness Character", "Token", "Bible icon"):
            payload = self._build_card_payload(valid_ident)
            issues, _ = stage10.verify_card_logic("9990001", payload)
            self.assertEqual(issues, [], msg=f"Unexpected Stage 10 issue for {valid_ident!r}: {issues}")

    def test_stage10_rejects_and_logs_unknown_identifier(self) -> None:
        """Unknown free-text identifiers trigger Stage 10 failure and UNKNOWN_SELECTOR_IDENTIFIER finding."""
        with tempfile.TemporaryDirectory() as tmp_dir:
            tmp_findings = Path(tmp_dir) / "batch_findings.json"
            with patch.object(finding_logger, "FINDINGS_FILE", tmp_findings):
                for in_exclude, cname in (
                    (False, "Test Audit Card Direct"),
                    (True, "Test Audit Card Exclude"),
                ):
                    payload = self._build_card_payload(
                        "unstructured free text clause",
                        in_exclude=in_exclude,
                        card_name=cname,
                    )
                    issues, _ = stage10.verify_card_logic("9990001", payload)
                    self.assertTrue(
                        any("Unknown non-ORDIR selector identifier" in i for i in issues),
                        msg=f"Expected UNKNOWN_SELECTOR_IDENTIFIER issue (in_exclude={in_exclude}), got {issues}",
                    )
                logged = json.loads(tmp_findings.read_text(encoding="utf-8"))
                self.assertEqual(set(logged.keys()), {"Test Audit Card Direct", "Test Audit Card Exclude"})
                self.assertEqual(logged["Test Audit Card Direct"]["issue_type"], "UNKNOWN_SELECTOR_IDENTIFIER")
                self.assertFalse(logged["Test Audit Card Direct"]["resolved"])
                self.assertEqual(logged["Test Audit Card Exclude"]["issue_type"], "UNKNOWN_SELECTOR_IDENTIFIER")
                self.assertFalse(logged["Test Audit Card Exclude"]["resolved"])


class TestPhase5bExportedDatasetInvariants(unittest.TestCase):
    """Dataset-wide verification against exported data/dist artifacts."""

    @classmethod
    def setUpClass(cls) -> None:
        """Loads production cards_logic.json, ast_constants.json, and canonical ORDIR set."""
        cls.logic: Dict[str, Any] = json.loads(_DIST_LOGIC.read_text(encoding="utf-8"))
        cls.constants: Dict[str, Any] = json.loads(_DIST_CONSTANTS.read_text(encoding="utf-8"))
        cls.allowed_exact: Set[str] = set(get_default_ordir_lookup().values()) | set(PRINTED_SELECTOR_IDENTIFIERS)

    def test_ast_constants_exports_phase5b_metadata(self) -> None:
        """ast_constants.json exports printed_selector_identifiers and signed ability filter verbs."""
        self.assertEqual(
            self.constants.get("printed_selector_identifiers"),
            list(PRINTED_SELECTOR_IDENTIFIERS),
        )
        ab_actions = self.constants.get("ability_filter_actions") or []
        self.assertIn("decrease", ab_actions)
        self.assertIn("increase", ab_actions)

    def test_zero_unknown_identifiers_across_entire_dataset(self) -> None:
        """Every identifier in every exported selector belongs strictly to ORDIR or PRINTED_SELECTOR_IDENTIFIERS."""
        unknown: List[str] = []
        for cid, entry in self.logic.items():
            for path, sel in _iter_all_selectors(entry.get("sides") or {}):
                for ident in sel.get("identifiers") or []:
                    if ident not in self.allowed_exact:
                        unknown.append(f"{cid} {path}: {ident!r}")
        self.assertEqual(unknown, [], msg=f"Found non-allowlisted identifiers: {unknown[:20]}")

    def test_phase5b_spot_checks(self) -> None:
        """Spot-checks representative Phase 5b excludes, ability targets, and ORDIR canonicalizations."""
        # Anthropophobia (-953497044): except a human -> exclude.is_human=True
        anth = self.logic["-953497044"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]
        self.assertTrue(anth["exclude"]["is_human"])
        self.assertEqual(anth["identifiers"], [])

        # Abraham's Servant to Ur (LoC) (-530005396): except band abilities -> exclude_ability_actions=['band']
        abraham = self.logic["-530005396"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]
        self.assertEqual(abraham["exclude_ability_actions"], ["band"])

        # Deluders (1324527282): Negate band abilities -> targets_abilities=True, ability_target_actions=['band']
        deluders = self.logic["1324527282"]["sides"]["top"]["abilities"][1]["effects"][0]["target"]
        self.assertTrue(deluders["targets_abilities"])
        self.assertEqual(deluders["ability_target_actions"], ["band"])

        # Clinging to Power (GoC) (-1379520782): card WITH a band or protect ability -> targets_abilities=False
        clinging = self.logic["-1379520782"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]
        self.assertFalse(clinging["targets_abilities"])
        self.assertEqual(sorted(clinging["ability_target_actions"]), ["band", "protect"])

        # The Afflicted (782890259): except their first one each turn -> trigger_subject.exclude
        afflicted = self.logic["782890259"]["sides"]["top"]["abilities"][1]["trigger_subject"]
        self.assertIn("first_played_this_turn", afflicted["exclude"]["state_filters"])

        # Zadok Annoints Solomon (141826046): brigade other than teal -> exclude.brigades=['Teal']
        zadok = self.logic["141826046"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]
        self.assertEqual(zadok["brigades"], [])
        self.assertEqual(zadok["exclude"]["brigades"], ["Teal"])

        # Forty Nights (-259751829): canonical ORDIR 'Wilderness Character'
        forty = self.logic["-259751829"]["sides"]["top"]["abilities"][1]["effects"][0]["target"]
        self.assertEqual(forty["identifiers"], ["Wilderness Character"])

        # Wild Animals (962378423): except 1 -> dynamic offset -1
        wa = self.logic["962378423"]["sides"]["top"]["abilities"][1]["effects"][0]["target"]
        self.assertEqual(wa["count"]["dynamic"]["offset"], -1)


if __name__ == "__main__":
    unittest.main()
