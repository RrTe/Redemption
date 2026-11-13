// server/tests/choiceGroupAndPileTargeting.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { AbilityLookup } = require("../src/ast/AbilityLookup");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { TargetSelectionService } = require("../src/ast/TargetSelectionService");
const { BattleTriggerService } = require("../src/services/BattleTriggerService");
const { EffectChronicleService } = require("../src/services/EffectChronicleService");
const { AST_ACTIONS, AST_MESSAGES, AST_SELECTION_MODES, AST_SCOPES } = require("../../shared/astConstants");
const { ActionType } = require("../../shared/actions");
const { PHASES } = require("../../shared/phases");
const { ZONES } = require("../../shared/zones");

describe("Choice Group & Universal Pile Targeting (Transitional Solution)", () => {
  let room;
  let state;
  let p1;
  let p2;
  let resolver;

  const createCard = (props) => {
    const card = new Card();
    Object.assign(card, props);
    return card;
  };

  beforeEach(() => {
    state = new RoomState();
    p1 = Object.assign(new PlayerState(), { sessionId: "p1", name: "Player 1" });
    p2 = Object.assign(new PlayerState(), { sessionId: "p2", name: "Player 2" });
    state.players.set("p1", p1);
    state.players.set("p2", p2);
    state.activePlayer = "p1";
    state.currentPhase = PHASES.BATTLE;

    const lookupMap = new Map();
    room = {
      state,
      clients: [
        { sessionId: "p1", send: jest.fn() },
        { sessionId: "p2", send: jest.fn() },
      ],
      cardLookup: lookupMap,
      broadcast: jest.fn(),
      broadcastGameLog: jest.fn(),
      chatHistory: [],
    };
    resolver = new AbilityResolver(room);
    room.abilityResolver = resolver;
  });

  describe("1. Choice Group Resolution ('Make Bricks!' pattern)", () => {
    beforeEach(() => {
      // Mock Make Bricks card in AbilityLookup._cardsLogic
      AbilityLookup._loadData();
      AbilityLookup._cardsLogic["make_bricks_test"] = {
        card_id: "make_bricks_test",
        card_name: "Make Bricks! [K]",
        sides: {
          top: {
            abilities: [
              {
                ability_id: "topdeck_evil_card_from_reserve",
                activation_mode: "immediate",
                is_optional: true,
                choice_group: "choice_1",
                effects: [
                  {
                    step: 1,
                    action: AST_ACTIONS.TOPDECK,
                    target: {
                      selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
                      zone_owner: "controller",
                      scope: ["reserve_pile"],
                      target_type: "card",
                      alignment: "evil",
                      count: { fixed_value: 1 },
                    },
                    destination: "deck",
                    destination_position: "top",
                  },
                ],
              },
              {
                ability_id: "underdeck_hero",
                activation_mode: "immediate",
                is_optional: true,
                choice_group: "choice_1",
                effects: [
                  {
                    step: 1,
                    action: AST_ACTIONS.UNDERDECK,
                    target: {
                      selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
                      zone_owner: "either",
                      scope: [AST_SCOPES.IN_PLAY],
                      target_type: "hero",
                      count: { fixed_value: 1 },
                    },
                    destination: "deck",
                    destination_position: "bottom",
                  },
                ],
              },
            ],
          },
        },
      };
    });

    test("Prompts player with choices when entering battle with choice_group", () => {
      const card = createCard({
        id: "mb_card_1",
        templateId: "make_bricks_test",
        Name: "Make Bricks! [K]",
        Type: "Evil Enhancement",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(card.id, card);

      const hero = createCard({
        id: "hero_opp_1",
        Name: "Faithful Defender",
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(hero.id, hero);
      state.battlefield.push(hero);

      // Battle entrance enqueues card without locking abilityId
      const triggerRes = BattleTriggerService.handleCardBattleEntry(room, p1, card, {
        from: ZONES.HAND,
        to: ZONES.BATTLEFIELD,
      });
      expect(triggerRes.triggered).toBe(true);

      const chronicle = state.effectChronicle;
      expect(chronicle.items.length).toBe(1);
      const item = chronicle.items[0];
      expect(item.abilityId).toBe(""); // Not locked yet!

      const clientP1 = room.clients.find((c) => c.sessionId === "p1");
      const resolveRes = resolver.resolve(item);

      expect(resolveRes.handled).toBe(true);
      expect(resolveRes.awaitingConfirmation).toBe(true);

      expect(clientP1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({
          action: "choose",
          choices: expect.arrayContaining([
            expect.objectContaining({ abilityId: "topdeck_evil_card_from_reserve" }),
            expect.objectContaining({ abilityId: "underdeck_hero" }),
          ]),
        })
      );
    });

    test("Executes only the chosen ability when player selects Option 2 (underdeck_hero)", () => {
      const card = createCard({
        id: "mb_card_2",
        templateId: "make_bricks_test",
        Name: "Make Bricks! [K]",
        Type: "Evil Enhancement",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(card.id, card);

      const hero = createCard({
        id: "hero_opp",
        Name: "Faithful Defender",
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(hero.id, hero);
      state.battlefield.push(hero);

      const item = {
        id: "item_mb_2",
        cardId: card.id,
        controllerId: "p1",
        title: card.Name,
        actionType: ActionType.PLAY_EVIL_ENHANCEMENT,
        abilityId: "",
      };

      // Player selects option 'underdeck_hero'
      const resolveRes = resolver.resolve(item, {
        accepted: true,
        chosenAbilityId: "underdeck_hero",
      });

      expect(resolveRes.handled).toBe(true);
      expect(item.abilityId).toBe("underdeck_hero");

      // Now target selection requests targeting the hero
      const clientP1 = room.clients.find((c) => c.sessionId === "p1");
      expect(clientP1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({
          abilityId: "underdeck_hero",
          eligibleCardIds: expect.arrayContaining(["hero_opp"]),
        })
      );
    });
  });

  describe("2. Universal Pile Targeting (SelectionDialogScene routing)", () => {
    test("Identifies pile target and tags targetZone for reserve_pile", () => {
      const evilReserveCard = createCard({
        id: "ec_res",
        Name: "Egyptian Magician",
        Alignment: "Evil",
        zone: ZONES.RESERVE,
      });
      p1.reserve.push(evilReserveCard);
      room.cardLookup.set(evilReserveCard.id, evilReserveCard);

      const targetDef = {
        selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
        zone_owner: "controller",
        scope: ["reserve_pile"],
        target_type: "card",
        count: { fixed_value: 1 },
      };

      const result = TargetSelectionService.resolveEligibleTargets(room, p1, targetDef, {
        isOptional: true,
      });

      expect(result.targetType).toBe("card");
      expect(result.isPileTarget).toBe(true);
      expect(result.targetZone).toBe(ZONES.RESERVE);
      expect(result.canCancel).toBe(true);
      expect(result.eligibleCardIds).toContain("ec_res");
    });

    test("Identifies pile target and tags targetZone for discard_pile and banish_pile", () => {
      const discardCard = createCard({ id: "card_disc", Name: "Lost Card", zone: ZONES.DISCARD });
      p1.discard.push(discardCard);
      room.cardLookup.set(discardCard.id, discardCard);

      const targetDefDiscard = {
        selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
        zone_owner: "controller",
        scope: ["discard_pile"],
        target_type: "card",
        count: { fixed_value: 1 },
      };

      const resultDiscard = TargetSelectionService.resolveEligibleTargets(room, p1, targetDefDiscard);
      expect(resultDiscard.isPileTarget).toBe(true);
      expect(resultDiscard.targetZone).toBe(ZONES.DISCARD);

      const banishCard = createCard({ id: "card_ban", Name: "Banished Soul", zone: ZONES.BANISH });
      p2.banish.push(banishCard);
      room.cardLookup.set(banishCard.id, banishCard);

      const targetDefBanish = {
        selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
        zone_owner: "opponent",
        scope: ["banish_pile"],
        target_type: "card",
        count: { fixed_value: 1 },
      };

      const resultBanish = TargetSelectionService.resolveEligibleTargets(room, p1, targetDefBanish);
      expect(resultBanish.isPileTarget).toBe(true);
      expect(resultBanish.targetZone).toBe(ZONES.BANISH);
    });
  });

  describe("3. Cancellation & Anti-Softlock Guarantee", () => {
    test("Optional targeting provides canCancel: true to prevent game lock", () => {
      const targetDef = {
        selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
        zone_owner: "controller",
        scope: ["reserve_pile"],
        target_type: "card",
        count: { fixed_value: 1 },
      };

      const result = TargetSelectionService.resolveEligibleTargets(room, p1, targetDef, {
        isOptional: true,
      });

      expect(result.canCancel).toBe(true);
    });
  });
});
