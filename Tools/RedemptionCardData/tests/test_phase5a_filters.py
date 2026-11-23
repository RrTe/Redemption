"""Unit and integration tests for Phase 5a TargetSelector filters (exclude_self, state_filters, relative_filters, used_by)."""

from __future__ import annotations

import importlib.util
import json
import sys
import unittest
from pathlib import Path
from typing import Any, Dict, Iterable, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(BASE_DIR))
sys.path.insert(0, str(BASE_DIR / "scripts"))

from models.enums import ActionVerb, ActivationMode, SelectionMode, StateFilter, Zone
from models.enums.state_filter import CANONICAL_STATE_FILTERS
from models.logic.ability import Ability
from models.logic.action_effect import ActionEffect
from models.logic.card_logic import CardSideLogic
from models.logic.relative_filter import (
    RELATIVE_FILTER_ATTRIBUTES,
    RELATIVE_FILTER_REFERENCES,
    RELATIVE_FILTER_RELATIONS,
    RelativeFilter,
    RelativeRefStep,
)
from models.logic.target_selector import TargetSelector
from scripts.ability_decompiler import decompile_target
from scripts.fact_matrix import extract_ast_facts, verify_fact_matrix
from scripts.migrations import migrate_phase5a_filters
from scripts.utils.card_linker import CardLinker, link_side_logic_targets
from scripts.utils.target_parser import build_target_selector
from scripts.utils.target_phase5a_helper import UNMIGRATED_PHASE5A_IDENTIFIER_TOKENS

DATA_DIST_LOGIC = BASE_DIR / "data" / "dist" / "cards_logic.json"
DATA_DIST_CONSTANTS = BASE_DIR / "data" / "dist" / "ast_constants.json"

_s10_spec = importlib.util.spec_from_file_location("stage10_verify_mod_p5a", BASE_DIR / "scripts" / "10_verify_logic.py")
assert _s10_spec and _s10_spec.loader
_s10 = importlib.util.module_from_spec(_s10_spec)
_s10_spec.loader.exec_module(_s10)


def _iter_selectors_recursive(node: Any, path: str = "") -> Iterable[Tuple[str, Dict[str, Any]]]:
    """Recursively yields (path, selector_dict) including any_of, dynamic selectors, and used_by."""
    if not isinstance(node, dict):
        return
    yield path, node
    for idx, br in enumerate(node.get("any_of") or []):
        yield from _iter_selectors_recursive(br, f"{path}.any_of[{idx}]")
    dyn = ((node.get("count") or {}).get("dynamic") or {}).get("selector")
    if isinstance(dyn, dict):
        yield from _iter_selectors_recursive(dyn, f"{path}.count.dynamic.selector")
    ub = node.get("used_by")
    if isinstance(ub, dict):
        yield from _iter_selectors_recursive(ub, f"{path}.used_by")


class TestPhase5aModelsAndHelpers(unittest.TestCase):
    """Validates Phase 5a enums, models, constants export, decompiler, fact matrix, and parser."""

    def test_ast_constants_exports_phase5a_vocabularies(self) -> None:
        """data/dist/ast_constants.json exports state_filters and relative_filter vocabularies."""
        constants = json.loads(DATA_DIST_CONSTANTS.read_text(encoding="utf-8"))
        self.assertEqual(constants["state_filters"], list(CANONICAL_STATE_FILTERS))
        self.assertEqual(constants["relative_filter_attributes"], list(RELATIVE_FILTER_ATTRIBUTES))
        self.assertEqual(constants["relative_filter_relations"], list(RELATIVE_FILTER_RELATIONS))
        self.assertEqual(constants["relative_filter_references"], list(RELATIVE_FILTER_REFERENCES))

    def test_models_linker_decompiler_and_fact_matrix_roundtrip(self) -> None:
        """RelativeFilter, StateFilter, exclude_self, and used_by serialize, link, decompile, and pass fact matrix."""
        sel = TargetSelector(
            selection_mode=SelectionMode.AUTOMATIC_ALL,
            zone_owner="controller",
            scope=[Zone.IN_PLAY],
            target_type="enhancement",
            exclude_self=True,
            state_filters=[StateFilter.SINGLE_BRIGADE, StateFilter.PLAYED_THIS_BATTLE],
            relative_filters=[
                RelativeFilter(attribute="brigade", relation="same", reference="selected"),
                RelativeFilter(attribute="strength", relation=">", reference=RelativeRefStep(ref_step=1)),
            ],
            used_by=TargetSelector(card_titles=["Job"]),
        )
        ab = Ability(
            ability_id="test_5a",
            activation_mode=ActivationMode.STATIC,
            effects=[ActionEffect(step=1, action=ActionVerb.NEGATE, target=sel)],
        )
        side = CardSideLogic(abilities=[ab])
        linker = CardLinker([{"Id": "500", "CardSides": {"top": {"Name": "Job", "Type": "Hero"}}}])
        link_side_logic_targets(side, linker)
        self.assertEqual(sel.used_by.target_card_ids, ["500"])  # type: ignore[union-attr]

        rendered = decompile_target(sel)
        self.assertIn("other", rendered)
        self.assertIn("single brigade", rendered)
        self.assertIn("used by Job", rendered)

        self_used = TargetSelector(used_by="self", target_type="enhancement")
        facts = extract_ast_facts(
            CardSideLogic(
                abilities=[
                    Ability(
                        ability_id="test_used_self",
                        activation_mode=ActivationMode.STATIC,
                        effects=[ActionEffect(step=1, action=ActionVerb.PROTECT, target=self_used)],
                    )
                ]
            )
        )
        ok, errs = verify_fact_matrix("Protect Enhancements used by this card.", facts)
        self.assertTrue(ok, f"Unexpected fact matrix errors: {errs}")

    def test_target_parser_and_stage10_audit(self) -> None:
        """Stage 08 target_parser extracts StateFilter directly and Stage 10 flags leftover tokens."""
        occ = build_target_selector("an occupied site in opponent's territory")
        self.assertEqual(occ.target_type, "site")
        self.assertIn(StateFilter.OCCUPIED, occ.state_filters)
        self.assertEqual(occ.identifiers, [])

        single = build_target_selector("your single-brigade Hero in territory")
        self.assertIn(StateFilter.SINGLE_BRIGADE, single.state_filters)

        bad_sel = TargetSelector(identifiers=["except this card", "captured"])
        issues: list[str] = []
        _s10._audit_selector_invariants(bad_sel, "test_bad", "top", issues)
        self.assertGreaterEqual(len(issues), 2)


class TestPhase5aExportedDatasetInvariants(unittest.TestCase):
    """Validates Phase 5a invariants across the exported data/dist/cards_logic.json file."""

    @classmethod
    def setUpClass(cls) -> None:
        cls.logic = json.loads(DATA_DIST_LOGIC.read_text(encoding="utf-8"))

    def test_zero_unmigrated_phase5a_tokens_in_export(self) -> None:
        """No selector anywhere in cards_logic.json may retain unmigrated Phase 5a identifier strings."""
        for cid, card in self.logic.items():
            for sk, side in (card.get("sides") or {}).items():
                for ab in side.get("abilities") or []:
                    sels = []
                    if ab.get("trigger_subject"):
                        sels.append(("trigger_subject", ab["trigger_subject"]))
                    if ab.get("trigger_source"):
                        sels.append(("trigger_source", ab["trigger_source"]))
                    for i, c in enumerate(ab.get("conditions") or []):
                        if c.get("selector"):
                            sels.append((f"conditions[{i}]", c["selector"]))
                    for k in ("costs", "effects"):
                        for i, it in enumerate(ab.get(k) or []):
                            if it.get("target"):
                                sels.append((f"{k}[{i}]", it["target"]))
                            for cs in ((it.get("protection_filter") or {}).get("card_sources") or []):
                                sels.append((f"{k}[{i}].pf", cs))
                    for rname, rsel in sels:
                        for p, sel in _iter_selectors_recursive(rsel, rname):
                            for ident in sel.get("identifiers") or []:
                                self.assertNotIn(
                                    str(ident).strip().lower(),
                                    UNMIGRATED_PHASE5A_IDENTIFIER_TOKENS,
                                    f"{cid} {sk} {ab.get('ability_id')} {p} kept Phase 5a token {ident!r}",
                                )

    def test_repaired_phase5a_spot_checks(self) -> None:
        """Spot-checks representative exclude_self, state_filters, relative_filters, and used_by cases."""
        # Mary of Bethany (-191162101): other -> exclude_self=True
        mary_t = self.logic["-191162101"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]
        self.assertTrue(mary_t["exclude_self"])
        self.assertNotIn("other", mary_t["identifiers"])

        # I am Redemption (-142994480): captured -> state_filters=['captured']
        red_t = self.logic["-142994480"]["sides"]["shared"]["abilities"][0]["effects"][0]["target"]
        self.assertIn("captured", red_t["state_filters"])
        self.assertEqual(red_t["identifiers"], [])

        # Michal (271289061): connected with him -> ORDIR 'Connected with David' (not used_by)
        mich_t = self.logic["271289061"]["sides"]["top"]["abilities"][0]["effects"][1]["target"]
        self.assertEqual(mich_t["identifiers"], ["Connected with David"])
        self.assertIsNone(mich_t.get("used_by"))

        # Nicodemus, the Seeker (1502721132): used by this card -> used_by='self'
        nic_t = self.logic["1502721132"]["sides"]["bottom"]["abilities"][1]["effects"][0]["target"]
        self.assertEqual(nic_t["used_by"], "self")
        self.assertEqual(nic_t["identifiers"], [])

        # False Accusations (GoC) (-1607249934): selected brigade -> relative_filters
        fa_t = self.logic["-1607249934"]["sides"]["top"]["abilities"][1]["effects"][0]["target"]
        self.assertTrue(any(rf["attribute"] == "brigade" and rf["reference"] == "selected" for rf in fa_t["relative_filters"]))

        # Forest Fire (Roots) (1010454351): opposite alignment -> relative_filters
        ff_t = self.logic["1010454351"]["sides"]["shared"]["abilities"][0]["effects"][0]["target"]
        self.assertTrue(any(rf["attribute"] == "alignment" and rf["relation"] == "opposite" for rf in ff_t["relative_filters"]))

        # Lost Soul "O.T. Only" (-945890825): 'this' -> automatic_self
        ot_t = self.logic["-945890825"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]
        self.assertEqual(ot_t["selection_mode"], "automatic_self")
        self.assertEqual(ot_t["identifiers"], [])

        # Miracle of Healing (598324512): poisoned or diseased -> 2 any_of branches
        mh_t = self.logic["598324512"]["sides"]["top"]["abilities"][0]["effects"][0]["target"]
        self.assertEqual(len(mh_t["any_of"]), 2)
        self.assertEqual(mh_t["any_of"][0]["state_filters"], ["poisoned"])
        self.assertEqual(mh_t["any_of"][1]["state_filters"], ["diseased"])

    def test_phase5a_migration_is_idempotent(self) -> None:
        """Re-running migrate_phase5a_filters in dry-run mode reports 0 modifications."""
        summary = migrate_phase5a_filters.run_migration(dry_run=True)
        self.assertEqual(summary["ai_modified"], 0)
        self.assertEqual(summary["raw_modified"], 0)
        self.assertEqual(summary["validation_errors"], [])


if __name__ == "__main__":
    unittest.main()
