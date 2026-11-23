"""Phase 3 AST migration: structured any_of disjunctions and target_card_ids cleanup.

Eliminates mixed card_titles/identifiers selectors, partial or mistyped group
target_card_ids, container/host titles on entity selectors, title-substring
remnants, and free-text 'or' fragments across ai_generated_abilities.json and
card_abilities_raw.json while preserving idempotency.
"""

from __future__ import annotations

import argparse
import copy
import json
import sys
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

BASE_DIR = Path(__file__).resolve().parent.parent.parent
if str(BASE_DIR) not in sys.path:
    sys.path.insert(0, str(BASE_DIR))

from models.logic.card_logic import CardSideLogic  # noqa: E402
from scripts.utils.card_linker import CardLinker, _link_selector_targets  # noqa: E402

AI_ABILITIES_PATH = BASE_DIR / "data" / "ai_generated_abilities.json"
RAW_ABILITIES_PATH = BASE_DIR / "data" / "card_abilities_raw.json"
EXTENDED_CARDS_PATH = BASE_DIR / "data" / "cards_extended_with_ordir_fuzzy.json"


def _walk_selectors(node: Any, fn: Callable[[Dict[str, Any]], None]) -> None:
    """Applies a callback to every selector-like dict inside an AST node recursively.

    Args:
        node: Arbitrary nested AST dict or list.
        fn: Mutation function invoked on each selector dictionary.

    Returns:
        None.
    """
    if isinstance(node, dict):
        if any(k in node for k in ("selection_mode", "target_type", "card_titles", "identifiers", "target_card_ids", "any_of")):
            fn(node)
        for v in node.values():
            _walk_selectors(v, fn)
    elif isinstance(node, list):
        for item in node:
            _walk_selectors(item, fn)


def _branch(
    *,
    zone_owner: Optional[str] = None,
    scope: Optional[List[str]] = None,
    target_type: Optional[str] = None,
    brigades: Optional[List[str]] = None,
    alignment: Optional[str] = None,
    gender: Optional[str] = None,
    is_generic: Optional[bool] = None,
    is_human: Optional[bool] = None,
    classes: Optional[List[str]] = None,
    testament: Optional[str] = None,
    references: Optional[List[str]] = None,
    identifiers: Optional[List[str]] = None,
    card_titles: Optional[List[str]] = None,
) -> Dict[str, Any]:
    """Builds a minimal dictionary representing a TargetSelectorBranch.

    Args:
        zone_owner: Optional owner override.
        scope: Optional zone list override.
        target_type: Canonical card type for this branch.
        brigades: Optional brigade filter list.
        alignment: Optional alignment override ('good', 'evil', 'neutral').
        gender: Optional gender filter.
        is_generic: Optional generic character flag.
        is_human: Optional human flag.
        classes: Optional card classes list.
        testament: Optional testament override.
        references: Optional scripture reference list.
        identifiers: Optional ORDIR/state identifier list.
        card_titles: Optional card title list.

    Returns:
        Compact branch dictionary accepted by TargetSelectorBranch.
    """
    out: Dict[str, Any] = {}
    for k, v in (
        ("zone_owner", zone_owner),
        ("scope", scope),
        ("target_type", target_type),
        ("brigades", brigades),
        ("alignment", alignment),
        ("gender", gender),
        ("is_generic", is_generic),
        ("is_human", is_human),
        ("classes", classes),
        ("testament", testament),
        ("references", references),
        ("identifiers", identifiers),
        ("card_titles", card_titles),
    ):
        if v is not None:
            out[k] = v
    return out


def _set_any_of(
    sel: Dict[str, Any],
    branches: List[Dict[str, Any]],
    *,
    target_type: Optional[str] = None,
    clear_target_type: bool = False,
    alignment: Optional[str] = None,
    clear_alignment: bool = False,
    clear_gender: bool = False,
    clear_brigades: bool = False,
    clear_classes: bool = False,
    clear_references: bool = False,
    keep_identifiers: Optional[List[str]] = None,
    scope: Optional[List[str]] = None,
) -> None:
    """Rewrites a selector to use structured any_of branches while clearing mixed fields.

    Args:
        sel: Target selector dictionary to update in place.
        branches: List of at least two branch dicts for any_of.
        target_type: Optional explicit parent target_type to assign.
        clear_target_type: Whether to clear target_type to None on parent.
        alignment: Optional explicit parent alignment to assign.
        clear_alignment: Whether to clear alignment to None on parent.
        clear_gender: Whether to clear gender to None on parent.
        clear_brigades: Whether to empty brigades on parent.
        clear_classes: Whether to empty classes on parent.
        clear_references: Whether to empty references on parent.
        keep_identifiers: Identifiers to retain on parent (defaults to empty list).
        scope: Optional scope list override on parent.

    Returns:
        None.
    """
    if target_type is not None:
        sel["target_type"] = target_type
    elif clear_target_type:
        sel["target_type"] = None
    if alignment is not None:
        sel["alignment"] = alignment
    elif clear_alignment:
        sel["alignment"] = None
    if clear_gender:
        sel["gender"] = None
    if clear_brigades:
        sel["brigades"] = []
    if clear_classes:
        sel["classes"] = []
    if clear_references:
        sel["references"] = []
    if scope is not None:
        sel["scope"] = scope
    sel["identifiers"] = list(keep_identifiers or [])
    sel["card_titles"] = []
    sel["target_card_ids"] = []
    sel["any_of"] = branches


def _split_top_or_bottom_abilities(side: Dict[str, Any], card_id: str) -> None:
    """Splits deck 'top or bottom' choice abilities into automatic_next/automatic_last pairs.

    Args:
        side: Side AST dictionary containing 'abilities'.
        card_id: Card ID string for selecting exact card migration behavior.

    Returns:
        None.
    """
    new_abilities: List[Dict[str, Any]] = []
    changed = False
    for ab in side.get("abilities") or []:
        ab_id = ab.get("ability_id", "")
        should_split = False
        for ef in ab.get("effects") or []:
            t = ef.get("target") or {}
            idents_low = [str(x).lower() for x in (t.get("identifiers") or [])]
            if any(x in ("top or bottom", "top or bottom card of deck") for x in idents_low):
                should_split = True
                break
        if not should_split:
            new_abilities.append(ab)
            continue

        changed = True
        existing_cg = ab.get("choice_group") or "choice_1"
        base_id = ab_id.removesuffix("_top").removesuffix("_bottom")
        for suffix, mode in (("top", "automatic_next"), ("bottom", "automatic_last")):
            clone = copy.deepcopy(ab)
            clone["ability_id"] = f"{base_id}_{suffix}"
            clone["choice_group"] = existing_cg
            for ef in clone.get("effects") or []:
                t = ef.get("target") or {}
                idents = t.get("identifiers") or []
                if any(str(x).lower() in ("top or bottom", "top or bottom card of deck") for x in idents):
                    t["selection_mode"] = mode
                    t["identifiers"] = [
                        x
                        for x in idents
                        if str(x).lower() not in ("top or bottom", "top or bottom card of deck")
                    ]
            new_abilities.append(clone)

    if changed:
        side["abilities"] = new_abilities


def _migrate_side_phase3(card_id: str, side_key: str, side: Dict[str, Any]) -> None:
    """Applies all Phase 3 AST normalizations and any_of migrations to a single card side.

    Args:
        card_id: Card ID string.
        side_key: Side name ('top', 'bottom', or 'shared').
        side: Side AST dictionary to normalize in place.

    Returns:
        None.
    """
    abilities = side.get("abilities") or []

    # Global per-selector fixes (title string normalizations, generic self/chained cleanup)
    def _global_sel_fix(sel: Dict[str, Any]) -> None:
        idents = sel.get("identifiers") or []
        if idents:
            updated = []
            for ident in idents:
                if ident == "Joseph in title or reference":
                    if "Joseph in the Title or Scripture Verse" not in updated:
                        updated.append("Joseph in the Title or Scripture Verse")
                else:
                    updated.append(ident)
            sel["identifiers"] = updated

    _walk_selectors(side, _global_sel_fix)

    # ---- Card-specific Section 1 fixes (mistyped targets & missing card_titles) ----
    if card_id == "968734370":
        for ab in abilities:
            if ab.get("ability_id") in ("protect_meek_lost_souls_from_rescue", "star_underdeck_meek_lost_soul"):
                ab["effects"][0]["target"]["target_type"] = "lost_soul"

    elif card_id == "-622696180":
        for ab in abilities:
            if ab.get("ability_id") == "play_lost_soul_from_deck":
                ab["effects"][0]["target"]["target_type"] = "lost_soul"

    elif card_id == "-1885107806":
        for ab in abilities:
            if ab.get("ability_id") == "aaron_staff_trigger" and len(ab.get("effects") or []) > 1:
                t = ab["effects"][1]["target"]
                t["target_type"] = "lost_soul"
                t["alignment"] = None

    elif card_id == "-1792286304":
        for ab in abilities:
            if ab.get("ability_id") == "protect_lost_souls":
                ab["effects"][0]["target"]["target_type"] = "lost_soul"

    elif card_id == "828111890":
        for ab in abilities:
            if ab.get("ability_id") == "set_aside_corinth_heroes" and len(ab.get("effects") or []) > 2:
                ab["effects"][2]["target"]["target_type"] = "lost_soul"

    elif card_id == "858470180":
        for ab in abilities:
            if ab.get("ability_id") == "play_lost_soul_from_deck":
                t = ab["effects"][0]["target"]
                t["target_type"] = "lost_soul"
                t["alignment"] = None

    elif card_id == "-1565624288":
        for ab in abilities:
            if ab.get("ability_id") == "aroch_ability":
                ab["effects"][0]["target"]["target_type"] = "lost_soul"

    elif card_id == "184024256":
        for ab in abilities:
            if ab.get("ability_id") == "arrest_in_getsemane_ability":
                _set_any_of(
                    ab["effects"][0]["target"],
                    [
                        _branch(target_type="character", card_titles=["Judas"]),
                        _branch(target_type="character", identifiers=["Sadducee"]),
                    ],
                )
                ab["effects"][1]["target"]["target_type"] = "lost_soul"

    elif card_id == "383853753":
        for ab in abilities:
            if ab.get("ability_id") in (
                "broken_covenant_cost_evilhand_discard_covenant",
                "broken_covenant_cost_deckrandom_discard_covenant",
            ):
                ab["effects"][0]["target"]["target_type"] = "covenant"

    elif card_id == "460780034":
        for ab in abilities:
            if ab.get("ability_id") == "reaper_negate_discard_covenant":
                for ef in ab.get("effects") or []:
                    ef["target"]["target_type"] = "covenant"

    elif card_id == "-1860747907":
        for ab in abilities:
            if ab.get("ability_id") == "discard_covenant_if_evil_king_blocks":
                ab["effects"][0]["target"]["target_type"] = "covenant"
            if ab.get("ability_id") in (
                "discard_covenant_if_evil_king_blocks",
                "exchange_lost_souls_if_evil_king_blocks",
            ):
                cond_sel = ab["conditions"][0]["selector"]
                if not cond_sel.get("any_of"):
                    _set_any_of(
                        cond_sel,
                        [
                            _branch(target_type="character", alignment="evil", identifiers=["King"]),
                            _branch(target_type="character", alignment="evil", identifiers=["Prophet"]),
                            _branch(target_type="character", alignment="evil", identifiers=["Priest"]),
                        ],
                    )

    elif card_id == "-229708149":
        for ab in abilities:
            if ab.get("ability_id") == "negate_and_underdeck_curse_or_idol":
                _set_any_of(
                    ab["effects"][0]["target"],
                    [
                        _branch(target_type="curse", alignment="evil"),
                        _branch(target_type="artifact", identifiers=["Idol"]),
                    ],
                    clear_target_type=True,
                    clear_alignment=True,
                )

    elif card_id == "-393048385":
        for ab in abilities:
            if ab.get("ability_id") == "discard_king_zechariah":
                t = ab["effects"][0]["target"]
                t["references"] = []
                t["identifiers"] = []
                t["card_titles"] = ["King Zechariah"]

    elif card_id == "428851935":
        for ab in abilities:
            if ab.get("ability_id") == "cannot_be_converted":
                t = ab["effects"][0]["target"]
                t["references"] = []
                t["identifiers"] = []
                t["card_titles"] = []

    # ---- Card-specific Section 2 & 3 AI fixes ----
    elif card_id == "202621487":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if t.get("card_titles") == ["Peter"] and "Centurion" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="hero", alignment="good", card_titles=["Peter"]),
                            _branch(target_type="hero", alignment="good", identifiers=["Centurion"]),
                        ],
                    )

    elif card_id in ("-55716512", "1211833271", "1879814433"):
        for ab in abilities:
            for cond in ab.get("conditions") or []:
                sel = cond.get("selector") or {}
                if sel.get("card_titles") == ["Isaiah"] and "Assyrian" in (sel.get("identifiers") or []):
                    _set_any_of(
                        sel,
                        [
                            _branch(target_type="character", card_titles=["Isaiah"]),
                            _branch(target_type="character", identifiers=["Assyrian"]),
                        ],
                    )
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if "single-color Site, Artifact, or evil card" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="site", identifiers=["single-brigade"]),
                            _branch(target_type="artifact"),
                            _branch(target_type="card", alignment="evil"),
                        ],
                        clear_target_type=True,
                    )

    elif card_id == "-1778827021":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if t.get("card_titles") == ["Peter"] and "Angel" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="hero", alignment="good", card_titles=["Peter"]),
                            _branch(target_type="hero", alignment="good", references=["Acts"], identifiers=["Angel"]),
                        ],
                        clear_references=True,
                    )

    elif card_id in ("444556450", "-1014428160"):
        for ab in abilities:
            for cond in ab.get("conditions") or []:
                sel = cond.get("selector") or {}
                if sel.get("card_titles") == ["Ezekiel"] and "Babylonian" in (sel.get("identifiers") or []):
                    _set_any_of(
                        sel,
                        [
                            _branch(target_type="character", card_titles=["Ezekiel"]),
                            _branch(target_type="character", identifiers=["Babylonian"]),
                        ],
                    )

    elif card_id == "-1244688528":
        for ab in abilities:
            for cond in ab.get("conditions") or []:
                sel = cond.get("selector") or {}
                if sel.get("card_titles") == ["Lion's Den"] and "Animal" in (sel.get("identifiers") or []):
                    _set_any_of(
                        sel,
                        [
                            _branch(target_type="character", identifiers=["Animal"]),
                            _branch(target_type="fortress", card_titles=["Lion's Den"]),
                        ],
                        clear_target_type=True,
                    )

    elif card_id == "611947904":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if t.get("card_titles") == ["Zechariah"] and "High Priest" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="character", card_titles=["Zechariah"]),
                            _branch(
                                target_type="character",
                                identifiers=["Zerubbabel's Temple Priest", "High Priest"],
                            ),
                        ],
                    )

    elif card_id == "-680597886":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if t.get("card_titles") == ["High Priest's Palace"] and "Sadducee" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="fortress", card_titles=["High Priest's Palace"]),
                            _branch(target_type="character", identifiers=["Sadducee"]),
                        ],
                        clear_target_type=True,
                    )

    elif card_id == "585022171":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if t.get("card_titles") == ["Moses"] and "Tabernacle Priest" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="hero", alignment="good", card_titles=["Moses"]),
                            _branch(target_type="hero", alignment="good", identifiers=["Tabernacle Priest"]),
                        ],
                    )

    elif card_id == "-1729265264":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if t.get("card_titles") == ["Cherubim"] and "Prophet" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="character", card_titles=["Cherubim"]),
                            _branch(target_type="character", brigades=["Green"], identifiers=["Prophet"]),
                            _branch(target_type="character", brigades=["Teal"], identifiers=["Priest"]),
                        ],
                        clear_brigades=True,
                    )

    elif card_id in ("686497646", "1872157418"):
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if set(t.get("card_titles") or []) == {"Goshen", "Storehouse"} and "Son of Jacob" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(card_titles=["Goshen", "Storehouse"]),
                            _branch(target_type="character", identifiers=["Son of Jacob"]),
                        ],
                        clear_target_type=True,
                    )

    elif card_id == "-2111206559":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if t.get("card_titles") == ["Belshazzar's Banquet"] and "Temple Artifact" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="artifact", identifiers=["Temple Artifact"]),
                            _branch(target_type="fortress", card_titles=["Belshazzar's Banquet"]),
                        ],
                        clear_target_type=True,
                    )

    elif card_id == "-1947929700":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if t.get("card_titles") == ["King Pekah"] and "Syrian" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="character", card_titles=["King Pekah"]),
                            _branch(target_type="character", identifiers=["Syrian"]),
                        ],
                    )

    elif card_id == "-2120749271":
        for ab in abilities:
            for c in ab.get("costs") or []:
                t = c.get("target") or {}
                if t.get("card_titles") == ["Nineveh"] and "Assyrian" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(card_titles=["Nineveh"]),
                            _branch(target_type="character", identifiers=["Assyrian"]),
                        ],
                        clear_target_type=True,
                    )

    elif card_id == "-36784495":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if t.get("card_titles") == ["Philip's Daughters"] and any(
                    str(x).lower() == "deacon" for x in (t.get("identifiers") or [])
                ):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="hero", alignment="good", identifiers=["Deacon"]),
                            _branch(target_type="hero", alignment="good", card_titles=["Philip's Daughters"]),
                        ],
                    )

    elif card_id == "-1729702217":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if t.get("card_titles") == ["Syrian Marauders"] and "Syrian" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(
                                target_type="evil_character",
                                alignment="evil",
                                classes=["Warrior"],
                                identifiers=["Syrian"],
                            ),
                            _branch(target_type="evil_character", alignment="evil", card_titles=["Syrian Marauders"]),
                        ],
                        clear_classes=True,
                    )

    elif card_id == "-1880424718":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if t.get("card_titles") == ["Aristarchus"] and "Missionary" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="hero", alignment="good", card_titles=["Aristarchus"]),
                            _branch(target_type="hero", alignment="good", identifiers=["Missionary"]),
                        ],
                    )

    elif card_id == "484231532":
        for ab in abilities:
            tf = ab.get("trigger_filter") or {}
            if tf.get("card_titles") == ["Solomon"] and "Solomon's Temple Priest" in (tf.get("identifiers") or []):
                _set_any_of(
                    tf,
                    [
                        _branch(target_type="character", identifiers=["Solomon's Temple Priest"]),
                        _branch(target_type="character", identifiers=["King of Judah"]),
                        _branch(target_type="character", card_titles=["Solomon"]),
                    ],
                )

    elif card_id == "-1885910936":
        for ab in abilities:
            for cond in ab.get("conditions") or []:
                sel = cond.get("selector") or {}
                if sel.get("card_titles") == ["Hosea"] and "Animal" in (sel.get("identifiers") or []):
                    _set_any_of(
                        sel,
                        [
                            _branch(target_type="character", card_titles=["Hosea"]),
                            _branch(target_type="character", identifiers=["Animal"]),
                        ],
                    )

    elif card_id == "-617195554":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if t.get("card_titles") == ["Hebron"] and "Canaanite" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(card_titles=["Hebron"]),
                            _branch(target_type="character", identifiers=["Canaanite", "Giant"]),
                        ],
                        clear_target_type=True,
                    )

    elif card_id == "-1140834244":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if t.get("card_titles") == ["Den of Thieves"] and any(
                    str(x).lower() == "thief" for x in (t.get("identifiers") or [])
                ):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="character", identifiers=["Thief"]),
                            _branch(card_titles=["Den of Thieves"]),
                        ],
                        clear_target_type=True,
                    )

    elif card_id in ("910984939", "-320805128"):
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if t.get("card_titles") == ["Judas Iscariot"] and "Sadducee" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="evil_character", alignment="evil", identifiers=["Sadducee"]),
                            _branch(target_type="evil_character", alignment="evil", identifiers=["Pharisee"]),
                            _branch(target_type="evil_character", alignment="evil", card_titles=["Judas Iscariot"]),
                        ],
                    )

    elif card_id == "1936832551":
        for ab in abilities:
            for cond in ab.get("conditions") or []:
                sel = cond.get("selector") or {}
                if sel.get("card_titles") == ["Asherah Pole"] and "Idol" in (sel.get("identifiers") or []):
                    _set_any_of(
                        sel,
                        [
                            _branch(target_type="artifact", card_titles=["Asherah Pole"]),
                            _branch(target_type="artifact", identifiers=["Idol"]),
                        ],
                    )

    elif card_id in ("1163275753", "1529202396"):
        for ab in abilities:
            for ef in ab.get("effects") or []:
                pf = ef.get("protection_filter") or {}
                for cs in pf.get("card_sources") or []:
                    if cs.get("card_titles") == ["Son of God"] and cs.get("identifiers"):
                        _set_any_of(
                            cs,
                            [
                                _branch(target_type="hero", alignment="good", gender="female"),
                                _branch(card_titles=["Son of God"]),
                            ],
                            clear_target_type=True,
                            clear_alignment=True,
                            clear_gender=True,
                        )

    elif card_id == "2056616352":
        for ab in abilities:
            if ab.get("ability_id") == "negate_abilities_on_good_cards":
                t = ab["effects"][0]["target"]
                if set(t.get("card_titles") or []) == {"David's Harp", "Chariots of Fire"}:
                    _set_any_of(
                        t,
                        [
                            _branch(card_titles=["David's Harp", "Chariots of Fire"]),
                            _branch(alignment="good", identifiers=["withdraw"]),
                        ],
                        clear_alignment=True,
                    )

    elif card_id == "422383239":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if set(t.get("identifiers") or []) == {"Pharisee", "Sadducee"} and not t.get("any_of"):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="character", alignment="evil", identifiers=["Pharisee"]),
                            _branch(target_type="character", alignment="evil", identifiers=["Sadducee"]),
                        ],
                    )

    elif card_id in ("2068819044", "730143821", "1864595454", "-832897936", "1721325920", "865202550", "-949129590"):
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if card_id == "2068819044" and t.get("card_titles") == ["David"]:
                    t["identifiers"] = [x for x in (t.get("identifiers") or []) if x not in ("cannot enter battle", "battle")]
                elif card_id in ("730143821", "1864595454") and t.get("card_titles") == ["David"]:
                    t["identifiers"] = [x for x in (t.get("identifiers") or []) if x != "enter battle"]
                elif card_id == "-832897936" and t.get("card_titles") == ["Paul"]:
                    t["identifiers"] = [x for x in (t.get("identifiers") or []) if x != "half"]
                elif card_id == "1721325920" and t.get("card_titles") == ["Dragon Raid"]:
                    t["identifiers"] = [x for x in (t.get("identifiers") or []) if x != "cannot enter battle"]
                elif card_id == "865202550" and set(t.get("card_titles") or []) == {"The Tabernacle", "Solomon's Temple"}:
                    t["identifiers"] = [x for x in (t.get("identifiers") or []) if x != "target"]
                elif card_id == "-949129590" and t.get("card_titles") == ["Gideon's 300"]:
                    t["identifiers"] = [x for x in (t.get("identifiers") or []) if x != "300"]

    elif card_id == "-1879988445":
        for ab in abilities:
            if ab.get("ability_id") == "capture_joseph_if_pit" and len(ab.get("effects") or []) > 1:
                t = ab["effects"][1]["target"]
                t["identifiers"] = [x for x in (t.get("identifiers") or []) if x != "placed onto Pit of Dothan"]

    elif card_id == "24735900":
        for ab in abilities:
            if ab.get("ability_id") == "admiral_negate_kotw_protect":
                t = ab["effects"][0]["target"]
                t["identifiers"] = [x for x in (t.get("identifiers") or []) if x != "Kingdoms of this World"]

    elif card_id == "-1276287509":
        for ab in abilities:
            tf = ab.get("trigger_filter")
            if tf and tf.get("card_titles") == ["Heavenly Host"]:
                tf["card_titles"] = ["Heavenly Host Token"]
                tf["identifiers"] = [x for x in (tf.get("identifiers") or []) if x != "Token"]

    elif card_id == "255628321":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if "Samaritan" in (t.get("identifiers") or []):
                    t["identifiers"] = [x for x in (t.get("identifiers") or []) if x != "Samaritan"]
                    titles = list(t.get("card_titles") or [])
                    if "Good Samaritan" not in titles:
                        idx = 1 if len(titles) >= 1 else 0
                        titles.insert(idx, "Good Samaritan")
                    t["card_titles"] = titles

    elif card_id in ("-1212670062", "-348654687"):
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if "martyr in discard pile" in (t.get("identifiers") or []):
                    t["identifiers"] = [x for x in (t.get("identifiers") or []) if x != "martyr in discard pile"]

    elif card_id == "143946224":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if t.get("card_titles") == ["Solomon's Temple"] and "Priest" in (t.get("identifiers") or []):
                    t["card_titles"] = []
                    t["target_card_ids"] = []
                    t["identifiers"] = ["Solomon's Temple Priest"]

    elif card_id == "1787706276":
        for ab in abilities:
            for cond in ab.get("conditions") or []:
                sel = cond.get("selector") or {}
                if sel.get("card_titles") == ["Blood of the Lamb"]:
                    sel["card_titles"] = []
                    sel["target_card_ids"] = []

    elif card_id == "-1329656198":
        for ab in abilities:
            if ab.get("ability_id") in ("protect_herods_from_band", "grant_cannot_be_negated_to_withdraw_abilities"):
                t = ab["effects"][0]["target"]
                t["target_type"] = "character"
                t["alignment"] = None

    elif card_id == "-695342366":
        for ab in abilities:
            if ab.get("ability_id") == "pharaohs_daughter_site_access":
                t = ab["effects"][0]["target"]
                t["card_titles"] = []
                t["target_card_ids"] = []
                t["identifiers"] = []

    elif card_id == "-766928600":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if "site that has the word Prison in the title" in (t.get("identifiers") or []):
                    t["identifiers"] = [
                        "held at Prison-title site" if x == "site that has the word Prison in the title" else x
                        for x in (t.get("identifiers") or [])
                    ]

    elif card_id == "-756939123":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if "from hand, The Darkness or Tartaros" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(scope=["hand"], target_type="evil_character", alignment="evil", identifiers=["face down"]),
                            _branch(
                                scope=["set_aside"],
                                target_type="evil_character",
                                alignment="evil",
                                identifiers=["face down", "in The Darkness"],
                            ),
                            _branch(
                                scope=["in_play"],
                                target_type="evil_character",
                                alignment="evil",
                                identifiers=["face down", "on Tartaros"],
                            ),
                        ],
                    )

    elif card_id == "550281601":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if t.get("card_titles") == ["Tartaros"] and "Demon" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(
                                scope=["in_play"],
                                target_type="evil_character",
                                alignment="evil",
                                identifiers=["Demon", "on Tartaros"],
                            ),
                            _branch(
                                scope=["discard_pile"],
                                target_type="evil_character",
                                alignment="evil",
                                identifiers=["Demon"],
                            ),
                        ],
                    )

    elif card_id == "-1823352535":
        for ab in abilities:
            if ab.get("ability_id") == "tower_wa_return_interrupt_prevent":
                for ef in ab.get("effects") or []:
                    t = ef.get("target") or {}
                    if t.get("card_titles") == ["The Strong Angel"] and "special abilities" in (t.get("identifiers") or []):
                        _set_any_of(
                            t,
                            [
                                _branch(target_type="character", identifiers=["special abilities"]),
                                _branch(card_titles=["The Strong Angel"], identifiers=["special abilities"]),
                            ],
                            clear_target_type=True,
                        )

    # ---- Card-specific Section 5 AI fixes ----
    elif card_id == "350486112":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if "from hand, territory, or Artifact pile" in (t.get("identifiers") or []):
                    t["scope"] = ["hand", "territory", "artifact_pile"]
                    t["identifiers"] = [x for x in (t.get("identifiers") or []) if x != "from hand, territory, or Artifact pile"]

    elif card_id == "-1240240187":
        for ab in abilities:
            for c in ab.get("costs") or []:
                t = c.get("target") or {}
                if "or territory" in (t.get("identifiers") or []):
                    t["scope"] = ["hand", "territory"]
                    t["identifiers"] = [x for x in (t.get("identifiers") or []) if x != "or territory"]
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                idents = t.get("identifiers") or []
                if "or discard pile" in idents or "or deck" in idents:
                    t["scope"] = ["deck", "discard_pile"]
                    t["identifiers"] = [x for x in idents if x not in ("or discard pile", "or deck")]

    elif card_id == "-800476268":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if "hand or territory" in (t.get("identifiers") or []):
                    t["scope"] = ["hand", "territory"]
                    t["identifiers"] = [x for x in (t.get("identifiers") or []) if x != "hand or territory"]

    elif card_id == "1645250253":
        for ab in abilities:
            for c in ab.get("costs") or []:
                t = c.get("target") or {}
                if "Fortress or single color Site" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="fortress"),
                            _branch(target_type="site", identifiers=["single-brigade"]),
                        ],
                        clear_target_type=True,
                    )

    elif card_id == "1161413925":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if "pale green or crimson Enhancement or a Babylonian" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="enhancement", brigades=["Pale Green", "Crimson"]),
                            _branch(target_type="character", identifiers=["Babylonian"]),
                        ],
                        clear_target_type=True,
                        clear_brigades=True,
                    )

    elif card_id in ("-909258684", "1439988652"):
        for ab in abilities:
            for c in ab.get("costs") or []:
                t = c.get("target") or {}
                if "evil Fortress or occupied Site" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="fortress", alignment="evil"),
                            _branch(target_type="site", identifiers=["occupied"]),
                        ],
                        clear_target_type=True,
                    )

    elif card_id == "662225821":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if "offering or feast" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="enhancement", identifiers=["Offering"]),
                            _branch(target_type="enhancement", identifiers=["Feast"]),
                        ],
                    )

    elif card_id == "17029110":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if "Curse or Evil Enhancement in your territory" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="curse", alignment="evil"),
                            _branch(
                                zone_owner="controller",
                                scope=["territory"],
                                target_type="enhancement",
                                alignment="evil",
                            ),
                        ],
                        clear_target_type=True,
                    )

    elif card_id in ("-482084398", "-247835569"):
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if "treated as Lost Soul or Evil Character" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="character", identifiers=["treated as Lost Soul"]),
                            _branch(target_type="character", identifiers=["treated as Evil Character"]),
                        ],
                    )

    elif card_id in ("852909792", "354954824"):
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if "from discard pile or Storehouse" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(scope=["discard_pile"], target_type="enhancement"),
                            _branch(scope=["territory"], target_type="enhancement", identifiers=["in Storehouse"]),
                        ],
                        scope=["discard_pile", "territory"],
                    )

    elif card_id == "366556152":
        new_abs: List[Dict[str, Any]] = []
        added = False
        for ab in abilities:
            if ab.get("ability_id") == "pagan_sailors_activate_artifact":
                t = ab["effects"][0]["target"]
                if "or Reserve if Jonah is in play" in (t.get("identifiers") or []):
                    t["scope"] = ["artifact_pile"]
                    t["identifiers"] = []
                    res_ab = copy.deepcopy(ab)
                    res_ab["ability_id"] = "pagan_sailors_activate_artifact_reserve"
                    res_ab["conditions"] = [
                        {
                            "condition_type": "zone_check",
                            "selector": {
                                "selection_mode": "automatic_all",
                                "zone_owner": "both",
                                "scope": ["in_play"],
                                "target_type": "hero",
                                "alignment": "good",
                                "card_titles": ["Jonah"],
                            },
                            "operator": ">=",
                            "value": 1,
                        }
                    ]
                    res_ab["effects"][0]["target"]["scope"] = ["reserve_pile"]
                    new_abs.append(ab)
                    new_abs.append(res_ab)
                    added = True
                    continue
            new_abs.append(ab)
        if added:
            side["abilities"] = new_abs

    elif card_id == "758912005":
        new_abs = []
        added = False
        for ab in abilities:
            if ab.get("ability_id") == "discard_clay_to_negate_and_bounce":
                c0 = ab["costs"][0]["target"]
                if "or place it on Widows' Tables" in (c0.get("identifiers") or []):
                    c0["identifiers"] = []
                    ab["choice_group"] = "choice_1"
                    place_ab = copy.deepcopy(ab)
                    place_ab["ability_id"] = "place_clay_on_widows_tables_to_negate_and_bounce"
                    place_ab["choice_group"] = "choice_1"
                    place_ab["costs"][0]["action"] = "place"
                    place_ab["costs"][0]["destination"] = "territory"
                    new_abs.append(ab)
                    new_abs.append(place_ab)
                    added = True
                    continue
            new_abs.append(ab)
        if added:
            side["abilities"] = new_abs

    elif card_id == "2001346917":
        new_abs = []
        added = False
        for ab in abilities:
            if ab.get("ability_id") == "search_and_place_generic_philistine":
                c0 = ab["costs"][0]["target"]
                if "this card or evil card from deck" in (c0.get("identifiers") or []):
                    ab_self = copy.deepcopy(ab)
                    ab_self["ability_id"] = "search_and_place_generic_philistine_discard_self"
                    ab_self["choice_group"] = "choice_1"
                    ab_self["costs"][0]["target"] = {
                        "selection_mode": "automatic_self",
                        "zone_owner": "controller",
                        "scope": ["in_play"],
                        "target_type": "fortress",
                    }
                    ab_deck = copy.deepcopy(ab)
                    ab_deck["ability_id"] = "search_and_place_generic_philistine_discard_deck"
                    ab_deck["choice_group"] = "choice_1"
                    ab_deck["costs"][0]["target"] = {
                        "selection_mode": "manual_controller",
                        "zone_owner": "controller",
                        "scope": ["deck"],
                        "target_type": "card",
                        "alignment": "evil",
                        "count": {"fixed_value": 1},
                    }
                    new_abs.extend([ab_self, ab_deck])
                    added = True
                    continue
            new_abs.append(ab)
        if added:
            side["abilities"] = new_abs

    elif card_id == "-595932754":
        for ab in abilities:
            if ab.get("ability_id") == "reveal_cards_until_lost_soul_play_and_underdeck" and len(ab.get("effects") or []) > 1:
                t = ab["effects"][1]["target"]
                if "or an Evil Character if you do not control one" in (t.get("identifiers") or []):
                    _set_any_of(
                        t,
                        [
                            _branch(target_type="lost_soul"),
                            _branch(
                                target_type="evil_character",
                                alignment="evil",
                                identifiers=["if controller controls 0 Evil Characters"],
                            ),
                        ],
                        clear_target_type=True,
                    )

    elif card_id == "1778874634":
        for ab in abilities:
            if ab.get("ability_id") == "sauls_disobedient_sacrifice_banish" and len(ab.get("effects") or []) == 1:
                t = ab["effects"][0].get("target") or {}
                if "Hero and/or Enhancement" in (t.get("identifiers") or []):
                    hero_ef = copy.deepcopy(ab["effects"][0])
                    hero_ef["step"] = 1
                    hero_ef["target"]["target_type"] = "hero"
                    hero_ef["target"]["alignment"] = "good"
                    hero_ef["target"]["identifiers"] = []
                    hero_ef["target"]["count"] = {"min_value": 0, "max_value": 1}
                    enh_ef = copy.deepcopy(ab["effects"][0])
                    enh_ef["step"] = 2
                    enh_ef["target"]["target_type"] = "enhancement"
                    enh_ef["target"]["identifiers"] = []
                    enh_ef["target"]["count"] = {"min_value": 0, "max_value": 1}
                    ab["effects"] = [hero_ef, enh_ef]

    elif card_id == "2130474948":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                idents = t.get("identifiers") or []
                cleaned = [
                    x
                    for x in idents
                    if x not in ("or underdeck a Hero in territory", "or reserve a good card from hand")
                ]
                if cleaned != idents:
                    t["identifiers"] = cleaned

    elif card_id == "-94197524":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if "abilities */3 or less" in (t.get("identifiers") or []):
                    t["is_human"] = False
                    t["stat_filters"] = [{"stat": "toughness", "operator": "<=", "value": 3}]
                    t["identifiers"] = [x for x in (t.get("identifiers") or []) if x != "abilities */3 or less"]

    elif card_id == "-866704047":
        for ab in abilities:
            for ef in ab.get("effects") or []:
                t = ef.get("target") or {}
                if "topdeck and/or underdeck" in (t.get("identifiers") or []):
                    t["identifiers"] = [x for x in (t.get("identifiers") or []) if x != "topdeck and/or underdeck"]

    # Split top/or/bottom deck choice abilities cleanly into choice_group pairs
    _split_top_or_bottom_abilities(side, card_id)


def _link_and_validate_side(side_dict: Dict[str, Any], linker: CardLinker) -> Dict[str, Any]:
    """Validates a migrated side dict with CardSideLogic and links/clears target_card_ids.

    Args:
        side_dict: Raw side dictionary to normalize.
        linker: Initialized CardLinker instance.

    Returns:
        Canonical serialized side dictionary matching CardSideLogic schema.
    """
    model = CardSideLogic.model_validate(side_dict)
    for ab in model.abilities:
        if ab.trigger_filter:
            _link_selector_targets(ab.trigger_filter, linker)
        for cond in ab.conditions:
            if cond.selector:
                _link_selector_targets(cond.selector, linker)
        for cost in ab.costs:
            if cost.target:
                _link_selector_targets(cost.target, linker)
        for ef in ab.effects:
            if ef.target:
                _link_selector_targets(ef.target, linker)
            if ef.protection_filter:
                for cs in ef.protection_filter.card_sources:
                    _link_selector_targets(cs, linker)
            for mod_attr in (ef.strength_mod, ef.toughness_mod):
                dyn = getattr(mod_attr, "dynamic", None)
                if dyn and getattr(dyn, "selector", None):
                    _link_selector_targets(dyn.selector, linker)
    return model.model_dump(mode="json", exclude_none=True)


def run_migration(dry_run: bool = False) -> Dict[str, Any]:
    """Executes Phase 3 AST normalization on both AI and RAW ability JSON stores.

    Args:
        dry_run: When True, computes stats and validates without writing files.

    Returns:
        Summary dictionary with ai_modified, raw_modified, and validation_errors.
    """
    ext_raw = json.loads(EXTENDED_CARDS_PATH.read_text(encoding="utf-8"))
    ext_cards = ext_raw.get("cards", ext_raw) if isinstance(ext_raw, dict) else ext_raw
    linker = CardLinker(ext_cards)
    validation_errors: List[str] = []
    ai_modified = 0
    raw_modified = 0

    ai_data = json.loads(AI_ABILITIES_PATH.read_text(encoding="utf-8"))
    for key, entry in ai_data.items():
        cid = str(entry.get("card_id", key.split("_")[0]))
        side_name = str(entry.get("side", "top"))
        ast = entry.get("ast")
        if not ast:
            continue
        before = json.dumps(ast, sort_keys=True, ensure_ascii=False)
        working = copy.deepcopy(ast)
        _migrate_side_phase3(cid, side_name, working)
        try:
            normalized = _link_and_validate_side(working, linker)
        except Exception as exc:  # noqa: BLE001
            validation_errors.append(f"AI {key}: {exc}")
            continue
        if json.dumps(normalized, sort_keys=True, ensure_ascii=False) != before:
            ai_modified += 1
            entry["ast"] = normalized

    raw_data = json.loads(RAW_ABILITIES_PATH.read_text(encoding="utf-8"))
    for cid, card_entry in raw_data.items():
        sides = card_entry.get("sides") or {}
        for side_name, side_ast in list(sides.items()):
            before = json.dumps(side_ast, sort_keys=True, ensure_ascii=False)
            working = copy.deepcopy(side_ast)
            _migrate_side_phase3(str(cid), str(side_name), working)
            try:
                normalized = _link_and_validate_side(working, linker)
            except Exception as exc:  # noqa: BLE001
                validation_errors.append(f"RAW {cid}_{side_name}: {exc}")
                continue
            if json.dumps(normalized, sort_keys=True, ensure_ascii=False) != before:
                raw_modified += 1
                sides[side_name] = normalized

    if not dry_run and not validation_errors:
        AI_ABILITIES_PATH.write_text(
            json.dumps(ai_data, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )
        RAW_ABILITIES_PATH.write_text(
            json.dumps(raw_data, indent=2, ensure_ascii=False) + "\n",
            encoding="utf-8",
        )

    return {
        "dry_run": dry_run,
        "ai_modified": ai_modified,
        "raw_modified": raw_modified,
        "validation_errors": validation_errors,
    }


def main() -> int:
    """CLI entry point for the Phase 3 AST migration script.

    Args:
        None.

    Returns:
        Exit code (0 on success, 1 on validation errors).
    """
    parser = argparse.ArgumentParser(description="Migrate Phase 3 any_of and card_titles selectors.")
    parser.add_argument("--dry-run", action="store_true", help="Compute changes without writing files.")
    args = parser.parse_args()

    result = run_migration(dry_run=args.dry_run)
    print(json.dumps(result, indent=2, ensure_ascii=False))
    return 1 if result["validation_errors"] else 0


if __name__ == "__main__":
    raise SystemExit(main())
