"""Card title to canonical card ID resolution module.

Provides REG v11.1.0-compliant linking between human-readable card titles
(e.g., 'Nadab') and static Coliseum card IDs, enforcing strict word boundaries
to prevent false positive matches like 'Amminadab' for 'Nadab'.
"""

from __future__ import annotations

import re
from typing import Dict, List, Set, Any
try:
    from utils.card_helpers import get_card_name
except ImportError:
    from scripts.utils.card_helpers import get_card_name


class CardLinker:
    """Indexes cards from the canonical database and resolves card titles to IDs."""

    def __init__(self, cards: List[Dict[str, Any]]) -> None:
        """Initializes linker with pre-indexed card entries.

        Args:
            cards: List of raw or extended card dicts from the database.
        """
        self.cards: List[Dict[str, Any]] = cards
        self._index: List[tuple[str, str, List[str]]] = []
        self._build_index()

    def _build_index(self) -> None:
        """Extracts and normalizes card names and side names for fast lookup."""
        for c in self.cards:
            cid = str(c.get("Id", "")).strip()
            if not cid:
                continue

            names: Set[str] = set()
            primary = get_card_name(c)
            if primary:
                names.add(primary)

            sides = c.get("CardSides", {})
            for side_val in sides.values():
                if isinstance(side_val, dict):
                    s_name = side_val.get("Name")
                    if s_name:
                        names.add(s_name)

            # Strip trailing edition/set qualifiers: e.g. "(GoC)", "[Promo]"
            clean_names = [
                re.sub(r"\s*[\(\[].*?[\)\]]", "", n).strip()
                for n in names if n
            ]
            self._index.append((cid, primary, clean_names))

    def resolve_title(self, target_title: str) -> List[str]:
        """Resolves a single card title to all matching canonical card IDs.

        Follows REG v11.1.0 rules:
        - Matches exact full name (case-insensitive)
        - Matches whole-word boundary (\\bName\\b)
        - Rejects partial substrings (e.g., 'Amminadab' for 'Nadab')

        Args:
            target_title: Card or character name referenced in ability text.

        Returns:
            List of unique matching card IDs, sorted deterministically.
        """
        title_clean = target_title.strip()
        if not title_clean:
            return []

        matched_ids = self._match_exact_title(title_clean)
        if not matched_ids:
            # Retry after stripping trailing edition/set qualifiers, e.g. "(CoW AB)", "[IR]"
            stripped = re.sub(r"(?:\s*[\(\[].*?[\)\]])+$", "", title_clean).strip()
            if stripped and stripped != title_clean and len(stripped) >= 3:
                matched_ids = self._match_exact_title(stripped)

        return sorted(matched_ids)

    def _match_exact_title(self, title_clean: str) -> Set[str]:
        """Matches a normalized title string with strict whole-word boundaries.

        Args:
            title_clean: Stripped card title to match.

        Returns:
            Set of matching canonical card IDs.
        """
        pattern = re.compile(rf"(?<!\w){re.escape(title_clean)}(?!\w)", re.IGNORECASE)
        matched_ids: Set[str] = set()
        for cid, _, clean_names in self._index:
            for name in clean_names:
                if pattern.search(name):
                    matched_ids.add(cid)
                    break
        return matched_ids

    def resolve_titles(self, target_titles: List[str]) -> List[str]:
        """Resolves multiple card titles and returns unified list of matching IDs.

        Args:
            target_titles: List of referenced card titles.

        Returns:
            List of unique matching card IDs.
        """
        all_ids: Set[str] = set()
        for title in target_titles:
            all_ids.update(self.resolve_title(title))
        return sorted(all_ids)


TITLE_SUBSTRING_PATTERNS: Dict[str, List[str]] = {
    "snare in the title": ["Snare"],
    "trumpet or trumpets in the title": ["Trumpet", "Trumpets"],
    "trumpet or censer in the title": ["Trumpet", "Censer"],
    "'false' in the title": ["False"],
    "false in the title": ["False"],
    "ship in the title": ["Ship"],
}


def _link_selector_targets(sel: Any, linker: CardLinker) -> None:
    """Recursively resolves card_titles and title-substring patterns, clearing group target_card_ids."""
    if not sel:
        return

    idents = list(getattr(sel, "identifiers", None) or [])
    if idents:
        titles = list(getattr(sel, "card_titles", None) or [])
        kept_idents: List[str] = []
        changed = False
        for ident in idents:
            low = str(ident).strip().lower()
            if low in TITLE_SUBSTRING_PATTERNS:
                for tok in TITLE_SUBSTRING_PATTERNS[low]:
                    if tok not in titles:
                        titles.append(tok)
                changed = True
            else:
                kept_idents.append(ident)
        if changed:
            sel.card_titles = titles
            sel.identifiers = kept_idents

    if getattr(sel, "card_titles", None):
        sel.target_card_ids = linker.resolve_titles(sel.card_titles)
    elif hasattr(sel, "target_card_ids") and getattr(sel, "target_card_ids", None) is not None:
        sel.target_card_ids = [] if type(sel).__name__ == "TargetSelector" else None

    for branch in getattr(sel, "any_of", None) or []:
        _link_selector_targets(branch, linker)
    ub = getattr(sel, "used_by", None)
    if ub is not None and not isinstance(ub, str):
        _link_selector_targets(ub, linker)
    excl = getattr(sel, "exclude", None)
    if excl is not None:
        _link_selector_targets(excl, linker)
    cnt = getattr(sel, "count", None)
    dyn = getattr(cnt, "dynamic", None) if cnt else None
    if dyn and getattr(dyn, "selector", None):
        _link_selector_targets(dyn.selector, linker)


def _link_stat_mod_targets(mod: Any, linker: CardLinker) -> None:
    """Resolves card_titles inside a DynamicValue stat modifier selector, if present."""
    dyn = getattr(mod, "dynamic", None) if mod else None
    if dyn and getattr(dyn, "selector", None):
        _link_selector_targets(dyn.selector, linker)


def link_side_logic_targets(side_logic: Any, linker: CardLinker) -> None:
    """Populates target_card_ids for all card_titles found in AST conditions, costs, and effects.

    Args:
        side_logic: CardSideLogic instance.
        linker: Pre-indexed CardLinker instance.
    """
    for ab in getattr(side_logic, "abilities", []):
        _link_selector_targets(getattr(ab, "trigger_subject", None), linker)
        _link_selector_targets(getattr(ab, "trigger_source", None), linker)
        _link_selector_targets(getattr(ab, "trigger_filter", None), linker)
        for cond in getattr(ab, "conditions", []):
            _link_selector_targets(getattr(cond, "selector", None), linker)
        for cost in getattr(ab, "costs", []):
            _link_selector_targets(getattr(cost, "target", None), linker)
            _link_stat_mod_targets(getattr(cost, "strength_mod", None), linker)
            _link_stat_mod_targets(getattr(cost, "toughness_mod", None), linker)
        for eff in getattr(ab, "effects", []):
            _link_selector_targets(getattr(eff, "target", None), linker)
            _link_stat_mod_targets(getattr(eff, "strength_mod", None), linker)
            _link_stat_mod_targets(getattr(eff, "toughness_mod", None), linker)
            pf = getattr(eff, "protection_filter", None)
            if pf:
                for cs in getattr(pf, "card_sources", []):
                    _link_selector_targets(cs, linker)


def normalize_chained_targets(side_logic: Any) -> List[str]:
    """Ensures chained targets have valid ref_step or self-corrects unambiguous ones.

    Args:
        side_logic: CardSideLogic instance.

    Returns:
        List of error descriptions for ambiguous chained targets requiring LLM retry.
    """
    from models.enums.selection_mode import SelectionMode

    ambiguous: List[str] = []
    for ab in getattr(side_logic, "abilities", []):
        target_source_steps: List[int] = []
        prior_steps: List[int] = []

        for c in getattr(ab, "costs", []):
            c_step = getattr(c, "step", 1)
            prior_steps.append(c_step)
            if getattr(c, "target", None):
                target_source_steps.append(c_step)

        for eff in getattr(ab, "effects", []):
            tgt = getattr(eff, "target", None)
            step = getattr(eff, "step", 1)
            sel_mode = getattr(tgt, "selection_mode", None)
            mode_val = sel_mode.value if hasattr(sel_mode, "value") else str(sel_mode)

            if tgt and mode_val == "chained_target":
                ref = getattr(tgt, "ref_step", None)
                if ref is None or ref >= step or ref not in prior_steps:
                    if step == 1 and not target_source_steps:
                        # Cannot chain if on step 1 and no prior cost targets: set to automatic_all
                        tgt.selection_mode = SelectionMode.AUTOMATIC_ALL
                        tgt.ref_step = None
                    elif target_source_steps:
                        # Link to the most recent prior step that introduced a target
                        tgt.ref_step = target_source_steps[-1]
                    elif prior_steps:
                        tgt.ref_step = prior_steps[-1]
                    else:
                        ambiguous.append(
                            f"Step {step} uses chained_target without valid ref_step among candidate steps {target_source_steps or prior_steps}"
                        )
            elif tgt:
                target_source_steps.append(step)

            prior_steps.append(step)

    return ambiguous

