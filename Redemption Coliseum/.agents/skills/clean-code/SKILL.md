---
name: clean-code
description: "Enforce Robert C. Martin's Clean Code principles and Redemption Coliseum's hybrid game architecture layouts. Handles token-saving and flexible file-size constraints."
risk: safe
source: "ClawForge (https://github.com/jackjin1997/ClawForge)"
date_added: "2026-02-27"
---

# Clean Code Skill

This skill embodies the principles of "Clean Code" by Robert C. Martin (Uncle Bob). Use it to transform "code that works" into "code that is clean."

## 🧠 Core Philosophy
> "Code is clean if it can be read, and enhanced by a developer other than its original author." — Grady Booch

## When to Use
Use this skill when:
- **Writing new code**: To ensure high quality from the start.
- **Reviewing Pull Requests**: To provide constructive, principle-based feedback.
- **Refactoring legacy code**: To identify and remove code smells.
- **Improving team standards**: To align on industry-standard best practices.

## 1. Meaningful Names
- **Use Intention-Revealing Names**: `elapsedTimeInDays` instead of `d`.
- **Avoid Disinformation**: Don't use `accountList` if it's actually a `Map`.
- **Make Meaningful Distinctions**: Avoid `ProductData` vs `ProductInfo`.
- **Use Pronounceable/Searchable Names**: Avoid `genymdhms`.
- **Class Names**: Use nouns (`Customer`, `WikiPage`). Avoid `Manager`, `Data`.
- **Method Names**: Use verbs (`postPayment`, `deletePage`).

## 2. Functions
- **Small!**: Functions should be shorter than you think.
- **Do One Thing**: A function should do only one thing, and do it well.
- **One Level of Abstraction**: Don't mix high-level business logic with low-level details (like regex).
- **Descriptive Names**: `isPasswordValid` is better than `check`.
- **Arguments**: 0 is ideal, 1-2 is okay, 3+ requires a very strong justification.
- **No Side Effects**: Functions shouldn't secretly change global state.

## 3. Comments
- **Don't Comment Bad Code—Rewrite It**: Most comments are a sign of failure to express ourselves in code.
- **Explain Yourself in Code**: 
  ```python
  # Check if employee is eligible for full benefits
  if employee.flags & HOURLY and employee.age > 65:
  ```
  vs
  ```python
  if employee.isEligibleForFullBenefits():
  ```
- **Good Comments**: Legal, Informative (regex intent), Clarification (external libraries), TODOs.
- **Bad Comments**: Mumbling, Redundant, Misleading, Mandated, Noise, Position Markers.

## 4. Formatting
- **The Newspaper Metaphor**: High-level concepts at the top, details at the bottom.
- **Vertical Density**: Related lines should be close to each other.
- **Distance**: Variables should be declared near their usage.
- **Indentation**: Essential for structural readability.

## 5. Objects and Data Structures
- **Data Abstraction**: Hide the implementation behind interfaces.
- **The Law of Demeter**: A module should not know about the innards of the objects it manipulates. Avoid `a.getB().getC().doSomething()`.
- **Data Transfer Objects (DTO)**: Classes with public variables and no functions.

## 6. Error Handling
- **Use Exceptions instead of Return Codes**: Keeps logic clean.
- **Write Try-Catch-Finally First**: Defines the scope of the operation.
- **Don't Return Null**: It forces the caller to check for null every time.
- **Don't Pass Null**: Leads to `NullPointerException`.

## 7. Unit Tests
- **The Three Laws of TDD**:
  1. Don't write production code until you have a failing unit test.
  2. Don't write more of a unit test than is sufficient to fail.
  3. Don't write more production code than is sufficient to pass the failing test.
- **F.I.R.S.T. Principles**: Fast, Independent, Repeatable, Self-Validating, Timely.

## 8. Classes
- **Small!**: Classes should have a single responsibility (SRP).
- **The Stepdown Rule**: We want the code to read like a top-down narrative.

## 9. Smells and Heuristics
- **Rigidity**: Hard to change.
- **Fragility**: Breaks in many places.
- **Immobility**: Hard to reuse.
- **Viscosity**: Hard to do the right thing.
- **Needless Complexity/Repetition**.

## 10. Project Architecture & Folder Layouts

### 10.1 Architecture Principles
- **Separation of Concerns**: Strictly separate network/state logic from rendering/visual logic.
- **Flexible Class & File Size Limit**: As a general guideline, every single file and class should stay **under 300 to a maximum of 350 lines of code**. Functional and logical separation always takes priority! It is not an issue if a logically cohesive class reaches 360 lines. However, the moment a class becomes cluttered or takes on multiple different responsibilities (violating SRP), you must immediately modularize and split it into separate files.
- **No Magic Numbers**: Server ports, room identifiers, or game-balancing constants must be imported from a centralized configuration file (e.g., `src/config.ts`). No hardcoded values in business logic.

### 10.2 Classic Technical Layout (`client/` & `server/`)
Used for legacy modules, organized by technical layers:

#### Client-Side (Phaser 3 / TypeScript)
- **Scenes (`*Scene.ts` in `client/src/scenes/`)**: Coordinate Phaser lifecycle, scene transitions, and layout resize events.
- **Managers (`*Manager.ts` in `client/src/ui/managers/` or `client/src/managers/`)**: High-level orchestrators for state and coordination. **No rendering logic**.
- **Handlers (`*Handler.ts` in `client/src/ui/handlers/`)**: Connect inputs (mouse/keyboard) and Colyseus message listeners.
- **Renderers (`*Renderer.ts` in `client/src/ui/renderers/`)**: Draw Phaser visual game objects based on state. No business logic.
- **Effects (`*Effect.ts` in `client/src/ui/effects/`)**: Pure visual/audio candy inside Phaser. Decoupled from server state.
- **Network (`client/src/network/`)**: Manage WebSocket connections and events between client/server.

#### Server-Side (Colyseus / Node.js)
- **Rooms (`*Room.js` in `server/src/rooms/`)**: Manage client connections, lifecycle hooks (`onCreate`, `onJoin`), and message dispatching.
- **Commands (`*Command.js` in `server/src/commands/`)**: Encapsulate transactional game actions via `CommandDispatcher`.
- **Services (`*Service.js` in `server/src/services/`)**: Central business logic, validation, and state modification.
- **State (`*State.js` in `server/src/state/`)**: Declare the synchronizing schema via `@colyseus/schema`.

---

### 10.3 Functional Feature Layout (e.g., `client/src/ui/deck-editor/`)
Used for new/refactored modules. All components for a feature live in one functional subdirectory:
- **Models (`*Model.ts`)**: Hold and manipulate pure data state. Free of rendering or framework dependencies.
- **Views (`*View.ts` / Overlays)**: Draw visuals (Phaser objects or dynamic HTML/CSS overlays). Subscribe to the event center.
- **Handlers (`*Handler.ts`)**: Process inputs (drag & drop, mouse wheel, scroll) and update models/views.
- **Managers (`*Manager.ts`)**: Coordinate buttons, tabs, and panel views.
- **Event Center (`*EventCenter.ts` / e.g., `EditorEventCenter.ts`)**: Local event bus (`editorEvents`) for decoupled feature communication.
- **IO (`*IO.ts`)**: Manage serialization and imports/exports (e.g. JSON, Lackey CCG deck lists).

## 🛠️ Implementation Checklist
- [ ] Is this function smaller than 20 lines?
- [ ] Does this function do exactly one thing?
- [ ] Are all names searchable and intention-revealing?
- [ ] Have I avoided comments by making the code clearer?
- [ ] Am I passing too many arguments?
- [ ] Is there a failing test for this change?
- [ ] Is the class/file size kept **under 300 to 350 lines of code** (prioritizing logical cohesion)?
- [ ] Are all network/state logics strictly separated from rendering logic?
- [ ] Are all magic numbers and room keys imported from a centralized config?
- [ ] Does the folder structure adhere to the Classic Technical Layout or Functional Feature Layout?

## Limitations
- Use this skill only when the task clearly matches the scope described above.
- Do not treat the output as a substitute for environment-specific validation, testing, or expert review.
- Stop and ask for clarification if required inputs, permissions, safety boundaries, or success criteria are missing.
