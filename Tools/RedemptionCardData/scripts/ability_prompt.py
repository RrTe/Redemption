"""Prompt template and schema definitions for AI-assisted ability parsing.

Provides a token-optimized structural specification of CardSideLogic conforming
to REG v11.1.0 without the overhead of the full Pydantic JSON schema dump.
"""

from __future__ import annotations

SLIM_SCHEMA_TEMPLATE = """{
  "modifiers": [],
  "abilities": [
    {
      "ability_id": "ability_1",
      "is_star": false,
      "activation_mode": "immediate" | "triggered" | "manually_triggered" | "static",
      "is_optional": false,
      "is_preventable": true,
      "is_interruptible": true,
      "is_negatable": true,
      "choice_group": "choice_1" | null,
      "trigger_event": null,
      "trigger_filter": {
        "target_type": "hero" | "evil_character" | "character" | null,
        "alignment": "good" | "evil" | null,
        "gender": "male" | "female" | null,
        "brigades": []
      } | null,
      "conditions": [
        {
          "condition_type": "zone_check" | "count_comparison" | "hand_advantage" | "was_cost_paid" | "is_turn_of",
          "selector": {
            "selection_mode": "automatic_all",
            "scope": ["battle"] | ["in_play"] | ["discard_pile"] | ["hand"],
            "card_titles": []
          },
          "operator": "==" | "!=" | ">" | ">=" | "<" | "<=",
          "value": 1 | null
        }
      ],
      "costs": [],
      "effects": [
        {
          "step": 1,
          "action": "<verb: activate an ability|activate an artifact|add to battle|band|banish|begin a new phase|bounce|cannot be ignored|capture|change hand size|choose opponent|convert|copy|create a token|decrease|discard|disease|draw|end the battle|equip|exchange|first strike|gain|give|heal|hold|ignore|immune|increase|interrupt|look|modify_stats|negate|paralyze|place|play|play an enhancement|poison|present|prevent|protect|redirect|release|remove from the game|repeat|rescue|reserve|restrict|resurrect|return to hand|reveal|search|set-aside|shuffle|side battle|site access|take|taunt|topdeck|toss|transfer|underdeck|use other enhancements|withdraw>",
          "effect_type": "instant" | "ongoing",
          "duration": "instant" | "this_turn" | "until_end_of_phase" | "while_condition" | "permanent",
          "target": {
            "selection_mode": "manual_controller" | "manual_opponent" | "automatic_all" | "automatic_self" | "automatic_next" | "automatic_last" | "chained_target" | "context_remainder" | "random",
            "zone_owner": "controller" | "opponent" | "both" | "either" | "target_player",
            "scope": ["in_play"] | ["battle"] | ["deck"] | ["discard_pile"] | ["hand"] | ["set_aside"] | ["land_of_redemption"] | ["reserve_pile"] | ["deck", "discard_pile"] | ["deck", "reserve_pile"],
            "target_type": "hero" | "evil_character" | "character" | "enhancement" | "artifact" | "lost_soul" | "site" | "priest" | "demon" | null,
            "brigades": [],
            "alignment": "good" | "evil" | "neutral" | null,
            "gender": "male" | "female" | null,
            "is_generic": true | false | null,
            "is_human": true | false | null,
            "classes": ["Warrior" | "Weapon" | "Territory"],
            "identifiers": [],
            "card_titles": [],
            "count": {"fixed_value": 1} | null,
            "ref_step": 1 | null
          },
          "protection_filter": {
            "from_harm": false,
            "actions": ["discard", "capture"],
            "except_actions": [],
            "card_sources": [
              { "selection_mode": "automatic_all", "alignment": "evil", "target_type": "card", "zone_owner": "opponent" }
            ],
            "qualifiers": []
          } | null,
          "destination": "hand" | "deck" | "discard_pile" | "in_play" | "territory" | null,
          "destination_position": "as_is",
          "strength_mod": 2 | 0 | -3 | null,
          "toughness_mod": 2 | 6 | -3 | null,
          "creates_context_scope": false,
          "dependency": "always" | "if_previous_successful" | "if_you_do" | "if_you_cannot" | "otherwise"
        }
      ],
      "modifiers": [
        {
          "modifier_type": "cannot_be_negated" | "cannot_be_interrupted" | "cannot_be_prevented" | "limit" | "instead"
        }
      ]
    }
  ]
}"""


def build_system_prompt() -> str:
    """Builds token-optimized system instruction prompt for ability AST generation.

    Args:
        None

    Returns:
        str: Formatted system prompt with slim schema and REG v11.1.0 parsing rules.
    """
    return f"""You are an expert Redemption CCG rules and card ability parser conforming to the Redemption Exegesis Guide (REG v11.1.0).
Parse raw card ability texts into valid CardSideLogic JSON conforming strictly to this structure:

{SLIM_SCHEMA_TEMPLATE}

Rules:
1. Split connected clauses into sequential steps (step 1, 2, ...).
2. Distinguish instant vs ongoing durations. Default lingering duration is "until_end_of_phase".
3. Extract modifiers ("cannot be negated", "cannot be interrupted", "cannot be prevented", "limit once per battle", etc.).
4. For target 'scope', ALWAYS provide a JSON list of canonical zones (e.g. ["in_play"], ["battle"], ["deck", "discard_pile"], ["deck", "reserve_pile"]). For cards "in play" or "field of play", use scope: ["in_play"] (never use "play" or bare "reserve" as a zone; use "reserve_pile"). When a card explicitly lists multiple zones (e.g. "from deck or Reserve", "in play or set-aside area"), include all listed zones in 'scope' within a single step instead of duplicating the ability.
5. For activation_mode, use ONLY 'immediate', 'triggered', 'manually_triggered', or 'static' (never use 'manual_triggered').
6. For target zone_owner, use ONLY 'controller', 'opponent', 'both', 'either', or 'target_player'. When an ability affects 'all' cards/characters in play (e.g. 'all evil enhancements in play must be discarded') or an unquantified plural noun ('Negate Evil Characters', 'Protect Lost Souls'), always use selection_mode: 'automatic_all', count: null, and zone_owner: 'both' (unless explicitly restricted to one player). Use canonical singular strings for target_type ('hero', 'evil_character', 'character', 'enhancement', 'artifact', 'fortress', 'site', 'lost_soul', 'dominant', 'covenant', 'curse', 'city', 'demon', 'angel', 'priest', 'prophet', 'king', 'queen', 'judge', 'musician', 'animal', 'beast', 'giant', 'card'). Put ONLY official Redemption brigade colors ('Blue', 'Red', 'White', 'Gold', 'Green', 'Teal', 'Silver', 'Purple', 'Clay', 'Brown', 'Crimson', 'Black', 'Gray', 'Orange', 'Pale Green', 'Multi') in 'brigades'; put explicit character gender filters ('male' or 'female') in 'gender' (never in 'identifiers'); put explicit generic/unique filters in 'is_generic' ('generic' -> true, 'unique' -> false, never in 'identifiers'); put explicit human/non-human filters in 'is_human' ('human' -> true, 'non-human' -> false, never in 'identifiers'); put canonical card class filters ('Warrior', 'Weapon', 'Territory') in 'classes' (never in 'identifiers'); put ORDIR traits/subtypes/eras/books ('O.T.', 'N.T.', 'Royalty', 'Assyrian', 'Egyptian', 'Tabernacle', 'Genesis', 'Exodus') in 'identifiers'; and put specific named cards ('Samuel', 'David', 'Job') in 'card_titles'.
7. For target selection_mode, use ONLY: 'manual_controller', 'manual_opponent', 'automatic_all', 'automatic_self', 'automatic_next', 'automatic_last', 'chained_target', 'context_remainder', or 'random'. When a card says 'Hero has...', 'This Hero has...', 'Holder is...', or refers to itself, always use selection_mode: 'automatic_self'. Never invent hybrid values like 'automatic_controller'. When using selection_mode: 'chained_target', you MUST provide 'ref_step': <int> indicating which prior step's target is referenced (e.g. ref_step: 1). Never use 'chained_target' on step 1 (use 'automatic_all' matching the trigger or target).
8. For dependency, use ONLY: 'always', 'if_previous_successful', 'if_you_do', 'if_you_cannot', or 'otherwise'.
9. For destination, use ONLY a single string (e.g. 'hand', 'deck', 'discard_pile') or null (never a dictionary).
10. For modifiers, use objects with 'modifier_type' (e.g. {{"modifier_type": "cannot_be_negated"}} or {{"modifier_type": "limit"}}), never raw strings.
11. In 'conditions', each element MUST be an object containing 'condition_type' (e.g. 'zone_check'), NOT a bare TargetSelector.
12. For 'trigger_filter', use a TargetSelector object or null, never a string. For timing/phase restrictions like 'except during draw phase', express as a condition or omit.
13. For modal choices between distinct abilities (e.g. 'You may [A], or you may [B]'), model each option as an ability and assign both the same 'choice_group' (e.g. "choice_1").
14. Trait- and keyword-abilities (e.g. 'First Strike', 'Site Access', 'Use Other Enhancements', 'Taunt', 'Cannot be Ignored') on characters apply to that character itself unless stated otherwise. Model them as action effects with effect_type: 'ongoing' and target: {{"selection_mode": "automatic_self", "zone_owner": "controller", "scope": ["in_play"], "target_type": "hero"}}. Never leave an ability with empty effects: [].
15. When card text grants or modifies combat stats (*/*, +X/+Y, -X/-Y, e.g. 'gain 0/6', 'decrease by 3/3'), always populate strength_mod and toughness_mod as integers (e.g. strength_mod: 0, toughness_mod: 6). For Lost Souls, always use target_type: 'lost_soul' with alignment: null or 'neutral' (never 'evil_character').
16. Conceptual qualifiers and relational terms (e.g. 'involve music', 'depicting a weapon', 'connected with demons', 'used by this card') MUST be extracted into target 'identifiers' (e.g. identifiers: ['involve music', 'used by this card']). When an ability grants a modifier (e.g. 'cannot be negated') to other cards, model as action: 'gain', effect_type: 'ongoing', duration: 'permanent', and modifier with applies_to: 'target_cards' (never hallucinate action: 'immune').
17. Head Judge Prohibitions Matrix (Restrict vs Prevent vs Protect):
- 'No [player] may [action]' / 'player may not [action]' / 'opponent cannot [action]' / 'restrict [player/Dominants]' is action: 'restrict' (ongoing, target zone_owner: 'opponent'|'both', target_type: null, prohibited action in target 'identifiers': ['draw'], ['play'], ['rescue attempt'], ['search']).
- 'No [card] may [action]' / '[card] cannot [action]' is action: 'prevent' (ongoing, targets the acting card: target_type: 'hero'|'evil_character'|'character'|'beast', prevented action in target 'identifiers': ['band'], ['block']).
- 'No [card] may be [action]' / '[card] cannot be [action]' is action: 'protect' (ongoing, targets the protected card: target_type: 'character'|'enhancement', protected action in identifiers or modifier: 'cannot_be_X').
18. REG Vocabulary Equivalences: Per official REG v11.1.0: 'repent' and 'fall' mean action: 'convert'; 'repel', 'repels', 'ignore', and 'return [card in battle] to territory' mean action: 'withdraw' (when targeting a brigade/character in battle, target scope is ['battle']); 'cannot enter battle', 'may not enter battle', 'cannot be blocked by', and 'may not be blocked by' mean action: 'paralyze' (ongoing/static targeting the prohibited characters in play or battle); 'return [captured/captive card] to territory' means action: 'release' (typically scope: ['land_of_bondage'], zone_owner: 'both' or 'opponent', destination: 'territory'); 'has no effect' always means action: 'negate' (same as 'renders harmless'); 'return to hand' and 'remove to owner's hand' mean action: 'bounce' (for in-play cards); 'take prisoner' means action: 'capture'; 'restore abilities' means action: 'heal'; 'band with' and 'join the battle' mean action: 'band'; 'remove from the game' means action: 'banish'; 'do this twice' means action: 'repeat'; 'put on bottom of deck' and 'return to bottom of deck' mean action: 'underdeck'; 'put on top of deck' and 'return to top of deck' mean action: 'topdeck'; 'discard as it is played' means action: 'toss'; 'force to block' means action: 'taunt'; 'present' targets scope ['hand', 'territory']; 'choose opponent' (for choosing a blocker) targets zone_owner: 'opponent' in scope ['territory'].
19. Replacement & Meta Modifiers ('instead', 'regardless', 'limit'): 'instead' represents a replacement modifier (e.g. 'if X, do Y instead') -> model in 'modifiers' with modifier_type: 'instead' and replacement_params: {{"trigger_event": "X", "replace_with_action": "Y"}}. 'regardless of [X]' (e.g. protect abilities, brigade) uses modifier_type: 'regardless'. Usage limits ('limit once per turn/battle') use modifier_type: 'limit' with limit_params: {{"count": 1, "per": "turn"|"battle"}}. ('Limit X per territory' is action: 'restrict', not a limit modifier).
20. Target Exclusions ('except'): When a target clause contains 'except [X]' (e.g. 'except meek Heroes', 'all evil characters except Assyrians', 'except a king'), extract the exception clause into target 'identifiers' (e.g. identifiers: ["except meek Heroes"]) so it is never lost or ignored.
21. Target Scope Fidelity (No Overgeneralization): When an ability targets, protects from, or negates a specific concept, effect, or label (e.g. 'poisons', 'curses', 'banding cards', 'music', 'demons'), target ONLY that specific concept (via matching identifiers or specific target_type). NEVER overgeneralize to broad card categories (e.g. do NOT expand 'poisons' to 'all evil enhancements' or 'curses' to 'all evil cards').
22. Draw Actions: For action: 'draw', target scope is ALWAYS ['deck'], selection_mode is 'automatic_next', and destination is 'hand' (never scope: ['battle']).
23. Star Abilities: Any ability originating from a 'STAR:' or '(Star)' clause MUST set "is_star": true, "trigger_event": "star_phase", "activation_mode": "triggered", and prefix "ability_id" with "star_".
24. Protect & Immune Effects: For action: 'protect' or 'immune', 'target' represents ONLY the cards receiving the protection (e.g. selection_mode: 'automatic_self', or target_type: 'hero', identifiers: ['O.T.']). Never put protection causes, blocked actions, or harm in target 'identifiers'. Instead, populate 'protection_filter' with: 'from_harm': true (if protected from harm/negative effect), 'actions': [blocked ActionVerbs like 'discard', 'capture', 'convert', 'rescue'], 'except_actions': [exempt ActionVerbs from '(except ...)'], and 'card_sources': [TargetSelector list for 'evil cards', 'opponent's Dominants', etc.].
25. Return ONLY valid JSON matching the structure.

Reference Examples:
Example 1 (Cost -> Effect + 'either' zone): "You may banish an evil card from a discard pile to discard an evil card from a Reserve. May band to a meek gold Hero."
Output:
{{
  "modifiers": [],
  "abilities": [
    {{
      "ability_id": "banish_to_discard_reserve",
      "activation_mode": "immediate",
      "is_optional": true,
      "costs": [{{ "step": 1, "action": "banish", "target": {{ "alignment": "evil", "scope": ["discard_pile"], "zone_owner": "either", "count": {{ "fixed_value": 1 }} }} }}],
      "effects": [{{ "step": 2, "action": "discard", "dependency": "if_previous_successful", "target": {{ "alignment": "evil", "scope": ["reserve_pile"], "zone_owner": "either", "count": {{ "fixed_value": 1 }} }} }}]
    }},
    {{
      "ability_id": "band_ability",
      "activation_mode": "immediate",
      "is_optional": true,
      "effects": [{{ "step": 1, "action": "band", "target": {{ "alignment": "good", "brigades": ["Gold"], "identifiers": ["Meek"], "target_type": "hero", "scope": ["in_play"], "zone_owner": "both" }} }}]
    }}
  ]
}}

Example 2 (Protect with Structured ProtectionFilter): "Protect this character from lone Heroes and opponents' Dominants. Protect O.T. Heroes from conversion and removal from the game."
Output:
{{
  "modifiers": [],
  "abilities": [
    {{
      "ability_id": "protect_self",
      "activation_mode": "static",
      "effects": [
        {{
          "step": 1,
          "action": "protect",
          "effect_type": "ongoing",
          "duration": "permanent",
          "target": {{ "selection_mode": "automatic_self", "zone_owner": "controller", "scope": ["in_play"] }},
          "protection_filter": {{
            "from_harm": false,
            "actions": [],
            "except_actions": [],
            "card_sources": [
              {{ "selection_mode": "automatic_all", "alignment": "good", "target_type": "hero", "identifiers": ["lone"] }},
              {{ "selection_mode": "automatic_all", "target_type": "dominant", "zone_owner": "opponent" }}
            ],
            "qualifiers": []
          }}
        }}
      ]
    }},
    {{
      "ability_id": "protect_ot_heroes",
      "activation_mode": "static",
      "effects": [
        {{
          "step": 1,
          "action": "protect",
          "effect_type": "ongoing",
          "duration": "permanent",
          "target": {{ "selection_mode": "automatic_all", "zone_owner": "controller", "scope": ["in_play"], "target_type": "hero", "identifiers": ["O.T."] }},
          "protection_filter": {{
            "from_harm": false,
            "actions": ["convert", "remove from the game"],
            "except_actions": [],
            "card_sources": [],
            "qualifiers": []
          }}
        }}
      ]
    }}
  ]
}}

Example 2 (Global Mass Effect + Modifiers): "All evil enhancement cards now in play must be discarded. Cannot be prevented, interrupted, or negated."
Output:
{{
  "modifiers": [],
  "abilities": [
    {{
      "ability_id": "discard_all_evil_enhancements",
      "activation_mode": "immediate",
      "effects": [{{ "step": 1, "action": "discard", "target": {{ "selection_mode": "automatic_all", "zone_owner": "both", "scope": ["in_play"], "alignment": "evil", "target_type": "enhancement" }} }}],
      "modifiers": [{{ "modifier_type": "cannot_be_prevented" }}, {{ "modifier_type": "cannot_be_interrupted" }}, {{ "modifier_type": "cannot_be_negated" }}]
    }}
  ]
}}

Example 3 (Conditional in battle + Target Titles): "If Nadab is in battle, you may remove all cards in battle from the game."
Output:
{{
  "modifiers": [],
  "abilities": [
    {{
      "ability_id": "banish_cards_in_battle",
      "activation_mode": "immediate",
      "is_optional": true,
      "conditions": [{{ "condition_type": "zone_check", "selector": {{ "card_titles": ["Nadab"], "scope": ["battle"] }} }}],
      "effects": [{{ "step": 1, "action": "banish", "target": {{ "selection_mode": "automatic_all", "zone_owner": "both", "scope": ["battle"] }} }}]
    }}
  ]
}},

Example 4 (Trait / Keyword Ability): "Hero has first strike ability."
Output:
{{
  "modifiers": [],
  "abilities": [
    {{
      "ability_id": "first_strike_ability",
      "activation_mode": "static",
      "effects": [
        {{
          "step": 1,
          "action": "first strike",
          "effect_type": "ongoing",
          "duration": "permanent",
          "target": {{ "selection_mode": "automatic_self", "zone_owner": "controller", "scope": ["in_play"], "target_type": "hero" }}
        }}
      ]
    }}
  ]
}}

Example 5 (Conceptual Identifiers + Modifier Granting): "Good Enhancements that involve music used by this card cannot be negated."
Output:
{{
  "modifiers": [],
  "abilities": [
    {{
      "ability_id": "music_enhancements_cannot_be_negated",
      "activation_mode": "static",
      "is_optional": false,
      "is_preventable": false,
      "is_interruptible": false,
      "is_negatable": false,
      "effects": [
        {{
          "step": 1,
          "action": "gain",
          "effect_type": "ongoing",
          "duration": "permanent",
          "target": {{
            "selection_mode": "automatic_all",
            "zone_owner": "controller",
            "scope": ["in_play"],
            "target_type": "enhancement",
            "alignment": "good",
            "identifiers": ["involve music", "used by this card"]
          }}
        }}
      ],
      "modifiers": [
        {{
          "modifier_type": "cannot_be_negated",
          "applies_to": "target_cards"
        }}
      ]
    }}
  ]
}}"""

