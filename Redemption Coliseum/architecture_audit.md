# Architecture & Quality Audit - Redemption Coliseum

## Overview
This document tracks modularization targets, line-count audits, and architectural technical debt across the codebase in accordance with project engineering standards (max 250 lines per file/class).

---

## Modularization & File Size Audit Targets

### 1. Template CSS Modularization
- **File**: `client/public/templates/deckTile.css` (Current Lines: ~543)
- **Status**: Audit Priority High
- **Issue**: Exceeds the 250-line file size threshold. Contains grid layout, tier skin variants, medallion animations, validity badges, custom scrollbars, and empty state banners.
- **Recommended Action Plan**:
  - Split into modular CSS files:
    - `deckTile-grid.css` (Grid container & custom scrollbar styles)
    - `deckTile-tiers.css` (Tier themes: Stone, Bronze, Silver, Gold Pulse animation)
    - `deckTile-components.css` (Header, medallion, action buttons, stats & validity badges)

---

## Clean Code & Modular Architecture Guidelines
- Strict 250-line limit per file/class (`*Manager.ts`, `*Handler.ts`, `*Effect.ts`, `.css`).
- Separation of concerns: UI/DOM views decoupled from game state managers and network event listeners.
