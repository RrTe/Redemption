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
          "action": "<verb: band|draw|discard|negate|prevent|modify_stats|search|shuffle|convert|protect|heal|banish|topdeck|ignore|decrease|reveal|exchange|choose_opponent|create_token|change_hand_size>",
          "effect_type": "instant" | "ongoing",
          "duration": "instant" | "this_turn" | "until_end_of_phase" | "while_condition" | "permanent",
          "target": {
            "selection_mode": "manual_controller" | "manual_opponent" | "automatic_all" | "automatic_next" | "automatic_last" | "chained_target" | "context_remainder" | "random",
            "zone_owner": "controller" | "opponent" | "both" | "either" | "target_player",
            "scope": "in_play" | "battle" | "deck" | "discard_pile" | "hand" | "set_aside" | "land_of_redemption" | "reserve_pile",
            "target_type": "hero" | "evil_character" | "character" | "enhancement" | "artifact" | "priest" | "demon" | null,
            "brigades": [],
            "alignment": "good" | "evil" | "neutral" | null,
            "identifiers": [],
            "card_titles": [],
            "count": {"fixed_value": 1} | null,
            "ref_step": null
          },
          "destination": "hand" | "deck" | "discard_pile" | "in_play" | "territory" | null,
          "destination_position": "as_is",
          "strength_mod": null,
          "toughness_mod": null,
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
7. For target selection_mode, use ONLY: 'manual_controller', 'manual_opponent', 'automatic_all', 'automatic_next', 'automatic_last', 'chained_target', 'context_remainder', or 'random'. Never invent hybrid values like 'automatic_controller'; use 'automatic_all' with zone_owner: 'controller' instead.
8. For dependency, use ONLY: 'always', 'if_previous_successful', 'if_you_do', 'if_you_cannot', or 'otherwise'.
9. For destination, use ONLY a single string (e.g. 'hand', 'deck', 'discard_pile') or null (never a dictionary).
10. For modifiers, use objects with 'modifier_type' (e.g. {{"modifier_type": "cannot_be_negated"}} or {{"modifier_type": "limit"}}), never raw strings.
11. In 'conditions', each element MUST be an object containing 'condition_type' (e.g. 'zone_check'), NOT a bare TargetSelector.
12. For 'trigger_filter', use a TargetSelector object or null, never a string. For timing/phase restrictions like 'except during draw phase', express as a condition or omit.
13. Return ONLY valid JSON matching the structure.

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
}}"""

