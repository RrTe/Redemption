"""Deterministic modal-OR splitting, choice_group reconciliation, and verification helpers.

Shared across Stage 08 (rule-based parser), Stage 09 (LLM AST post-processing),
Stage 10 (logic verifier), and Phase 4 migrations to keep choice_group handling
consistent without duplicated heuristics.
"""

from __future__ import annotations

from collections import Counter
from dataclasses import dataclass
import json
import re
from typing import Any, Dict, List, Optional, Sequence, Set, Tuple

try:
    from utils.ability_patterns import protect_abbreviations, restore_abbreviations
except ImportError:
    from scripts.utils.ability_patterns import protect_abbreviations, restore_abbreviations

_ACTION_VERBS: Tuple[str, ...] = (
    "draw", "discard", "negate", "interrupt", "band", "search", "topdeck",
    "underdeck", "reserve", "take", "add", "banish", "remove", "return",
    "bounce", "shuffle", "protect", "withdraw", "activate", "play",
    "exchange", "convert", "heal", "capture", "release", "place", "put",
    "reveal", "look", "choose", "restrict", "prevent", "toss", "rescue",
    "equip", "hold", "ignore", "paralyze", "set aside",
)
_VERB_ALT = "|".join(re.escape(v) for v in _ACTION_VERBS)

# Matches exclusive clause-level OR boundaries while ignoring noun/zone/modifier lists.
_MODAL_SPLIT_RE = re.compile(
    r"(?:"
    r",\s*or\s+(?=(?:(?:you|holder|opponent|they|active\s+player)\s+)?may\b(?!\s+not\b)|"
    r"if\s+[^,]+,\s*(?:(?:you|holder)\s+)?may\b|"
    r"(?:each\s+player|opponent)\s+must\b|"
    rf"(?:{_VERB_ALT})\b(?:\s+(?:a|an|the|this|that|these|those|up|all|any|your|his|her|their|its|it|them|him|her|one|two|three|x|\d+)\b|\s+to\b|\s+from\b|\s+in\b|\s+at\b))"
    r"|\bor\s+(?=(?:you|holder)\s+may\b(?!\s+not\b))"
    r"|\bor\s+(?="
    rf"(?:{_VERB_ALT})\s+(?:a|an|the|this|that|these|those|up\s+to|all|any|your|his|her|their|its|it|them|him|her|one|two|three|x|\d+)\b)"
    r")",
    re.IGNORECASE,
)

# Matches inline parenthetical modal verb options like "topdeck (or take if ...)".
_PAREN_MODAL_VERB_RE = re.compile(
    rf"\b({_VERB_ALT})\s*\(\s*or\s+({_VERB_ALT})\b([^)]*)\)",
    re.IGNORECASE,
)

_CANONICAL_VERB_SYNONYMS: Dict[str, Set[str]] = {
    "draw": {"draw"},
    "discard": {"discard"},
    "deactivate": {"deactivate"},
    "negate": {"negate", "deactivate"},
    "interrupt": {"interrupt"},
    "band": {"band"},
    "search": {"search"},
    "topdeck": {"topdeck"},
    "underdeck": {"underdeck"},
    "reserve": {"reserve"},
    "take": {"take", "add"},
    "add to battle": {"add"},
    "banish": {"banish", "remove"},
    "bounce": {"bounce", "return"},
    "return to hand": {"return", "bounce"},
    "release": {"release", "return"},
    "place": {"place", "put", "return"},
    "play": {"play", "put", "activate", "equip"},
    "activate an artifact": {"activate"},
    "activate an ability": {"activate"},
    "equip": {"equip"},
    "shuffle": {"shuffle"},
    "protect": {"protect"},
    "withdraw": {"withdraw", "ignore", "repel"},
    "ignore": {"ignore"},
    "exchange": {"exchange"},
    "convert": {"convert"},
    "heal": {"heal"},
    "capture": {"capture"},
    "reveal": {"reveal"},
    "look": {"look"},
    "taunt": {"choose"},
    "choose opponent": {"choose"},
    "restrict": {"restrict"},
    "prevent": {"prevent"},
    "toss": {"toss"},
    "rescue": {"rescue"},
    "modify_stats": {"increase", "decrease"},
    "increase": {"increase"},
    "decrease": {"decrease"},
    "change hand size": {"reduce", "change"},
    "hold": {"hold"},
    "paralyze": {"paralyze"},
    "set-aside": {"set"},
}

# Excludes universal quantifiers ("Toss all Enhancements ... that have A, or that have B").
_UNIVERSAL_ALL_OR_RE = re.compile(
    r"\b(?:all|every)\b[^.]+\bthat\b[^.]+\bor\s+that\b"
    r"|\b(?:all|each)\s+(?:demons|characters|heroes|enhancements|cards)\s+that\b",
    re.IGNORECASE,
)
_LEADING_COND_PREFIX_RE = re.compile(
    r"^(?:(?:if|while|when|whenever|unless)\b[^,]*,\s*)+",
    re.IGNORECASE,
)
_STAR_PREFIX_RE = re.compile(r"^(?:STAR\s*:|\(\s*Star\s*\))\s*", re.IGNORECASE)
_STOP_WORDS = frozenset({
    "a", "an", "the", "you", "may", "or", "and", "to", "from", "in", "of",
    "card", "cards", "with", "if", "is", "are", "that", "it", "for", "your",
    "their", "by", "on", "be", "must",
})


@dataclass(frozen=True)
class ChoiceGroupMatch:
    """Represents a detected missing choice_group across sibling abilities.

    Attributes:
        kind: Classification ('modal_or' or 'split_sibling').
        sentence: Matched raw ability sentence.
        ability_indices: Ordered 0-based indices into the side's abilities list.
    """

    kind: str
    sentence: str
    ability_indices: List[int]


def _ab_as_dict(ab: Any) -> Dict[str, Any]:
    """Converts a Pydantic Ability model or raw dict to a plain dict for inspection."""
    if isinstance(ab, dict):
        return ab
    if hasattr(ab, "model_dump"):
        return ab.model_dump(mode="json")
    raise TypeError(f"Unsupported ability object type: {type(ab)!r}")


def _get_ab_attr(ab: Any, key: str, default: Any = None) -> Any:
    """Reads an attribute/key uniformly from an Ability model or dict."""
    if isinstance(ab, dict):
        return ab.get(key, default)
    return getattr(ab, key, default)


def _set_ab_choice_group(ab: Any, value: Optional[str]) -> None:
    """Assigns choice_group uniformly on an Ability model or dict."""
    if isinstance(ab, dict):
        ab["choice_group"] = value
    else:
        setattr(ab, "choice_group", value)


def find_singleton_choice_groups(abilities: Sequence[Any]) -> Dict[str, List[str]]:
    """Finds all choice_group labels assigned to fewer than 2 abilities on a side.

    Args:
        abilities: Sequence of Ability models or serialized ability dicts.

    Returns:
        Mapping from invalid singleton choice_group name to list containing its ability_id.
    """
    members: Dict[str, List[str]] = {}
    for ab in abilities:
        cg = _get_ab_attr(ab, "choice_group")
        if isinstance(cg, str) and cg.strip():
            ab_id = str(_get_ab_attr(ab, "ability_id") or "")
            members.setdefault(cg.strip(), []).append(ab_id)
    return {cg: ids for cg, ids in members.items() if len(ids) < 2}


def split_sentences_for_choice_matching(raw_text: str) -> List[str]:
    """Splits raw ability text into sentences, keeping linked 'If you do' choice pairs together.

    Args:
        raw_text: Raw ability string (may include abbreviations like O.T./N.T.).

    Returns:
        List of cleaned sentence strings.
    """
    masked = protect_abbreviations(raw_text or "")
    raw_parts = [restore_abbreviations(p).strip(" .") for p in re.split(r"\.\s+", masked) if p.strip()]
    merged: List[str] = []
    for part in raw_parts:
        # Join cost-choice + reward-choice pairs ("...discard A or B. If you do, discard C or draw X").
        if (
            merged
            and re.match(r"^if\s+you\s+do\b", part, re.IGNORECASE)
            and re.search(r"\bor\b", merged[-1], re.IGNORECASE)
            and re.search(r"\bor\b", part, re.IGNORECASE)
        ):
            merged[-1] = f"{merged[-1]}. {part}"
        else:
            merged.append(part)
    return merged


def split_modal_or_clauses(sentence: str) -> List[str]:
    """Deterministically splits a sentence at exclusive modal-OR branch boundaries.

    Explicitly skips non-exclusive 'and/or', universal 'all ... that ... or that ...',
    replacement 'instead'/'otherwise', protection modifiers, and zone/noun lists.

    Args:
        sentence: Single raw ability sentence without trailing period.

    Returns:
        List of 2+ branch strings if an exclusive modal OR is present, else [sentence].
    """
    s = (sentence or "").strip()
    if not s:
        return [s]
    if _UNIVERSAL_ALL_OR_RE.search(s):
        return [s]
    if re.search(r"\binstead\b|\botherwise\b", s, re.IGNORECASE):
        return [s]
    if re.match(r"^(?:this\s+\w+\s+)?can\s*\[?not\]?\s+be\s+", s, re.IGNORECASE):
        return [s]

    work = re.sub(r"^either\s+", "", s, flags=re.IGNORECASE).strip()

    pm = _PAREN_MODAL_VERB_RE.search(work)
    if pm:
        v1, v2, cond = pm.group(1), pm.group(2), pm.group(3)
        c1 = _PAREN_MODAL_VERB_RE.sub(v1, work, count=1).strip()
        c2 = _PAREN_MODAL_VERB_RE.sub(f"{v2}{cond}", work, count=1).strip()
        return [c1, c2]

    matches = list(_MODAL_SPLIT_RE.finditer(work))
    if not matches:
        return [s]

    valid_cuts: List[Tuple[int, int]] = []
    for m in matches:
        prefix = work[:m.start()]
        suffix = work[m.end():].strip()
        # Ignore ORs inside double-quoted literal names/rules (possessive apostrophes are allowed).
        if prefix.count('"') % 2 == 1:
            continue
        if prefix.rstrip().endswith("and/"):
            continue
        if re.search(r"\bcan\s*\[?not\]?\s+be\s+[^.]*$", prefix, re.IGNORECASE):
            continue
        # Do not split inside leading conditional prefix ("If A or B, do C") before its comma.
        if re.match(r"^(?:if|while|when)\b", prefix, re.IGNORECASE) and "," not in prefix:
            continue
        if re.match(r"^(?:draw|search|band|capture)\s+(?:or\s+\w+\s+)?abilit", suffix, re.IGNORECASE):
            continue
        if suffix.lower().startswith("play") and re.search(r"\b(?:in|from|into)\s+(?:a\s+|the\s+)?$", prefix, re.IGNORECASE):
            continue
        valid_cuts.append((m.start(), m.end()))

    if not valid_cuts:
        return [s]

    clauses: List[str] = []
    prev = 0
    for st, en in valid_cuts:
        part = work[prev:st].strip(" ,")
        if part:
            clauses.append(part)
        prev = en
    tail = work[prev:].strip(" ,")
    if tail:
        clauses.append(tail)
    return clauses if len(clauses) >= 2 else [s]


def _tokenize_keywords(text: str) -> Set[str]:
    """Extracts normalized content tokens for sentence-to-ability alignment."""
    return set(re.findall(r"[a-z0-9]+", text.lower())) - _STOP_WORDS


def _ability_text_verbs(ab: Dict[str, Any]) -> Set[str]:
    """Maps AST action verbs on an ability to canonical English text verbs."""
    verbs: Set[str] = set()
    for item in list(ab.get("effects") or []) + list(ab.get("costs") or []):
        act = str(item.get("action") or "").lower()
        verbs.update(_CANONICAL_VERB_SYNONYMS.get(act, {act}))
    return verbs


def _extract_ability_features(ab: Dict[str, Any]) -> Tuple[Set[str], Set[str], bool]:
    """Extracts (specific_tokens, general_tokens, is_self_target) from an ability dict."""
    spec_parts: List[str] = []
    gen_parts: List[str] = []
    is_self = False
    if ab.get("trigger_event"):
        te_val = ab["trigger_event"]
        if isinstance(te_val, list):
            for te_item in te_val:
                spec_parts.append(str(te_item).replace("_", " "))
        else:
            spec_parts.append(str(te_val).replace("_", " "))
    for item in list(ab.get("effects") or []) + list(ab.get("costs") or []):
        act = str(item.get("action") or "")
        gen_parts.append(act)
        if act == "add to battle":
            spec_parts.append("add battle")
        tgt = item.get("target") or {}
        if tgt.get("selection_mode") == "automatic_self":
            is_self = True
        tt = str(tgt.get("target_type") or "")
        if tt and tt not in ("card", "character"):
            if tt == "evil_character":
                gen_parts.append("evil character")
            elif tt == "lost_soul":
                spec_parts.append("lost soul")
            else:
                spec_parts.append(tt.replace("_", " "))
        for scope_zone in tgt.get("scope") or []:
            gen_parts.append(str(scope_zone).replace("_pile", "").replace("_", " "))
        for fld in ("brigades", "classes", "identifiers", "card_titles", "references"):
            for val in tgt.get(fld) or []:
                spec_parts.append(str(val))
    for cond in ab.get("conditions") or []:
        if cond.get("value") == 0:
            spec_parts.append("none")
        sel = cond.get("selector") or {}
        if sel.get("target_type") and sel.get("target_type") != "card":
            gen_parts.append(str(sel["target_type"]).replace("_", " "))
        for val in (sel.get("identifiers") or []) + (sel.get("card_titles") or []):
            gen_parts.append(str(val))
    return _tokenize_keywords(" ".join(spec_parts)), _tokenize_keywords(" ".join(gen_parts)), is_self


def _assign_abilities_to_sentences(
    ab_dicts: List[Dict[str, Any]],
    indices: List[int],
    sentences: List[str],
) -> Dict[int, List[int]]:
    """Maps each candidate ability index to its single best-matching raw sentence index."""
    sent_to_abs: Dict[int, List[int]] = {}
    sent_words_list = [set(re.findall(r"[a-z]+", s.lower())) for s in sentences]
    sent_tok_list = [_tokenize_keywords(s) for s in sentences]

    for idx in indices:
        ab = ab_dicts[idx]
        ab_verbs = _ability_text_verbs(ab)
        spec_toks, gen_toks, is_self = _extract_ability_features(ab)
        ab_mode = ab.get("activation_mode")
        best_s: Optional[int] = None
        best_score = 0

        for s_idx, sent in enumerate(sentences):
            verb_hits = len(ab_verbs & sent_words_list[s_idx])
            if verb_hits == 0:
                continue
            spec_hits = len(spec_toks & sent_tok_list[s_idx])
            gen_hits = len(gen_toks & sent_tok_list[s_idx])
            self_bonus = 12 if (is_self and re.search(
                r"\bthis\s+(?:card|hero|character|artifact|fortress|site|curse|covenant)\b", sent, re.I
            )) else 0
            has_trig_cue = bool(
                re.match(r"^(?:each\s+upkeep|each\s+draw|when\b|whenever\b)\b", sent, re.I)
                or "SITE:" in sent
                or "FORT:" in sent
            )
            mode_bonus = 2 if (ab_mode == "triggered" and has_trig_cue) else 0
            colon_pen = -5 if (":" in sent and "place" not in ab_verbs and re.match(r"^\s*place\b", sent, re.I)) else 0
            score = verb_hits * 10 + spec_hits * 5 + gen_hits * 2 + self_bonus + mode_bonus + colon_pen
            if score > best_score:
                best_score = score
                best_s = s_idx

        if best_s is not None:
            sent_to_abs.setdefault(best_s, []).append(idx)

    return sent_to_abs


def _is_instead_ability(ab: Dict[str, Any]) -> bool:
    """Returns True if an ability models an 'instead' replacement clause."""
    if "instead" in str(ab.get("ability_id") or "").lower():
        return True
    return any(m.get("modifier_type") == "instead" for m in (ab.get("modifiers") or []))


def _has_or_in_action_tail(sentence: str) -> bool:
    """Returns True if 'or' appears outside a leading If/While/When condition prefix."""
    tail = _LEADING_COND_PREFIX_RE.sub("", sentence.strip()).strip()
    return bool(re.search(r"\bor\b", tail, re.IGNORECASE))


def _abilities_differ_only_in_conditions(ab_dicts: List[Dict[str, Any]], idxs: List[int]) -> bool:
    """Returns True when sibling abilities share identical costs/effects and differ only in conditions."""
    eff_sigs = {
        json.dumps({"costs": ab_dicts[i].get("costs", []), "effects": ab_dicts[i].get("effects", [])}, sort_keys=True)
        for i in idxs
    }
    return len(eff_sigs) <= 1


def find_missing_choice_groups(
    side_or_abilities: Any,
    raw_text: str,
    star_text: str = "",
) -> List[ChoiceGroupMatch]:
    """Detects ungrouped abilities that represent exclusive modal-OR or split-OR choices.

    Args:
        side_or_abilities: CardSideLogic, side dict, or list of Ability models/dicts.
        raw_text: Regular SpecialAbility text for this card side.
        star_text: Optional StarAbility text for ``is_star=True`` abilities on this side.

    Returns:
        List of ChoiceGroupMatch descriptors identifying missing choice_groups.
    """
    if isinstance(side_or_abilities, dict):
        raw_abs = side_or_abilities.get("abilities") or []
    elif hasattr(side_or_abilities, "abilities"):
        raw_abs = side_or_abilities.abilities or []
    else:
        raw_abs = list(side_or_abilities or [])

    if len(raw_abs) < 2:
        return []

    ab_dicts = [_ab_as_dict(ab) for ab in raw_abs]
    reg_raw = (raw_text or "").strip()
    star_raw = (star_text or "").strip()
    if not star_raw and _STAR_PREFIX_RE.match(reg_raw):
        star_raw = _STAR_PREFIX_RE.sub("", reg_raw).strip()
        reg_raw = ""
    elif _STAR_PREFIX_RE.match(star_raw):
        star_raw = _STAR_PREFIX_RE.sub("", star_raw).strip()

    reg_indices = [
        i for i, ab in enumerate(ab_dicts)
        if not ab.get("is_star")
        and not ab.get("choice_group")
        and ab.get("activation_mode") != "static"
        and not _is_instead_ability(ab)
        and (ab.get("effects") or ab.get("costs"))
    ]
    star_indices = [
        i for i, ab in enumerate(ab_dicts)
        if ab.get("is_star")
        and not ab.get("choice_group")
        and ab.get("activation_mode") != "static"
        and not _is_instead_ability(ab)
        and (ab.get("effects") or ab.get("costs"))
    ]

    found: List[ChoiceGroupMatch] = []

    def _scan_bucket(indices: List[int], text: str) -> None:
        if len(indices) < 2 or not text.strip():
            return
        sentences = split_sentences_for_choice_matching(text)
        sent_to_abs = _assign_abilities_to_sentences(ab_dicts, indices, sentences)

        for s_idx, cand_idxs in sent_to_abs.items():
            if len(cand_idxs) < 2:
                continue
            sent = sentences[s_idx]
            clauses = split_modal_or_clauses(sent)

            if len(clauses) >= 2 and re.search(r"\.\s*if\s+you\s+do\b", sent, re.IGNORECASE):
                found.append(ChoiceGroupMatch("modal_or", sent, sorted(cand_idxs)))
                continue

            if len(clauses) >= 2:
                matched: List[int] = []
                for cl in clauses:
                    cl_kw = _tokenize_keywords(cl)
                    cl_words = set(re.findall(r"[a-z]+", cl.lower()))
                    best_idx: Optional[int] = None
                    best_score = 0
                    for idx in cand_idxs:
                        if idx in matched:
                            continue
                        ab = ab_dicts[idx]
                        verb_hits = len(_ability_text_verbs(ab) & cl_words)
                        if verb_hits == 0:
                            continue
                        spec_t, gen_t, _ = _extract_ability_features(ab)
                        score = verb_hits * 10 + len((spec_t | gen_t) & cl_kw)
                        if score > best_score:
                            best_score = score
                            best_idx = idx
                    if best_idx is not None:
                        matched.append(best_idx)
                if len(matched) >= 2:
                    for idx in cand_idxs:
                        if idx not in matched:
                            ab_v = _ability_text_verbs(ab_dicts[idx])
                            if any(ab_v & set(re.findall(r"[a-z]+", cl.lower())) for cl in clauses):
                                matched.append(idx)
                    found.append(ChoiceGroupMatch("modal_or", sent, sorted(matched)))
                    continue

            if not _has_or_in_action_tail(sent):
                continue
            if _UNIVERSAL_ALL_OR_RE.search(sent):
                continue
            if re.search(r"\binstead\b|\botherwise\b", sent, re.IGNORECASE):
                continue

            by_sig: Dict[Tuple[str, ...], List[int]] = {}
            for idx in cand_idxs:
                sig = tuple(e.get("action") for e in (ab_dicts[idx].get("effects") or []))
                if sig:
                    by_sig.setdefault(sig, []).append(idx)

            for sig_idxs in by_sig.values():
                if len(sig_idxs) < 2:
                    continue
                if _abilities_differ_only_in_conditions(ab_dicts, sig_idxs):
                    continue
                if "and/or" in sent.lower():
                    scopes = {
                        tuple((e.get("target") or {}).get("scope") or [])
                        for idx in sig_idxs
                        for e in (ab_dicts[idx].get("effects") or [])
                    }
                    if len(scopes) <= 1 or not re.search(r"\bfrom\s+[^.]*\bor\b", sent, re.IGNORECASE):
                        continue
                found.append(ChoiceGroupMatch("split_sibling", sent, sorted(sig_idxs)))

    _scan_bucket(reg_indices, reg_raw)
    _scan_bucket(star_indices, star_raw)
    return found


def reconcile_side_choice_groups(
    side_or_dict: Any,
    raw_text: str,
    star_text: str = "",
) -> Tuple[int, int]:
    """Cleans singleton choice_groups and deterministically assigns missing choice_groups.

    Mutates ``side_or_dict`` in-place (works on both CardSideLogic models and raw AST dicts).

    Args:
        side_or_dict: CardSideLogic instance or serialized side AST dictionary.
        raw_text: Regular SpecialAbility text for this card side.
        star_text: Optional StarAbility text for ``is_star=True`` abilities.

    Returns:
        Tuple of ``(cleared_singletons_count, added_groups_count)``.
    """
    if isinstance(side_or_dict, dict):
        abilities = side_or_dict.get("abilities") or []
    elif hasattr(side_or_dict, "abilities"):
        abilities = side_or_dict.abilities or []
    else:
        return 0, 0

    # 1. Strip whitespace-only choice_groups and singleton groups (size < 2).
    counts: Counter[str] = Counter()
    for ab in abilities:
        cg = _get_ab_attr(ab, "choice_group")
        if isinstance(cg, str):
            stripped = cg.strip()
            if stripped != cg:
                _set_ab_choice_group(ab, stripped or None)
            if stripped:
                counts[stripped] += 1
            else:
                _set_ab_choice_group(ab, None)

    cleared = 0
    for ab in abilities:
        cg = _get_ab_attr(ab, "choice_group")
        if cg and counts[cg] < 2:
            _set_ab_choice_group(ab, None)
            cleared += 1

    # 2. Assign deterministic non-colliding choice_group labels to missing modal/split groups.
    missing = find_missing_choice_groups(abilities, raw_text=raw_text, star_text=star_text)
    if not missing:
        return cleared, 0

    used_names = {
        str(_get_ab_attr(ab, "choice_group"))
        for ab in abilities
        if _get_ab_attr(ab, "choice_group")
    }
    added = 0
    next_num = 1
    for match in missing:
        while f"choice_{next_num}" in used_names:
            next_num += 1
        group_name = f"choice_{next_num}"
        used_names.add(group_name)
        next_num += 1
        for idx in match.ability_indices:
            _set_ab_choice_group(abilities[idx], group_name)
        added += 1

    return cleared, added
