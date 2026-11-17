import re
from typing import Dict, List, Optional, Set, Tuple
from mappings.card_type_metadata import CARD_TYPE_ABILITY_ALIASES, TYPE_ALIGNMENT_MAP
from models.enums.card_type import TYPE_IS_A
from scripts.utils.type_helpers import normalize_case

# Regex matching ability section tags:
# - Compound slash tags like 'GE/EE:' (preceded by start, whitespace, or period)
# - Single colon-delimited labels ('HERO:', 'EC:', 'TOP:') or parenthetical labels ('(Star)')
TAG_PATTERN = re.compile(
    r'(?:(?:^|(?<=[\s\.]))([A-Za-z]+(?:/[A-Za-z]+)+):'
    r'|(?:^|(?<=[\s/\.]))(?:([A-Za-z]+):|\(\s*([A-Za-z]+)\s*\)))\s*'
)

# Patterns for protecting stat modifications like 'X/X', '2/2', '+1/+1', or 'and/or'
STAT_PATTERN = re.compile(r'^\s*[-+]?[0-9Xx]\s*/\s*[-+]?[0-9Xx]\s*$')


def resolve_side_tags(
    side_key: str,
    side_type: Optional[str] = None,
    side_alignment: Optional[str] = None
) -> Set[str]:
    """Resolves all valid ability label tags associated with a specific card side.

    Expands direct types, type inheritance hierarchies (via TYPE_IS_A),
    positional markers (top/bottom), and alignment labels into uppercase tokens.
    Guards against alignment conflicts when inheriting types (e.g. Neutral side
    of Curse should not inherit Evil Enhancement tags).

    Args:
        side_key: The identifier of the side ('top', 'bottom', or type name).
        side_type: The card type for this side (e.g. 'Hero', 'Curse', 'EE').
        side_alignment: The alignment of this side ('Good', 'Evil', 'Neutral').

    Returns:
        Set of uppercase string tokens representing valid labels for this side.
    """
    tags: Set[str] = set()

    # Position tags (e.g., TOP, BOTTOM)
    side_key_norm = str(side_key)
    if side_key_norm in CARD_TYPE_ABILITY_ALIASES:
        tags.update(normalize_case(t) for t in CARD_TYPE_ABILITY_ALIASES[side_key_norm])
    tags.add(normalize_case(side_key_norm))

    # Type tags and inherited types (e.g., Curse is an Artifact and EE)
    types_to_expand = [side_type] if side_type else []
    if side_type and side_type in TYPE_IS_A:
        for inherited in TYPE_IS_A[side_type]:
            # Filter out inherited types that contradict the side's alignment
            if side_alignment:
                inherited_align = TYPE_ALIGNMENT_MAP.get(inherited)
                if inherited_align and normalize_case(inherited_align.value) != normalize_case(side_alignment):
                    continue
            types_to_expand.append(inherited)

    for t in types_to_expand:
        if not t:
            continue
        if t in CARD_TYPE_ABILITY_ALIASES:
            tags.update(normalize_case(alias) for alias in CARD_TYPE_ABILITY_ALIASES[t])
        # Word initials acronym (e.g., 'Evil Character' -> 'EC')
        acronym = "".join(w[0] for w in t.split() if w)
        if acronym:
            tags.add(normalize_case(acronym))
        tags.add(normalize_case(t))

    # Alignment tags (e.g., GOOD, EVIL, NEUTRAL)
    if side_alignment and side_alignment in CARD_TYPE_ABILITY_ALIASES:
        tags.update(normalize_case(a) for a in CARD_TYPE_ABILITY_ALIASES[side_alignment])

    return tags


def split_card_abilities(
    raw_ability: str,
    sides_info: List[Dict[str, Optional[str]]]
) -> Tuple[Dict[str, str], Optional[str]]:
    """Splits a card's SpecialAbility across its respective sides.

    Identifies side-specific text segments using tag-matching and balanced
    slash delimiters, while protecting shared abilities, entry triggers (STAR),
    and stat-change notations from false-positive fragmentation.

    Args:
        raw_ability: The full unparsed ability string from card data.
        sides_info: List of dicts describing each side, each containing 'key',
            and optionally 'type' and 'alignment'.

    Returns:
        A tuple of (side_abilities, star_ability), where side_abilities maps
        side keys to their separated ability texts, and star_ability is any
        extracted global entry ability (or None).
    """
    if not raw_ability or not sides_info:
        return {}, None

    cleaned_text = raw_ability.strip()

    # Map all eligible tags to their corresponding side key
    tag_to_side: Dict[str, str] = {}
    for side in sides_info:
        side_tags = resolve_side_tags(
            side["key"],
            side.get("type"),
            side.get("alignment")
        )
        for tag in side_tags:
            # Prioritize exact type matches over inherited associations
            if tag not in tag_to_side or side.get("type") == tag:
                tag_to_side[tag] = side["key"]

    # Locate tag positions in the ability string
    matches = list(TAG_PATTERN.finditer(cleaned_text))
    tag_positions = []
    matched_sides: Set[str] = set()
    has_star = False

    for m in matches:
        compound_tag = m.group(1)
        if compound_tag:
            # Handle compound shared prefixes such as 'GE/EE:' without splitting the first tag into StarAbility.
            parts = [normalize_case(p) for p in compound_tag.split("/") if p]
            if parts and all(p in tag_to_side for p in parts):
                side_keys = list(dict.fromkeys(tag_to_side[p] for p in parts))
                tag_positions.append({
                    "side_keys": side_keys,
                    "start": m.start(),
                    "content_start": m.end(),
                })
                matched_sides.update(side_keys)
            elif parts and parts[-1] in tag_to_side:
                side_key = tag_to_side[parts[-1]]
                slash_offset = compound_tag.rfind("/") + 1
                tag_positions.append({
                    "side_keys": [side_key],
                    "start": m.start() + slash_offset,
                    "content_start": m.end(),
                })
                matched_sides.add(side_key)
            continue

        raw_tag = m.group(2) or m.group(3)
        if not raw_tag:
            continue
        tag_str = normalize_case(raw_tag)
        if tag_str in tag_to_side:
            side_key = tag_to_side[tag_str]
            tag_positions.append({
                "side_keys": [side_key],
                "start": m.start(),
                "content_start": m.end()
            })
            matched_sides.add(side_key)
        elif tag_str == "STAR":
            has_star = True
            tag_positions.append({
                "side_keys": ["star"],
                "start": m.start(),
                "content_start": m.end()
            })

    if len(sides_info) < 2 and not has_star:
        return {sides_info[0]["key"]: cleaned_text}, None

    # Stage 1: Segment by matched tags if multiple distinct sides are targeted or STAR tag is present
    if has_star or len(matched_sides) >= 2 or (len(matched_sides) == len(sides_info)):
        tag_positions.sort(key=lambda x: x["start"])
        extracted_abilities: Dict[str, str] = {}
        star_ability: Optional[str] = None

        for i, pos in enumerate(tag_positions):
            next_start = tag_positions[i + 1]["start"] if i + 1 < len(tag_positions) else len(cleaned_text)
            content = cleaned_text[pos["content_start"]:next_start].strip().rstrip("/").strip()
            for sk in pos["side_keys"]:
                if sk == "star":
                    star_ability = content
                else:
                    extracted_abilities[sk] = content

        result = {s["key"]: extracted_abilities.get(s["key"], "") for s in sides_info}
        return result, star_ability

    # Stage 2: Balanced slash splitting with strict guards against stat modifications
    if " / " in cleaned_text:
        parts = [p.strip() for p in cleaned_text.split(" / ")]
        # Guard: must match side count and not resemble stat changes or short conjunctions
        is_stat_or_phrase = any(STAT_PATTERN.match(p) or p.lower() in {"or", "and"} for p in parts)
        if len(parts) == len(sides_info) and not is_stat_or_phrase:
            cleaned_parts = []
            for i, part in enumerate(parts):
                s = sides_info[i]
                side_tags = resolve_side_tags(s["key"], s.get("type"), s.get("alignment"))
                # Strip leading tag if present
                m = re.match(r'^([A-Za-z]+):\s*(.*)', part)
                if m and normalize_case(m.group(1)) in side_tags:
                    cleaned_parts.append(m.group(2).strip())
                else:
                    cleaned_parts.append(part)
            return {sides_info[i]["key"]: cleaned_parts[i] for i in range(len(sides_info))}, None

    # Stage 3: Truly shared ability fallback
    return {s["key"]: cleaned_text for s in sides_info}, None
