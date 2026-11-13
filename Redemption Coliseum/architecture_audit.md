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
- **Scope**: Entire Redemption Coliseum suite (Client Scenes, Dialogs, Overlays, Deck Catacombs, Server Commands, and Shared Rule Engines).
- **Issue**:
  - Hardcoded UI strings, dialog texts, and button labels are scattered across client views and scenes (e.g. `DeckMetricsDialogScene.ts`, `StaticElementFactory.ts`).
  - Rule validation errors and toast messages are hardcoded as raw string literals across `shared/rules/` (`CombatRules.js`, `MovementRules.js`) and `server/src/commands/` / `services/` (`cardService.js`).
  - String duplication and drift across shared rules, server, and tests (e.g. `"Additional characters in battle must be banded!"` in `CombatRules.js`, `cardService.js`, and `astBattlePrimitives.test.js`).
  - Layering mismatch: `client/src/constants/uiStrings.ts` contains duplicate/dead toast strings that `server/` cannot import, while client handlers simply render raw string payloads from network events.
- **Target Architecture**:
  1. **Rule Engine & Server Error Codes (`shared/ruleErrors.js` / Error Codes)**:
     - Strict layer separation: `server/` and `shared/rules/` must NEVER import from `client/src/constants/uiStrings.ts`.
     - Rule validation failures and server toasts must emit standardized machine-readable error codes (e.g. `RULE_ERROR_CODES.BANDING_REQUIRED`) or shared constants from `shared/ruleErrors.js` (analogous to `shared/actionStrings.js`).
     - Client maps error codes to localized toast messages via `uiStrings.ts` instead of directly rendering arbitrary server strings.
  2. **Client UI Strings (`client/src/constants/uiStrings.ts`)**:
     - Migrate all remaining hardcoded client view/scene texts to `uiStrings.ts`.
     - Remove obsolete, dead toast constants from `uiStrings.ts`.
     - Prepare for multi-language localization (English standard, expandable to German/other languages) without touching game or scene logic.
  3. **Action Descriptions**:
     - Centralize Colyseus action schema descriptions via `shared/actionStrings.js`.

### 4. Action Type Harmonization (`ACTIVATE_STAR_ABILITY` -> Generic `ACTIVATE_ABILITY`)
- **Status**: Audit Planned (Code Hygiene & Consistency)
- **Scope**: `shared/actions.js`, `server/src/services/MatchService.js`, `server/src/commands/NextPhaseCommand.js`, `client/src/ui/CardUI.ts`.
- **Issue**: `ACTIVATE_STAR_ABILITY` was historically introduced as a standalone action type, whereas all other special abilities (Lost Souls, Fortresses, Artifacts, Heroes) use the generic `ActionType.ACTIVATE_ABILITY`.
- **Target Architecture**:
  - Unify Star card activation to use `ActionType.ACTIVATE_ABILITY` with Star class validation.
  - Maintain backward-compatibility alias during transitional phases to prevent regression.

### 5. Card Type Hierarchy & Dynamic Type System Migration
- **Status**: Completed (`shared/cardHierarchy.json` & `shared/cardHierarchy.js`)
- **Scope**: `shared/card-constants.js`, `shared/cardHierarchy.json`, `shared/cardHierarchy.js`, `server/src/ast/TargetSelectionService.js`, `server/src/services/BattleCharacterClassifier.js`, `client/src/ui/renderers/FieldRenderer.ts`.
- **Issue**:
  - The codebase currently relies on a flat `CARD_TYPES` enum without ontological type hierarchy (`TYPE_GROUPS`, `TYPE_IS_A`).
  - Fragile, manual string inspections (e.g. `rawType.includes("character")`, `card.inGameType === "ge"`, manual alignment checking) are scattered across services.
  - When card abilities target higher-order categories (e.g. `enhancement` encompassing both `GE` and `EE`), manual string checks fail or misclassify characters as enhancements.
- **Target Architecture**:
  1. **Hierarchy Export (`shared/cardHierarchy.json` / `shared/cardTypes.js`)**:
     - Ingest exported ontology schema from the Python card data pipeline defining:
       - Complete `CardType` enum (including `Hero`, `Evil Character`, `GE`, `EE`, `Artifact`, `Site`, `Fortress`, `Dominant`, `Lost Soul`, `Covenant`, `Curse`, `City`, `Character`, `Enhancement`, Tokens).
       - `TYPE_GROUPS` (e.g., `Enhancement: ["GE", "EE"]`, `Character: ["Hero", "Evil Character", ...]`, `City: ["Site", "Fortress"]`).
       - `TYPE_IS_A` (e.g., `Covenant: ["Artifact", "GE"]`, `Curse: ["Artifact", "EE"]`, Tokens).
  2. **Centralized Query Helper (`CardTypeService` in `shared/`)**:
     - Provide a single source of truth helper method: `CardTypeService.matchesType(card, targetType)`.
     - Recursively/transitively evaluates if `card` satisfies `targetType` via direct match, group membership (`TYPE_GROUPS`), or inheritance (`TYPE_IS_A`).
  3. **Codebase Refactoring**:
     - Replace all ad-hoc string inspections in `TargetSelectionService.matchesFilter`, `BattleCharacterClassifier`, and UI renderers with `CardTypeService.matchesType(card, targetType)`.
     - Eliminate magic strings and enforce compiler-checked types across client and server.

### 6. Structured Game Log Events & Central Formatter Architecture
- **Status**: Audit Planned (Architectural Technical Debt; complements Item #3)
- **Scope**: `server/src/utils/gameLogFormatter.js`, `server/src/commands/`, `server/src/services/`, `server/src/ast/` (`AbilityResolver.js`, `handlers/`), and `client/src/ui/managers/ChatManager.ts`.
- **Issue**:
  - Commands, services, and AST ability handlers currently compose English prose strings inline (calling `formatCardLink(card)` or interpolating `card.Name` / `item.title`) before emitting via `room.broadcastGameLog(...)`.
  - When a handler omits `formatCardLink()` (`{{templateId|cardName}}` / `"a face-down card"`), cards render as non-interactive plain text or break on bracketed set suffixes (e.g., `[L]` in `Altar of Burnt Offering [L]` getting partially matched by the `[Name]` fallback regex in `ChatManager.ts`).
  - Decentralized log string assembly couples gameplay handlers and tests to exact English wording, prevents single-point enforcement of `isFaceDown` masking, and blocks clean localization alongside Item #3.
- **Target Architecture**:
  1. **Structured Log Payloads (`shared/` Event Descriptors)**:
     - Replace ad-hoc prose concatenation in commands, services, and AST handlers with structured log descriptors (e.g., `{ eventKey, actorId, cardRefs, params }`).
     - Pass typed card references instead of pre-formatted strings so callers cannot accidentally interpolate raw `card.Name`.
  2. **Single-Point Formatting & Privacy Gateway**:
     - Perform card-link formatting, localization template resolution (see Item #3), and `isFaceDown` masking centrally in one server log gateway before broadcasting.
  3. **Client Game Log Rendering (`ChatManager.ts`)**:
     - Keep bracket `[Card Name]` parsing scoped strictly to manual player chat messages while server game logs use structured tokens/events exclusively.

---

## Clean Code & Modular Architecture Guidelines
- Strict 250-line limit per file/class (`*Manager.ts`, `*Handler.ts`, `*Effect.ts`, `.css`).
- Separation of concerns: UI/DOM views decoupled from game state managers and network event listeners.


