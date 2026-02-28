from pydantic import BaseModel
from typing import List
from models.enums.effect_type import EffectType
from models.enums.target_type import TargetType
from models.enums.timing import Timing

class AbilityEffect(BaseModel):
    effectType: EffectType = EffectType.UNKNOWN
    targetType: List[TargetType] = []
    timing: Timing = Timing.UNKNOWN
    conditions: List[str] = []

class ParsedAbility(BaseModel):
    effects: List[AbilityEffect] = []



### Example ###
#{
#  "effects": [
#    {
#      "effectType": "interrupt",
#      "targetType": ["evil character"],
#      "timing": "instant",
#      "conditions": ["in battle"]
#    },
#    {
#      "effectType": "discard",
#      "targetType": ["evil character"],
#      "timing": "instant",
#      "conditions": ["in battle"]
#    }
#  ]
#}
