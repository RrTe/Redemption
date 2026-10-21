// server/tests/optionalAbilityAst.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { ChronicleItem } = require("../src/state/EffectChronicleState");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { RespondOptionalAbilityCommand } = require("../src/commands/RespondOptionalAbilityCommand");
const { ZONES } = require("../../shared/zones");
const { AST_MESSAGES } = require("../../shared/astConstants");
const { CHRONICLE_STATUS } = require("../../shared/effectChronicleConstants");

describe("Optional Ability (May) AST Prompt & Execution", () => {
  let room;
  let state;
  let player1;
  let client1;
  let sentMessages;

  beforeEach(() => {
    state = new RoomState();
    player1 = new PlayerState();
    player1.sessionId = "p1";
    player1.name = "Pharaoh";

    state.players.set("p1", player1);
    state.activePlayer = "p1";

    sentMessages = [];
    client1 = {
      sessionId: "p1",
      send: jest.fn((msgType, payload) => {
        sentMessages.push({ msgType, payload });
      }),
    };

    room = {
      roomId: "test-room",
      state,
      clients: [client1],
      cardLookup: new Map(),
      broadcastGameLog: jest.fn(),
      broadcast: jest.fn(),
    };
    room.abilityResolver = new AbilityResolver(room);
  });

  function createCard(id, templateId, name, zone, ownerId) {
    const card = new Card();
    card.id = id;
    card.templateId = templateId;
    card.Name = name;
    card.ImageFile = `${templateId}_img`;
    card.zone = zone;
    card.ownerId = ownerId;
    card.originalOwnerId = ownerId;
    card.controllerId = ownerId;
    room.cardLookup.set(id, card);
    const p = state.players.get(ownerId);
    if (p && p[zone]) p[zone].push(card);
    return card;
  }

  function enqueueChronicleItem(card, actionType = "TRIGGER") {
    const chronicle = state.effectChronicle;
    const item = new ChronicleItem({
      id: "item_opt_1",
      cardId: card.id,
      controllerId: "p1",
      actionType,
      title: card.Name,
      description: "Draw 1 card",
      order: 1,
    });
    chronicle.items.push(item);
    chronicle.priorityPlayerId = "p1";
    chronicle.isResolving = true;
    return item;
  }

  test("1. Enqueued Egyptian Horsemen triggers REQUEST_OPTIONAL_ABILITY prompt", () => {
    const horsemen = createCard("eh_1", "2041723113", "Egyptian Horsemen", ZONES.TERRITORY, "p1");
    createCard("deck_1", "100", "Deck Card", ZONES.DECK, "p1");

    const item = enqueueChronicleItem(horsemen);
    const result = room.abilityResolver.resolve(item);

    expect(result.handled).toBe(true);
    expect(result.awaitingConfirmation).toBe(true);
    expect(sentMessages).toHaveLength(1);
    expect(sentMessages[0].msgType).toBe(AST_MESSAGES.REQUEST_OPTIONAL_ABILITY);
    expect(sentMessages[0].payload.itemId).toBe("item_opt_1");
    expect(sentMessages[0].payload.cardTitle).toBe("Egyptian Horsemen");
    expect(sentMessages[0].payload.promptText).toBe("Draw 2 cards?");
    expect(sentMessages[0].payload.cardImageFile).toBe("2041723113_img");
    expect(state.effectChronicle.items).toHaveLength(1);
  });

  test("2. Declining optional ability logs pass and does not draw cards", () => {
    const horsemen = createCard("eh_1", "2041723113", "Egyptian Horsemen", ZONES.TERRITORY, "p1");
    createCard("deck_1", "100", "Deck Card", ZONES.DECK, "p1");

    const item = enqueueChronicleItem(horsemen);
    const cmd = new RespondOptionalAbilityCommand(room, client1);
    cmd.execute({ itemId: item.id, accepted: false });

    expect(player1.hand).toHaveLength(0);
    expect(player1.deck).toHaveLength(1);
    expect(state.effectChronicle.items).toHaveLength(0);
    expect(state.effectChronicle.history).toHaveLength(1);
    expect(state.effectChronicle.history[0].status).toBe(CHRONICLE_STATUS.PASSED);
    expect(room.broadcastGameLog).toHaveBeenCalledWith(
      expect.stringContaining("chooses not to activate")
    );
  });

  test("3. Accepting optional ability executes draw and records completion", () => {
    const horsemen = createCard("eh_1", "2041723113", "Egyptian Horsemen", ZONES.TERRITORY, "p1");
    const deckCard = createCard("deck_1", "100", "Deck Card", ZONES.DECK, "p1");

    const item = enqueueChronicleItem(horsemen);
    const cmd = new RespondOptionalAbilityCommand(room, client1);
    cmd.execute({ itemId: item.id, accepted: true });

    expect(player1.hand).toHaveLength(1);
    expect(player1.hand[0].id).toBe(deckCard.id);
    expect(player1.deck).toHaveLength(0);
    expect(state.effectChronicle.items).toHaveLength(0);
    expect(state.effectChronicle.history).toHaveLength(1);
    expect(state.effectChronicle.history[0].status).toBe(CHRONICLE_STATUS.COMPLETED);
    expect(cmd.canUndo).toBe(true);
  });

  test("4. Undoing accepted optional ability rolls back drawn card and restores chronicle item", () => {
    const horsemen = createCard("eh_1", "2041723113", "Egyptian Horsemen", ZONES.TERRITORY, "p1");
    createCard("deck_1", "100", "Deck Card", ZONES.DECK, "p1");

    const item = enqueueChronicleItem(horsemen);
    const cmd = new RespondOptionalAbilityCommand(room, client1);
    cmd.execute({ itemId: item.id, accepted: true });

    expect(player1.hand).toHaveLength(1);
    expect(player1.deck).toHaveLength(0);

    cmd.undo();

    expect(player1.hand).toHaveLength(0);
    expect(player1.deck).toHaveLength(1);
    expect(state.effectChronicle.items).toHaveLength(1);
    expect(state.effectChronicle.items[0].id).toBe(item.id);
    expect(room.broadcastGameLog).toHaveBeenCalledWith(
      expect.stringContaining("rewound")
    );
  });

  test("5. Star abilities with ACTIVATE_STAR_ABILITY bypass confirmation prompt", () => {
    const { AbilityLookup } = require("../src/ast/AbilityLookup");
    AbilityLookup._loadData()["mock_opt_star"] = {
      card_id: "mock_opt_star",
      card_name: "Mock Star Hero",
      sides: {
        shared: {
          abilities: [
            {
              ability_id: "ab_star_opt",
              is_optional: true,
              conditions: [],
              effects: [
                {
                  action: "draw",
                  count: 1,
                  target: { selection_mode: "automatic_next", zone_owner: "controller", scope: "deck" },
                },
              ],
            },
          ],
        },
      },
    };

    const starHero = createCard("sh_1", "mock_opt_star", "Mock Star Hero", ZONES.HAND, "p1");
    createCard("deck_1", "100", "Deck Card", ZONES.DECK, "p1");

    const item = enqueueChronicleItem(starHero, "ACTIVATE_STAR_ABILITY");
    const result = room.abilityResolver.resolve(item);

    expect(result.handled).toBe(true);
    expect(result.awaitingConfirmation).toBeUndefined();
    const promptMessages = sentMessages.filter((m) => m.msgType === AST_MESSAGES.REQUEST_OPTIONAL_ABILITY);
    expect(promptMessages).toHaveLength(0);
    expect(sentMessages).toContainEqual({
      msgType: "cardsDrawn",
      payload: { cardIds: ["deck_1"] },
    });
    expect(player1.hand).toHaveLength(2); // starHero + drawn card
  });

  test("6. Stale or mismatching itemId falls back to player's pending chronicle item and resolves safely", () => {
    const horsemen = createCard("eh_1", "2041723113", "Egyptian Horsemen", ZONES.TERRITORY, "p1");
    createCard("deck_1", "100", "Deck Card", ZONES.DECK, "p1");
    createCard("deck_2", "101", "Deck Card 2", ZONES.DECK, "p1");

    const item = enqueueChronicleItem(horsemen);
    expect(state.effectChronicle.items).toHaveLength(1);
    expect(state.effectChronicle.isResolving).toBe(true);

    // Client sends an outdated itemId (e.g. from previous banner closure)
    const cmd = new RespondOptionalAbilityCommand(room, client1);
    cmd.execute({ itemId: "stale_old_item_id_from_previous_card", accepted: true });

    // Should gracefully fall back to horsemen item, draw 2 cards, and finish chronicle
    expect(player1.hand).toHaveLength(2);
    expect(state.effectChronicle.items).toHaveLength(0);
    expect(state.effectChronicle.isResolving).toBe(false);
    expect(state.effectChronicle.history).toHaveLength(1);
    expect(state.effectChronicle.history[0].status).toBe(CHRONICLE_STATUS.COMPLETED);
  });
});
