"""Structured protection filter model for Protect and Immune effects.

Separates protection causes (actions, card sources, harm, exceptions) from the
entity receiving protection, strictly adhering to Redemption REG v11.1.0.
"""

from __future__ import annotations
from typing import Any, List, Optional
from pydantic import BaseModel, Field, field_validator
from models.enums.action_verb import ActionVerb
from models.logic.target_selector import TargetSelector


class ProtectionFilter(BaseModel):
    """Specification of what an entity is protected from or immune to.

    Attributes:
        from_harm: True if protected from harm or negative effects per REG p. 106.
        actions: Specific action verbs blocked (e.g. discard, capture, convert).
        except_actions: Action verbs explicitly exempt from protection (e.g. '(except discard)').
        card_sources: Selectors defining opposing cards/actors whose abilities or strength cannot affect this card.
        qualifiers: Optional temporal or ordering constraints (e.g. 'the first each battle').
    """
    from_harm: bool = False
    actions: List[ActionVerb] = Field(default_factory=list)
    except_actions: List[ActionVerb] = Field(default_factory=list)
    card_sources: List[TargetSelector] = Field(default_factory=list)
    qualifiers: List[str] = Field(default_factory=list)

    @field_validator("actions", "except_actions", mode="before")
    @classmethod
    def normalize_action_verbs(cls, v: Any) -> Any:
        """Normalizes action verb strings or lists to canonical ActionVerb enums."""
        if not v:
            return []
        if isinstance(v, (str, ActionVerb)):
            v = [v]
        canonical_map = {
            "discard": ActionVerb.DISCARD,
            "capture": ActionVerb.CAPTURE,
            "convert": ActionVerb.CONVERT,
            "conversion": ActionVerb.CONVERT,
            "remove from the game": ActionVerb.BANISH,
            "remove from game": ActionVerb.BANISH,
            "removal from the game": ActionVerb.BANISH,
            "removal from game": ActionVerb.BANISH,
            "banish": ActionVerb.BANISH,
            "return to hand": ActionVerb.BOUNCE,
            "bounce": ActionVerb.BOUNCE,
            "negate": ActionVerb.NEGATE,
            "negation": ActionVerb.NEGATE,
            "interrupt": ActionVerb.INTERRUPT,
            "band": ActionVerb.BAND,
            "rescue": ActionVerb.RESCUE,
            "decrease": ActionVerb.DECREASE,
            "increase": ActionVerb.INCREASE,
            "deactivate": ActionVerb.DEACTIVATE,
            "poison": ActionVerb.POISON,
            "paralyze": ActionVerb.PARALYZE,
            "side battle": ActionVerb.SIDE_BATTLE,
            "withdraw": ActionVerb.WITHDRAW,
        }
        res = []
        for item in v:
            act = None
            if isinstance(item, ActionVerb):
                cleaned_val = item.value.strip().lower()
                act = canonical_map.get(cleaned_val, item)
            elif isinstance(item, str):
                cleaned = item.strip().lower()
                act = canonical_map.get(
                    cleaned,
                    ActionVerb(cleaned) if cleaned in ActionVerb._value2member_map_ else ActionVerb.DISCARD,
                )
            if act is not None and act not in res:
                res.append(act)
        return res

    @field_validator("card_sources", mode="before")
    @classmethod
    def normalize_card_sources(cls, v: Any) -> Any:
        """Ensures card_sources is a list even if a single TargetSelector dictionary is provided."""
        if not v:
            return []
        if isinstance(v, (dict, TargetSelector)):
            return [v]
        return v
