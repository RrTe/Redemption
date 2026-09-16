"""Card title to canonical card ID resolution module.

Provides REG v11.0.0-compliant linking between human-readable card titles
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

        Follows REG v11.0.0 rules:
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

        # Strict whole-word regex: \bTitle\b
        pattern = re.compile(rf"\b{re.escape(title_clean)}\b", re.IGNORECASE)

        matched_ids: Set[str] = set()
        for cid, _, clean_names in self._index:
            for name in clean_names:
                if pattern.search(name):
                    matched_ids.add(cid)
                    break

        return sorted(matched_ids)

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
