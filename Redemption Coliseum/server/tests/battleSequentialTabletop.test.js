// server/tests/battleSequentialTabletop.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { MoveCardCommand } = require("../src/commands/MoveCardCommand");
const { RespondOptionalAbilityCommand } = require("../src/commands/RespondOptionalAbilityCommand");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { ZONES } = require("../../shared/zones");
const { AST_MESSAGES } = require("../../shared/astConstants");
const { CHRONICLE_STATUS } = require("../../shared/effectChronicleConstants");
const { ActionType } = require("../../shared/actions");

describe("Sequential Battle Resolution: AST Abilities & Tabletop Fallbacks", () => {
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

    sentMessages1 = [];
    sentMessages2 = [];
    client1 = { sessionId: "p1", send: jest.fn((m, p) => sentMessages1.push({ msgType: m, payload: p })) };
    client2 = { sessionId: "p2", send: jest.fn((m, p) => sentMessages2.push({ msgType: m, payload: p })) };

    room = {
      roomId: "battle-room-seq",
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

  test("Horsemen draw resolution does not break subsequent defenders with tabletop abilities", () => {
    // 1. Setup deck and Egyptian Horsemen for Player 2
    createCard("deck_ec1", "101", "Evil Deck 1", ZONES.DECK, "p2");
    createCard("deck_ec2", "102", "Evil Deck 2", ZONES.DECK, "p2");
    const horsemen = createCard("c_horse", "2041723113", "Egyptian Horsemen (1st Print - K)", ZONES.TERRITORY, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
      SpecialAbility: "You may draw 2 cards.",
    });

    // Player 2 blocks with Egyptian Horsemen
    const moveCmd1 = new MoveCardCommand(room, client2);
    moveCmd1.execute({ from: ZONES.TERRITORY, to: ZONES.BATTLEFIELD, cardId: horsemen.id });

    expect(client2.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({ abilityId: "ab_1_draw", promptText: "Draw 2 cards?" })
    );

    // Defending player accepts prompt -> draws 2 cards
    const horsemenItemId = state.effectChronicle.items[0].id;
    const optCmd1 = new RespondOptionalAbilityCommand(room, client2);
    optCmd1.execute({ itemId: horsemenItemId, accepted: true });

    expect(player2.hand.length).toBe(2);
    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.effectChronicle.isResolving).toBe(false);

    // 2. Player 2 blocks with Pharaoh (no AST logic, but has tabletop Special Ability)
    client2.send.mockClear();
    const pharaoh = createCard("c_pharaoh", "-1946607650", "Pharaoh Ramses II", ZONES.HAND, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
      SpecialAbility: "Protect this character from lone Heroes. You may look at a hand.",
    });

    const moveCmd2 = new MoveCardCommand(room, client2);
    moveCmd2.execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: pharaoh.id });

    // Tabletop SA must trigger REQUEST_OPTIONAL_ABILITY prompt!
    expect(client2.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        cardId: pharaoh.id,
        cardTitle: "Pharaoh Ramses II",
        promptText: "Activate the special ability of Pharaoh Ramses II?",
      })
    );
    expect(state.effectChronicle.items.length).toBe(1);

    // 3. Player 2 confirms Pharaoh's special ability
    const pharaohItemId = state.effectChronicle.items[0].id;
    const optCmd2 = new RespondOptionalAbilityCommand(room, client2);
    optCmd2.execute({ itemId: pharaohItemId, accepted: true });

    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.effectChronicle.isResolving).toBe(false);
    expect(room.broadcastGameLog).toHaveBeenCalledWith(
      expect.stringContaining("Defending Player activates Pharaoh Ramses II")
    );

    // 4. Opponent plays a character with a Special Ability (e.g. Miriam)
    client1.send.mockClear();
    const miriam = createCard("c_miriam", "3001", "Miriam", ZONES.HAND, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
      SpecialAbility: "Search deck for a good musical instrument.",
    });

    const moveCmd3 = new MoveCardCommand(room, client1);
    moveCmd3.execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: miriam.id });

    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        cardId: miriam.id,
        cardTitle: "Miriam",
        promptText: "Activate the special ability of Miriam?",
      })
    );
  });

  test("David Giant Slayer prioritizes supported optional draw and Eli the Priest prompts optional ability", () => {
    // 1. Setup Hero deck and David, Giant Slayer
    createCard("hero_deck_1", "201", "Hero Card 1", ZONES.DECK, "p1");
    const david = createCard("c_david", "-1330560095", "David, Giant Slayer [K]", ZONES.HAND, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
      SpecialAbility: "Negate an evil card. You may draw 1.",
    });

    const moveDavid = new MoveCardCommand(room, client1);
    moveDavid.execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: david.id });

    // David must pick the supported optional draw ability (ab_2_draw)
    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        abilityId: "ab_2_draw",
        cardId: david.id,
        cardTitle: "David, Giant Slayer [K]",
        promptText: "Draw 1 card?",
      })
    );
    expect(state.effectChronicle.items.length).toBe(1);

    // Accept David's draw -> 1 card drawn to hand!
    const davidItemId = state.effectChronicle.items[0].id;
    const optCmdDavid = new RespondOptionalAbilityCommand(room, client1);
    optCmdDavid.execute({ itemId: davidItemId, accepted: true });

    expect(player1.hand.length).toBe(1);
    expect(state.effectChronicle.items.length).toBe(0);

    // 2. Play Eli the Priest (RoA)
    client1.send.mockClear();
    const eli = createCard("c_eli", "-175529066", "Eli the Priest (RoA)", ZONES.HAND, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
      SpecialAbility: "Search deck for a Tabernacle Artifact and put it in hand. May band to Samuel.",
    });

    const moveEli = new MoveCardCommand(room, client1);
    moveEli.execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: eli.id });

    // Eli must pick the optional ability (ab_2_band) and prompt the player
    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        cardId: eli.id,
        cardTitle: "Eli the Priest (RoA)",
        promptText: expect.stringContaining("Eli the Priest (RoA)"),
      })
    );
    expect(state.effectChronicle.items.length).toBe(1);

    // Accept Eli's prompt -> logs tabletop execution
    const eliItemId = state.effectChronicle.items[0].id;
    const optCmdEli = new RespondOptionalAbilityCommand(room, client1);
    optCmdEli.execute({ itemId: eliItemId, accepted: true });

    expect(state.effectChronicle.items.length).toBe(0);
    expect(room.broadcastGameLog).toHaveBeenCalledWith(
      expect.stringContaining("Hero Player activates Eli the Priest (RoA)")
    );
  });
});
