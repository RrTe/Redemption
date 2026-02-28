import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parent.parent))

import json
import re
from config import LOG_VALIDATION_KEYS, LOG_NOT_FOUND
from card_utils import clean_card_name, strip_print_suffix, normalize, extract_set_variants, safe_keys
from mappings.ordir_name_errata import apply_name_errata
from mappings.set_alias import SET_ALIAS


def resolve_set_aliases(set_code: str):
    raw = normalize(str(set_code))
    alias = SET_ALIAS.get(raw, raw)
    # Immer als Liste zurückgeben
    return alias if isinstance(alias, list) else [alias]


def normalize_brackets_round(name: str) -> str:
    """
    Vergleichs-Normalisierung: wandle beliebige Klammerarten am Ende des Namens
    in runde Klammern. Beispiel:
      'King Jehoahaz [Judah]'  -> 'King Jehoahaz (Judah)'
      'King Jehoahaz (Israel)' -> 'King Jehoahaz (Israel)' (unverändert)

    Es wird nur der letzte Klammerzusatz vereinheitlicht; echte Namensinhalte
    innerhalb des Namens bleiben unverändert.
    """
    if not name:
        return name
    # Ersetze am Ende stehende [text] oder (text) durch (text)
    name = re.sub(r"\s*[\(\[]\s*([^\)\]]+)\s*[\)\]]\s*$", r" (\1)", name)
    return name


def build_indexes(category_map):
    """
    Erzeugt zwei schnelle Lookup-Indizes aus category_map:
    - direct_index: (name_lower, set) -> categories
    - normalized_index: (normalized_round_lower, set) -> categories
    """
    direct_index = {}
    normalized_index = {}

    for (ordir_name, ordir_set), cats in category_map.items():
        name_lower = ordir_name.lower()
        direct_index[(name_lower, ordir_set)] = sorted(cats)

        norm_round_lower = normalize_brackets_round(ordir_name).lower()
        normalized_index[(norm_round_lower, ordir_set)] = sorted(cats)

    return direct_index, normalized_index


def validate_cards(card_file, category_map):
    with card_file.open(encoding="utf-8") as f:
        extended_cards = json.load(f)["cards"]

    # Indizes einmalig bauen (massiv schneller als verschachteltes Iterieren)
    direct_index, normalized_index = build_indexes(category_map)

    verbose_entries = []

    for card in extended_cards:
        raw_name = card.get("Name")
        raw_set = card.get("Set", "")
        rarity = card.get("Rarity", "").strip()
        is_legacy_rare = rarity.lower() == "legacy rare"

        cleaned_name = clean_card_name(raw_name)
        stripped_name = strip_print_suffix(cleaned_name)

        # Alle Set-Aliase für diese Karte holen
        set_aliases = resolve_set_aliases(raw_set)

        # Errata pro Set-Alias anwenden
        candidate_names = set()
        for sa in set_aliases:
            candidate_names.add(stripped_name)
            candidate_names.add(apply_name_errata(stripped_name, sa))

        # Leere entfernen und Whitespace normalisieren
        candidate_names = {n.strip() for n in candidate_names if n and n.strip()}

        # Falls "/" im Namen → splitten
        name_parts = []
        for n in candidate_names:
            if "/" in n:
                name_parts.extend([part.strip() for part in n.split("/") if part.strip()])
            else:
                name_parts.append(n)

        # Keys bauen: Name × Set-Varianten
        set_variants = extract_set_variants(raw_set)
        keys_tested = []
        for part in name_parts:
            for variant in set_variants:
                keys = safe_keys(part, variant)
                if LOG_VALIDATION_KEYS:
                    print(f"🔍 Validierung: Name = {part}, Set = {variant} → Schlüssel = {keys}")
                keys_tested.extend(keys)

        # Legacy Rare Fallback
        if is_legacy_rare:
            for part in name_parts:
                keys_tested.append((normalize(part), "LR"))

        found_categories = []
        matched_ordir_set = None

        # Vergleich (erst streng per direct_index, dann tolerant per normalized_index)
        for key_name, key_set in keys_tested:
            # Schritt 1: direkter Vergleich ohne Normalisierung
            dn = key_name.lower()
            if (dn, key_set) in direct_index:
                found_categories = direct_index[(dn, key_set)]
                matched_ordir_set = key_set
                break

            # Schritt 2: Fallback – beide Seiten auf runde Klammern normalisieren
            nn = normalize_brackets_round(key_name).lower()
            if (nn, key_set) in normalized_index:
                found_categories = normalized_index[(nn, key_set)]
                matched_ordir_set = key_set
                break

        verbose_entries.append({
            "card_name": raw_name,
            "ordir_name": stripped_name,
            "card_set": raw_set,
            "ordir_set": matched_ordir_set,
            "categories": found_categories
        })

        if not found_categories and LOG_NOT_FOUND:
            print(f"\n❌ Nicht gefunden:")
            print(f"  Kartendaten: {repr(raw_name)} [{raw_set}]")
            print(f"  ORDIR-Name:  {repr(stripped_name)}")
            print(f"  Kategorien:  —")
            print(f"  → Geprüfte Schlüssel:")

            # Ausgabe gegen beide Indizes prüfen
            for k_name, k_set in keys_tested:
                dn = k_name.lower()
                nn = normalize_brackets_round(k_name).lower()
                direct_hit = (dn, k_set) in direct_index
                normalized_hit = (nn, k_set) in normalized_index
                print(f"     - ({repr(k_name)}, {repr(k_set)}) {'✅' if (direct_hit or normalized_hit) else '❌'}")

    return verbose_entries
