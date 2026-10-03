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

---

## 2. The Mission: AST Special Abilities Engine (Phase 1 Walking Skeleton)

### 2.1 The Goal
Connect structured ability data (`cards_logic.json`) to the server game loop so that played or triggered cards automatically enqueue and execute real state mutations (`DRAW`, `DISCARD`), replacing placeholder logs.

### 2.2 Input Data (`cards_logic.json`)
The card data pipeline outputs structured AST representations for card abilities:
```json
{
  "cardId": "hero_moses_01",
  "name": "Moses",
  "abilities": [
    {
      "id": "ability_moses_draw",
      "type": "ACTIVATED",
      "trigger": { "event": "ENTERS_ZONE", "zone": "TERRITORY", "phase": "PREPARATION" },
      "conditions": [
        { "type": "COMPARE", "field": "player.hand.length", "operator": "<=", "value": 7 }
      ],
      "effects": [
        { "action": "DRAW", "params": { "count": 2, "target": "CONTROLLER" } }
      ]
    }
  ]
}
```

### 2.3 Phase 1 Scope & Deliverables
1. **Ingestion & Lookup (`AbilityLookup.js`):**
   - Load and index `cards_logic.json` by `cardId` or `abilityId`.
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
   - Unit test suite verifying condition checking, execution, and state mutations on 5–10 archetype test cards.

---

## 3. Strict Architecture & Quality Standards

- **Maximum 250 Lines of Code:** Every single file or class is strictly limited to $\le 250$ LOC.
- **Clean Separation:** Network/state logic on server; UI rendering delegated via events.
- **No Magic Strings:** All action types (`DRAW`, `DISCARD`) and zones imported from centralized constants (`shared/actions.js`, `shared/zones.js`).
- **Mutation Ledgers:** Every executed effect must record its state change snapshot to support Redemption's rule-based `Interrupt` and `Negate` mechanics ([REG 11.0.0](file:///d:/Documents/Workspaces/Redemption/Redemption%20Coliseum/docs/REG_PDF_11.0.0.txt#L1850)).
