// server/tests/chronicleUndo.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { CardAction } = require("../../shared/actionSchema");
const { MoveCardCommand } = require("../src/commands/MoveCardCommand");
const { RespondOptionalAbilityCommand } = require("../src/commands/RespondOptionalAbilityCommand");
const { SelectTargetCommand } = require("../src/commands/SelectTargetCommand");
const { ResolveChronicleCommand } = require("../src/commands/ResolveChronicleCommand");
const { PassInitiativeCommand } = require("../src/commands/PassInitiativeCommand");
const { SubmitDrawSequenceCommand } = require("../src/commands/SubmitDrawSequenceCommand");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { AbilityLookup } = require("../src/ast/AbilityLookup");
const { EffectMutationReverser } = require("../src/ast/EffectMutationReverser");
const { BattleService } = require("../src/services/BattleService");
const { ChronicleHistoryService } = require("../src/services/ChronicleHistoryService");
const { DrawPhaseStepService } = require("../src/services/DrawPhaseStepService");
const { EffectChronicleService } = require("../src/services/EffectChronicleService");
const { ZONES } = require("../../shared/zones");
const { PHASES, DRAW_STEPS } = require("../../shared/phases");
const { ActionType } = require("../../shared/actions");
const { CHRONICLE_STATUS } = require("../../shared/effectChronicleConstants");
const {
  AST_ACTIONS,
  AST_ACTIVATION_MODES,
  AST_MESSAGES,
  AST_SCOPES,
  AST_SELECTION_MODES,
} = require("../../shared/astConstants");

describe("Chronicle Undo & Mutation Rollback Suite", () => {
  let room;
  let state;
  let p1;
  let p2;
  let client1;
  let client2;
  let registeredIds;

  beforeEach(() => {
    registeredIds = [];
    state = new RoomState();
    state.currentPhase = PHASES.BATTLE;
    state.activePlayer = "p1";

    p1 = Object.assign(new PlayerState(), { sessionId: "p1", name: "Player 1" });
    p2 = Object.assign(new PlayerState(), { sessionId: "p2", name: "Player 2" });
    state.players.set("p1", p1);
    state.players.set("p2", p2);

    client1 = { sessionId: "p1", send: jest.fn(), userData: { playerName: "Player 1" } };
    client2 = { sessionId: "p2", send: jest.fn(), userData: { playerName: "Player 2" } };

    room = {
      roomId: "chronicle-undo-room",
      state,
      clients: [client1, client2],
      cardLookup: new Map(),
      broadcastGameLog: jest.fn(),
      broadcast: jest.fn(),
    };
    room.abilityResolver = new AbilityResolver(room);
  });

  afterEach(() => {
    const logicMap = AbilityLookup._loadData();
    for (const id of registeredIds) {
      delete logicMap[id];
    }
  });

  function registerAbility(templateId, abilities) {
    registeredIds.push(templateId);
    AbilityLookup._loadData()[templateId] = {
      card_id: templateId,
      card_name: `Card ${templateId}`,
      sides: { top: { abilities } },
    };
  }

  function createCard(id, templateId, name, zone, ownerId, extra = {}) {
    const card = Object.assign(
      new Card(),
      {
        id,
        templateId,
        Name: name,
        ImageFile: `${templateId}_img`,
        zone,
        ownerId,
        originalOwnerId: ownerId,
        controllerId: ownerId,
        isFaceUp: zone !== ZONES.DECK,
      },
      extra
    );
    room.cardLookup.set(id, card);
    if (zone === ZONES.BATTLEFIELD) {
      state.battlefield.push(card);
    } else {
      const p = state.players.get(ownerId);
      if (p && p[zone]) p[zone].push(card);
    }
    return card;
  }

  describe("1. Auto-executed Battle Entry Effects via MoveCardCommand.undo()", () => {
    test("DrawHandler with Lost Soul diversion restores exact Deck order and removes Lost Soul action", () => {
      registerAbility("t_draw_hero", [
        {
          ability_id: "ab_draw_1",
          activation_mode: AST_ACTIVATION_MODES.IMMEDIATE,
          is_optional: false,
          conditions: [],
          effects: [{ action: AST_ACTIONS.DRAW, target: { count: { fixed_value: 1 } } }],
        },
      ]);

      const ls = createCard("ls_top", "100", "Lost Soul", ZONES.DECK, "p1", { Type: "Lost Soul" });
      const d1 = createCard("d_1", "101", "Deck Card 1", ZONES.DECK, "p1", { Type: "Hero" });
      const d2 = createCard("d_2", "102", "Deck Card 2", ZONES.DECK, "p1", { Type: "Hero" });
      const hero = createCard("h_draw", "t_draw_hero", "Draw Hero", ZONES.TERRITORY, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });

      const moveCmd = new MoveCardCommand(room, client1);
      moveCmd.execute({ from: ZONES.TERRITORY, to: ZONES.BATTLEFIELD, cardId: hero.id });

      expect(p1.land_of_bondage.map((c) => c.id)).toEqual([ls.id]);
      expect(p1.hand.map((c) => c.id)).toEqual([d1.id]);
      expect(p1.deck.map((c) => c.id)).toEqual([d2.id]);
      expect(state.battle.rescueAttemptOccurred).toBe(true);
      expect(state.effectChronicle.history.length).toBe(1);

      moveCmd.undo();

      expect(p1.land_of_bondage.length).toBe(0);
      expect(p1.hand.length).toBe(0);
      expect(p1.deck.map((c) => c.id)).toEqual([ls.id, d1.id, d2.id]);
      expect(room.cardLookup.get(ls.id).availableActions.length).toBe(0);
      expect(room.cardLookup.get(hero.id).zone).toBe(ZONES.TERRITORY);
      expect(state.battle.rescueAttemptOccurred).toBe(false);
      expect(state.effectChronicle.history.length).toBe(0);
      expect(state.effectChronicle.items.length).toBe(0);
    });

    test("DiscardHandler + BattleService.discardOrphanedEnhancements roll back cleanly together", () => {
      registerAbility("t_ec_discard", [
        {
          ability_id: "ab_disc_hero",
          activation_mode: AST_ACTIVATION_MODES.IMMEDIATE,
          is_optional: false,
          conditions: [],
          effects: [
            {
              action: AST_ACTIONS.DISCARD,
              target: {
                selection_mode: AST_SELECTION_MODES.AUTOMATIC_ALL,
                zone_owner: "opponent",
                scope: [AST_SCOPES.BATTLE],
                target_type: "hero",
                brigades: ["Red"],
              },
            },
          ],
        },
      ]);

      const hero = createCard("h_1", "101", "Red Hero", ZONES.BATTLEFIELD, "p1", {
        Type: "Hero",
        Alignment: "Good",
        Brigade: "Red",
        IsCharacter: true,
      });
      const hero2 = createCard("h_keep", "102", "Blue Hero", ZONES.BATTLEFIELD, "p1", {
        Type: "Hero",
        Alignment: "Good",
        Brigade: "Blue",
        IsCharacter: true,
      });
      const enh = createCard("ge_red", "103", "Red Sword", ZONES.BATTLEFIELD, "p1", {
        Type: "GE",
        Alignment: "Good",
        Brigade: "Red",
        IsEnhancement: true,
        attachedTo: hero.id,
      });
      const ec = createCard("ec_disc", "t_ec_discard", "Discarder EC", ZONES.HAND, "p2", {
        Type: "Evil Character",
        Alignment: "Evil",
        Brigade: "Black",
        IsCharacter: true,
      });
      // Keep hero2 in battle so hero is not p1's last hero (no SI triggers on discard)
      expect(hero2.zone).toBe(ZONES.BATTLEFIELD);

      state.battle.rescueAttemptOccurred = true;
      state.lastBattleCardPlayerId = "p1";

      const moveCmd = new MoveCardCommand(room, client2);
      moveCmd.execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: ec.id });

      expect(room.cardLookup.get(hero.id).zone).toBe(ZONES.DISCARD);
      expect(room.cardLookup.get(enh.id).zone).toBe(ZONES.DISCARD);

      moveCmd.undo();

      const restoredHero = room.cardLookup.get(hero.id);
      const restoredEnh = room.cardLookup.get(enh.id);
      expect(restoredHero.zone).toBe(ZONES.BATTLEFIELD);
      expect(restoredEnh.zone).toBe(ZONES.BATTLEFIELD);
      expect(restoredEnh.attachedTo).toBe(hero.id);
      expect(room.cardLookup.get(ec.id).zone).toBe(ZONES.HAND);
      expect(state.battle.blockOccurred).toBe(false);
      expect(state.lastBattleCardPlayerId).toBe("p1");
    });

    test("ModifyNumbersHandler reverts stat counters, zero-toughness discard, and pre-SI partial debuff", () => {
      registerAbility("t_debuff_ec", [
        {
          ability_id: "ab_debuff",
          activation_mode: AST_ACTIVATION_MODES.IMMEDIATE,
          is_optional: false,
          conditions: [],
          effects: [
            {
              action: AST_ACTIONS.DECREASE,
              strength_mod: 2,
              toughness_mod: 2,
              target: {
                selection_mode: AST_SELECTION_MODES.AUTOMATIC_ALL,
                zone_owner: "opponent",
                scope: [AST_SCOPES.BATTLE],
                target_type: "hero",
              },
            },
          ],
        },
      ]);

      // Case A: Non-last character (another hero stays -> immediate zero-toughness discard, no SI)
      const weakHero = createCard("h_weak", "101", "Weak Hero", ZONES.BATTLEFIELD, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
        Strength: "2",
        Toughness: "2",
      });
      const strongHero = createCard("h_strong", "102", "Strong Hero", ZONES.BATTLEFIELD, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
        Strength: "5",
        Toughness: "5",
      });
      const ec = createCard("ec_deb", "t_debuff_ec", "Debuffer", ZONES.TERRITORY, "p2", {
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
      });

      const moveCmdA = new MoveCardCommand(room, client2);
      moveCmdA.execute({ from: ZONES.TERRITORY, to: ZONES.BATTLEFIELD, cardId: ec.id });

      expect(room.cardLookup.get(weakHero.id).zone).toBe(ZONES.DISCARD);
      expect(room.cardLookup.get(strongHero.id).counters.get("strength_mod")).toBe(-2);

      moveCmdA.undo();

      expect(room.cardLookup.get(weakHero.id).zone).toBe(ZONES.BATTLEFIELD);
      expect(room.cardLookup.get(weakHero.id).counters.has("strength_mod")).toBe(false);
      expect(room.cardLookup.get(strongHero.id).counters.has("toughness_mod")).toBe(false);
      expect(room.cardLookup.get(ec.id).zone).toBe(ZONES.TERRITORY);

      // Case B: Only weakHero in battle -> zero-toughness triggers Special Initiative -> undo reverts pre-SI debuff!
      state.battlefield.splice(state.battlefield.indexOf(strongHero), 1);
      const ec2 = createCard("ec_deb2", "t_debuff_ec", "Debuffer 2", ZONES.TERRITORY, "p2", {
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
      });
      const moveCmdB = new MoveCardCommand(room, client2);
      moveCmdB.execute({ from: ZONES.TERRITORY, to: ZONES.BATTLEFIELD, cardId: ec2.id });

      expect(state.battle.specialInitiativePlayerId).toBe("p1");
      expect(room.cardLookup.get(weakHero.id).counters.get("toughness_mod")).toBe(-2);

      moveCmdB.undo();

      expect(state.battle.specialInitiativePlayerId).toBe("");
      expect(room.cardLookup.get(weakHero.id).counters.has("toughness_mod")).toBe(false);
      expect(state.effectChronicle.items.length).toBe(0);
    });

    test("ImmunityHandler reverts card protections and sourceCard._zoneProtection", () => {
      registerAbility("t_protect_hero", [
        {
          ability_id: "ab_prot_deck",
          activation_mode: AST_ACTIVATION_MODES.STATIC,
          is_optional: false,
          conditions: [],
          effects: [
            {
              action: AST_ACTIONS.PROTECT,
              target: {
                selection_mode: AST_SELECTION_MODES.AUTOMATIC_SELF,
                zone_owner: "controller",
                scope: ["deck"],
              },
              protection_filter: { from_harm: true },
            },
          ],
        },
      ]);

      const hero = createCard("h_prot", "t_protect_hero", "Protector", ZONES.HAND, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });

      const moveCmd = new MoveCardCommand(room, client1);
      moveCmd.execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: hero.id });

      const activeHero = room.cardLookup.get(hero.id);
      expect(activeHero.isProtected).toBe(true);
      expect(activeHero._zoneProtection).toBeTruthy();

      moveCmd.undo();

      const revertedHero = room.cardLookup.get(hero.id);
      expect(revertedHero.zone).toBe(ZONES.HAND);
      expect(revertedHero.isProtected).toBe(false);
      expect(revertedHero.isImmune).toBe(false);
      expect(revertedHero._protection).toBeNull();
      expect(revertedHero._zoneProtection).toBeNull();
    });

    test("BandHandler returns allied opponent character to opponent territory and rolls back its auto-trigger", () => {
      registerAbility("t_leader_band", [
        {
          ability_id: "ab_band_hero",
          activation_mode: AST_ACTIVATION_MODES.IMMEDIATE,
          is_optional: false,
          conditions: [],
          effects: [
            {
              action: AST_ACTIONS.BAND,
              target: {
                selection_mode: AST_SELECTION_MODES.AUTOMATIC_ALL,
                zone_owner: "opponent",
                scope: [AST_SCOPES.TERRITORY],
                target_type: "hero",
                count: { fixed_value: 1 },
              },
            },
          ],
        },
      ]);
      registerAbility("t_allied_draw", [
        {
          ability_id: "ab_allied_draw",
          activation_mode: AST_ACTIVATION_MODES.IMMEDIATE,
          is_optional: false,
          conditions: [],
          effects: [{ action: AST_ACTIONS.DRAW, target: { count: { fixed_value: 1 } } }],
        },
      ]);

      const deckCard = createCard("d_p1", "101", "P1 Deck", ZONES.DECK, "p1");
      const ally = createCard("h_ally", "t_allied_draw", "Allied Hero", ZONES.TERRITORY, "p2", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });
      const filler = createCard("f_p2", "102", "P2 Territory Filler", ZONES.TERRITORY, "p2", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });
      // Move ally to index 0, filler at index 1; remove filler from matching by making it Evil
      filler.Type = "Evil Character";
      filler.Alignment = "Evil";

      const leader = createCard("h_leader", "t_leader_band", "Band Leader", ZONES.TERRITORY, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });

      const moveCmd = new MoveCardCommand(room, client1);
      moveCmd.execute({ from: ZONES.TERRITORY, to: ZONES.BATTLEFIELD, cardId: leader.id });

      expect(room.cardLookup.get(ally.id).zone).toBe(ZONES.BATTLEFIELD);
      expect(room.cardLookup.get(ally.id).controllerId).toBe("p1");
      expect(room.cardLookup.get(ally.id).isBanded).toBe(true);
      expect(p1.hand.map((c) => c.id)).toEqual([deckCard.id]);

      moveCmd.undo();

      const revertedAlly = room.cardLookup.get(ally.id);
      expect(revertedAlly.zone).toBe(ZONES.TERRITORY);
      expect(revertedAlly.controllerId).toBe("p2");
      expect(revertedAlly.isBanded).toBe(false);
      expect(revertedAlly.bandedTo).toBe("");
      expect(p2.territory.map((c) => c.id)).toEqual([ally.id, filler.id]);
      expect(p1.hand.length).toBe(0);
      expect(p1.deck.map((c) => c.id)).toEqual([deckCard.id]);
      expect(room.cardLookup.get(leader.id).zone).toBe(ZONES.TERRITORY);
      expect(state.effectChronicle.history.length).toBe(0);
    });

    test("ZoneTransferHandler same-zone DECK -> DECK topdeck/underdeck restores exact deck index", () => {
      registerAbility("t_topdeck_self", [
        {
          ability_id: "ab_topdeck_c",
          activation_mode: AST_ACTIVATION_MODES.IMMEDIATE,
          is_optional: false,
          conditions: [],
          effects: [
            {
              action: AST_ACTIONS.TOPDECK,
              target: {
                selection_mode: AST_SELECTION_MODES.AUTOMATIC_ALL,
                zone_owner: "controller",
                scope: [AST_SCOPES.DECK],
                card_titles: ["Third Card"],
              },
            },
          ],
        },
      ]);

      const cA = createCard("d_a", "101", "First Card", ZONES.DECK, "p1");
      const cB = createCard("d_b", "102", "Second Card", ZONES.DECK, "p1");
      const cC = createCard("d_c", "103", "Third Card", ZONES.DECK, "p1");
      const hero = createCard("h_top", "t_topdeck_self", "Topdecker", ZONES.HAND, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });

      const moveCmd = new MoveCardCommand(room, client1);
      moveCmd.execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: hero.id });

      expect(p1.deck.map((c) => c.id)).toEqual([cC.id, cA.id, cB.id]);

      moveCmd.undo();

      expect(p1.deck.map((c) => c.id)).toEqual([cA.id, cB.id, cC.id]);
    });
  });

  describe("2. Interactive Chronicle Undo, History Cleanup, CANCEL_INTERACTION & Re-Prompt", () => {
    test("RespondOptionalAbilityCommand (accept, decline, choice, transition) undoes and re-prompts cleanly", () => {
      registerAbility("t_opt_draw", [
        {
          ability_id: "ab_opt_draw",
          activation_mode: AST_ACTIVATION_MODES.IMMEDIATE,
          is_optional: true,
          conditions: [],
          effects: [{ action: AST_ACTIONS.DRAW, target: { count: { fixed_value: 1 } } }],
        },
      ]);

      const d1 = createCard("d1", "101", "Deck 1", ZONES.DECK, "p1");
      const hero = createCard("h_opt", "t_opt_draw", "Optional Hero", ZONES.TERRITORY, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });

      const moveCmd = new MoveCardCommand(room, client1);
      moveCmd.execute({ from: ZONES.TERRITORY, to: ZONES.BATTLEFIELD, cardId: hero.id });
      const item = state.effectChronicle.items[0];
      expect(item).toBeDefined();

      // 1. Accept -> undo -> cleans history, returns card, broadcasts CANCEL_INTERACTION, re-prompts
      client1.send.mockClear();
      room.broadcast.mockClear();
      const optAccept = new RespondOptionalAbilityCommand(room, client1);
      optAccept.execute({ itemId: item.id, accepted: true });

      expect(p1.hand.map((c) => c.id)).toEqual([d1.id]);
      expect(state.effectChronicle.history.length).toBe(1);
      expect(optAccept.canUndo).toBe(true);

      optAccept.undo();

      expect(p1.hand.length).toBe(0);
      expect(p1.deck.map((c) => c.id)).toEqual([d1.id]);
      expect(state.effectChronicle.history.length).toBe(0);
      expect(state.effectChronicle.items.length).toBe(1);
      expect(room.broadcast).toHaveBeenCalledWith(AST_MESSAGES.CANCEL_INTERACTION, { reason: "undo" });
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({ itemId: item.id })
      );

      // 2. Decline -> undo -> cleans PASSED history, re-prompts
      client1.send.mockClear();
      const optDecline = new RespondOptionalAbilityCommand(room, client1);
      optDecline.execute({ itemId: item.id, accepted: false });

      expect(state.effectChronicle.items.length).toBe(0);
      expect(state.effectChronicle.history[0].status).toBe(CHRONICLE_STATUS.PASSED);
      expect(optDecline.canUndo).toBe(true);

      optDecline.undo();

      expect(state.effectChronicle.history.length).toBe(0);
      expect(state.effectChronicle.items.length).toBe(1);
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({ itemId: item.id })
      );

      // 3. Undoing MoveCardCommand while optional prompt is still open clears item & cancels client dialog
      room.broadcast.mockClear();
      moveCmd.undo();

      expect(room.broadcast).toHaveBeenCalledWith(AST_MESSAGES.CANCEL_INTERACTION, { reason: "undo" });
      expect(state.effectChronicle.items.length).toBe(0);
      expect(room.cardLookup.get(hero.id).zone).toBe(ZONES.TERRITORY);
    });

    test("SelectTargetCommand (confirm & cancel) undoes cleanly and re-opens REQUEST_TARGET_SELECTION", () => {
      registerAbility("t_target_disc", [
        {
          ability_id: "ab_target_disc",
          activation_mode: AST_ACTIVATION_MODES.IMMEDIATE,
          is_optional: true,
          conditions: [],
          effects: [
            {
              action: AST_ACTIONS.DISCARD,
              target: {
                selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
                zone_owner: "opponent",
                scope: [AST_SCOPES.TERRITORY],
                target_type: "evil_character",
                count: { fixed_value: 1 },
              },
            },
          ],
        },
      ]);

      const ec1 = createCard("ec1", "201", "Evil 1", ZONES.TERRITORY, "p2", {
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
      });
      createCard("ec2", "202", "Evil 2", ZONES.TERRITORY, "p2", {
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
      });
      const hero = createCard("h_tgt", "t_target_disc", "Targeting Hero", ZONES.BATTLEFIELD, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });

      EffectChronicleService.enqueueCards(room, [{ card: hero, abilityId: "ab_target_disc", isOptional: true }], "p1", ActionType.RESCUE_ATTEMPT, {
        autoExecute: true,
        autoExecuteSupported: true,
      });
      const item = state.effectChronicle.items[0];

      // Accept optional -> transitions to target selection
      const optCmd = new RespondOptionalAbilityCommand(room, client1);
      optCmd.execute({ itemId: item.id, accepted: true });
      expect(optCmd.canUndo).toBe(true);

      // Select target -> undo re-opens REQUEST_TARGET_SELECTION directly (not optional dialog!)
      client1.send.mockClear();
      const selCmd = new SelectTargetCommand(room, client1);
      selCmd.execute({ itemId: item.id, abilityId: "ab_target_disc", selectedCardIds: [ec1.id] });
      expect(room.cardLookup.get(ec1.id).zone).toBe(ZONES.DISCARD);

      selCmd.undo();

      expect(room.cardLookup.get(ec1.id).zone).toBe(ZONES.TERRITORY);
      expect(state.effectChronicle.history.length).toBe(0);
      expect(state.effectChronicle.items.length).toBe(1);
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({ itemId: item.id })
      );

      // Cancel target selection -> undo re-opens REQUEST_TARGET_SELECTION
      client1.send.mockClear();
      const cancelCmd = new SelectTargetCommand(room, client1);
      cancelCmd.execute({ itemId: item.id, cancelled: true });
      expect(cancelCmd.canUndo).toBe(true);
      expect(state.effectChronicle.items.length).toBe(0);
      expect(state.effectChronicle.history[0].status).toBe(CHRONICLE_STATUS.PASSED);

      cancelCmd.undo();
      expect(state.effectChronicle.history.length).toBe(0);
      expect(state.effectChronicle.items.length).toBe(1);
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({ itemId: item.id })
      );

      // Undo the RespondOptionalAbilityCommand transition -> re-opens REQUEST_OPTIONAL_ABILITY
      client1.send.mockClear();
      optCmd.undo();
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({ itemId: item.id })
      );
    });
  });

  describe("3. Special Initiative & Initiative Passing Undo", () => {
    test("PassInitiativeCommand (SI pass & normal pass) and MoveCardCommand during SI undo cleanly", () => {
      registerAbility("t_si_discard", [
        {
          ability_id: "ab_si_disc",
          activation_mode: AST_ACTIVATION_MODES.IMMEDIATE,
          is_optional: false,
          conditions: [],
          effects: [
            {
              action: AST_ACTIONS.DISCARD,
              target: {
                selection_mode: AST_SELECTION_MODES.AUTOMATIC_ALL,
                zone_owner: "opponent",
                scope: [AST_SCOPES.BATTLE],
                target_type: "evil_character",
              },
            },
          ],
        },
      ]);

      const blocker = createCard("ec_only", "201", "Only Blocker", ZONES.BATTLEFIELD, "p2", {
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
        Brigade: "Black",
      });
      const hero = createCard("h_si", "t_si_discard", "Hero SI", ZONES.TERRITORY, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });

      const moveHero = new MoveCardCommand(room, client1);
      moveHero.execute({ from: ZONES.TERRITORY, to: ZONES.BATTLEFIELD, cardId: hero.id });
      expect(state.battle.specialInitiativePlayerId).toBe("p2");

      // Path A: P2 passes Special Initiative -> blocker discarded -> undo restores blocker & SI!
      const passSiCmd = new PassInitiativeCommand(room, client2);
      passSiCmd.execute();
      expect(room.cardLookup.get(blocker.id).zone).toBe(ZONES.DISCARD);
      expect(state.battle.specialInitiativePlayerId).toBe("");
      expect(passSiCmd.canUndo).toBe(true);

      passSiCmd.undo();

      expect(room.cardLookup.get(blocker.id).zone).toBe(ZONES.BATTLEFIELD);
      expect(state.battle.specialInitiativePlayerId).toBe("p2");
      expect(state.effectChronicle.items.length).toBe(1);
      expect(state.effectChronicle.history.length).toBe(0);

      // Path B: P2 plays Evil Enhancement in SI -> consumes SI -> undo restores SI item & specialInitiativePlayerId
      const ee = createCard("ee_si", "202", "Evil Enh", ZONES.HAND, "p2", {
        Type: "EE",
        Alignment: "Evil",
        IsEnhancement: true,
        Brigade: "Black",
      });
      const playEnhCmd = new MoveCardCommand(room, client2);
      playEnhCmd.execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: ee.id });
      expect(state.battle.specialInitiativePlayerId).toBe("");
      expect(state.effectChronicle.items.length).toBe(0);

      playEnhCmd.undo();

      expect(room.cardLookup.get(ee.id).zone).toBe(ZONES.HAND);
      expect(state.battle.specialInitiativePlayerId).toBe("p2");
      expect(state.effectChronicle.items.length).toBe(1);

      // Resolve SI cleanly then test normal initiative pass undo with an active blocker in battle
      const passSiCmd2 = new PassInitiativeCommand(room, client2);
      passSiCmd2.execute();
      expect(state.effectChronicle.items.length).toBe(0);

      createCard("ec_normal", "203", "Normal Blocker", ZONES.BATTLEFIELD, "p2", {
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
        Strength: "5",
        Toughness: "5",
      });
      state.battle.blockOccurred = true;
      BattleService.recalculate(room);
      expect(state.battle.initiativePlayerId).toBe("p1");

      const normalPassCmd = new PassInitiativeCommand(room, client1);
      normalPassCmd.execute();
      expect(state.battle.initiativeOverridePlayerId).toBe("p2");
      expect(normalPassCmd.canUndo).toBe(true);

      normalPassCmd.undo();
      expect(state.battle.initiativeOverridePlayerId).toBe("");
      expect(state.battle.initiativePlayerId).toBe("p1");
    });
  });

  describe("4. Draw Phase Sequence Undo (SubmitDrawSequenceCommand)", () => {
    test("undoes Star AST draw execution, star reveal, cleared actions, and drawStep advancement", () => {
      registerAbility("t_star_draw", [
        {
          ability_id: "ab_star_draw",
          is_star: true,
          activation_mode: AST_ACTIVATION_MODES.IMMEDIATE,
          is_optional: false,
          conditions: [],
          effects: [{ action: AST_ACTIONS.DRAW, target: { count: { fixed_value: 1 } } }],
        },
      ]);

      state.currentPhase = PHASES.DRAW;
      const d1 = createCard("d_star", "101", "Drawn Card", ZONES.DECK, "p1");
      const star = createCard("s_1", "t_star_draw", "Star Hero", ZONES.HAND, "p1", {
        IsStarCard: true,
        Class: "Star",
        isFaceUp: false,
        isFaceDown: true,
      });
      const act = new CardAction();
      act.id = "act_star";
      act.type = ActionType.ACTIVATE_STAR_ABILITY;
      act.description = "Activate Star Ability";
      star.availableActions.push(act);

      DrawPhaseStepService.startTurnDrawSequence(room);
      expect(state.drawStep).toBe(DRAW_STEPS.ACTIVE_STARS);

      const submitCmd = new SubmitDrawSequenceCommand(room, client1);
      submitCmd.execute({ step: DRAW_STEPS.ACTIVE_STARS, orderedCardIds: [star.id] });

      expect(submitCmd.canUndo).toBe(true);
      expect(p1.hand.map((c) => c.id)).toContain(d1.id);
      expect(star.isFaceUp).toBe(true);
      expect(star.availableActions.length).toBe(0);
      expect(state.drawStep).toBe(DRAW_STEPS.NONE);

      submitCmd.undo();

      expect(p1.hand.map((c) => c.id)).toEqual([star.id]);
      expect(p1.deck.map((c) => c.id)).toEqual([d1.id]);
      expect(star.isFaceUp).toBe(false);
      expect(star.isFaceDown).toBe(true);
      expect(star.availableActions.length).toBe(1);
      expect(state.drawStep).toBe(DRAW_STEPS.ACTIVE_STARS);
      expect(state.priorityPlayerId).toBe("p1");
      expect(state.effectChronicle.history.length).toBe(0);
    });
  });

  describe("5. REG Negate/Interrupt Preparation (EffectMutationReverser & Phase Registry)", () => {
    test("requireCurrentZoneMatch and skipDivertedLostSouls obey REG reversal flags", () => {
      const ls = createCard("ls_reg", "100", "Lost Soul", ZONES.LAND_OF_BONDAGE, "p1", { Type: "Lost Soul" });
      const movedAway = createCard("h_moved", "101", "Moved Hero", ZONES.TERRITORY, "p1");
      const stillInHand = createCard("h_hand", "102", "In Hand", ZONES.HAND, "p1");

      const snapshot = {
        action: AST_ACTIONS.DRAW,
        playerId: "p1",
        movedCards: [
          { cardId: ls.id, fromZone: ZONES.DECK, toZone: ZONES.LAND_OF_BONDAGE, ownerId: "p1", wasLostSoulDiversion: true },
          { cardId: movedAway.id, fromZone: ZONES.DECK, toZone: ZONES.HAND, ownerId: "p1", wasLostSoulDiversion: false },
          { cardId: stillInHand.id, fromZone: ZONES.DECK, toZone: ZONES.HAND, ownerId: "p1", wasLostSoulDiversion: false },
        ],
      };

      EffectMutationReverser.revertSnapshot(room, snapshot, p1, {
        requireCurrentZoneMatch: true,
        skipDivertedLostSouls: true,
        isUndo: false,
      });

      expect(room.cardLookup.get(ls.id).zone).toBe(ZONES.LAND_OF_BONDAGE);
      expect(room.cardLookup.get(movedAway.id).zone).toBe(ZONES.TERRITORY);
      expect(room.cardLookup.get(stillInHand.id).zone).toBe(ZONES.DECK);
    });

    test("room._phaseResolvedEffects tracks resolved effects and purges on phase change", () => {
      const hero = createCard("h_reg", "101", "Reg Hero", ZONES.TERRITORY, "p1");
      const deckCard = createCard("d_reg", "102", "Reg Deck", ZONES.DECK, "p1");
      registerAbility("t_reg_draw", [
        {
          ability_id: "ab_reg_draw",
          activation_mode: AST_ACTIVATION_MODES.IMMEDIATE,
          is_optional: false,
          conditions: [],
          effects: [{ action: AST_ACTIONS.DRAW, target: { count: { fixed_value: 1 } } }],
        },
      ]);
      hero.templateId = "t_reg_draw";

      EffectChronicleService.enqueueCards(
        room,
        [{ card: hero, abilityId: "ab_reg_draw", effectStepIndex: 0, effectLabel: "Draw 1 card(s)" }],
        "p1",
        ActionType.ACTIVATE_ABILITY,
        { autoExecute: true }
      );

      expect(room._phaseResolvedEffects instanceof Map).toBe(true);
      expect(room._phaseResolvedEffects.size).toBe(1);
      const entry = Array.from(room._phaseResolvedEffects.values())[0];
      expect(entry.targetCardIds).toEqual([deckCard.id]);

      ChronicleHistoryService.purgeHistory(room);
      expect(room._phaseResolvedEffects.size).toBe(0);
    });
  });
});
