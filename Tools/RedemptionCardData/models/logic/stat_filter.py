"""Specification of numeric stat constraints on target cards in Redemption CCG.

Supports structured stat comparisons (strength, toughness, both, either) with
relational operators (>=, <=, ==, >, <, !=) and fixed numeric or dynamic variable thresholds.
"""

from __future__ import annotations

import re
from typing import List, Literal, Optional
from pydantic import BaseModel, Field


class StatFilter(BaseModel):
    """Specification of numeric stat constraints on target cards.

    Attributes:
        stat: Target statistic being compared ('strength', 'toughness', 'both', 'either').
        operator: Relational comparison operator ('>=', '<=', '==', '>', '<', '!=').
        value: Numeric threshold value for fixed comparisons.
        variable: Named variable symbol (e.g. 'X') for dynamic comparisons.
    """

    stat: Literal["strength", "toughness", "both", "either"]
    operator: Literal[">=", "<=", "==", ">", "<", "!="] = ">="
    value: Optional[int] = None
    variable: Optional[str] = None


_PREFIX_RE = re.compile(r"^(?:with|except|worth|of)\s+", re.IGNORECASE)

_BOTH_STATS_RE = re.compile(
    r"^(\d+)\s*/\s*(\d+)\s+or\s+(less|lower|fewer)$", re.IGNORECASE
)

_STRENGTH_SLASH_RE = re.compile(
    r"^strength\s+(\d+)\s*/\s*\*\s+or\s+(greater|more|less|lower|fewer)$", re.IGNORECASE
)

_TOUGHNESS_SLASH_RE = re.compile(
    r"^toughness\s+(?:of\s+)?(?:\*\s*/\s*|\(\s*\*\s*/\s*)?(\d+)\)?\s+or\s+(less|lower|fewer|greater|more)$",
    re.IGNORECASE,
)

_STRENGTH_NUM_RE = re.compile(
    r"^strength\s+(\d+)\s+or\s+(greater|more|less|lower|fewer)$", re.IGNORECASE
)

_TOUGHNESS_NUM_RE = re.compile(
    r"^toughness\s+(\d+)\s+or\s+(less|lower|fewer|greater|more)$", re.IGNORECASE
)

_RELATIONAL_OP_RE = re.compile(
    r"^(strength|toughness)\s*(>=|<=|==|>|<|!=)\s*(\d+)$", re.IGNORECASE
)

_VARIABLE_RE = re.compile(
    r"^(strength|toughness)[_\s]+([A-Z])[_\s]+or[_\s]+(greater|more|less|lower|fewer)$",
    re.IGNORECASE,
)

_VARIABLE_THAN_RE = re.compile(
    r"^(strength|toughness)\s+(less|greater)\s+than\s+([A-Z])$", re.IGNORECASE
)

_STAR_TOUGHNESS_RE = re.compile(
    r"^\*\s*/\s*(\d+)\s+or\s+(less|lower|fewer|greater|more)$", re.IGNORECASE
)

_STAR_TOUGHNESS_VAR_RE = re.compile(
    r"^\*\s*/\s*([A-Z])\s+or\s+(less|lower|fewer|greater|more)$", re.IGNORECASE
)

_STAR_STRENGTH_RE = re.compile(
    r"^(\d+)\s*/\s*\*\s+or\s+(greater|more|less|lower|fewer)$", re.IGNORECASE
)

_OFFENSE_NUM_RE = re.compile(
    r"^(\d+)\s+or\s+(greater|more)\s+offense$", re.IGNORECASE
)

_EITHER_STAT_RE = re.compile(
    r"^(?:strength\s+or\s+toughness|toughness\s+or\s+strength)\s+(?:of\s+)?(\d+)$",
    re.IGNORECASE,
)


def parse_stat_filters(phrase: str) -> Optional[List[StatFilter]]:
    """Parses a natural-language or LLM stat condition string into structured StatFilter instances.

    Args:
        phrase: Raw identifier string (e.g. 'strength 10 or greater', '6/6 or less').

    Returns:
        List of StatFilter models if the phrase represents stat conditions, otherwise None.
    """
    clean = phrase.strip()
    if not clean:
        return None

    # Strip conversational / selector prefix words
    m_pref = _PREFIX_RE.match(clean)
    core = clean[m_pref.end():].strip() if m_pref else clean

    # 1. Dual stats: (\d+)/(\d+) or less
    m = _BOTH_STATS_RE.match(core)
    if m:
        v1, v2 = int(m.group(1)), int(m.group(2))
        if v1 == v2:
            return [StatFilter(stat="both", operator="<=", value=v1)]
        return [
            StatFilter(stat="strength", operator="<=", value=v1),
            StatFilter(stat="toughness", operator="<=", value=v2),
        ]

    # 2. Asterisk-slashed stats: e.g. 'strength 6/* or lower', 'strength 7/* or greater'
    m = _STRENGTH_SLASH_RE.match(core)
    if m:
        val = int(m.group(1))
        op = ">=" if m.group(2).lower() in ("greater", "more") else "<="
        return [StatFilter(stat="strength", operator=op, value=val)]

    # 3. Asterisk-slashed toughness: e.g. 'toughness */3 or less', 'toughness */7 or greater'
    m = _TOUGHNESS_SLASH_RE.match(core)
    if m:
        val = int(m.group(1))
        op = ">=" if m.group(2).lower() in ("greater", "more") else "<="
        return [StatFilter(stat="toughness", operator=op, value=val)]

    # 4. Standard strength comparison
    m = _STRENGTH_NUM_RE.match(core)
    if m:
        val = int(m.group(1))
        op = ">=" if m.group(2).lower() in ("greater", "more") else "<="
        return [StatFilter(stat="strength", operator=op, value=val)]

    # 5. Standard toughness comparison
    m = _TOUGHNESS_NUM_RE.match(core)
    if m:
        val = int(m.group(1))
        op = ">=" if m.group(2).lower() in ("greater", "more") else "<="
        return [StatFilter(stat="toughness", operator=op, value=val)]

    # 6. Explicit mathematical operators (e.g. 'strength > 2')
    m = _RELATIONAL_OP_RE.match(core)
    if m:
        stat_name = m.group(1).lower()
        op = m.group(2)
        val = int(m.group(3))
        return [StatFilter(stat=stat_name, operator=op, value=val)]  # type: ignore[arg-type]

    # 7. Variable thresholds: 'strength X or greater', 'toughness X or less', 'toughness_X_or_less'
    m = _VARIABLE_RE.match(core)
    if m:
        stat_name = m.group(1).lower()
        var_symbol = m.group(2)
        op = ">=" if m.group(3).lower() in ("greater", "more") else "<="
        return [StatFilter(stat=stat_name, operator=op, variable=var_symbol)]  # type: ignore[arg-type]

    # 8. Variable thresholds with 'less than' / 'greater than': 'toughness less than X'
    m = _VARIABLE_THAN_RE.match(core)
    if m:
        stat_name = m.group(1).lower()
        direction = m.group(2).lower()
        op = "<" if direction == "less" else ">"
        var_symbol = m.group(3)
        return [StatFilter(stat=stat_name, operator=op, variable=var_symbol)]  # type: ignore[arg-type]

    # 9. Either stat equality: 'strength or toughness 3'
    m = _EITHER_STAT_RE.match(core)
    if m:
        val = int(m.group(1))
        return [StatFilter(stat="either", operator="==", value=val)]

    # 10. Bare star-toughness threshold: '*/5 or less', '*/0 or less'
    m = _STAR_TOUGHNESS_RE.match(core)
    if m:
        val = int(m.group(1))
        op = ">=" if m.group(2).lower() in ("greater", "more") else "<="
        return [StatFilter(stat="toughness", operator=op, value=val)]

    # 11. Bare star-toughness variable threshold: '*/X or less'
    m = _STAR_TOUGHNESS_VAR_RE.match(core)
    if m:
        var_symbol = m.group(1)
        op = ">=" if m.group(2).lower() in ("greater", "more") else "<="
        return [StatFilter(stat="toughness", operator=op, variable=var_symbol)]

    # 12. Bare star-strength threshold: '5/* or greater'
    m = _STAR_STRENGTH_RE.match(core)
    if m:
        val = int(m.group(1))
        op = ">=" if m.group(2).lower() in ("greater", "more") else "<="
        return [StatFilter(stat="strength", operator=op, value=val)]

    # 13. Offense threshold: '7 or greater offense'
    m = _OFFENSE_NUM_RE.match(core)
    if m:
        val = int(m.group(1))
        op = ">=" if m.group(2).lower() in ("greater", "more") else "<="
        return [StatFilter(stat="strength", operator=op, value=val)]

    return None
