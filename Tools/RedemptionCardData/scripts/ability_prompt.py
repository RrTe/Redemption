"""Prompt template and schema definitions for AI-assisted ability parsing.

Provides a token-optimized structural specification of CardSideLogic conforming
to REG v11.0.0 without the overhead of the full Pydantic JSON schema dump.
"""

from __future__ import annotations

SLIM_SCHEMA_TEMPLATE = """{
  "modifiers": [],
  "abilities": [
    {
      "ability_id": "ability_1",
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
        "brigades": []
      } | null,
      "conditions": [
        {
          "condition_type": "zone_check" | "count_comparison" | "hand_advantage" | "was_cost_paid" | "is_turn_of",
          "selector": {
            "selection_mode": "automatic_all",
            "scope": "battle" | "in_play" | "discard_pile" | "hand",
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
            "scope": "in_play" | "battle" | "deck" | "discard_pile" | "hand" | "set_aside" | "land_of_redemption" | "reserve_pile",
            "target_type": "hero" | "evil_character" | "character" | "enhancement" | "artifact" | "lost_soul" | "site" | "priest" | "demon" | null,
            "brigades": [],
            "alignment": "good" | "evil" | "neutral" | null,
            "identifiers": [],
            "card_titles": [],
            "count": {"fixed_value": 1} | null,
            "ref_step": 1 | null
          },
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
        str: Formatted system prompt with slim schema and REG v11.0.0 parsing rules.
    """
    return f"""You are an expert Redemption CCG rules and card ability parser conforming to the Redemption Exegesis Guide (REG v11.0.0).
Parse raw card ability texts into valid CardSideLogic JSON conforming strictly to this structure:

{SLIM_SCHEMA_TEMPLATE}

Rules:
1. Split connected clauses into sequential steps (step 1, 2, ...).
2. Distinguish instant vs ongoing durations. Default lingering duration is "until_end_of_phase".
3. Extract modifiers ("cannot be negated", "cannot be interrupted", "cannot be prevented", "limit once per battle", etc.).
4. For cards "in play" or "field of play", always use scope: "in_play" (never use "play", as "play" is an action verb).
5. For activation_mode, use ONLY 'immediate', 'triggered', 'manually_triggered', or 'static' (never use 'manual_triggered').
6. For target zone_owner, use ONLY 'controller', 'opponent', 'both', 'either', or 'target_player'. When an ability affects 'all' cards/characters in play (e.g. 'all evil enhancements in play must be discarded') without specifying an opponent, always use zone_owner: 'both' (never 'controller'). Use 'opponent' only when the card explicitly restricts to opponent's cards.
7. For target selection_mode, use ONLY: 'manual_controller', 'manual_opponent', 'automatic_all', 'automatic_self', 'automatic_next', 'automatic_last', 'chained_target', 'context_remainder', or 'random'. When a card says 'Hero has...', 'This Hero has...', 'Holder is...', or refers to itself, always use selection_mode: 'automatic_self'. Never invent hybrid values like 'automatic_controller'. When using selection_mode: 'chained_target', you MUST provide 'ref_step': <int> indicating which prior step's target is referenced (e.g. ref_step: 1). Never use 'chained_target' on step 1 (use 'automatic_all' matching the trigger or target).
8. For dependency, use ONLY: 'always', 'if_previous_successful', 'if_you_do', 'if_you_cannot', or 'otherwise'.
9. For destination, use ONLY a single string (e.g. 'hand', 'deck', 'discard_pile') or null (never a dictionary).
10. For modifiers, use objects with 'modifier_type' (e.g. {{"modifier_type": "cannot_be_negated"}} or {{"modifier_type": "limit"}}), never raw strings.
11. In 'conditions', each element MUST be an object containing 'condition_type' (e.g. 'zone_check'), NOT a bare TargetSelector.
12. For 'trigger_filter', use a TargetSelector object or null, never a string. For timing/phase restrictions like 'except during draw phase', express as a condition or omit.
13. For modal choices between distinct abilities (e.g. 'You may [A], or you may [B]'), model each option as an ability and assign both the same 'choice_group' (e.g. "choice_1").
14. Trait- and keyword-abilities (e.g. 'First Strike', 'Site Access', 'Use Other Enhancements', 'Taunt', 'Cannot be Ignored') on characters apply to that character itself unless stated otherwise. Model them as action effects with effect_type: 'ongoing' and target: {{"selection_mode": "automatic_self", "zone_owner": "controller", "scope": "in_play", "target_type": "hero"}}. Never leave an ability with empty effects: [].
15. When card text grants or modifies combat stats (*/*, +X/+Y, -X/-Y, e.g. 'gain 0/6', 'decrease by 3/3'), always populate strength_mod and toughness_mod as integers (e.g. strength_mod: 0, toughness_mod: 6). For Lost Souls, always use target_type: 'lost_soul' with alignment: null or 'neutral' (never 'evil_character').
16. Conceptual qualifiers and relational terms (e.g. 'involve music', 'depicting a weapon', 'connected with demons', 'used by this card') MUST be extracted into target 'identifiers' (e.g. identifiers: ['involve music', 'used by this card']). When an ability grants a modifier (e.g. 'cannot be negated') to other cards, model as action: 'gain', effect_type: 'ongoing', duration: 'permanent', and modifier with applies_to: 'target_cards' (never hallucinate action: 'immune').
17. Player Restrictions & Prohibitions: Phrases like 'player may not [action]', 'no player may [action]', 'opponent cannot [action]' mean 'restrict' per REG. Model them as action: 'restrict', effect_type: 'ongoing' with target zone_owner: 'opponent' (or 'both'). NEVER model prohibitions as an affirmative action (e.g. 'opponent may not draw' is action: 'restrict', NOT 'draw').
18. REG Vocabulary Equivalences: Per official REG v11.0.0: 'repent' and 'fall' mean action: 'convert'; 'repel', 'repels', 'ignore', 'may not be blocked by', 'return to territory', and 'cannot enter battle' mean action: 'withdraw' (when targeting a brigade/character, target is opposing characters of that brigade in battle, scope: 'battle'); 'has no effect' when referring to characters means action: 'withdraw' (opposing character withdraws); 'has no effect' when referring to cards other than characters (e.g. artifacts, fortresses, enhancements) means action: 'negate'; 'renders harmless' means action: 'negate'; 'return to hand' means action: 'bounce'; 'take prisoner' means action: 'capture'; 'restore abilities' means action: 'heal'; 'band with' and 'join the battle' mean action: 'band'; 'remove from the game' means action: 'banish'; 'do this twice' means action: 'repeat'; 'put on bottom of deck' means action: 'underdeck'; 'put on top of deck' means action: 'topdeck'; 'discard as it is played' means action: 'toss'; 'force to block' means action: 'taunt'.
19. Replacement & Meta Modifiers ('instead', 'regardless', 'limit'): 'instead' represents a replacement modifier (e.g. 'if X, do Y instead') -> model in 'modifiers' with modifier_type: 'instead' and replacement_params: {{"trigger_event": "X", "replace_with_action": "Y"}}. 'regardless of [X]' (e.g. protect abilities, brigade) uses modifier_type: 'regardless'. Usage limits ('limit once per turn/battle') use modifier_type: 'limit' with limit_params: {{"count": 1, "per": "turn"|"battle"}}. ('Limit X per territory' is action: 'restrict', not a limit modifier).
20. Target Exclusions ('except'): When a target clause contains 'except [X]' (e.g. 'except meek Heroes', 'all evil characters except Assyrians', 'except a king'), extract the exception clause into target 'identifiers' (e.g. identifiers: ["except meek Heroes"]) so it is never lost or ignored.
21. Target Scope Fidelity (No Overgeneralization): When an ability targets, protects from, or negates a specific concept, effect, or label (e.g. 'poisons', 'curses', 'banding cards', 'music', 'demons'), target ONLY that specific concept (via matching identifiers or specific target_type). NEVER overgeneralize to broad card categories (e.g. do NOT expand 'poisons' to 'all evil enhancements' or 'curses' to 'all evil cards').
22. Return ONLY valid JSON matching the structure.

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
      "costs": [{{ "step": 1, "action": "banish", "target": {{ "alignment": "evil", "scope": "discard_pile", "zone_owner": "either", "count": {{ "fixed_value": 1 }} }} }}],
      "effects": [{{ "step": 2, "action": "discard", "dependency": "if_previous_successful", "target": {{ "alignment": "evil", "scope": "reserve_pile", "zone_owner": "either", "count": {{ "fixed_value": 1 }} }} }}]
    }},
    {{
      "ability_id": "band_ability",
      "activation_mode": "immediate",
      "is_optional": true,
      "effects": [{{ "step": 1, "action": "band", "target": {{ "alignment": "good", "brigades": ["gold"], "identifiers": ["Meek"], "target_type": "hero" }} }}]
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
      "effects": [{{ "step": 1, "action": "discard", "target": {{ "selection_mode": "automatic_all", "zone_owner": "both", "scope": "in_play", "alignment": "evil", "target_type": "enhancement" }} }}],
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
      "conditions": [{{ "condition_type": "zone_check", "selector": {{ "card_titles": ["Nadab"], "scope": "battle" }} }}],
      "effects": [{{ "step": 1, "action": "banish", "target": {{ "selection_mode": "automatic_all", "zone_owner": "both", "scope": "battle" }} }}]
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
          "target": {{ "selection_mode": "automatic_self", "zone_owner": "controller", "scope": "in_play", "target_type": "hero" }}
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
            "scope": "in_play",
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

