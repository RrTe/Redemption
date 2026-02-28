# Harte Overrides für bekannte Fehlprints oder Sonderfälle,
# die parser-unabhängig in die Maps geschrieben werden sollen.

# Struktur:
#   ("Name wie im ORDIR", "SetCode") -> {"as_reference": bool}
#
# Hinweis:
# - categories werden wie gewohnt über den ORDIR-Kategorie-Kontext zugeordnet.
# - as_reference steuert, ob der Eintrag in reference_map (True) oder category_map (False) geht.

SPECIAL_ORDIR_OVERRIDES = {
    # Fehlprint: Karte mit fehlender schließender Klammer
    ("James (half-brother of Jesus", "Ap"): {"as_reference": False},
}
