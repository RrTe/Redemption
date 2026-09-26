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

## Architectural Blueprints & Feature Plans

### 2. Synchronized Card Reordering (Hand & Managed Field Rows)
- **Status**: Planned (Design Finalized)
- **Scope**: Hand (`ZONES.HAND`), Territory rows (`HERO`, `EC`, `FORTRESS`, `ARTIFACT`), Land of Bondage (`LAND_OF_BONDAGE`), and Battlefield (`BATTLEFIELD`).
- **Architectural Rationale**:
  - Direct opponent-hand interactions (e.g. pulling a card from opponent's hand via Drag & Drop) depend on exact 1:1 synchronized `cardId` positions between both clients.
  - To prevent regressions, in-zone reordering must NOT overload `moveCard` (which manages play-transitions, attachments, dual cards, and zone rules).
- **Target Implementation Blueprint**:
  1. **Server Command (`ReorderZoneCommand.js`)**:
     - Dedicated message: `reorderZone` with payload `{ zone: Zone, cardId: string, targetIndex: number }`.
     - Reorders the target card within the corresponding player collection (`player.hand`, `player.territory`, etc.) via shifting.
     - Automatically broadcasts synchronized array schema updates via Colyseus without touching zone transitions.
  2. **Client Grid Slot Calculation (`FieldRenderer.ts` & `HandRenderer.ts`)**:
     - Provide dedicated helper `getCardIndexAtPosition(dropX, cardsInRow)` to calculate target drop index based on layout row coordinates.
  3. **Drag & Drop Dispatcher (`DragDropHandler.ts`)**:
     - Triggers `reorderZone` exclusively when `fromZone === toZone` and the drop target is a managed row/hand.

### 3. Suite-Wide UI String Centralization & i18n Architecture
- **Status**: Audit Planned (Architectural Technical Debt)
- **Scope**: Entire Redemption Coliseum suite (Game Scenes, Dialogs, Overlays, and Deck Catacombs).
- **Issue**: Hardcoded UI strings, dialog texts, button labels, and system messages are scattered throughout views and scenes (violating the "No Magic Strings" rule).
- **Target Architecture**:
  - Migrate all user-facing strings into a unified dictionary structure (e.g. `client/src/constants/uiStrings.ts` or scoped i18n JSON bundles).
  - Prepare for multi-language localization (English standard, expandable to German/other languages) without touching game or scene logic.
  - Eliminate all hardcoded action descriptions in Colyseus schema via `shared/actionStrings.js`.

### 4. Action Type Harmonization (`ACTIVATE_STAR_ABILITY` -> Generic `ACTIVATE_ABILITY`)
- **Status**: Audit Planned (Code Hygiene & Consistency)
- **Scope**: `shared/actions.js`, `server/src/services/MatchService.js`, `server/src/commands/NextPhaseCommand.js`, `client/src/ui/CardUI.ts`.
- **Issue**: `ACTIVATE_STAR_ABILITY` was historically introduced as a standalone action type, whereas all other special abilities (Lost Souls, Fortresses, Artifacts, Heroes) use the generic `ActionType.ACTIVATE_ABILITY`.
- **Target Architecture**:
  - Unify Star card activation to use `ActionType.ACTIVATE_ABILITY` with Star class validation.
  - Maintain backward-compatibility alias during transitional phases to prevent regression.

---

## Clean Code & Modular Architecture Guidelines
- Strict 250-line limit per file/class (`*Manager.ts`, `*Handler.ts`, `*Effect.ts`, `.css`).
- Separation of concerns: UI/DOM views decoupled from game state managers and network event listeners.

