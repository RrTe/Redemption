// server/tests/battleTriggerAst.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { MoveCardCommand } = require("../src/commands/MoveCardCommand");
const { RespondOptionalAbilityCommand } = require("../src/commands/RespondOptionalAbilityCommand");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { AbilityLookup } = require("../src/ast/AbilityLookup");
const { ZONES } = require("../../shared/zones");
const { PHASES } = require("../../shared/phases");
const { AST_MESSAGES } = require("../../shared/astConstants");
const { CHRONICLE_STATUS } = require("../../shared/effectChronicleConstants");
const { ActionType } = require("../../shared/actions");

describe("Phase 3: Battlefield & Combat Triggers (Battle Primitives)", () => {
  let room;
  let state;
  let player1;
  let player2;
  let client1;
  let client2;
  let sentMessages1;
  let sentMessages2;

  beforeEach(() => {
    state = new RoomState();

    player1 = Object.assign(new PlayerState(), { sessionId: "p1", name: "Hero Player" });
    player2 = Object.assign(new PlayerState(), { sessionId: "p2", name: "Defending Player" });
    state.players.set("p1", player1);
    state.players.set("p2", player2);
    state.activePlayer = "p1";
    state.currentPhase = PHASES.BATTLE;

    sentMessages1 = [];
    sentMessages2 = [];
    client1 = { sessionId: "p1", send: jest.fn((m, p) => sentMessages1.push({ msgType: m, payload: p })) };
    client2 = { sessionId: "p2", send: jest.fn((m, p) => sentMessages2.push({ msgType: m, payload: p })) };

    room = {
      roomId: "battle-room-1",
      state,
      clients: [client1, client2],
      cardLookup: new Map(),
      broadcastGameLog: jest.fn(),
      broadcast: jest.fn(),
    };
    room.abilityResolver = new AbilityResolver(room);
  });

  function createCard(id, templateId, name, zone, ownerId, extra = {}) {
    const card = Object.assign(new Card(), {
      id, templateId, Name: name, ImageFile: `${templateId}_art`,
      zone, ownerId, originalOwnerId: ownerId, controllerId: ownerId,
    }, extra);

    room.cardLookup.set(id, card);
    if (zone === ZONES.BATTLEFIELD) {
      state.battlefield.push(card);
    } else {
      const p = state.players.get(ownerId);
      if (p && p[zone]) p[zone].push(card);
    }
    return card;
  }

  test("1. Blocking with Egyptian Horsemen triggers BLOCK_RESCUE and requests optional ability prompt", () => {
    // Setup player 2's deck and Egyptian Horsemen in Territory
    createCard("deck_ec1", "101", "Evil Deck 1", ZONES.DECK, "p2");
    createCard("deck_ec2", "102", "Evil Deck 2", ZONES.DECK, "p2");
    const horsemen = createCard("c_horse", "2041723113", "Egyptian Horsemen (1st Print - K)", ZONES.TERRITORY, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });

    expect(player2.hand.length).toBe(0);
    expect(player2.deck.length).toBe(2);

    // Defending player blocks by moving Egyptian Horsemen into Battlefield
    const moveCmd = new MoveCardCommand(room, client2);
    moveCmd.execute({
      from: ZONES.TERRITORY,
      to: ZONES.BATTLEFIELD,
      cardId: horsemen.id,
    });

    // Card is on the battlefield
    expect(horsemen.zone).toBe(ZONES.BATTLEFIELD);
    expect(state.battlefield.length).toBe(1);

    // Enqueued into Effect Chronicle with actionType BLOCK_RESCUE
    expect(state.effectChronicle.items.length).toBe(1);
    const item = state.effectChronicle.items[0];
    expect(item.actionType).toBe(ActionType.BLOCK_RESCUE);
    expect(item.cardId).toBe(horsemen.id);
    expect(item.isOptional).toBe(true);

    // Client 2 (defending player) received the optional ability prompt
    expect(client2.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        abilityId: "ab_1_draw",
        itemId: item.id,
        cardId: horsemen.id,
        cardTitle: expect.stringContaining("Egyptian Horsemen"),
        promptText: "Draw 2 cards?",
      })
    );

    // Defending player accepts prompt -> draws 2 cards
    const optCmd = new RespondOptionalAbilityCommand(room, client2);
    optCmd.execute({ itemId: item.id, accepted: true });

    expect(player2.deck.length).toBe(0);
    expect(player2.hand.length).toBe(2);
    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.effectChronicle.history.length).toBe(1);
    expect(state.effectChronicle.history[0].status).toBe(CHRONICLE_STATUS.COMPLETED);
    expect(room.broadcastGameLog).toHaveBeenCalledWith(
      expect.stringContaining("Defending Player draws 2 card(s)")
    );
  });

  test("2. Declining Egyptian Horsemen block trigger passes without drawing", () => {
    createCard("deck_ec1", "101", "Evil Deck 1", ZONES.DECK, "p2");
    const horsemen = createCard("c_horse", "2041723113", "Egyptian Horsemen", ZONES.HAND, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });

    const moveCmd = new MoveCardCommand(room, client2);
    moveCmd.execute({
      from: ZONES.HAND,
      to: ZONES.BATTLEFIELD,
      cardId: horsemen.id,
    });

    expect(state.effectChronicle.items.length).toBe(1);
    const item = state.effectChronicle.items[0];

    // Defending player declines prompt
    const optCmd = new RespondOptionalAbilityCommand(room, client2);
    optCmd.execute({ itemId: item.id, accepted: false });

    expect(player2.deck.length).toBe(1);
    expect(player2.hand.length).toBe(0);
    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.effectChronicle.history.length).toBe(1);
    expect(state.effectChronicle.history[0].status).toBe(CHRONICLE_STATUS.PASSED);
  });

  test("3. Graceful Fallback: Character without AST entry moves to battlefield without hard-fail", () => {
    const vanillaHero = createCard("v_hero", "9999999", "Vanilla Hero", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });

    const moveCmd = new MoveCardCommand(room, client1);
    expect(() => {
      moveCmd.execute({
        from: ZONES.TERRITORY,
        to: ZONES.BATTLEFIELD,
        cardId: vanillaHero.id,
      });
    }).not.toThrow();

    // Card placed on battlefield cleanly
    expect(vanillaHero.zone).toBe(ZONES.BATTLEFIELD);
    expect(state.battlefield.length).toBe(1);
    // No chronicle items or errors created
    expect(state.effectChronicle.items.length).toBe(0);
  });

  test("4. Moving within Battlefield does not re-trigger battle entrance triggers", () => {
    const horsemen = createCard("c_horse_in_battle", "2041723113", "Egyptian Horsemen", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });

    const moveCmd = new MoveCardCommand(room, client2);
    moveCmd.execute({
      from: ZONES.BATTLEFIELD,
      to: ZONES.BATTLEFIELD,
      cardId: horsemen.id,
      coords: { x: 500, y: 300 },
    });

    // No chronicle triggers on intra-zone position update
    expect(state.effectChronicle.items.length).toBe(0);
  });

  test("5. Star abilities NEVER trigger when character enters battlefield", () => {
    AbilityLookup._loadData()["star_hero_test"] = {
      card_id: "star_hero_test",
      card_name: "Star Hero",
      sides: {
        shared: {
          abilities: [
            {
              ability_id: "star_draw_cards",
              activation_mode: "immediate",
              effects: [{ action: "draw" }],
            },
          ],
        },
      },
    };

    const starHero = createCard("sh_enter", "star_hero_test", "Star Hero", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
      IsStarCard: true,
    });

    const moveCmd = new MoveCardCommand(room, client1);
    moveCmd.execute({
      from: ZONES.TERRITORY,
      to: ZONES.BATTLEFIELD,
      cardId: starHero.id,
    });

    expect(starHero.zone).toBe(ZONES.BATTLEFIELD);
    expect(state.effectChronicle.items.length).toBe(0);
  });

  it("never triggers Amminadab Star discard ability on rescue attempt entry", () => {
    const amminadab = createCard("ammi_1", "-622696180", "Amminadab", ZONES.TERRITORY, "p1", {
      Type: "Hero", Alignment: "Good", IsCharacter: true, IsStarCard: true,
    });
    const moveCmd = new MoveCardCommand(room, client1);
    moveCmd.execute({ from: ZONES.TERRITORY, to: ZONES.BATTLEFIELD, cardId: amminadab.id });
    expect(amminadab.zone).toBe(ZONES.BATTLEFIELD);
    const hasDiscard = state.effectChronicle.items.some((i) => i.abilityId === "ab_1_discard");
    expect(hasDiscard).toBe(false);
  });

  test("6. Playing Good Enhancement in battle triggers PLAY_GOOD_ENHANCEMENT and executes AST Draw", () => {
    createCard("c_hero_active", "hero_active_1", "Active Hero", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero", Alignment: "Good", IsCharacter: true, Brigade: "Silver",
    });

    AbilityLookup._loadData()["ge_ast_draw"] = {
      card_id: "ge_ast_draw",
      card_name: "Good Enhancement Draw",
      sides: {
        top: {
          abilities: [
            {
              ability_id: "ab_ge_draw",
              activation_mode: "immediate",
              is_optional: true,
              conditions: [],
              effects: [{ action: "draw", target: { count: { fixed_value: 2 } } }],
            },
          ],
        },
      },
    };
    createCard("d_p1_1", "d1", "Deck 1", ZONES.DECK, "p1");
    createCard("d_p1_2", "d2", "Deck 2", ZONES.DECK, "p1");

    const goodEnh = createCard("ge_card_1", "ge_ast_draw", "Good Enhancement Draw", ZONES.HAND, "p1", {
      Type: "Good Enhancement", Alignment: "Good", IsEnhancement: true, Brigade: "Silver",
      SpecialAbility: "You may draw 2 cards.",
    });

    const moveCmd = new MoveCardCommand(room, client1);
    moveCmd.execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: goodEnh.id });

    expect(goodEnh.zone).toBe(ZONES.BATTLEFIELD);
    expect(state.effectChronicle.items.length).toBe(1);
    const item = state.effectChronicle.items[0];
    expect(item.actionType).toBe(ActionType.PLAY_GOOD_ENHANCEMENT);
    expect(item.cardId).toBe(goodEnh.id);

    const optCmd = new RespondOptionalAbilityCommand(room, client1);
    optCmd.execute({ itemId: item.id, accepted: true });

    expect(player1.hand.length).toBe(2);
    expect(player1.deck.length).toBe(0);
    expect(state.effectChronicle.items.length).toBe(0);
  });

  test("7. Playing Evil Enhancement in battle triggers PLAY_EVIL_ENHANCEMENT and tabletop fallback", () => {
    createCard("c_ec_blocker", "ec_blocker_1", "Blocking EC", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character", Alignment: "Evil", IsCharacter: true, Brigade: "Pale Green",
    });

    const evilEnh = createCard("ee_card_1", "ee_tt_test", "Evil Tabletop Enhancement", ZONES.HAND, "p2", {
      Type: "Evil Enhancement", Alignment: "Evil", IsEnhancement: true, Brigade: "Pale Green",
      SpecialAbility: "Discard all Heroes in battle.",
    });

    const moveCmd = new MoveCardCommand(room, client2);
    moveCmd.execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: evilEnh.id });

    expect(evilEnh.zone).toBe(ZONES.BATTLEFIELD);
    expect(state.effectChronicle.items.length).toBe(1);
    const item = state.effectChronicle.items[0];
    expect(item.actionType).toBe(ActionType.PLAY_EVIL_ENHANCEMENT);
    expect(item.cardId).toBe(evilEnh.id);
    expect(item.isOptional).toBe(true);

    const optCmd = new RespondOptionalAbilityCommand(room, client2);
    optCmd.execute({ itemId: item.id, accepted: true });

    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.effectChronicle.history.length).toBe(1);
    expect(state.effectChronicle.history[0].status).toBe(CHRONICLE_STATUS.COMPLETED);
    expect(room.broadcastGameLog).toHaveBeenCalledWith(
      expect.stringContaining("Defending Player activates Evil Tabletop Enhancement")
    );
  });
});

