#from models.card import Card
#from models.enums.card_type import CardType

#def is_type(card: Card, target: str | CardType) -> bool:
#    """
#    Checks whether a card has the given type, including inherited or expanded types.
#    Accepts either a string or a CardType enum.
#    """
#    target_value = target.value if isinstance(target, CardType) else target
#    return target_value in [t.value if isinstance(t, CardType) else t for t in card.CardTypes]
	
def normalize_case(value):
    return value.strip().upper() if isinstance(value, str) else value

def case_insensitive_in(value, container):
    value = normalize_case(value)
    return any(normalize_case(item) == value for item in container)

def case_insensitive_key_lookup(key, mapping):
    key = normalize_case(key)
    for k, v in mapping.items():
        if normalize_case(k) == key:
            return v
    return None

def case_insensitive_alias_match(value, alias_mapping):
    value = normalize_case(value)
    for alias_key, alias_values in alias_mapping.items():
        if normalize_case(alias_key) == value:
            return True
        if isinstance(alias_values, str) and normalize_case(alias_values) == value:
            return True
        if isinstance(alias_values, list) and any(normalize_case(alias) == value for alias in alias_values):
            return True
    return False