# AST Special Abilities Engine: Kickoff & Handover Specification

> **Document Type:** Project Handover & Implementation Kickoff  
> **Target:** New Conversation / Development Phase  
> **Prerequisites:** Effect Chronicle Milestones 1–4 Completed  

---

## 1. Executive Context & Current Architecture

Redemption Coliseum has transitioned from a virtual card-moving tabletop to an automated trading card game with an official **Resolution Queue** named **The Effect Chronicle** ([docs/action_queue_specification.md](file:///d:/Documents/Workspaces/Redemption/Redemption%20Coliseum/docs/action_queue_specification.md)).

### 1.1 What Is Already Implemented & Operational:
1. **Server Queue State & Messaging:**
   - `server/src/state/EffectChronicleState.js`: `EffectChronicleState` schema tracking `items: ArraySchema<ChronicleItem>`, `priorityPlayerId`, and `isResolving`.
   - `ChronicleItem` supports: `id`, `cardId`, `controllerId`, `actionType`, `title`, `description`, `order`, `status`, `abilityId`, and `isOptional: boolean`.
   - `server/src/services/EffectChronicleService.js`: Enqueues cards/abilities, alternates priority, resolves items (`executeItem`, `passItem`, `passAllItems`), and invokes `room._chronicleOnComplete(room)`.
   - `server/src/commands/ResolveChronicleCommand.js`: Dispatches client execution/pass requests.
2. **Client Visuals & Dual-Mode Ergonomics:**
   - `client/src/ui/managers/EffectChronicleManager.ts` & `EffectChronicleEffect.ts`: Symmetrical book icon with circular counter badge at the Menorah (left of player deck, right of opponent deck). Staggered 80 ms card flight trajectory with audio and scale/tint bump.
   - **Support Mode (`inGameSupport = true`):** Rich slide-out DOM drawer (`EffectChronicleFlyoutUI.ts`) with card art, detail zoom, and controls.
   - **Tournament Mode (`inGameSupport = false`):** Clean board with compact counter badge. Top HUD banner (`DrawSequenceManager.ts` + `DrawSequenceBanner.ts`) renders Quick-Controls (`[ Execute ]` and `[ Pass ]`).
   - Mandatory vs. Optional actions: `isOptional === false` greys out *Pass* buttons, allowing only *Execute*.
3. **Data Foundation & Authoritative IDs (COMPLETED):**
   - The card catalog (`shared/cards_extended_with_ordir_fuzzy.json`) is the single source of truth.
   - Dynamic hashing (`generateCardId`) has been completely removed across the client, server, and deck editor.
   - Runtime `Card` instances preserve `card.templateId` (the catalog ID matching `cards_logic.json`) alongside their runtime instance ID `card.id`.
   - `card.IsStarCard` is fully synchronized as a boolean schema property on both client and server.
   - Dual Dominants and multi-sided cards are parsed into distinct `sides` with alignment-specific selection (`Good Dominant` vs. `Evil Dominant`).

---

## 2. The Mission: AST Special Abilities Engine (Phase 1 Walking Skeleton)

### 2.1 The Goal
Connect structured ability data (`cards_logic.json`) to the server game loop so that played or triggered cards automatically enqueue and execute real state mutations (`DRAW`, `DISCARD`), replacing placeholder logs.

### 2.2 Input Data (`cards_logic.json`)
The card data pipeline outputs a JSON dictionary indexed directly by `card_id` (`card.templateId`):
```json
{
  "-320853472": {
    "card_id": "-320853472",
    "card_name": "A Child is Born",
    "set": "Promo",
    "sides": {
      "shared": {
        "modifiers": [
          { "modifier_type": "cannot_be_negated", "applies_to": "this_side" },
          { "modifier_type": "cannot_be_interrupted", "applies_to": "this_side" },
          { "modifier_type": "cannot_be_prevented", "applies_to": "this_side" }
        ],
        "abilities": [
          {
            "ability_id": "ab_1_discard",
            "activation_mode": "immediate",
            "is_optional": false,
            "is_preventable": false,
            "is_interruptible": false,
            "is_negatable": false,
            "conditions": [],
            "costs": [],
            "effects": [
              {
                "step": 1,
                "action": "discard",
                "effect_type": "instant",
                "duration": "instant",
                "target": {
                  "selection_mode": "automatic_all",
                  "zone_owner": "controller",
                  "zone": "hand"
                }
              }
            ]
          }
        ]
      }
    }
  }
}
```

### 2.3 Phase 1 Scope & Deliverables
1. **Ingestion & Lookup (`AbilityLookup.js`):**
   - Load `cards_logic.json` into memory. O(1) card logic lookup by `card.templateId`.
   - Side resolution: Inspect `sides.shared`, `sides.top`, and `sides.bottom` based on active card state (`card.inGameType` / `card.inGameAlignment`).
2. **Condition Evaluator (`ConditionEvaluator.js`):**
   - Evaluate trigger conditions against `RoomState` (phase, zone, quantitative comparisons).
3. **Execution Coordinator (`AbilityResolver.js`):**
   - Plug into the prepared hook in `EffectChronicleService.executeItem`:
     ```javascript
     if (room.abilityResolver && typeof room.abilityResolver.resolve === "function") {
       await room.abilityResolver.resolve(item);
     }
     ```
4. **Action Handlers (`DrawHandler.js`, `DiscardHandler.js`):**
   - Execute state mutations using `cardService.js` (respecting hand limits and Lost Soul diversion).
   - Record an atomic `MutationSnapshot` on the executed item for future Undo, Negate, and Interrupt rollbacks!
5. **Automated Unit Tests (`server/tests/astEngine.test.js`):**
   - Unit test suite verifying condition checking, execution, and state mutations on archetype test cards.

### 2.4 Walking Skeleton Strategy & Graceful Fallback (Hybrid Principle)
To prevent scope creep and guarantee 100% match stability while card logic is incrementally authored in the companion project:
1. **Never Fail Hard (Graceful Degradation):**
   - If a card's `templateId` is missing from `cards_logic.json`, or if an ability requires an action not yet implemented in Phase 1 (e.g. `search`, `convert`, `negate`):
   - `AbilityResolver` logs an info message and gracefully falls back to the established chronicle log (`${playerName} executes ${item.title}: "${item.description}"`).
   - The match continues seamlessly without errors; players execute unsupported steps manually on the board as before.
2. **Phase 1 Archetype Primitives Only:**
   - **`DRAW`:** Draw $X$ cards from deck into hand (triggering phase-specific draws and hand checks).
   - **`DISCARD`:** Discard target card(s) to discard pile (supporting automatic or target-driven selections).
   - **Test Archetypes:**
     - Instant Discard: *"A Child is Born"* (`templateId: "-320853472"`).
     - Instant / Hand Reset: *"Mayhem"* or Star Card with Draw ability.

### 2.5 Phase 1 Definition of Done (DoD)
1. [ ] `AbilityLookup.js` indexes `cards_logic.json` and resolves abilities by `card.templateId` and active side.
2. [ ] `DrawHandler.js` and `DiscardHandler.js` execute real state mutations via `cardService.js`.
3. [ ] `EffectChronicleService.executeItem` executes automated handlers when available, and falls back to text logs when unavailable.
4. [ ] Unit test suite in `server/tests/astEngine.test.js` passes cleanly.

### 2.6 Architectural Boundary: Execution First, Rulebook Second
To prevent getting trapped in the "Waterfall Rulebook Pitfall":
- **Engine is an Executor, Not a Referee:** The AST Engine only executes abilities that have been confirmed in the Chronicle. It does **not** need a 200-page rulebook validator to function.
- **Leverage Existing Entry Points:** Phase 1 connects to the already working, 100% rules-legal Draw Phase Sequence (Star Cards & Lost Souls in the Chronicle) and unit tests.
- **Phase Roadmap:**
  - *Phase 1 (This Kickoff):* AST Execution Core (`AbilityLookup`, `DrawHandler`, `DiscardHandler`, Graceful Fallback).
  - *Phase 1.5 (UI Evolution / Direct Mode):* In-Situ / Spotlight presentation (cards hover into center and auto-resolve or prompt directly on the board without drawer friction).
  - *Phase 2:* Category-level Triggers & More Handlers (Dominants played from hand, TC characters on territory placement, Search/Negate handlers).
  - *Phase 3:* Full Play Legality Validator (preventing illegal drag & drop moves before they hit the board).

---

## 3. Strict Architecture & Quality Standards

- **Maximum 250 Lines of Code:** Every single file or class is strictly limited to $\le 250$ LOC.
- **Clean Separation:** Network/state logic on server; UI rendering delegated via events.
- **No Magic Strings:** All action types (`DRAW`, `DISCARD`) and zones imported from centralized constants (`shared/actions.js`, `shared/zones.js`).
- **Mutation Ledgers:** Every executed effect must record its state change snapshot to support Redemption's rule-based `Interrupt` and `Negate` mechanics ([REG 11.0.0](file:///d:/Documents/Workspaces/Redemption/Redemption%20Coliseum/docs/REG_PDF_11.0.0.txt#L1850)).
