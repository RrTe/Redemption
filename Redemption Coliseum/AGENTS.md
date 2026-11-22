# Redemption Coliseum — Project Rules

## Scope & Context Hygiene
- These rules apply strictly to `Redemption Coliseum/` (do not modify sibling projects in parent folders unless explicitly requested).
- Keep one focused task per chat and keep changes surgical.
- Never load huge JSON data files (`shared/cards_logic.json`, `shared/carddata.json`, `shared/cards_extended*.json`) into context with file reads. Query specific entries or stats via `npm --prefix server run audit:ast` or targeted `node -e` commands.
- Never run `git commit` or `git push` without explicit user approval.

## Architecture & Separation of Concerns
- **Authoritative Server (`server/src/`)**: All game state, rule checks, phase/chronicle progression, targeting validation, and card mutations live server-side (`rooms/`, `commands/`, `services/`, `ast/`, `state/`). Never trust client input for rule enforcement.
- **Client (`client/src/`)**: Phaser 3 + TypeScript. Strictly separate:
  - Orchestration (`managers/`, `ui/managers/`)
  - Input & Colyseus network listeners (`ui/handlers/`, `network/`)
  - Visual rendering (`ui/renderers/`, `ui/overlays/`, `scenes/`) — zero direct network/storage/DB I/O
  - Decoupled VFX/SFX (`ui/effects/`, `managers/SoundManager.ts`)
- **Shared (`shared/`)**: Canonical constants, types, schemas, and pure rule evaluators (`zones.js`, `actions.js`, `astConstants.js`, `phases.js`, `cardHierarchy.js`, `BattleCalculator.js`, `rules/*`).
- **No Magic Numbers or Strings**: Import zones, phases, actions, AST tokens, and config keys from `shared/` or `client/src/config/` / `client/src/constants/`.
- **Cohesion & File Size**: Keep files focused around ~250–300 LOC (avoid exceeding 350 LOC unless strongly cohesive) with small, single-purpose functions and no duplicated logic.

## AST Engine & Game Rules Guardrails
- Register AST action identifiers in `shared/astConstants.js` (`AST_ACTIONS`) and handlers in `server/src/ast/AstEffectRunner.js` (`_handlers`).
- Treat `shared/cards_logic.json` as upstream card data unless explicitly asked to patch an entry; never invent undocumented AST fields.
- Reuse shared evaluators instead of re-implementing rule logic:
  - `shared/cardHierarchy.js` (`resolveActiveSideIndex`, `matchesCardType`, `matchesTargetType`)
  - `shared/rules/ProtectionService.js`, `MovementRules.js`, `StatFilterEvaluator.js`, `GenderEvaluator.js`, `SideAttributeEvaluator.js`
  - `server/src/ast/ConditionEvaluator.js`, `TargetSelectionService.js`, `TargetCountResolver.js`
- Consult official rules via targeted searches (`Select-String` / `node -e` or bounded `read_file` slices — never read entire rulebook files): `docs/REG_PDF_11.1.0.txt` (effect glossary, Ability Activation Order, Modifiers, targeting/timing), `docs/ORDIR_PDF_7.1.0.txt` (taxonomy/attributes), and `docs/5th_Edition_Rulebook.txt`. Respect Special Initiative interruption windows, hand-size overflow, Lost Soul diversion, dual-side/dual-aligned card side resolution, and Chronicle Undo rollback (`ResolveChronicleCommand.js`).
- Do **not** add new Phaser VFX (`client/src/ui/effects/`) or sound cues (`SoundManager.ts`) unless explicitly requested.

## Verification & Quality Gates
- **Unified verification command**: Run `node scripts/verify.js` from `Redemption Coliseum/` after edits (`--server` for Jest only during iteration, `--client` for client `tsc --noEmit` + Vite `build` only; full `node scripts/verify.js` after shared changes or before wrapping up).
- Organize Jest tests by rule/mechanic class inside the matching module test file (`server/tests/<feature>.test.js`) instead of per-card or catch-all bugfix files (e.g., `playtestBugfixes.test.js`); keep at most one real card sample per mechanic class.
- Never claim checks passed without running them after the final edit. Report exact commands run and exact counts/failures observed.
- Do not leave unused imports, commented-out blocks, or dead helpers behind.

## Workflow & Planning Boundary (Auto-Triage Before Editing)
On every task start, briefly inspect scope and decide before modifying code:
1. **Execute directly (no pre-approval stop)**: Clear bug fixes, isolated UI adjustments without new network/state contracts, and single AST handlers/conditions following established patterns — implement and verify end-to-end.
2. **Clarify first (`ask_question` / interview)**: When genuine rule/design ambiguity, multiple valid approaches, or missing prerequisite systems appear, ask focused questions before coding instead of guessing.
3. **Implementation Plan for approval first**: When adding new core state/network mechanics (new `@colyseus/schema` tracking, new client-server messages, UI modals, interrupt/negate/play timing windows) or large cross-layer refactors (`shared/` + `server/` + `client/`), present a concise Implementation Plan artifact for approval before editing.

## Skill Routing
- When implementing or extending AST ability handlers, conditions, targeting, or multi-step AST effects, activate `.agents/skills/implement-effect-handler/SKILL.md`.
- When surveying AST coverage, inspecting specific `cards_logic.json` entries, or prioritizing engine vs. data gaps, activate `.agents/skills/audit-cards-logic/SKILL.md` (`npm --prefix server run audit:ast`).
