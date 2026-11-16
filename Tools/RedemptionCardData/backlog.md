# Project Backlog & Known Issues

Central tracking document for known bugs, data anomalies, planned enhancements, and technical debt across the Redemption card data processing pipeline (ORDIR 7.1.0 / REG v11.1.0 / Stages 01–11).

---

## 1. Known Bugs & Open Items

### Ability AST Coverage (Pass 2 / Stage 09 LLM Extraction)
- **Remaining Unparsed Sides & Star Clauses:**
  - *Status:* Stage 08/09/10 partial-side retention and Star/top separation are implemented; the remaining unparsed non-trivial `SpecialAbility` sides and remaining `StarAbility` entries logged in `data/logic_verification_report.log` / `data/unparsed_abilities.log` await targeted Pass 2 Stage 09 LLM extraction.
- **Stage 11 Semantic Audit Triage:**
  - *Status:* `data/semantic_audit_report.md` now evaluates all Stage 09 AI ASTs against REG v11.1.0 / ORDIR 7.1.0 and extended `ability_decompiler.py` fields; flagged review-required cards can be queued for targeted Pass 2 inspection.

### ORDIR Parser (`scripts/04_extract_ordir.py`) — Historical Notes (ORDIR 7.0.0+ / 7.1.0)
- **Prose Appended to Bullets Across Blank Lines:**
  - *Symptom:* Explanatory text following a list of cards can be appended to the final bullet item instead of terminating the block.
  - *Fix:* Ensure bullet extraction blocks strictly terminate upon blank lines or non-bullet paragraph starts.

- **Missing Delimiters Between Consecutive Cards in Source PDF:**
  - *Symptom:* Multiple distinct cards placed consecutively without punctuation or whitespace are parsed as single composite cards (`Bound Before the Fire (T2C) Clash with Persia (T2C)`, `Roman Centurion [Capernaum] (GC)Roman Jailer (Ap)`).

- **Conjoined Card Titles via "and":**
  - *Symptom:* Conjunction "and" joining two distinct card names treated as a single entry (`Zelophehad, the Lone and Zimri, Son of Salu (RA, IR)`).

### Data Source Discrepancies & Typographical Errata
- **Book Typo in ORDIR:**
  - `Lost Soul [Exodus 13:18] (Wo)`: In the *Women* set, the card is actually `Lost Soul Ezekiel 13:18 (Wo)`. The ORDIR has a book name error (Exodus instead of Ezekiel).
- **Disambiguating Titles in ORDIR vs. DB Titles:**
  - `New Covenant [Ezekiel] (PoC)`: In the database, the Ezekiel-referenced card is titled simply `New Covenant` (Reference: *Ezekiel 36:26*), whereas `[Ezekiel]` was added in the ORDIR text solely to distinguish it from `New Covenant (Isaiah)` and `New Covenant (Jeremiah)`.
  - `Zeresh (Pi, RR)`: Exists in *Priests* as `Zeresh`, and in *Roots* as `Zeresh, Wife of Haman (Roots)`.
  - `Seraphim (Wa)`: ORDIR distinguishes variants by ability (`[Band to Blue]` vs `[Band to Green]`), corresponding in the database to `Seraphim - Isaiah 6:2` and `Seraphim - Isaiah 6:6`.
  - `Questioning Christ (Di)`: Database canonical title is `Questioning Christ's Authority`.
  - `Stolen Blessing (Pa)`: Database canonical title is `Stolen Blessing - Special Ability`.
  - `Bride of Christ (RJ)`: Database canonical title is `New Jerusalem Bride of Christ (RoJ)`.
  - `Adam (Man) (LR)`: Database canonical title is `Adam, the Exile / Adam (Man) (LoC)`.
- **Cards Missing from Live LackeyCCG Data:**
  - Future/Unreleased Promos: `Emperor Nero (P-2025)`, `Son of God (P-2025)`, and `Raiders' Camp (P-2025)` do not yet exist in Lackey `carddata.txt`.
  - Physical Starter Cards Absent in Lackey: `Task Master (A-L)` and `Meditation (Or-UL)`.

---

## 2. Features & Enhancements

- **Cross-Reference Extraction ("refer to..." Sections):**
  - *Status:* Currently strictly skipped per business logic.
  - *Goal:* If the game engine later requires rule references, evaluate adding an explicit `"ORDIR_References": []` structure without altering the primary `"ORDIR": []` category list.
- **Dynamic Promo Year Resolution:**
  - Automate matching for upcoming promo years (e.g. `P-2024`, `P-2025`) once added to Lackey `carddata.txt`.
- **Card Data Pipeline Extensions (High Priority):**
  - Upcoming core game extensions in `02_process_csv.py` and `03_extend_cards.py` (CardSides, brigade evaluations, special abilities, stats/classes).

---

## 3. Refactoring & Technical Debt

- **File Size & Modularity (Architecture Standards):**
  - Modularize large legacy pipeline scripts (`03_extend_cards.py`, `04_extract_ordir.py`, `05_map_ordir.py`, `07_generate_ai_errata.py`) into focused helper modules when touching them.

---

## 4. Completed / Resolved

- **Pass 1 AST Pipeline Hardening & Hygiene (ORDIR 7.1.0 / REG v11.1.0):**
  - Removed Melchizedek composite ghost keys (`-1587655157_shared_top`, `-1587655157_top_top`), restoring exact 1:1 `5692` card parity in `cards_logic.json`.
  - Fixed Stage 08 partial-side retention (`card_all_parsed` removal) and collision-free `side="star"` logging, Stage 09 side/star skip logic & canonical `card_id` sanitization, and Stage 10 non-destructive Star/regular side merging + extended DB coverage audit (`data/logic_verification_report.log`).
  - Migrated deterministic ORDIR 7.1.0 terms and unresolved `card_titles` (including `protection_filter.card_sources` and `trigger_filter` linking), extended `ability_decompiler.py`, refreshed Stage 11 semantic audit (`all-MiniLM-L6-v2` offline cache support), calibrated `06_verify.py` for multi-type/disjunctive/`IsStarCard` cards, and removed zero-reference legacy files in `mappings/`, `models/_to_be_deleted_variant.py`, and root scratch/log artifacts.
- **Parenthesis Preservation for Defective Printings:**
  - Correct handling of physical card anomalies such as `James (half-brother of Jesus` without closing parenthesis (verified mapped in database).
- **Category Definition Bullet Gatekeeping:**
  - Filtering out descriptive bullet criteria (e.g. `• Represents all or part of a song...` under *Involves Music*) via `is_membership_marker()`.
- **CardSides Shared Field Optimization:**
  - Deduplication of identical top/bottom side properties into `CardSides.shared` in `03_extend_cards.py`.
