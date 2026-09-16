from enum import Enum


class ModifierType(str, Enum):
    """Represents the official modifier categories from the Redemption REG."""
    CANNOT_BE_NEGATED = "cannot_be_negated"
    CANNOT_BE_INTERRUPTED = "cannot_be_interrupted"
    CANNOT_BE_PREVENTED = "cannot_be_prevented"
    INSTEAD = "instead"
    LIMIT = "limit"
    REGARDLESS = "regardless"
