# Technical Debt & Architecture Refactoring Backlog

Dieses Dokument erfasst alle identifizierten architektonischen Schwachstellen, Code-Smells und anstehenden Refactoring-Aufgaben für den Client und Server.

---

## 🔴 High Priority (SoC-Verletzungen & Exzessive Dateigrößen)

### 1. `LocalDecksGridUI.ts` (391 Zeilen)
- [ ] **Data/UI Entkopplung**: Speicherlogik (`saveMetadataPermanently`) vollständig aus der UI entfernen. `LocalDecksGridUI` schickt nur noch Callbacks (`onUpdateStats`, `onRename`) an `LocalDecksScene`.
- [ ] **Modul-Aufteilung**:
  - `LocalDecksGridUI.ts`: Rein für Grid-Container, Layout und Render-Schleife (~120 Zeilen).
  - `LocalDeckTileView.ts`: Kapselt das Kachel-Rendering und DOM-Event-Handling (~130 Zeilen).

### 2. `DeckEditorScene.ts` (1.446 Zeilen)
- [ ] **Monster-Klasse aufspalten**:
  - `DeckEditorScene.ts`: Nur Phaser-Szenen-Lifecycle und Kamera/Resizing.
  - `DeckEditorManager.ts`: High-Level Deck-State (Karten hinzufügen/entfernen, Validierung).
  - `DeckEditorFilterHandler.ts`: Filter- & Such-Logik.

### 3. `filter_config.ts` (1.010 Zeilen)
- [ ] **Modularisierung**: Aufteilen der riesigen Konfigurationsdatei in thematische Unter-Configs (z. B. `brigadeFilters.ts`, `typeFilters.ts`, `setFilters.ts`).

---

## 🟡 Medium Priority (Manager/View Trennung & Storage-Kapselung)

### 4. Storage-Zentralisierung (`localStorage`)
- [ ] Direct Access entfernen in `OverlayManager.ts`, `LobbyInputHandler.ts` und `PhaseManager.ts`.
- [ ] Alle `localStorage`-Operationen (`reconnectionToken`, `debug`) zentral über `PersistenceManager.ts` leiten.

### 5. Umstrukturierung von UI-Managern (Manager vs. View)
- [ ] **`LobbyUIManager.ts` (491 Zeilen)** & **`SelectionDialogUIManager.ts` (474 Zeilen)**:
  - Trennen von reine DOM/Phaser-Visuelles (`LobbyView.ts`) und State-Orchestrierung (`LobbyManager.ts`).
- [ ] **`HUDManager.ts` (6,1 KB)** & **`DialogManager.ts` (6,9 KB)**: Umbenennen/Entkoppeln in saubere View-Klassen.

### 6. Datei-Verschlankung (Klassen > 500 Zeilen)
- [ ] `DeckListView.ts` (816 Zeilen) ➔ Aufteilen in List-Controller & Row-Renderer.
- [ ] `CardVisuals.ts` (690 Zeilen) ➔ Auslagern in spezialisierte Visual Effects (`CardGlowEffect.ts`).
- [ ] `DeckCardView.ts` (620 Zeilen) ➔ Kapseln der Hover/Click Interaktions-Handler.
- [ ] `SoundManager.ts` (530 Zeilen) ➔ Trennen in Asset-Loader und Audio-Controller.
- [ ] `DragDropHandler.ts` (521 Zeilen) ➔ Entkoppeln von Drop-Target-Validierung.
- [ ] `LocalDecksScene.ts` (502 Zeilen) ➔ Auslagern der Layout- & Footer-Erstellung.

---

## 🟢 Low Priority (Server-Architektur & Typisierung)

### 7. Colyseus Server Room-Isolierung (`GameRoom.js`)
- [ ] Entkopplung von Room-Lifecycle und Geschäftslogik: 100% aller State-Mutationen strikt über den `CommandDispatcher` leiten.

### 8. Server TypeScript Migration (`server/src/`)
- [ ] Umstellung der Server-Dateien (`.js` ➔ `.ts`).
- [ ] Gemeinsame Nutzung der TypeScript-Typdefinitionen (`DeckMetadata`, `CardData`) zwischen Client und Server.

---
*Letztes Update: 26.07.2026*
