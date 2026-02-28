# === NAME ERRATA (set-spezifisch) ===

# Globale Korrekturen (immer gültig, z. B. Tippfehler)
GLOBAL_EXCEPTIONS = {
    "Alexander the Coopersmith": "Alexander the Coppersmith",
    "Ethiopian Treasurer": "The Ethiopian Treasurer",
    "Namaan’s Chariot and Horses": "Naaman’s Chariot and Horses",
    "Pharoah": "Pharaoh",
    "The Sanhedrin": "Sanhedrin",
    "Diotrephres": "Diotrephes",
    "James (half-brother of Jesus": "James (half-brother of Jesus",
    # Jehoahaz Sonderfälle
    "King Jehoahaz (Isreal)": "King Jehoahaz [Israel]",
    "King Jehoahaz (Israel)": "King Jehoahaz [Israel]",  # falls korrekt geschrieben
    "King Jehoahaz (Judah)": "King Jehoahaz [Judah]",
}

# Set-spezifische Korrekturen (nur für bestimmte Sets gültig)
SET_SPECIFIC_EXCEPTIONS = {
    "Isaiah": {
        "PoC": "Isaiah, Prince of Prophets"
        # Für andere Sets KEINE Änderung
    }
}

def apply_name_errata(name: str, set_code: str) -> str:
    """
    Wendet Errata auf einen Kartennamen an.
    - Erst globale Korrekturen
    - Dann set-spezifische Korrekturen (nur wenn Set passt)
    """
    if not name:
        return name

    # Globale Korrekturen
    corrected = GLOBAL_EXCEPTIONS.get(name, name)

    # Set-spezifische Korrekturen
    if corrected in SET_SPECIFIC_EXCEPTIONS:
        mapping = SET_SPECIFIC_EXCEPTIONS[corrected]
        if set_code in mapping:
            corrected = mapping[set_code]

    return corrected
