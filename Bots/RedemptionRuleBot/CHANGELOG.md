# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [5.6.0] - 2026-04-30

### Added
- **README.md and CHANGELOG.md**: Initial documentation to track project versions and provide setup instructions.

### Changed
- **V5.6 Expert Logic Architecture**: Complete overhaul of the RAG reasoning pipeline into a deterministic 7-step process.
- **Selection Gate (rag_engine.py)**: The bot now explicitly forces a card version selection *before* looking up rules, preventing context bloat and hallucinations. Includes robust regex parsing to catch IDs like `CardName_V2`.
- **Deduplication Strategy (knowledge_manager.py)**: Established a strict "Single Ground Truth" hierarchy (REG > ORDIR > Rulebook). Redundant rules are filtered out to optimize token usage.
- **Word-Set Matching (knowledge_manager.py)**: Upgraded the header matching logic. The system now cross-references card types (e.g., "Artifact") with abilities (e.g., "Activate") to reliably find critical REG sections like "Activate an Artifact".
- **Prompt Isolation**: Scrubbed all game-specific jargon from system and reviewer prompts, replacing them with generic, architectural instructions to enforce strict factual deduction.
- **Transparency Headers**: The bot's response now explicitly lists the "Factual Base Data", detailing exactly which card version was selected and why.

### Fixed
- **Version Fallback Bug**: Fixed a critical logic error in the Selection Gate where the system would silently fall back to Version 1 if the LLM output contained extra chatter.
- **Wispbyte Deployment**: Removed the heavy `pinecone-plugin-inference` dependency and cleaned up the `main.py` init sequence to prevent startup crashes on the hosting platform.
- **JSON Corruption Handling**: Fixed an issue where a full disk (`[Errno 28]`) corrupted the `pagination_progress.json`, preventing the bot from starting.
