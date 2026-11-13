// server/tests/interactionPkg2.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { ChronicleItem } = require("../src/state/EffectChronicleState");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { SelectTargetCommand } = require("../src/commands/SelectTargetCommand");
const { AST_MESSAGES, AST_ACTIONS, AST_SELECTION_MODES } = require("../../shared/astConstants");
const { ActionType } = require("../../shared/actions");
const { PHASES } = require("../../shared/phases");
const { ZONES } = require("../../shared/zones");
const { AbilityLookup } = require("../src/ast/AbilityLookup");

describe("Paket 2: Pre-Validation, No Valid Targets Toast, Full Pile Display & Opponent Selection", () => {
  let room;
  let state;
  let p1;
  let p2;
  let clientP1;
  let clientP2;
  let resolver;

  const createCard = (props) => {
    const card = new Card();
    Object.assign(card, props);
    return card;
  };

  beforeEach(() => {
    state = new RoomState();
    state.round = 2; // Default to Round 2 unless specifically testing Round 1
    p1 = Object.assign(new PlayerState(), { sessionId: "p1", name: "Player 1" });
    p2 = Object.assign(new PlayerState(), { sessionId: "p2", name: "Player 2" });
    state.players.set("p1", p1);
    state.players.set("p2", p2);
    state.activePlayer = "p1";
    state.currentPhase = PHASES.BATTLE;

    clientP1 = { sessionId: "p1", send: jest.fn() };
    clientP2 = { sessionId: "p2", send: jest.fn() };

    const lookupMap = new Map();
    room = {
      roomId: "test_room_pkg2",
      state,
      clients: [clientP1, clientP2],
      cardLookup: lookupMap,
      broadcast: jest.fn(),
      broadcastGameLog: jest.fn(),
      chatHistory: [],
    };
    resolver = new AbilityResolver(room);
    room.abilityResolver = resolver;
  });

  describe("1. Pre-Validation & Round 1 Reserve Rule in Choice Groups", () => {
    test("Ordained Priests (-1216565237) in Round 1 disables 'Take from Reserve' with (Round 1) suffix while keeping 'Band' enabled", () => {
      state.round = 1;

      const ordained = createCard({
        id: "ordained_1",
        templateId: "-1216565237",
        Name: "Ordained Priests [L]",
        Type: "Hero",
        Alignment: "Good",
        Brigade: "White",
        Identifier: "Generic, Tabernacle Priest, Wilderness",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(ordained.id, ordained);
      state.battlefield.push(ordained);

      // Eligible card in p1's Reserve (would be valid in Round 2+, locked in Round 1)
      const reserveEnh = createCard({
        id: "res_enh_1",
        Name: "Atonement",
        Type: "GE",
        Alignment: "Good",
        Reference: "Leviticus 16:30",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.RESERVE,
      });
      room.cardLookup.set(reserveEnh.id, reserveEnh);
      p1.reserve.push(reserveEnh);

      // Eligible O.T. Priest in p1's Territory for Choice 2 (Band)
      const aaron = createCard({
        id: "aaron_terr",
        Name: "Aaron",
        Type: "Hero",
        Alignment: "Good",
        Testament: "OT",
        Identifier: "Male, Tabernacle Priest",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.TERRITORY,
      });
      room.cardLookup.set(aaron.id, aaron);
      p1.territory.push(aaron);

      const item = {
        id: "item_ordained_r1",
        cardId: ordained.id,
        controllerId: "p1",
        title: ordained.Name,
        actionType: ActionType.ENTER_BATTLE,
        abilityId: "",
      };

      const res = resolver.resolve(item);
      expect(res.handled).toBe(true);
      expect(res.awaitingConfirmation).toBe(true);

      expect(clientP1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({
          action: "choose",
          choices: [
            expect.objectContaining({
              abilityId: "take_good_ot_card_from_reserve",
              disabled: true,
              label: expect.stringContaining("(Round 1)"),
            }),
            expect.objectContaining({
              abilityId: "draw_one_card",
              disabled: false,
            }),
          ],
        })
      );
    });

    test("Round 1 Opponent Reserve Read-Only Inspection opens SelectionDialogScene in read-only mode (minTargets: 0, maxTargets: 0)", () => {
      state.round = 1;

      AbilityLookup._loadData();
      AbilityLookup._cardsLogic["either_reserve_test"] = {
        card_id: "either_reserve_test",
        card_name: "Reserve Inspector",
        sides: {
          top: {
            abilities: [
              {
                ability_id: "take_from_any_reserve",
                activation_mode: "immediate",
                is_optional: true,
                effects: [
                  {
                    step: 1,
                    action: AST_ACTIONS.TAKE,
                    target: {
                      selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
                      zone_owner: "either",
                      scope: ["reserve_pile"],
                      target_type: "card",
                      count: { fixed_value: 1 },
                    },
                    destination: "hand",
                  },
                ],
              },
            ],
          },
        },
      };

      const sourceCard = createCard({
        id: "insp_1",
        templateId: "either_reserve_test",
        Name: "Reserve Inspector",
        Type: "Hero",
        Alignment: "Good",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(sourceCard.id, sourceCard);

      const oppReserveCard = createCard({
        id: "opp_res_card",
        Name: "Opponent Secret Card",
        Type: "Evil Enhancement",
        Alignment: "Evil",
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.RESERVE,
      });
      room.cardLookup.set(oppReserveCard.id, oppReserveCard);
      p2.reserve.push(oppReserveCard);

      const item = {
        id: "item_insp_r1",
        cardId: sourceCard.id,
        controllerId: "p1",
        title: sourceCard.Name,
        actionType: ActionType.ENTER_BATTLE,
        abilityId: "take_from_any_reserve",
        isConfirmed: true,
      };

      const res = resolver.resolve(item, { accepted: true });
      expect(res.handled).toBe(true);
      expect(res.awaitingTargetSelection).toBe(true);

      expect(clientP1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({
          eligibleCardIds: [],
          searchedPiles: ["p2:reserve"],
          minTargets: 0,
          maxTargets: 0,
          canCancel: true,
          promptText: "Reserve Inspector: View Opponent's Reserve (Round 1 - Read Only)",
        })
      );
    });
  });

  describe("2. 'No valid targets.' Toast Notification & ChatLog", () => {
    test("Given to Israel (-816099963) with no valid targets emits gameToast and ChatLog without opening a dialog", () => {
      const givenCard = createCard({
        id: "given_1",
        templateId: "-816099963",
        Name: "Given to Israel [K]",
        Type: "GE",
        Alignment: "Good",
        Brigade: "Yellow",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(givenCard.id, givenCard);
      state.battlefield.push(givenCard);

      const item = {
        id: "item_given_1",
        cardId: givenCard.id,
        controllerId: "p1",
        title: givenCard.Name,
        actionType: ActionType.PLAY_GOOD_ENHANCEMENT,
        abilityId: "",
      };

      const res = resolver.resolve(item);
      expect(res.handled).toBe(true);
      expect(res.awaitingConfirmation).toBeUndefined();
      expect(res.awaitingTargetSelection).toBeUndefined();
      expect(res.logEntries).toContain("Player 1's Given to Israel [K] has no valid targets.");

      expect(clientP1.send).toHaveBeenCalledWith("gameToast", {
        message: "Given to Israel [K]: No valid targets.",
        type: "warning",
      });
      expect(clientP1.send).not.toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.anything()
      );
    });

    test("Choice group where ALL options have 0 valid targets emits gameToast and ChatLog", () => {
      const charioteers = createCard({
        id: "char_1",
        templateId: "1381592137",
        Name: "Philistine Charioteers [L]",
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(charioteers.id, charioteers);
      state.battlefield.push(charioteers);

      // Both p1.discard and p1.reserve are empty -> 0 valid targets for both options
      const item = {
        id: "item_char_empty",
        cardId: charioteers.id,
        controllerId: "p1",
        title: charioteers.Name,
        actionType: ActionType.ENTER_BATTLE,
        abilityId: "",
      };

      const res = resolver.resolve(item);
      expect(res.handled).toBe(true);
      expect(res.awaitingConfirmation).toBeUndefined();
      expect(res.logEntries).toContain("Player 1's Philistine Charioteers [L] has no valid targets.");
      expect(clientP1.send).toHaveBeenCalledWith("gameToast", {
        message: "Philistine Charioteers [L]: No valid targets.",
        type: "warning",
      });
    });
  });

  describe("3. Full Pile Display (searchedPiles alongside eligibleCardIds)", () => {
    test("Make Bricks! (27009089) Option 1 provides searchedPiles for controller's Reserve alongside filtered eligibleCardIds", () => {
      state.round = 2;

      const makeBricks = createCard({
        id: "mb_real_1",
        templateId: "27009089",
        Name: "Make Bricks! [K]",
        Type: "EE",
        Alignment: "Evil",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(makeBricks.id, makeBricks);

      const evilRes = createCard({
        id: "evil_res_1",
        Name: "Taskmaster",
        Type: "Evil Character",
        Alignment: "Evil",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.RESERVE,
      });
      const goodRes = createCard({
        id: "good_res_1",
        Name: "Moses",
        Type: "Hero",
        Alignment: "Good",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.RESERVE,
      });
      room.cardLookup.set(evilRes.id, evilRes);
      room.cardLookup.set(goodRes.id, goodRes);
      p1.reserve.push(evilRes, goodRes);

      const item = {
        id: "item_mb_pile",
        cardId: makeBricks.id,
        controllerId: "p1",
        title: makeBricks.Name,
        actionType: ActionType.PLAY_EVIL_ENHANCEMENT,
        abilityId: "topdeck_evil_card_from_reserve",
        isConfirmed: true,
      };

      const res = resolver.resolve(item, {
        accepted: true,
        chosenAbilityId: "topdeck_evil_card_from_reserve",
      });

      expect(res.handled).toBe(true);
      expect(res.awaitingTargetSelection).toBe(true);
      expect(clientP1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({
          eligibleCardIds: ["evil_res_1"],
          searchedPiles: ["p1:reserve"],
          isPileTarget: true,
          targetZone: ZONES.RESERVE,
        })
      );
    });
  });

  describe("4. Interactive Opponent Selection (manual_opponent) & Multi-Step Execution", () => {
    test("Counsel for the King (-265232813) routes Step 1 (underdeck Evil card from hand) to Opponent then Step 2 (bounce Evil Character) to Controller", () => {
      const counsel = createCard({
        id: "counsel_1",
        templateId: "-265232813",
        Name: "Counsel for the King [K]",
        Type: "GE",
        Alignment: "Good",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(counsel.id, counsel);
      state.battlefield.push(counsel);

      // Put 2 Evil Characters controlled by p2 in battle so Step 2 (bounce) has 2 targets and does not trigger Special Initiative
      const oppEc1 = createCard({
        id: "opp_ec_1",
        Name: "King Saul",
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.BATTLEFIELD,
      });
      const oppEc2 = createCard({
        id: "opp_ec_2",
        Name: "Doeg",
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(oppEc1.id, oppEc1);
      room.cardLookup.set(oppEc2.id, oppEc2);
      state.battlefield.push(oppEc1, oppEc2);

      // Put 2 Evil cards in p2's hand so Step 1 requires manual_opponent selection
      const oppEvilHand1 = createCard({
        id: "opp_evil_h1",
        Name: "Pharaoh",
        Type: "Evil Character",
        Alignment: "Evil",
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.HAND,
      });
      const oppEvilHand2 = createCard({
        id: "opp_evil_h2",
        Name: "Pride",
        Type: "EE",
        Alignment: "Evil",
        controllerId: "p2",
        originalOwnerId: "p2",
        zone: ZONES.HAND,
      });
      room.cardLookup.set(oppEvilHand1.id, oppEvilHand1);
      room.cardLookup.set(oppEvilHand2.id, oppEvilHand2);
      p2.hand.push(oppEvilHand1, oppEvilHand2);

      const item = new ChronicleItem({
        id: "item_counsel_1",
        cardId: counsel.id,
        controllerId: "p1",
        title: counsel.Name,
        actionType: ActionType.PLAY_GOOD_ENHANCEMENT,
        abilityId: "counsel_for_the_king_ability",
      });
      item.isConfirmed = true;
      state.effectChronicle.items.push(item);
      state.effectChronicle.priorityPlayerId = "p1";
      state.effectChronicle.isResolving = true;

      // 1. Resolve starts at Step 1 (manual_opponent) -> prompts p2 (Opponent) to select an evil card from hand
      const step1Prompt = resolver.resolve(item, { accepted: true });
      expect(step1Prompt.awaitingTargetSelection).toBe(true);
      expect(state.effectChronicle.priorityPlayerId).toBe("p2");
      expect(clientP2.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({
          eligibleCardIds: expect.arrayContaining(["opp_evil_h1", "opp_evil_h2"]),
          targetZone: ZONES.HAND,
        })
      );
      expect(clientP1.send).toHaveBeenCalledWith("gameToast", {
        message: "Waiting for Player 2 to select a card...",
        type: "info",
      });

      clientP1.send.mockClear();
      clientP2.send.mockClear();

      // 2. Player 2 (Opponent) selects opp_evil_h2 via SelectTargetCommand
      const cmdStep1 = new SelectTargetCommand(room, clientP2);
      cmdStep1.execute({
        itemId: item.id,
        abilityId: item.abilityId,
        selectedCardIds: ["opp_evil_h2"],
      });

      // Step 1 executed: opp_evil_h2 is now underdecked into p2's deck!
      expect(oppEvilHand2.zone).toBe(ZONES.DECK);
      expect(p2.deck[p2.deck.length - 1].id).toBe("opp_evil_h2");

      // Step 2 (manual_controller) now prompts Player 1 to select an Evil Character in play to bounce!
      expect(state.effectChronicle.priorityPlayerId).toBe("p1");
      expect(clientP1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({
          eligibleCardIds: expect.arrayContaining(["opp_ec_1", "opp_ec_2"]),
        })
      );

      // 3. Player 1 (Controller) selects opp_ec_1 via SelectTargetCommand
      const cmdStep2 = new SelectTargetCommand(room, clientP1);
      cmdStep2.execute({
        itemId: item.id,
        abilityId: item.abilityId,
        selectedCardIds: ["opp_ec_1"],
      });

      // Step 2 executed: opp_ec_1 is now bounced to p2's hand!
      expect(oppEc1.zone).toBe(ZONES.HAND);
      // Both Step 1 and Step 2 logs were broadcast!
      expect(room.broadcastGameLog).toHaveBeenCalledTimes(2);
    });
  });

  describe("5. Specific Choice & Prompt Formatting (Brigades, References, Multi-Pile Scope)", () => {
    test("The Tribal Elders (-696815277) generates specific choice label 'Band to a White Exodus hero'", () => {
      const elders = createCard({
        id: "elders_1",
        templateId: "-696815277",
        Name: "The Tribal Elders [L]",
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(elders.id, elders);
      state.battlefield.push(elders);

      const moses = createCard({
        id: "moses_terr",
        Name: "Moses",
        Type: "Hero",
        Alignment: "Good",
        Brigade: "White",
        Reference: "Exodus 3:1",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.TERRITORY,
      });
      room.cardLookup.set(moses.id, moses);
      p1.territory.push(moses);

      const item = {
        id: "item_elders_1",
        cardId: elders.id,
        controllerId: "p1",
        title: elders.Name,
        actionType: ActionType.ENTER_BATTLE,
        abilityId: "",
      };

      const res = resolver.resolve(item);
      expect(res.handled).toBe(true);
      expect(res.awaitingConfirmation).toBe(true);
      expect(clientP1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({
          choices: expect.arrayContaining([
            expect.objectContaining({
              abilityId: "tribal_elders_band_loc",
              label: "Band to a White Exodus hero",
              disabled: false,
            }),
            expect.objectContaining({
              abilityId: "tribal_elders_draw_loc",
              label: "Draw 2 card(s)",
              disabled: false,
            }),
          ]),
        })
      );
    });

    test("Samuel, the Anointer (-1708238440) expands multi-pile scope into per-pile choice buttons with disabled state for empty pile", () => {
      const samuel = createCard({
        id: "sam_1",
        templateId: "-1708238440",
        Name: "Samuel, the Anointer [K]",
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(samuel.id, samuel);
      state.battlefield.push(samuel);

      // Put valid I Samuel enhancement in Reserve, while Discard is empty
      const samEnh = createCard({
        id: "sam_enh_1",
        Name: "Samuel's Edict",
        Type: "GE",
        Alignment: "Good",
        Reference: "I Samuel 7:15",
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.RESERVE,
      });
      room.cardLookup.set(samEnh.id, samEnh);
      p1.reserve.push(samEnh);

      const item = {
        id: "item_sam_1",
        cardId: samuel.id,
        controllerId: "p1",
        title: samuel.Name,
        actionType: ActionType.ENTER_BATTLE,
        abilityId: "",
      };

      const res = resolver.resolve(item);
      expect(res.handled).toBe(true);
      expect(res.awaitingConfirmation).toBe(true);
      expect(clientP1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({
          action: "choose",
          choices: [
            expect.objectContaining({
              abilityId: "ab_1_underdeck__scope_discard_pile",
              label: "Underdeck good I Samuel enhancement from discard (No valid targets)",
              disabled: true,
            }),
            expect.objectContaining({
              abilityId: "ab_1_underdeck__scope_reserve_pile",
              label: "Underdeck good I Samuel enhancement from reserve",
              disabled: false,
            }),
          ],
        })
      );

      clientP1.send.mockClear();

      // Player selects the Reserve option -> opens SelectionDialogScene exclusively for Reserve
      const resTarget = resolver.resolve(item, {
        accepted: true,
        chosenAbilityId: "ab_1_underdeck__scope_reserve_pile",
      });
      expect(resTarget.handled).toBe(true);
      expect(resTarget.awaitingTargetSelection).toBe(true);
      expect(clientP1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({
          abilityId: "ab_1_underdeck__scope_reserve_pile",
          targetZone: ZONES.RESERVE,
          searchedPiles: ["p1:reserve"],
          eligibleCardIds: ["sam_enh_1"],
        })
      );
    });

    test("Gathering Soothsayers [K] (1943086376) sends specific choice button 'Band to up to 3 O.T. Egyptians'", () => {
      const soothsayers = createCard({
        id: "sooth_1",
        templateId: "1943086376",
        Name: "Gathering Soothsayers [K]",
        Type: "EE",
        Alignment: "Evil",
        IsEnhancement: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(soothsayers.id, soothsayers);
      state.battlefield.push(soothsayers);

      const egyptianInBattle = createCard({
        id: "eg_leader",
        Name: "Egyptian Charioteers [K]",
        Type: "Evil Character",
        Alignment: "Evil",
        Testament: "OT",
        Identifier: "Egyptian",
        ORDIR: ["OT Character", "Egyptian"],
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.BATTLEFIELD,
      });
      room.cardLookup.set(egyptianInBattle.id, egyptianInBattle);
      state.battlefield.push(egyptianInBattle);

      const egyptianInPlay = createCard({
        id: "eg_1",
        Name: "Egyptian Magicians [K]",
        Type: "Evil Character",
        Alignment: "Evil",
        Testament: "OT",
        Identifier: "Egyptian, Magician",
        ORDIR: ["OT Character", "Egyptian"],
        IsCharacter: true,
        controllerId: "p1",
        originalOwnerId: "p1",
        zone: ZONES.TERRITORY,
      });
      room.cardLookup.set(egyptianInPlay.id, egyptianInPlay);
      p1.territory.push(egyptianInPlay);

      const item = {
        id: "item_sooth_1",
        cardId: soothsayers.id,
        controllerId: "p1",
        title: soothsayers.Name,
        actionType: ActionType.ENTER_BATTLE,
        abilityId: "band_to_ot_egyptians",
      };

      const res = resolver.resolve(item);
      expect(res.handled).toBe(true);
      expect(res.awaitingConfirmation).toBe(true);
      expect(clientP1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({
          promptText: "Band to up to 3 O.T. Egyptians?",
          choices: [
            expect.objectContaining({
              abilityId: "band_to_ot_egyptians",
              label: "Band to up to 3 O.T. Egyptians",
              action: "band",
              disabled: false,
            }),
          ],
        })
      );
    });
  });
});
