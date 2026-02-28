from pydantic import BaseModel, Field
from datetime import datetime

class Meta(BaseModel):
    Created: str = Field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))
    LastModified: str = Field(default_factory=lambda: datetime.now().strftime("%Y-%m-%d"))
    Verified: bool = False
