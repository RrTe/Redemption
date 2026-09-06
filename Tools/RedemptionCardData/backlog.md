# Project Backlog & Known Issues

Central tracking document for known bugs, data anomalies, planned enhancements, and technical debt across the Redemption card data processing pipeline.

---

## 1. Known Bugs & Data Anomalies

### ORDIR Parser (`scripts/04_extract_ordir.py`)
- **Prose Appended to Bullets Across Blank Lines:**
  - *Symptom:* Explanatory text following a list of cards is erroneously appended to the final bullet item instead of terminating the block.
  - *Example:* Line 1385–1387 in `ORDIR_PDF_7.0.0.txt`: `• Zerubbabel ... (LC)` followed by a blank line and `The Tabernacle (Pi, P), Solomon’s Temple... are considered the same unique Fortress.` results in `Zerubbabel, the Chosen (LC) The Tabernacle (Pi, P)`.
  - *Fix:* Ensure bullet extraction blocks strictly terminate upon blank lines or non-bullet paragraph starts.

- **Missing Delimiters Between Consecutive Cards in Source PDF:**
  - *Symptom:* Multiple distinct cards placed consecutively without punctuation or whitespace are parsed as single composite cards.
  - *Examples:*
    - `Bound Before the Fire (T2C) Clash with Persia (T2C)`
    - `Roman Centurion [Capernaum] (GC)Roman Jailer (Ap)`
    - `The Murdering Pharaoh (K, CW) The Protecting King (II)`
    - `Rahab, the Defender LC)` (missing opening parenthesis before `LC)`)

- **Conjoined Card Titles via "and":**
  - *Symptom:* The conjunction "and" joining two distinct card names is treated as part of the card title.
  - *Examples:*
    - `Zelophehad, the Lone and Zimri, Son of Salu (RA, IR)` -> Two separate cards (`Zelophehad, the Lone` & `Zimri, Son of Salu [IR]`).
    - `The Power of Death and Thorns and Thistles (CW)` -> Two separate cards (`The Power of Death` & `Thorns and Thistles (CoW)`).

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

- **Mapping Directory Consolidation (`mappings/`):**
  - Clean up obsolete, redundant, or temporary single-script duplicates (e.g. `ordir_card_entries_single_script.py`, `ordir_carddata_mapping_single_script.py`, `ordir_carddata_mapping.py_new`).
- **File Size & Modularity (Architecture Standards):**
  - Modularize pipeline scripts exceeding the 250 LOC threshold (`03_extend_cards.py`, `04_extract_ordir.py`, `05_map_ordir.py`, `07_generate_ai_errata.py`) into focused helper modules.
- **Verification Rule Calibration (`scripts/06_verify.py`):**
  - Recalibrate outdated or overly broad deterministic checks to reduce noise and false positives in `data/verification_report.log`.

---

## 4. Completed / Resolved

- **Parenthesis Preservation for Defective Printings:**
  - Correct handling of physical card anomalies such as `James (half-brother of Jesus` without closing parenthesis (verified mapped in database).
- **Category Definition Bullet Gatekeeping:**
  - Filtering out descriptive bullet criteria (e.g. `• Represents all or part of a song...` under *Involves Music*) via `is_membership_marker()`.
- **CardSides Shared Field Optimization:**
  - Deduplication of identical top/bottom side properties into `CardSides.shared` in `03_extend_cards.py`.
