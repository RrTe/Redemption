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
    # Neu aus User-Feedback
    "Amram & Jochebed": "Moses' Parents",
    "Famine in Egypt": "Famine of Egypt",
    "Nicodemus, the Seeker": "Nicodemus, the Seeker / Nicodemus, the Teacher",
    "Nicodemus, the Teacher": "Nicodemus, the Seeker / Nicodemus, the Teacher",
    "The Worm": "Withered Plant (The Worm)",
    "Faith of Amram & Jochebed": "Faith of Moses' Parents",
    "Lost Soul [Acts 14:4, \"Different Testaments\"]": "Lost Soul Acts 14:4 (Same Testament)",
    "Stephanas": "Stephanus",
    # Lost Soul specialized mappings
    "Lost Soul [Acts 23:27, \"Withdraw\"]": "Lost Soul  Acts 23:27",
    "Lost Soul [Hebrews 10:39, \"Shrink\"]": "Lost Soul  Hebrews 10:39",
    "Lost Soul [James 1:15, \"Demon Shuffle\"]": "Lost Soul  James 1:15",
    "Lost Soul [Jeremiah 3:25, \"Shame\"]": "Lost Soul  Jeremiah 3:25",
    "Lost Soul [Luke 19:10, \"Negater\"]": "Lost Soul  Luke 19:10",
    "Lost Soul [Matthew 8:34, \"Site Release\"]": "Lost Soul  Matthew 8:34",
    # Taskmaster variants
    "Task Master": "Taskmaster",
    "Taskmaster_": "Taskmaster",
    "Plague of Flies": "Plague of Flies", # Ensure stays same
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
