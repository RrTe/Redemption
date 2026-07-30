# Technical Debt & Architecture Refactoring Backlog

Dieses Dokument erfasst alle identifizierten architektonischen Schwachstellen, Code-Smells und anstehenden Refactoring-Aufgaben für den Client und Server.

---

## 🔴 High Priority (SoC-Verletzungen & Exzessive Dateigrößen > 500 Zeilen)

### 1. `LocalDecksScene.ts` (612 Zeilen) & `LocalDecksGridUI.ts` (514 Zeilen)
- [ ] **Data/UI Entkopplung**: Speicherlogik (`saveMetadataPermanently`) vollständig aus der UI entfernen. `LocalDecksGridUI` schickt nur noch Callbacks (`onUpdateStats`, `onRename`) an `LocalDecksScene`.
- [ ] **Modul-Aufteilung `LocalDecksScene.ts`**:
  - `LocalDecksScene.ts`: Rein für Phaser-Szenen-Lifecycle (`preload`, `create`, `resize`) (~120 Zeilen).
  - `LocalDeckScannerHandler.ts`: Dateisystem-Scanning & Cache-Synchronisation (~150 Zeilen).
  - `LocalDeckVisualResolver.ts`: Ermittlung der Vorschaukarten & Kartendatenbank-Abgleiche (~120 Zeilen).
- [ ] **Modul-Aufteilung `LocalDecksGridUI.ts`**:
  - `LocalDecksGridUI.ts`: Rein für Grid-Container, Layout und Render-Schleife (~120 Zeilen).
  - `LocalDeckTileView.ts`: Kapselt das Kachel-Rendering und DOM-Event-Handling (~130 Zeilen).

### 2. `DeckEditorScene.ts` (1.501 Zeilen)
- [ ] **Monster-Klasse aufspalten**:
  - `DeckEditorScene.ts`: Nur Phaser-Szenen-Lifecycle und Kamera/Resizing.
  - `DeckEditorManager.ts`: High-Level Deck-State (Karten hinzufügen/entfernen, Validierung).
  - `DeckEditorFilterHandler.ts`: Filter- & Such-Logik.

### 3. `DeckHeaderFilterUI.ts` (655 Zeilen)
- [ ] **Modul-Aufteilung**:
  - `DeckHeaderFilterUI.ts`: Orchestrierung der 4 Filterleisten-Container.
  - `DeckSortBarView.ts`: Kapselung der Sortierbuttons (`A-Z`, `Z-A`, `Tier`, `Format`, `Brigades`).
  - `DeckActionButtonsView.ts`: Kapselung der Aktionsicons (`Deck Smith`, `Sync`, `Reset`).

### 4. `filter_config.ts` (1.010 Zeilen)
- [ ] **Modularisierung**: Aufteilen der riesigen Konfigurationsdatei in thematische Unter-Configs (z. B. `brigadeFilters.ts`, `typeFilters.ts`, `setFilters.ts`).

---

## 🟡 Medium Priority (Manager/View Trennung & Dateigrößen 250 - 500 Zeilen)

### 5. Storage-Zentralisierung (`localStorage`)
- [ ] Direct Access entfernen in `OverlayManager.ts`, `LobbyInputHandler.ts` und `PhaseManager.ts`.
- [ ] Alle `localStorage`-Operationen (`reconnectionToken`, `debug`) zentral über `PersistenceManager.ts` leiten.

### 6. Umstrukturierung von UI-Managern (Manager vs. View)
- [ ] **`LobbyUIManager.ts` (491 Zeilen)** & **`SelectionDialogUIManager.ts` (474 Zeilen)**:
  - Trennen von reinen DOM/Phaser-Visuals (`LobbyView.ts`) und State-Orchestrierung (`LobbyManager.ts`).
- [ ] **`HUDManager.ts` (6,1 KB)** & **`DialogManager.ts` (6,9 KB)**: Umbenennen/Entkoppeln in saubere View-Klassen.

### 7. Datei-Verschlankung (Klassen > 250 Zeilen Audit)
- [ ] `DeckListView.ts` (816 Zeilen) ➔ Aufteilen in List-Controller & Row-Renderer.
- [ ] `CardVisuals.ts` (690 Zeilen) ➔ Auslagern in spezialisierte Visual Effects (`CardGlowEffect.ts`).
- [ ] `DeckCardView.ts` (620 Zeilen) ➔ Kapseln der Hover/Click Interaktions-Handler.
- [ ] `SoundManager.ts` (530 Zeilen) ➔ Trennen in Asset-Loader und Audio-Controller.
- [ ] `DragDropHandler.ts` (521 Zeilen) ➔ Entkoppeln von Drop-Target-Validierung.
- [ ] `GameLoadingScene.ts` (500 Zeilen) ➔ Entkoppeln von Preloader & Loading-Animations-Handler.
- [ ] `CardRenderer.ts` (496 Zeilen) ➔ Entkopplung von Card Frame & Text Rendering.
- [ ] `SettingsDialogScene.ts` (494 Zeilen) ➔ Trennen von Audio- & Display-Einstellungs-Panels.
- [ ] `VerticalCardScrollList.ts` (486 Zeilen) ➔ Auslagern der Scrollbar-Mathematik.
- [ ] `ChatManager.ts` (446 Zeilen) ➔ Trennung von DOM-Chatbox & WebSocket-Handler.
- [ ] `layout.ts` (436 Zeilen) ➔ Aufteilung der dynamischen Layout-Berechnungshelfer.
- [ ] `SelectionDialogScene.ts` (405 Zeilen) & `gameUI.ts` (403 Zeilen).
- [ ] `SelectionDialogFilterView.ts` (368 Zeilen) & `ElementManager.ts` (360 Zeilen).
- [ ] `CardUI.ts` (351 Zeilen) & `MenuTile.ts` (349 Zeilen).
- [ ] `GameNetworkManager.ts` (334 Zeilen) & `DeckMetricsDialogScene.ts` (329 Zeilen).
- [ ] `StackedPileUI.ts` (320 Zeilen) & `FieldRenderer.ts` (312 Zeilen).
- [ ] `DeckDragDropHandler.ts` (308 Zeilen), `PlaceBackground.ts` (297 Zeilen), `AnimationManager.ts` (297 Zeilen).
- [ ] `IconToggleGroup.ts` (278 Zeilen), `QuantitySelectionDialogScene.ts` (277 Zeilen), `DesktopDeckScanner.ts` (257 Zeilen), `OverlayManager.ts` (254 Zeilen), `DeckCatacombsScene.ts` (254 Zeilen).

---

## 🟢 Low Priority (Server-Architektur & Typisierung)

### 8. Colyseus Server Room-Isolierung (`GameRoom.js`)
- [ ] Entkopplung von Room-Lifecycle und Geschäftslogik: 100% aller State-Mutationen strikt über den `CommandDispatcher` leiten.

### 9. Server TypeScript Migration (`server/src/`)
- [ ] Umstellung der Server-Dateien (`.js` ➔ `.ts`).
- [ ] Gemeinsame Nutzung der TypeScript-Typdefinitionen (`DeckMetadata`, `CardData`) zwischen Client und Server.

---

*Letztes Update: 29.07.2026*
