"""Static overrides for complex or irregular card abilities.

Provides verified manual AST definitions for cards where deterministic
or AI extraction requires custom rule logic. Keys are (card_identifier, side_key).
"""

from typing import Dict, Tuple
from models.logic.card_logic import CardSideLogic
from models.logic.ability import Ability
from models.logic.action_effect import ActionEffect
from models.logic.target_selector import TargetSelector
from models.logic.modifier import Modifier
from models.enums.modifier_type import ModifierType
from models.enums.activation_mode import ActivationMode
from models.enums.action_verb import ActionVerb
from models.enums.zone import Zone
from models.enums.duration import Duration
from models.enums.selection_mode import SelectionMode
from models.logic.dynamic_value import DynamicValue


SPECIAL_ABILITY_OVERRIDES: Dict[Tuple[str, str], CardSideLogic] = {
    # The Angel Under the Oak (RoA)
    # "You may draw 2 and exchange this Hero with a gold Judge in your hand, deck,
    #  territory, or discard pile. Protect Gideon from opponents. Cannot be negated."
    ("The Angel Under the Oak", "shared"): CardSideLogic(
        modifiers=[
            Modifier(
                modifier_type=ModifierType.CANNOT_BE_NEGATED,
                applies_to="this_side"
            )
        ],
        abilities=[
            Ability(
                ability_id="oak_angel_draw_exchange",
                activation_mode=ActivationMode.IMMEDIATE,
                is_optional=True,
                is_negatable=False,
                effects=[
                    ActionEffect(
                        step=1,
                        action=ActionVerb.DRAW,
                        effect_type="instant",
                        target=TargetSelector(
                            selection_mode=SelectionMode.AUTOMATIC_ALL,
                            zone_owner="controller",
                            count=DynamicValue.from_int(2)
                        )
                    ),
                    ActionEffect(
                        step=2,
                        action=ActionVerb.EXCHANGE,
                        effect_type="instant",
                        target=TargetSelector(
                            selection_mode=SelectionMode.MANUAL_CONTROLLER,
                            scope=Zone.TERRITORY,
                            target_type="hero",
                            brigades=["Gold"],
                            identifiers=["Judge"],
                            count=DynamicValue.from_int(1)
                        )
                    )
                ]
            ),
            Ability(
                ability_id="oak_angel_protect_gideon",
                activation_mode=ActivationMode.STATIC,
                is_optional=False,
                is_negatable=False,
                effects=[
                    ActionEffect(
                        step=1,
                        action=ActionVerb.PROTECT,
                        effect_type="ongoing",
                        duration=Duration.PERMANENT,
                        target=TargetSelector(
                            selection_mode=SelectionMode.AUTOMATIC_ALL,
                            card_titles=["Gideon"]
                        )
                    )
                ]
            )
        ]
    )
}
