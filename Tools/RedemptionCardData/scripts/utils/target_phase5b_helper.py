"""Shared Phase 5b selector normalization for exclude, ability targets, and ORDIR canonicalization."""

from __future__ import annotations

import copy
import json
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, FrozenSet, List, Optional, Set, Tuple, get_args

from models.enums.action_verb import ActionVerb, normalize_ability_filter_action
from models.enums.ordir import OrdirCategory
from models.enums.state_filter import StateFilter

_PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent


@lru_cache(maxsize=1)
def get_default_ordir_lookup() -> Dict[str, str]:
    """Loads lowercase->canonical ORDIR category lookup from the extended card database.

    Returns:
        Dictionary mapping lowercased ORDIR category names to canonical casing.
    """
    lookup: Dict[str, str] = {
        str(cat).strip().lower(): str(cat).strip()
        for cat in get_args(OrdirCategory)
        if str(cat).strip()
    }
    candidates = (
        _PROJECT_ROOT / "data" / "dist" / "cards_extended_with_ordir_fuzzy.json",
        _PROJECT_ROOT / "data" / "cards_extended_with_ordir_fuzzy.json",
    )
    for cand in candidates:
        if not cand.exists():
            continue
        try:
            raw = json.loads(cand.read_text(encoding="utf-8"))
            cards = raw["cards"] if isinstance(raw, dict) and "cards" in raw else raw
            if isinstance(cards, dict):
                cards = list(cards.values())
            for card in cards or []:
                if not isinstance(card, dict):
                    continue
                for cat in card.get("ORDIR") or []:
                    if cat:
                        lookup[str(cat).strip().lower()] = str(cat).strip()
                for side in (card.get("CardSides") or {}).values():
                    if isinstance(side, dict):
                        for cat in side.get("ORDIR") or []:
                            if cat:
                                lookup[str(cat).strip().lower()] = str(cat).strip()
            break
        except Exception:
            continue
    return lookup

# Explicitly approved non-ORDIR printed selector identifiers exported in ast_constants.json.
# Stage 10 enforces that every TargetSelector.identifiers token belongs either to the
# canonical ORDIR set from cards_extended_with_ordir_fuzzy.json or this fixed allowlist.
PRINTED_SELECTOR_IDENTIFIERS: Tuple[str, ...] = (
    "Token",
    "Bible icon",
    "Skull icon",
    "Dual icon",
    "Minor Prophet",
    "Major Prophet",
    "Son of Anak",
    "Child of Leah",
    "Child of Jacob",
    "Queen",
    "Church",
    "Number Enhancement",
    "Sacrifice Enhancement",
    "Side Battle Loser",
    "Lowest Toughness",
    "Smallest Toughness",
    "Named Card",
    "Rescuing Player",
    "Month: December",
    "Board Advantage",
    "Treated as Lost Soul",
    "Treated as Evil Character",
    "Hand Advantage",
    "Successful in Battle",
    "Opponent: >3 Brigades",
    "Hand > 10 Cards",
    "Hand > 4 Cards",
    "Not Owned by Controller",
    "Type Set Aside",
    "Has Scripture Reference",
    "Restrict: attack",
    "Restrict: control",
    "Ability Text: negated",
    "Ability Text: cannot be negated",
    "Ability Text: interrupt",
    "Ability Text: ignore",
    "Ability Text: repel",
    "Ability Text: repeat",
    "Ability Text: place",
    "Ability Text: capture",
    "Ability Text: discard",
    "Ability Text: immune",
    "Ability Text: prevent",
    "Ability Text: end the battle",
)

PRINTED_SELECTOR_IDENTIFIERS_LOWER: Dict[str, str] = {
    item.lower(): item for item in PRINTED_SELECTOR_IDENTIFIERS
}

# Exact phrase/short-form aliases mapped to canonical ORDIR categories (matched lowercased).
_ORDIR_ALIAS_MAP: Dict[str, str] = {
    "armor of god": "Armor of God Enhancement",
    "bows": "Bows, Arrows, Spears, Javelins and Darts",
    "arrows": "Bows, Arrows, Spears, Javelins and Darts",
    "spears": "Bows, Arrows, Spears, Javelins and Darts",
    "javelins": "Bows, Arrows, Spears, Javelins and Darts",
    "darts": "Bows, Arrows, Spears, Javelins and Darts",
    "centurion": "Roman Centurion",
    "colossae": "Colossae Church",
    "corinth": "Corinth Church",
    "depict an idol": "Depicting an Idol",
    "emperor": "Roman Emperor",
    "empty tomb": "Empty Tomb Hero",
    "ephesus": "Ephesus Church",
    "involve music": "Involves Music",
    "involving music": "Involves Music",
    "music": "Involves Music",
    "joppa": "Joppa Church",
    "king of judah": "King or Queen of Judah",
    "kings of israel": "King of Israel",
    "magicins": "Magician",
    "sorcerer": "Magician",
    "nativity": "Nativity Card",
    "philippi": "Philippi Church",
    "philosopher": "Scholars or Philosophers in the Title",
    "scholar": "Scholars or Philosophers in the Title",
    "with scholar": "Scholars or Philosophers in the Title",
    "prophecy": "Based on Prophecy",
    "soldier": "Roman Soldier",
    "spiritual gift": "Spiritual Gifts",
    "thessalonica": "Thessalonica Church",
    "thessalonian": "Thessalonica Church",
    "wilderness": "Wilderness Character",
    "daniel human": "Daniel Card",
    "jesus' 12 disciples": "Disciple",
    "known as one of jesus' 12 disciples": "Disciple",
}

# Exact phrase to printed non-ORDIR allowlist canonical token.
_PRINTED_ALIAS_MAP: Dict[str, str] = {
    "token": "Token",
    "tokens": "Token",
    "bible icon": "Bible icon",
    "skull icon": "Skull icon",
    "grim-reaper icon": "Skull icon",
    "grim reaper": "Skull icon",
    "dual icon": "Dual icon",
    "dual-icon": "Dual icon",
    "minor prophet": "Minor Prophet",
    "major prophet": "Major Prophet",
    "son of anak": "Son of Anak",
    "child of leah": "Child of Leah",
    "child of jacob": "Child of Jacob",
    "queen": "Queen",
    "church": "Church",
    "number": "Number Enhancement",
    "sacrifice": "Sacrifice Enhancement",
    "loser": "Side Battle Loser",
    "lowest toughness": "Lowest Toughness",
    "smallest toughness": "Smallest Toughness",
    "named card": "Named Card",
    "named hero": "Named Card",
    "rescuing player": "Rescuing Player",
    "rescuer": "Rescuing Player",
    "with \"negated\" in the special ability": "Ability Text: negated",
    "negated": "Ability Text: negated",
    "cannot be negated": "Ability Text: cannot be negated",
    "interrupt in special ability": "Ability Text: interrupt",
    "contains the word place in the special ability": "Ability Text: place",
    "december": "Month: December",
    "board advantage": "Board Advantage",
    "version of any character that has been successful in battle": "Successful in Battle",
    "any opponent with more than three brigades": "Opponent: >3 Brigades",
    "with more than 10 cards in hand": "Hand > 10 Cards",
    "more than 4 cards in hand": "Hand > 4 Cards",
    "not owned": "Not Owned by Controller",
    "type set aside": "Type Set Aside",
    "with an reference": "Has Scripture Reference",
    "attack": "Restrict: attack",
    "controlling": "Restrict: control",
}

# Tokens that map deterministically to structured ActionVerb ability filters.
# Value: (actions, targets_abilities_default)
_ABILITY_ACTION_TOKEN_MAP: Dict[str, Tuple[List[ActionVerb], bool]] = {
    "special abilities": ([], True),
    "special_ability": ([], True),
    "abilities": ([], True),
    "abilities on": ([], True),
    "band abilities": ([ActionVerb.BAND], True),
    "band ability": ([ActionVerb.BAND], False),
    "banding abilities": ([ActionVerb.BAND], True),
    "banding ability": ([ActionVerb.BAND], False),
    "with banding ability": ([ActionVerb.BAND], False),
    "evil banding abilities": ([ActionVerb.BAND], True),
    "banding": ([ActionVerb.BAND], False),
    "band": ([ActionVerb.BAND], False),
    "protect abilities": ([ActionVerb.PROTECT], True),
    "protect ability": ([ActionVerb.PROTECT], True),
    "protect": ([ActionVerb.PROTECT], False),
    "abilities on are of protect abilities": ([ActionVerb.PROTECT], True),
    "draw abilities": ([ActionVerb.DRAW], True),
    "draw ability": ([ActionVerb.DRAW], False),
    "drawing abilities": ([ActionVerb.DRAW], True),
    "card drawing abilities": ([ActionVerb.DRAW], True),
    "used draw ability": ([ActionVerb.DRAW], True),
    "used a draw ability": ([ActionVerb.DRAW], True),
    "used draw ability this turn": ([ActionVerb.DRAW], True),
    "draw_ability_used_this_turn": ([ActionVerb.DRAW], True),
    "draw": ([ActionVerb.DRAW], True),
    "drawing": ([ActionVerb.DRAW], True),
    "drawing cards by abilities they control": ([ActionVerb.DRAW], True),
    "search abilities": ([ActionVerb.SEARCH], True),
    "used search ability this turn": ([ActionVerb.SEARCH], True),
    "good search abilities": ([ActionVerb.SEARCH], True),
    "search": ([ActionVerb.SEARCH], True),
    "searching": ([ActionVerb.SEARCH], True),
    "search draw pile": ([ActionVerb.SEARCH], True),
    "draw or search ability": ([ActionVerb.DRAW, ActionVerb.SEARCH], True),
    "draw or search": ([ActionVerb.DRAW, ActionVerb.SEARCH], True),
    "look, reveal or search": ([ActionVerb.LOOK, ActionVerb.REVEAL, ActionVerb.SEARCH], True),
    "capture abilities": ([ActionVerb.CAPTURE], True),
    "capture ability": ([ActionVerb.CAPTURE], False),
    "with a capture ability": ([ActionVerb.CAPTURE], False),
    "capture": ([ActionVerb.CAPTURE], True),
    "convert ability": ([ActionVerb.CONVERT], False),
    "convert enhancement": ([ActionVerb.CONVERT], False),
    "convert": ([ActionVerb.CONVERT], False),
    "repent": ([ActionVerb.CONVERT], False),
    "causes an ec to repent": ([ActionVerb.CONVERT], False),
    "discard abilities": ([ActionVerb.DISCARD], True),
    "discard ability": ([ActionVerb.DISCARD], False),
    "discard cards from draw piles": ([ActionVerb.DISCARD], True),
    "immune abilities": ([ActionVerb.IMMUNE], True),
    "immune abilties on": ([ActionVerb.IMMUNE], True),
    "immunity on demons": ([ActionVerb.IMMUNE], True),
    "immunity": ([ActionVerb.IMMUNE], True),
    "immune": ([ActionVerb.IMMUNE], True),
    "ignore abilities": ([ActionVerb.IGNORE], True),
    "ignore": ([ActionVerb.IGNORE], True),
    "ignores": ([ActionVerb.IGNORE], False),
    "negate ability": ([ActionVerb.NEGATE], False),
    "negate": ([ActionVerb.NEGATE], True),
    "interrupt": ([ActionVerb.INTERRUPT], True),
    "prevent": ([ActionVerb.PREVENT], True),
    "heal abilities": ([ActionVerb.HEAL], True),
    "healing": ([ActionVerb.HEAL], False),
    "resurrect abilities": ([ActionVerb.RESURRECT], True),
    "toss abilities": ([ActionVerb.TOSS], True),
    "toss": ([ActionVerb.TOSS], True),
    "play abilities": ([ActionVerb.PLAY], True),
    "play enhancement": ([ActionVerb.PLAY], True),
    "playing enhancements during battle": ([ActionVerb.PLAY], True),
    "playing": ([ActionVerb.PLAY], True),
    "play": ([ActionVerb.PLAY], True),
    "place ability": ([ActionVerb.PLACE], False),
    "take abilities": ([ActionVerb.TAKE], True),
    "shuffle": ([ActionVerb.SHUFFLE], True),
    "withdraw": ([ActionVerb.WITHDRAW], True),
    "repel": ([ActionVerb.WITHDRAW], True),
    "deactivate": ([ActionVerb.DEACTIVATE], True),
    "deactivate an": ([ActionVerb.DEACTIVATE], True),
    "first strike ability": ([ActionVerb.FIRST_STRIKE], True),
    "site access": ([ActionVerb.SITE_ACCESS], True),
    "underdeck": ([ActionVerb.UNDERDECK], True),
    "repeat": ([ActionVerb.REPEAT], False),
    "end the battle": ([ActionVerb.END_BATTLE], True),
    "activate": ([ActionVerb.ACTIVATE_ARTIFACT], True),
    "rescue attempt": ([ActionVerb.RESCUE], True),
    "rescue": ([ActionVerb.RESCUE], True),
    "make a rescue attempt": ([ActionVerb.RESCUE], True),
    "make no rescue attempt": ([ActionVerb.RESCUE], True),
    "putting": ([ActionVerb.PLACE], True),
    "putting into sites": ([ActionVerb.PLACE], True),
    "protect abilities on": ([ActionVerb.PROTECT], True),
    "with a negate ability": ([ActionVerb.NEGATE], False),
    "without special abilities": ([], False),
}

# Ability exception tokens -> exclude_ability_actions
_EXCLUDE_ABILITY_MAP: Dict[str, List[ActionVerb]] = {
    "except band abilities": [ActionVerb.BAND],
    "except banding": [ActionVerb.BAND],
}

# Tokens that reduce count by all-but-one (`count = count_cards - 1`).
_ALL_BUT_ONE_TOKENS: FrozenSet[str] = frozenset({
    "except 1",
    "but one",
    "except one",
    "all but one",
    "all but one hero in battle",
})

# Static/structural exclude definitions keyed by lowercase token.
_EXCLUDE_SELECTOR_MAP: Dict[str, Dict[str, Any]] = {
    "except a character": {"target_type": "character"},
    "except characters": {"target_type": "character"},
    "non-character": {"target_type": "character"},
    "except a hero": {"target_type": "hero"},
    "except hero": {"target_type": "hero"},
    "except heroes": {"target_type": "hero"},
    "except a human": {"is_human": True},
    "except human": {"is_human": True},
    "except cloud cards": {"is_cloud": True},
    "except ? cards": {"is_cloud": True},
    "except * cards": {"is_star": True},
    "except a dominant": {"target_type": "dominant"},
    "except dominant": {"target_type": "dominant"},
    "except dominants": {"target_type": "dominant"},
    "unless it is a dominant": {"target_type": "dominant"},
    "except a dominant or artifact card": {
        "any_of": [{"target_type": "dominant"}, {"target_type": "artifact"}]
    },
    "except a lost soul": {"target_type": "lost_soul"},
    "except lost soul": {"target_type": "lost_soul"},
    "except lost souls": {"target_type": "lost_soul"},
    "except a lost soul card": {"target_type": "lost_soul"},
    "except lost soul cards": {"target_type": "lost_soul"},
    "not lost souls": {"target_type": "lost_soul"},
    "except heroes and lost souls": {
        "any_of": [{"target_type": "hero"}, {"target_type": "lost_soul"}]
    },
    "except dominant or angel": {
        "any_of": [
            {"target_type": "dominant"},
            {"target_type": "character", "identifiers": ["Angel"]},
        ]
    },
    "except a token": {"identifiers": ["Token"]},
    "except tokens": {"identifiers": ["Token"]},
    "except warrior class": {"classes": ["Warrior"]},
    "non-warrior": {"classes": ["Warrior"]},
    "non-warrior class": {"classes": ["Warrior"]},
    "non-weapon": {"classes": ["Weapon"]},
    "non-weapon class": {"classes": ["Weapon"]},
    "except good weapons": {
        "alignment": "good",
        "classes": ["Weapon"],
        "target_type": "enhancement",
    },
    "except good warriors": {
        "alignment": "good",
        "classes": ["Warrior"],
        "target_type": "character",
    },
    "except silver": {"brigades": ["Silver"]},
    "except orange": {"brigades": ["Orange"]},
    "except brown": {"brigades": ["Brown"]},
    "except gold and pale green": {"brigades": ["Gold", "Pale Green"]},
    "except angels": {"identifiers": ["Angel"]},
    "except by an angel": {"target_type": "character", "identifiers": ["Angel"]},
    "except persians": {"identifiers": ["Persian"]},
    "except romans": {"identifiers": ["Roman"]},
    "non-roman": {"identifiers": ["Roman"]},
    "except kings": {"identifiers": ["King"]},
    "except a king": {"identifiers": ["King"]},
    "non-royal": {"identifiers": ["Royalty"]},
    "non-prophet": {"identifiers": ["Prophet"]},
    "except flood survivors": {"identifiers": ["Flood Survivor"]},
    "except giant slayers": {"identifiers": ["Giant Slayer"]},
    "except giant-slayers": {"identifiers": ["Giant Slayer"]},
    "except giant slayer": {"identifiers": ["Giant Slayer"]},
    "except temple artifact": {
        "target_type": "artifact",
        "identifiers": ["Temple Artifact"],
    },
    "except a tabernacle artifact": {
        "target_type": "artifact",
        "identifiers": ["Tabernacle Artifact"],
    },
    "except tabernacle and temple artifacts": {
        "target_type": "artifact",
        "any_of": [
            {"identifiers": ["Tabernacle Artifact"]},
            {"identifiers": ["Temple Artifact"]},
        ],
    },
    "except wilderness characters": {
        "target_type": "character",
        "identifiers": ["Wilderness Character"],
    },
    "except empty tomb heroes": {
        "target_type": "hero",
        "identifiers": ["Empty Tomb Hero"],
    },
    "except good nativity cards": {
        "alignment": "good",
        "identifiers": ["Nativity Card"],
    },
    "except good revelation cards": {
        "alignment": "good",
        "identifiers": ["Revelation Card"],
    },
    "except acts characters": {
        "target_type": "character",
        "identifiers": ["Acts Card"],
    },
    "except acts cards": {"identifiers": ["Acts Card"]},
    "except a daniel enhancement": {
        "target_type": "enhancement",
        "identifiers": ["Daniel Card"],
    },
    "except daniel humans": {"is_human": True, "references": ["Daniel"]},
    "except daniel cards": {"references": ["Daniel"]},
    "except joshua artifacts": {"target_type": "artifact", "references": ["Joshua"]},
    "non-weapon class special abilities": {"classes": ["Weapon"]},
    "except judges enhancements": {
        "target_type": "enhancement",
        "references": ["Judges"],
    },
    "except ruth heroes": {"target_type": "hero", "references": ["Ruth"]},
    "except meek heroes": {"target_type": "hero", "is_meek": True},
    "except a meek hero": {"target_type": "hero", "is_meek": True},
    "except n.t. hero": {"target_type": "hero", "testament": "NT"},
    "except good o.t. priests": {
        "alignment": "good",
        "testament": "OT",
        "identifiers": ["Priest"],
    },
    "except good prophets": {"alignment": "good", "identifiers": ["Prophet"]},
    "except a roman or high priest": {
        "any_of": [{"identifiers": ["Roman"]}, {"identifiers": ["High Priest"]}]
    },
    "other than a priest": {"identifiers": ["Priest"]},
    "except job": {"references": ["Job"]},
    "except job reference": {"references": ["Job"]},
    "except those with a job reference": {"references": ["Job"]},
    "except lone priests": {
        "identifiers": ["Priest"],
        "state_filters": [StateFilter.LONE.value],
    },
    "except on a musician": {"used_by": {"identifiers": ["Musician"]}},
    "except on heroes": {"used_by": {"target_type": "hero"}},
    "except an emperor": {"identifiers": ["Roman Emperor"]},
    "except archer": {"card_titles": ["Archer", "Archers"]},
    "except a card in battle": {"scope": ["battle"]},
    "not held in sites": {"used_by": {"target_type": "site"}},
    "except haman": {"card_titles": ["Haman"]},
    "except mary": {"card_titles": ["Mary"]},
    "except nergalsharezer": {"card_titles": ["Nergalsharezer"]},
    "except thorns and thistles": {"card_titles": ["Thorns and Thistles"]},
    "excluding michael": {"card_titles": ["Michael"]},
    "excluding gabriel": {"card_titles": ["Gabriel"]},
    "except rome": {"card_titles": ["Rome"]},
    "except the 'lost souls' card": {"card_titles": ['Lost Soul "Lost Souls"']},
    "except another copy of this card": {"card_titles": ['Lost Soul "Wanderer"']},
    "except their first one each turn": {
        "state_filters": [StateFilter.FIRST_PLAYED_THIS_TURN.value]
    },
    "except those of matching brigade to another character that player controls": {
        "relative_filters": [
            {"attribute": "brigade", "relation": "same", "reference": "actor"}
        ]
    },
    "except by your ability": {"zone_owner": "controller"},
    "except by your special ability": {"zone_owner": "controller"},
    "except those who control an evil prophet": {
        "zone_owner": "opponent",
        "used_by": {
            "target_type": "character",
            "alignment": "evil",
            "identifiers": ["Prophet"],
        },
    },
    "who is not a prophet": {"identifiers": ["Prophet"]},
}

# Title words / exact card titles accidentally dropped into TargetSelector.identifiers.
_CARD_TITLE_TOKEN_MAP: Dict[str, List[str]] = {
    "ananias": ["Ananias"],
    "ashdod": ["Ashdod"],
    "babylon": ["Babylon"],
    "bearing david's name": ["David"],
    "bethany": ["Bethany"],
    "chief priest": ["Chief Priest", "Chief Priests"],
    "deceit": ["Deceit"],
    "deceived": ["Deceived"],
    "deception": ["Deception"],
    "dragonraid": ["Dragon Raid"],
    "elah": ["King Elah"],
    "faith": ["Faith"],
    "false": ["False"],
    "hero": ["Hero"],
    "herodian": ["Herodian", "Herodians"],
    "holy of holies": ["Holy of Holies"],
    "jericho": ["Jericho"],
    "jehoiada the high": ["Jehoiada the High Priest"],
    "kingdoms of this world (kotw)": ["Kingdoms of the World"],
    "lacking sleep": ["Lacking Sleep"],
    "lie": ["Lie", "Lies"],
    "lies": ["Lie", "Lies"],
    "lying": ["Lying"],
    "mist": ["Mist"],
    "prison": ["Prison"],
    "roman spearmen": ["Roman Spearmen"],
    "samaria": ["Samaria"],
    "scribe": ["Scribe", "Scribes"],
    "shield of faith is": ["Shield of Faith"],
    "spy": ["Spy"],
    "the tabernacle": ["The Tabernacle"],
    "trumpet": ["Trumpet", "Trumpets"],
    "vain": ["Vain"],
    "widows' tables": ["Widows' Tables"],
    "zedekiah": ["King Zedekiah"],
}

# State/boolean/reference tokens from Phase 5b audit that map onto structured fields.
_EXTRA_STATE_FILTER_MAP: Dict[str, str] = {
    "blocker": StateFilter.BLOCKING.value,
    "being targeted": StateFilter.PROTECTED.value,
    "drawn card": StateFilter.DRAWN_THIS_TURN.value,
    "drawn cards": StateFilter.DRAWN_THIS_TURN.value,
    "cards_drawn_this_turn": StateFilter.DRAWN_THIS_TURN.value,
    "drawn this turn by special ability": StateFilter.DRAWN_THIS_TURN.value,
    "played": StateFilter.PLAYED_THIS_BATTLE.value,
    "played by opponent this battle": StateFilter.PLAYED_THIS_BATTLE.value,
    "played by an opponent this battle": StateFilter.PLAYED_THIS_BATTLE.value,
    "first enhancement": StateFilter.FIRST_PLAYED_THIS_BATTLE.value,
    "just_defeated": StateFilter.ABOUT_TO_BE_DISCARDED.value,
    "last removed from battle": StateFilter.LAST_PLAYED.value,
    "on a hero": StateFilter.ATTACHED_TO_SELF.value,
    "on evil character": StateFilter.ATTACHED_TO_SELF.value,
    "on human heroes": StateFilter.ATTACHED_TO_SELF.value,
    "on characters": StateFilter.ATTACHED_TO_SELF.value,
    "on that hero": StateFilter.ATTACHED_TO_SELF.value,
    "placed": StateFilter.ATTACHED_TO_SELF.value,
    "placed on a hero": StateFilter.ATTACHED_TO_SELF.value,
    "placed on heroes by you": StateFilter.ATTACHED_TO_SELF.value,
    "placed on selected hero": StateFilter.ATTACHED_TO_SELF.value,
    "played on thomas": StateFilter.ATTACHED_TO_SELF.value,
    "has this card": StateFilter.ATTACHED_TO_SELF.value,
    "this": StateFilter.HELD_BY_SELF.value,
    "returned": StateFilter.IN_SAME_ZONE.value,
    "rescuing": StateFilter.RESCUING.value,
    "bearer": StateFilter.HELD_BY_SELF.value,
    "next opponent plays this battle": StateFilter.NEXT_PLAYED.value,
    "taunting": StateFilter.ATTACKING.value,
    "guarding": StateFilter.BLOCKING.value,
    "guarding it": StateFilter.HELD_BY_SELF.value,
    "in it": StateFilter.HELD_BY_SELF.value,
    "it": StateFilter.HELD_BY_SELF.value,
    "fighting": StateFilter.IN_BATTLE.value,
}

# Named host container Fortresses/Sites -> structured `used_by` TargetSelector + scope.
_HOST_CONTAINER_MAP: Dict[str, Tuple[List[str], Dict[str, Any]]] = {
    "in storehouse": (["territory"], {"target_type": "fortress", "card_titles": ["Storehouse"]}),
    "from opponent's storehouse": (["territory"], {"target_type": "fortress", "zone_owner": "opponent", "card_titles": ["Storehouse"]}),
    "that fortress": (["in_play"], {"target_type": "fortress"}),
    "placed on lost soul site": (["in_play"], {"target_type": "site", "state_filters": [StateFilter.OCCUPIED.value]}),
    "on a hero in battle": (["battle"], {"target_type": "hero", "state_filters": [StateFilter.IN_BATTLE.value]}),
    "on rescuing meek hero": (["battle"], {"target_type": "hero", "zone_owner": "controller", "is_meek": True, "state_filters": [StateFilter.RESCUING.value]}),
    "in solomon's temple": (["in_play"], {"target_type": "fortress", "card_titles": ["Solomon's Temple"]}),
    "in your tabernacle": (["in_play"], {"target_type": "fortress", "zone_owner": "controller", "card_titles": ["The Tabernacle"]}),
    "on the tabernacle": (["in_play"], {"target_type": "fortress", "card_titles": ["The Tabernacle"]}),
    "from demonic stronghold": (["in_play", "set_aside"], {"target_type": "fortress", "card_titles": ["Demonic Stronghold"]}),
    "a hero is in noah's ark": (["in_play", "set_aside"], {"target_type": "fortress", "card_titles": ["Noah's Ark"]}),
    "on tartaros": (["in_play", "set_aside"], {"target_type": "site", "card_titles": ["Tartaros"]}),
    "where a lost soul is held prisoner": (["in_play"], {"state_filters": [StateFilter.OCCUPIED.value]}),
    "held by site": (["in_play"], {"target_type": "site"}),
    "held at prison-title site": (["in_play"], {"target_type": "site", "card_titles": ["Prison"]}),
    "in one site": (["in_play"], {"target_type": "site"}),
    "in opponent's site": (["in_play"], {"target_type": "site", "zone_owner": "opponent"}),
    "from one of your sites": (["in_play"], {"target_type": "site", "zone_owner": "controller"}),
    "into unoccupied sites": (["in_play"], {"target_type": "site", "state_filters": [StateFilter.UNOCCUPIED.value]}),
    "in sites": (["in_play"], {"target_type": "site"}),
    "from sites": (["in_play"], {"target_type": "site"}),
    "from this site": (["in_play"], {"target_type": "site", "state_filters": [StateFilter.HELD_BY_SELF.value]}),
    "special abilities on opponents' n.t. fortresses": (["in_play"], {"target_type": "fortress", "zone_owner": "opponent", "testament": "NT"}),
}

# Zone-scope hints inside identifiers.
_ZONE_TOKEN_MAP: Dict[str, List[str]] = {
    "land of bondage": ["land_of_bondage"],
    "lands of bondage": ["land_of_bondage"],
    "redeemed": ["land_of_redemption"],
    "redeemed soul": ["land_of_redemption"],
    "in potter's field": ["discard_pile"],
    "set-aside areas": ["set_aside"],
    "set-aside area": ["set_aside"],
    "in the darkness": ["set_aside"],
    "the darkness": ["set_aside"],
    "'the darkness' and its contents": ["set_aside"],
    "in play": ["in_play"],
    "in territories": ["territory"],
    "in territory": ["territory"],
    "in a territory": ["territory"],
    "other territories": ["territory"],
    "territory": ["territory"],
    "players territory": ["territory"],
    "from each territory": ["territory"],
    "in each territory": ["territory"],
    "an opponent's territory": ["territory"],
    "opponent's territory": ["territory"],
    "an opponent's territory to your territory until the end of turn": ["territory"],
    "additional from his territory": ["territory"],
    "from hand": ["hand"],
    "to hand": ["hand"],
    "hand": ["hand"],
    "deck": ["deck"],
    "into deck": ["deck"],
    "into owner's draw pile": ["deck"],
    "bottom of an opponent's deck": ["deck"],
    "from all discard piles": ["discard_pile"],
    "reserve": ["reserve_pile"],
    "from an opponent's discard pile": ["discard_pile"],
    "battle": ["battle"],
    "during battle": ["battle"],
    "battle phase": ["battle"],
    "during the battle phase": ["battle"],
    "during the next battle phase": ["battle"],
    "cards in play and set-aside areas": ["in_play", "set_aside"],
}

# Pure grammatical/quantifier/duration/action noise tokens that already live on ActionEffect
# or Condition fields and should never remain inside TargetSelector.identifiers.
_PURE_NOISE_TOKENS: FrozenSet[str] = frozenset({
    "10",
    "2",
    "2 flood survivors",
    "2 turns",
    "3 turns",
    "4 turns",
    "after 2 turns",
    "for 1 turn",
    "for 3 turns",
    "for 4 turns",
    "for two turns",
    "additional",
    "an",
    "and its contents",
    "any/all evil brigades",
    "at",
    "back into their owners' draw piles",
    "begin as a battle challenge",
    "bottom",
    "bottom of deck",
    "bottom card of each opponent's deck",
    "bottom x",
    "brigade",
    "cannot_be_targeted",
    "card to resurrect their human",
    "cards except in one opponent's discard pile",
    "controls a king",
    "covenant being used as an",
    "deactivate an",
    "decreased toughness",
    "different",
    "each brigade",
    "each turn until */1",
    "enter battle",
    "evil brigade",
    "evil enhancements from any evil brigade",
    "evil enhancements from hand",
    "fewer redeemed souls",
    "first",
    "first that each opponent put this game",
    "for each babylonian site",
    "from",
    "from all kotw sites",
    "from any brigade color",
    "from each opponent",
    "from evil fortress",
    "from here as if played from hand",
    "having a reference on card",
    "his strength",
    "holder's",
    "if controller controls 0 evil characters",
    "if you reserve at least 9",
    "in",
    "in any order",
    "initiative",
    "into owners' deck",
    "limit 3",
    "limit 6",
    "maximum 2",
    "most lost souls",
    "next battle phase",
    "one",
    "one brigade",
    "one evil brigade",
    "opponent's",
    "opponents",
    "opponents'",
    "opponents' this turn",
    "opponents' while he is",
    "opposing",
    "or 12/12 if used by an exodus hero",
    "or 2 if used by andrew",
    "or 3 evil cards if used by job",
    "other card in site",
    "over 7",
    "owned",
    "phase after put in play",
    "played while your n.t. human is alone",
    "played with female heroes",
    "previous",
    "redirect an",
    "redirect an played by an opponent",
    "regardless of brigade",
    "regardless of brigade if played in battle",
    "regardless of protection",
    "remain in battle",
    "remains",
    "rest",
    "same icon as removed dominant",
    "skip",
    "skip battle phase",
    "skip next draw phase",
    "source_of_trigger",
    "successful rescue during 4 turns",
    "target",
    "that brigade color",
    "this card",
    "this turn",
    "to attack",
    "top",
    "top 6 cards",
    "top card",
    "top from any draw pile",
    "top x",
    "top x cards",
    "turn",
    "until a lost soul is revealed",
    "until healed",
    "until this card leaves play",
    "up to 2",
    "up to 3 characters",
    "up to x",
    "up to x cards",
    "uses to rescue",
    "without making a successful rescue",
    "without using it",
    "x",
    "your human",
    "becomes crimson evil character",
    "to a gray brigade evil character",
    "to a hero in any brigade",
    "to a hero in brigade of your choice",
    "green brigade hero",
    "white brigade hero",
    "treated as discarded heroes",
    "abilities (*/*)",
    "worth half",
    "worth triple face value",
    "multiply abilities by evil characters in battle",
    "ignore angels",
    "-brigade",
    "-class",
    "-class enhancement on a",
    "after battle",
    "band to a male",
    "cannot enter battle",
    "card placed on a",
    "cards in this",
    "controlled by each player",
    "covenants on this",
    "enhancement placed on a",
    "has contents, placed on, equipped to, or activated on",
    "may band to a human.",
    "number of",
    "pile",
    "placed card on a",
    "rescuer loses access",
    "resurrect a",
    "this card to reserve a",
    "this into that pile",
    "while this panic demon remains",
})


def _merge_exclude_dict(existing: Optional[Dict[str, Any]], addition: Dict[str, Any]) -> Dict[str, Any]:
    """Deep-merges filter constraints into an exclude selector dictionary."""
    base = copy.deepcopy(existing) if isinstance(existing, dict) else {}
    if not base:
        base.setdefault("selection_mode", "automatic_all")
    for k, v in addition.items():
        if k not in base or base[k] in (None, [], False, ""):
            base[k] = copy.deepcopy(v)
        elif isinstance(base[k], list) and isinstance(v, list):
            for item in v:
                if item not in base[k]:
                    base[k].append(copy.deepcopy(item))
    return base


def _append_unique(target: List[Any], items: List[Any]) -> List[Any]:
    """Appends items preserving order and uniqueness."""
    for item in items:
        if item not in target:
            target.append(item)
    return target


def _try_promote_ability_text_or_meek(low: str, sel: Dict[str, Any], action: str) -> bool:
    """Handles self-contained card-state flags like is_meek, is_cloud, is_star."""
    if low in {
        "has no special ability",
        "no special ability",
        "with no special ability",
        "without special abilities",
    }:
        sel["is_meek"] = True
        return True
    if low == "?":
        sel["is_cloud"] = True
        return True
    if low == "* abilities":
        sel["is_star"] = True
        sel["targets_abilities"] = True
        return True
    if low == "o.t.*":
        sel["is_star"] = True
        sel["testament"] = sel.get("testament") or "OT"
        sel["targets_abilities"] = True
        return True
    if low == "leprosy":
        if action != "disease":
            idents = list(sel.get("identifiers") or [])
            _append_unique(idents, ["Disease"])
            sel["identifiers"] = idents
        return True
    if low in {"diseases", "poisons"}:
        idents = list(sel.get("identifiers") or [])
        _append_unique(idents, ["Disease" if low == "diseases" else "Poison"])
        sel["identifiers"] = idents
        return True
    return False


def promote_phase5b_fields(
    sel: Dict[str, Any],
    ordir_lookup: Optional[Dict[str, str]] = None,
    action: str = "",
) -> None:
    """Deterministically promotes Phase 5b excludes, ability filters, and ORDIR canonical tags.

    Mutates ``sel`` (and recursively ``any_of``, ``used_by``, ``exclude``) in place so
    that every element in ``identifiers`` is either an exact canonical ORDIR category
    or an explicitly approved ``PRINTED_SELECTOR_IDENTIFIERS`` value.

    Args:
        sel: Mutable TargetSelector or TargetSelectorBranch dictionary.
        ordir_lookup: Lowercase-keyed mapping to exact canonical ORDIR category strings.
        action: Enclosing ActionEffect/cost action string, used for context disambiguation.
    """
    if not isinstance(sel, dict):
        return
    if ordir_lookup is None:
        ordir_lookup = get_default_ordir_lookup()

    for branch in sel.get("any_of") or []:
        if isinstance(branch, dict):
            promote_phase5b_fields(branch, ordir_lookup=ordir_lookup, action=action)

    used_by = sel.get("used_by")
    if isinstance(used_by, dict):
        promote_phase5b_fields(used_by, ordir_lookup=ordir_lookup, action=action)

    excl_obj = sel.get("exclude")
    if isinstance(excl_obj, dict):
        promote_phase5b_fields(excl_obj, ordir_lookup=ordir_lookup, action=action)

    idents = list(sel.get("identifiers") or [])
    if not idents:
        return

    low_all = {str(x).strip().lower() for x in idents}
    tt = str(sel.get("target_type") or "").strip().lower()
    kept_idents: List[str] = []

    for raw_tok in idents:
        tok = str(raw_tok).strip()
        if not tok:
            continue
        low = tok.lower()

        # 1. Self / negation-action exceptions
        if low in {"except this ability", "except this special ability"}:
            sel["exclude_self"] = True
            continue
        if low in _EXCLUDE_ABILITY_MAP:
            excl_acts = list(sel.get("exclude_ability_actions") or [])
            for act in _EXCLUDE_ABILITY_MAP[low]:
                if act.value not in excl_acts:
                    excl_acts.append(act.value)
            sel["exclude_ability_actions"] = excl_acts
            continue
        if low == "except banding and warrior class":
            excl_acts = list(sel.get("exclude_ability_actions") or [])
            if ActionVerb.BAND.value not in excl_acts:
                excl_acts.append(ActionVerb.BAND.value)
            sel["exclude_ability_actions"] = excl_acts
            sel["exclude"] = _merge_exclude_dict(sel.get("exclude"), {"classes": ["Warrior"]})
            continue

        # 2. All-but-one count pattern ('except 1', 'but one', 'all but one')
        if low in _ALL_BUT_ONE_TOKENS:
            if sel.get("count") is None:
                sel["count"] = {
                    "dynamic": {
                        "source": "count_cards",
                        "operation": "add",
                        "multiplier": 1,
                        "offset": -1,
                    }
                }
            continue

        # 3. Exclude selector clauses ('except ...', 'non-...', 'other than ...')
        if low in _EXCLUDE_SELECTOR_MAP:
            addition = copy.deepcopy(_EXCLUDE_SELECTOR_MAP[low])
            if "identifiers" in addition:
                addition["identifiers"] = [
                    ordir_lookup.get(x.lower(), PRINTED_SELECTOR_IDENTIFIERS_LOWER.get(x.lower(), x))
                    for x in addition["identifiers"]
                ]
            if low == "non-weapon class special abilities":
                sel["targets_abilities"] = True
            sel["exclude"] = _merge_exclude_dict(sel.get("exclude"), addition)
            continue

        # 3b. Contextual single-word type/reference/opponent tokens
        if low == "daniel":
            refs = list(sel.get("references") or [])
            _append_unique(refs, ["Daniel"])
            sel["references"] = refs
            continue
        if low == "banished by an opponent" or low == "discarded from draw pile by opponent":
            if sel.get("used_by") is None:
                sel["used_by"] = "opponent"
            continue
        if low == "follower":
            titles = list(sel.get("card_titles") or [])
            _append_unique(titles, ["Follower Token"])
            sel["card_titles"] = titles
            _append_unique(kept_idents, ["Token"])
            continue
        if low == "character":
            if not sel.get("target_type"):
                sel["target_type"] = "character"
            continue
        if low in {"human character", "your human characters"}:
            if not sel.get("target_type"):
                sel["target_type"] = "character"
            sel["is_human"] = True
            if low == "your human characters":
                sel["zone_owner"] = "controller"
            continue

        # 4. Compound context disambiguations before generic maps
        if low == "high" and "priest" in low_all:
            kept_idents = [x for x in kept_idents if x.lower() != "priest"]
            _append_unique(kept_idents, ["High Priest"])
            continue
        if low == "soldier" and "roman" in low_all:
            kept_idents = [x for x in kept_idents if x.lower() != "roman"]
            _append_unique(kept_idents, ["Roman Soldier"])
            continue
        if low in {"israel", "israelite"}:
            if "king" in low_all or tt in {"character", "hero", "evil_character"}:
                kept_idents = [x for x in kept_idents if x.lower() != "king"]
                _append_unique(kept_idents, ["King of Israel"])
                continue
        if low == "judah":
            _append_unique(kept_idents, ["King or Queen of Judah"])
            continue
        if low == "queen" and ("king of judah" in low_all or "judah" in low_all or tt in {"hero", "evil_character"} and any("judah" in str(r).lower() for r in (sel.get("references") or []))):
            _append_unique(kept_idents, ["King or Queen of Judah"])
            continue
        if low == "minor" and "prophet" in low_all:
            kept_idents = [x for x in kept_idents if x.lower() != "prophet"]
            _append_unique(kept_idents, ["Minor Prophet"])
            continue
        if low in {"jerusalem", "damascus"}:
            if tt in {"site", "fortress"} or action == "site access":
                titles = list(sel.get("card_titles") or [])
                _append_unique(titles, [tok.title()])
                sel["card_titles"] = titles
                continue
            tag = "Jerusalem Church" if low == "jerusalem" else "Damascus Church"
            _append_unique(kept_idents, [tag])
            continue
        if low == "christ" or low == "jesus":
            _append_unique(kept_idents, ["Christ or Jesus in the Title or Scripture Verse"])
            continue
        if low == "genesis":
            _append_unique(kept_idents, ["Genesis Card"])
            continue
        if low == "19":
            refs = list(sel.get("references") or [])
            if "12" in low_all or any("revelation" in r.lower() for r in refs):
                _append_unique(kept_idents, ["Revelation 12-19 Character"])
            else:
                _append_unique(kept_idents, ["Acts 19 Card"])
                _append_unique(refs, ["Acts 19"])
                sel["references"] = refs
            continue
        if low == "12" and any("revelation" in str(r).lower() for r in (sel.get("references") or [])):
            _append_unique(kept_idents, ["Revelation 12-19 Character"])
            refs = list(sel.get("references") or [])
            if "Revelation" in refs and "Revelation 12-19" not in refs:
                refs = ["Revelation 12-19" if r == "Revelation" else r for r in refs]
            sel["references"] = refs
            continue
        if low in {"21", "35"} and any("genesis" in str(r).lower() for r in (sel.get("references") or [])):
            _append_unique(kept_idents, ["Genesis 21-35 Enhancement"])
            continue
        if low == "14-18":
            _append_unique(kept_idents, ["II Samuel 14-18 Character"])
            refs = list(sel.get("references") or [])
            _append_unique(refs, ["II Samuel 14-18"])
            sel["references"] = refs
            continue
        if low == "capture" and action == "discard" and "discard" in low_all:
            # Haman's Plot Exposed: word 'capture' or 'discard' in special ability
            _append_unique(kept_idents, ["Ability Text: capture", "Ability Text: discard"])
            continue
        if low == "discard" and action == "discard" and "capture" in low_all:
            _append_unique(kept_idents, ["Ability Text: capture", "Ability Text: discard"])
            continue
        if low == "repeat" and action == "protect":
            _append_unique(kept_idents, ["Ability Text: repeat"])
            continue
        if low == "ignores" and action in {"search", "play"}:
            _append_unique(kept_idents, ["Ability Text: ignore"])
            continue
        if low == "ignore" and action == "gain":
            _append_unique(kept_idents, ["Ability Text: ignore"])
            continue
        if low in {"treated as a lost soul", "treated as lost soul"}:
            if action in {"convert", "bounce"}:
                _append_unique(kept_idents, ["Treated as Lost Soul"])
            continue
        if low == "treated as evil character":
            _append_unique(kept_idents, ["Treated as Evil Character"])
            continue
        if low == "multi-color site":
            sfs = list(sel.get("state_filters") or [])
            _append_unique(sfs, [StateFilter.MULTI_BRIGADE.value])
            sel["state_filters"] = sfs
            if not sel.get("target_type"):
                sel["target_type"] = "site"
            continue
        if low == "captured angels":
            _append_unique(kept_idents, ["Angel"])
            sfs = list(sel.get("state_filters") or [])
            _append_unique(sfs, [StateFilter.CAPTURED.value])
            sel["state_filters"] = sfs
            continue
        if low == "special abilities used by opponent":
            sel["targets_abilities"] = True
            if sel.get("used_by") is None:
                sel["used_by"] = "opponent"
            continue
        if low == "good search abilities":
            if not sel.get("alignment"):
                sel["alignment"] = "good"
        if low == "access to rescue the jeremiah 7:18 lost soul":
            refs = list(sel.get("references") or [])
            _append_unique(refs, ["Jeremiah 7:18"])
            sel["references"] = refs
            continue
        if low == "removed by noah's ark":
            if sel.get("used_by") is None:
                sel["used_by"] = {"target_type": "fortress", "card_titles": ["Noah's Ark"]}
            continue
        if low == "remove":
            sel["targets_abilities"] = True
            existing_acts = list(sel.get("ability_target_actions") or [])
            for act in (ActionVerb.BANISH, ActionVerb.DISCARD, ActionVerb.TAKE):
                if act.value not in existing_acts:
                    existing_acts.append(act.value)
            sel["ability_target_actions"] = existing_acts
            continue
        if low == "michael and enhancements played with him":
            titles = list(sel.get("card_titles") or [])
            _append_unique(titles, ["Michael"])
            sel["card_titles"] = titles
            continue
        if low == "house of eleazar abilities on":
            _append_unique(kept_idents, ["House of Eleazar"])
            continue
        if low == "discard" and action == "discard":
            continue
        if low == "cards_drawn_this_turn":
            sfs = list(sel.get("state_filters") or [])
            _append_unique(sfs, [StateFilter.DRAWN_THIS_TURN.value])
            sel["state_filters"] = sfs
            existing_acts = list(sel.get("ability_target_actions") or [])
            if ActionVerb.DRAW.value not in existing_acts:
                existing_acts.append(ActionVerb.DRAW.value)
            sel["ability_target_actions"] = existing_acts
            continue
        if low == "rescuer" or low == "rescuing player":
            sfs = list(sel.get("state_filters") or [])
            _append_unique(sfs, [StateFilter.RESCUING.value])
            sel["state_filters"] = sfs
            if sel.get("used_by") is None:
                sel["used_by"] = "opponent"
            continue
        if low == "any/all evil brigades" or low == "evil brigade":
            if not sel.get("alignment"):
                sel["alignment"] = "evil"
            continue

        # 5. Exact ORDIR match (canonical case normalization)
        if low in ordir_lookup:
            _append_unique(kept_idents, [ordir_lookup[low]])
            continue

        # 6. ORDIR canonical shortcut alias
        if low in _ORDIR_ALIAS_MAP:
            canon = _ORDIR_ALIAS_MAP[low]
            canon = ordir_lookup.get(canon.lower(), canon)
            _append_unique(kept_idents, [canon])
            continue

        # 7. Meek/Cloud/Star/Disease boolean & tag handling
        if _try_promote_ability_text_or_meek(low, sel, action):
            continue

        # 8. Exact CardTitle / Title-Substring resolution
        if low in _CARD_TITLE_TOKEN_MAP:
            titles = list(sel.get("card_titles") or [])
            _append_unique(titles, _CARD_TITLE_TOKEN_MAP[low])
            sel["card_titles"] = titles
            continue

        # 9. Ability target verbs (`targets_abilities`, `ability_target_actions`)
        if low in _ABILITY_ACTION_TOKEN_MAP:
            acts, is_ability_target = _ABILITY_ACTION_TOKEN_MAP[low]
            if action in {"protect", "immune", "prevent", "negate", "restrict", "gain"} and not is_ability_target and low in {"banding", "band", "convert", "protect"}:
                if low == "convert" and tt == "enhancement":
                    sel["targets_abilities"] = bool(sel.get("targets_abilities"))
                elif low in {"band", "banding"} and action in {"restrict", "negate", "prevent", "gain"}:
                    is_ability_target = True
            if is_ability_target:
                sel["targets_abilities"] = True
            existing_acts = list(sel.get("ability_target_actions") or [])
            for act in acts:
                if act.value not in existing_acts:
                    existing_acts.append(act.value)
            sel["ability_target_actions"] = existing_acts
            continue

        # 10. Extra StateFilters
        if low in _EXTRA_STATE_FILTER_MAP:
            sfs = list(sel.get("state_filters") or [])
            _append_unique(sfs, [_EXTRA_STATE_FILTER_MAP[low]])
            sel["state_filters"] = sfs
            continue

        # 10c. Named host containers & site guards -> structured scope + used_by/state_filters
        if low in _HOST_CONTAINER_MAP:
            scopes_to_add, host_spec = _HOST_CONTAINER_MAP[low]
            scopes = list(sel.get("scope") or [])
            if scopes == ["in_play"] and scopes_to_add != ["in_play"]:
                sel["scope"] = list(scopes_to_add)
            else:
                _append_unique(scopes, scopes_to_add)
                sel["scope"] = scopes
            if low == "where a lost soul is held prisoner":
                sfs = list(sel.get("state_filters") or [])
                _append_unique(sfs, [StateFilter.OCCUPIED.value])
                sel["state_filters"] = sfs
            else:
                if low == "held at prison-title site":
                    sfs = list(sel.get("state_filters") or [])
                    _append_unique(sfs, [StateFilter.CAPTURED.value])
                    sel["state_filters"] = sfs
                if sel.get("used_by") is None:
                    sel["used_by"] = copy.deepcopy(host_spec)
            continue

        # 11. Zone scope fragments
        if low in _ZONE_TOKEN_MAP:
            if low in {"an opponent's territory", "in opponent's site"}:
                sel["zone_owner"] = "opponent"
            scopes = list(sel.get("scope") or [])
            if scopes == ["in_play"] and _ZONE_TOKEN_MAP[low] != ["in_play"]:
                sel["scope"] = list(_ZONE_TOKEN_MAP[low])
            else:
                _append_unique(scopes, _ZONE_TOKEN_MAP[low])
                sel["scope"] = scopes
            continue

        # 12. Documented non-ORDIR printed allowlist
        if low in _PRINTED_ALIAS_MAP:
            _append_unique(kept_idents, [_PRINTED_ALIAS_MAP[low]])
            continue
        if low in PRINTED_SELECTOR_IDENTIFIERS_LOWER:
            _append_unique(kept_idents, [PRINTED_SELECTOR_IDENTIFIERS_LOWER[low]])
            continue

        # 13. Known noise tokens
        if low in _PURE_NOISE_TOKENS:
            continue

        # Unknown token preserved for Stage 10 whitelist gate reporting
        _append_unique(kept_idents, [tok])

    sel["identifiers"] = kept_idents
