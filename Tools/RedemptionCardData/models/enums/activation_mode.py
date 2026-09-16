from enum import Enum


class ActivationMode(str, Enum):
    """Defines how an ability or effect is activated per REG Section 'Abilities'."""
    IMMEDIATE = "immediate"
    TRIGGERED = "triggered"
    MANUALLY_TRIGGERED = "manually_triggered"
    STATIC = "static"
