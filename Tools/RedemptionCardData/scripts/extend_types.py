from typing import List
from models.enums.card_type import TYPE_GROUPS, TYPE_IS_A

def expand_types(types: List[str]) -> List[str]:
    """
    Expands a card's type list by applying bidirectional logic based on TYPE_GROUPS.
    """
    type_set = set(types)
    changed = True

    while changed:
        changed = False
        for derived_type, required_types in TYPE_GROUPS.items():
            if required_types.issubset(type_set) and derived_type not in type_set:
                type_set.add(derived_type)
                changed = True
            elif derived_type in type_set:
                for base in required_types:
                    if base not in type_set:
                        type_set.add(base)
                        changed = True

    return sorted(type_set)

def apply_type_inheritance(types: List[str]) -> List[str]:
    """
    Adds inherited types based on TYPE_IS_A relationships.
    """
    inherited = set(types)
    for t in list(inherited):
        inherited.update(TYPE_IS_A.get(t, []))
    return sorted(inherited)

def expand_and_inherit_types(types: List[str]) -> List[str]:
    """
    Fully resolves all types by repeatedly applying expansion and inheritance until stable.
    """
    type_set = set(types)
    changed = True

    while changed:
        before = set(type_set)

        # Apply inheritance
        for t in list(type_set):
            type_set.update(TYPE_IS_A.get(t, []))

        # Apply group expansion
        type_set.update(expand_types(list(type_set)))

        changed = type_set != before

    return sorted(type_set)
