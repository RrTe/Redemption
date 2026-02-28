from pydantic import BaseModel, Field
from typing import List, Optional
from models.enums.card_type import CardType

class CardVariant(BaseModel):
    Types: List[CardType] = Field(default_factory=list)
    Brigades: List[str] = Field(default_factory=list)
    Alignment: Optional[str] = ""
