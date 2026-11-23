"""Unit and integration tests for Phase 4 canonical TriggerEvent, trigger_subject, and trigger_source."""

from __future__ import annotations

import importlib.util
import json
import sys
import tempfile
import unittest
from pathlib import Path
from typing import Any, Dict, Iterable, List, Tuple
from unittest.mock import patch

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / "scripts"))

from models.enums import ActionVerb, ActivationMode, SelectionMode, TriggerEvent, Zone
from models.enums.trigger_event import CANONICAL_TRIGGER_EVENTS
from models.logic.ability import Ability
from models.logic.action_effect import ActionEffect
from models.logic.card_logic import CardSideLogic
from models.logic.target_selector import TargetSelector
from scripts.ability_decompiler import decompile_ability
from scripts.fact_matrix import extract_ast_facts
from scripts.migrations import migrate_phase4_triggers
from scripts.utils import finding_logger

_s10_spec = importlib.util.spec_from_file_location("stage10_verify_mod", BASE_DIR / "scripts" / "10_verify_logic.py")
assert _s10_spec and _s10_spec.loader
_s10 = importlib.util.module_from_spec(_s10_spec)
_s10_spec.loader.exec_module(_s10)
verify_card_logic = _s10.verify_card_logic

DATA_DIST_LOGIC = BASE_DIR / "data" / "dist" / "cards_logic.json"
DATA_DIST_CONSTANTS = BASE_DIR / "data" / "dist" / "ast_constants.json"


def _iter_abilities(logic_map: Dict[str, Any]) -> Iterable[Tuple[str, str, Dict[str, Any]]]:
    """Yields (card_id, side_key, ability_dict) across an exported cards_logic mapping."""
    for cid, card in logic_map.items():
        for sk, side in (card.get("sides") or {}).items():
            for ab in side.get("abilities") or []:
                yield cid, sk, ab


class TestPhase4TriggerModelsAndVerifier(unittest.TestCase):
    """Validates TriggerEvent schema enforcement, decompilation, and Stage 10 finding logs."""

    def test_ast_constants_exports_all_trigger_events(self) -> None:
        """data/dist/ast_constants.json exports the exact canonical TriggerEvent vocabulary."""
        constants = json.loads(DATA_DIST_CONSTANTS.read_text(encoding="utf-8"))
        self.assertIn("trigger_events", constants)
        self.assertEqual(constants["trigger_events"], list(CANONICAL_TRIGGER_EVENTS))
        for required in (
            "star_phase",
            "upkeep",
            "after_draw_phase",
            "on_turn_start",
            "after_battle",
            "end_of_turn",
            "on_rescued",
            "on_zero_toughness",
            "on_deck_empty",
            "would_be_discarded",
        ):
            self.assertIn(required, constants["trigger_events"])

    def test_ability_model_enforces_canonical_trigger_event_and_splits_legacy_filter(self) -> None:
        """Ability validates scalar/list TriggerEvent, maps legacy star/trigger_filter, and rejects prose."""
        ab_list = Ability(
            ability_id="dual_trig",
            activation_mode=ActivationMode.TRIGGERED,
            trigger_event=[TriggerEvent.ON_HARMED, TriggerEvent.ON_DEFEATED, TriggerEvent.ON_HARMED],
            trigger_subject=TargetSelector(target_type="hero"),
            effects=[ActionEffect(step=1, action=ActionVerb.DRAW)],
        )
        self.assertEqual(ab_list.trigger_event, [TriggerEvent.ON_HARMED, TriggerEvent.ON_DEFEATED])

        ab_single_wrapped = Ability.model_validate(
            {
                "ability_id": "legacy_test",
                "activation_mode": "triggered",
                "trigger_event": ["star"],
                "trigger_filter": {"target_type": "lost_soul"},
                "effects": [{"step": 1, "action": "underdeck"}],
            }
        )
        self.assertTrue(ab_single_wrapped.is_star)
        self.assertEqual(ab_single_wrapped.trigger_event, TriggerEvent.STAR_PHASE)
        self.assertIsNotNone(ab_single_wrapped.trigger_subject)
        self.assertEqual(ab_single_wrapped.trigger_subject.target_type, "lost_soul")  # type: ignore[union-attr]
        dumped = ab_single_wrapped.model_dump(mode="json", exclude_none=True)
        self.assertNotIn("trigger_filter", dumped)

        with self.assertRaises(ValueError):
            Ability.model_validate(
                {
                    "ability_id": "bad_trig",
                    "activation_mode": "triggered",
                    "trigger_event": "Son of God is played in battle",
                    "effects": [{"step": 1, "action": "draw"}],
                }
            )

    def test_decompiler_and_fact_matrix_handle_trigger_subject_source_and_lists(self) -> None:
        """Decompiler and fact_matrix support list trigger_event and trigger_subject/trigger_source."""
        ab = Ability(
            ability_id="test_or_trig",
            activation_mode=ActivationMode.TRIGGERED,
            trigger_event=[TriggerEvent.ON_BANISHED, TriggerEvent.ON_CAPTURED],
            trigger_subject=TargetSelector(target_type="hero", identifiers=["Revelation"]),
            trigger_source=TargetSelector(zone_owner="opponent", scope=[Zone.IN_PLAY], target_type="card"),
            effects=[ActionEffect(step=1, action=ActionVerb.DRAW)],
        )
        rendered = decompile_ability(ab)
        self.assertIn("on banished or on captured", rendered)
        facts = extract_ast_facts(CardSideLogic(abilities=[ab]))
        self.assertIn("revelation", facts["identifiers"])

    def test_stage10_flags_missing_and_unexpected_triggers_and_logs_finding(self) -> None:
        """Stage 10 flags missing trigger_event on triggered abilities and unexpected triggers on immediate ones."""
        payload = {
            "card_identifier": "999001",
            "sides": {
                "top": {
                    "abilities": [
                        {
                            "ability_id": "broken_triggered",
                            "activation_mode": "triggered",
                            "effects": [{"step": 1, "action": "draw"}],
                        },
                        {
                            "ability_id": "broken_immediate",
                            "activation_mode": "immediate",
                            "trigger_source": {"scope": ["hand"], "zone_owner": "opponent"},
                            "effects": [{"step": 1, "action": "negate"}],
                        },
                    ]
                }
            },
        }
        issues, _ = verify_card_logic("999001", payload, is_dual_card=False)
        joined = "\n".join(issues)
        self.assertIn("Missing required trigger_event", joined)
        self.assertIn("Unexpected trigger_event/trigger_subject/trigger_source", joined)

        with tempfile.TemporaryDirectory() as tmpdir:
            tmp_findings = Path(tmpdir) / "batch_findings.json"
            with patch.object(finding_logger, "FINDINGS_FILE", tmp_findings):
                finding_logger.log_finding(
                    "Test Card",
                    "MISSING_OR_INVALID_TRIGGER_EVENT",
                    joined,
                    resolved=False,
                    card_identifier="999001",
                )
                saved = json.loads(tmp_findings.read_text(encoding="utf-8"))
                self.assertIn("Test Card", saved)
                self.assertEqual(saved["Test Card"]["issue_type"], "MISSING_OR_INVALID_TRIGGER_EVENT")
                self.assertFalse(saved["Test Card"]["resolved"])


class TestPhase4ExportedDatasetInvariants(unittest.TestCase):
    """Validates Phase 4 trigger invariants across the entire production data/dist/cards_logic.json file."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.logic = json.loads(DATA_DIST_LOGIC.read_text(encoding="utf-8"))
        cls.canonical_set = set(CANONICAL_TRIGGER_EVENTS)

    def test_zero_missing_zero_non_canonical_and_zero_legacy_trigger_filter(self) -> None:
        """Every triggered ability has canonical TriggerEvent(s), non-triggered have none, and no trigger_filter remains."""
        for cid, sk, ab in _iter_abilities(self.logic):
            self.assertNotIn("trigger_filter", ab, f"{cid} {sk} {ab.get('ability_id')} still has legacy trigger_filter")
            mode = ab.get("activation_mode")
            te = ab.get("trigger_event")
            if mode == "triggered":
                self.assertIsNotNone(te, f"{cid} {sk} {ab.get('ability_id')} missing trigger_event")
                te_list = te if isinstance(te, list) else [te]
                self.assertTrue(te_list, f"{cid} {sk} {ab.get('ability_id')} has empty trigger_event")
                for item in te_list:
                    self.assertIn(item, self.canonical_set, f"{cid} {sk} {ab.get('ability_id')} invalid trigger {item!r}")
            else:
                self.assertIsNone(te, f"{cid} {sk} {ab.get('ability_id')} ({mode}) should not have trigger_event")
                self.assertIsNone(
                    ab.get("trigger_subject"), f"{cid} {sk} {ab.get('ability_id')} ({mode}) should not have trigger_subject"
                )
                self.assertIsNone(
                    ab.get("trigger_source"), f"{cid} {sk} {ab.get('ability_id')} ({mode}) should not have trigger_source"
                )

    def test_repaired_phase4_spot_checks(self) -> None:
        """Spot-checks representative Phase 4 trigger conversions and trigger_subject/trigger_source splits."""
        # Lost Soul Chaff (-840157467): on_rescue -> on_rescued + lost_soul subject
        chaff = self.logic["-840157467"]["sides"]["top"]["abilities"][0]
        self.assertEqual(chaff["trigger_event"], "on_rescued")
        self.assertEqual(chaff["trigger_subject"]["target_type"], "lost_soul")

        # Priests of Christ (RoJ AB) (-969385097): blocked_from_hand -> on_blocked + source scope=["hand"]
        poc = self.logic["-969385097"]["sides"]["top"]["abilities"][1]
        self.assertEqual(poc["trigger_event"], "on_blocked")
        self.assertEqual(poc["trigger_source"]["scope"], ["hand"])

        # Kingdoms of the World (D) (513165601) & Goshen (1459960641): after_draw_phase
        self.assertEqual(self.logic["513165601"]["sides"]["top"]["abilities"][0]["trigger_event"], "after_draw_phase")
        self.assertEqual(self.logic["1459960641"]["sides"]["top"]["abilities"][0]["trigger_event"], "after_draw_phase")

        # Storehouse (1809983858): discard_phase & preparation_phase
        sh_abs = self.logic["1809983858"]["sides"]["top"]["abilities"]
        self.assertEqual(sh_abs[0]["trigger_event"], "discard_phase")
        self.assertEqual(sh_abs[1]["trigger_event"], "preparation_phase")

        # King Zimri (-978550881): ab_3_discard fixed to triggered after_battle + automatic_self
        zimri_3 = self.logic["-978550881"]["sides"]["top"]["abilities"][2]
        self.assertEqual(zimri_3["activation_mode"], "triggered")
        self.assertEqual(zimri_3["trigger_event"], "after_battle")
        self.assertEqual(zimri_3["effects"][0]["target"]["selection_mode"], "automatic_self")

        # Missing triggers fixed: Benjamin (39561632), Devouring Birds (158154325), False Peace (226021839), The Heavenly Host (-1276287509)
        self.assertEqual(self.logic["39561632"]["sides"]["top"]["abilities"][1]["trigger_event"], "after_battle")
        self.assertEqual(self.logic["158154325"]["sides"]["top"]["abilities"][1]["trigger_event"], "after_battle")
        self.assertEqual(self.logic["226021839"]["sides"]["top"]["abilities"][1]["trigger_event"], "on_play")
        hh = self.logic["-1276287509"]["sides"]["top"]["abilities"][0]
        self.assertEqual(hh["trigger_event"], "on_attack")
        self.assertEqual(hh["trigger_subject"]["card_titles"], ["Heavenly Host Token"])

        # Composite OR-trigger & reclassified non-triggered
        self.assertEqual(
            self.logic["-160263637"]["sides"]["shared"]["abilities"][0]["trigger_event"],
            ["on_draw", "on_search"],
        )
        self.assertEqual(self.logic["1133140715"]["sides"]["top"]["abilities"][0]["activation_mode"], "immediate")
        self.assertEqual(self.logic["773830287"]["sides"]["top"]["abilities"][0]["activation_mode"], "triggered")
        self.assertEqual(self.logic["773830287"]["sides"]["top"]["abilities"][0]["trigger_event"], "on_play")

    def test_phase4_migration_is_idempotent(self) -> None:
        """Re-running migrate_phase4_triggers in dry-run mode reports 0 further modifications."""
        summary = migrate_phase4_triggers.run_migration(dry_run=True)
        self.assertEqual(summary["ai_modified"], 0)
        self.assertEqual(summary["raw_modified"], 0)
        self.assertEqual(summary["validation_errors"], [])


if __name__ == "__main__":
    unittest.main()
