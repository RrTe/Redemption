const { formatCardLink } = require("../src/utils/gameLogFormatter");
const { ResolveSearchPileCommand } = require("../src/commands/ResolveSearchPileCommand");
const { EffectChronicleService } = require("../src/services/EffectChronicleService");
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { ChronicleItem } = require("../src/state/EffectChronicleState");
const SearchHelper = require("../src/utils/SearchHelper");
const { ZONES } = require("../../shared/zones");
const { PHASES } = require("../../shared/phases");
const { CHRONICLE_STATUS } = require("../../shared/effectChronicleConstants");

describe("gameLogFormatter & Card Link Log Formatting", () => {
  test("formatCardLink wraps bracketed card names cleanly and respects face-down state", () => {
    expect(
      formatCardLink({
        id: "c_altar",
        templateId: "altar_burnt_offering_l",
        Name: "Altar of Burnt Offering [L]",
        isFaceDown: false,
      }),
    ).toBe("{{altar_burnt_offering_l|Altar of Burnt Offering [L]}}");

    expect(
      formatCardLink({
        id: "c_hidden",
        templateId: "altar_burnt_offering_l",
        Name: "Altar of Burnt Offering [L]",
        isFaceDown: true,
      }),
    ).toBe("a face-down card");

    expect(formatCardLink(null, "fallback")).toBe("fallback");
  });

  test("ResolveSearchPileCommand logs selected card with full card link token including set suffix", () => {
    const state = new RoomState();
    state.currentPhase = PHASES.PREP;
    state.activePlayer = "p1";

    const player = new PlayerState();
    player.sessionId = "p1";
    player.name = "Test1";
    state.players.set("p1", player);

    const card = new Card();
    card.id = "c_altar";
    card.templateId = "altar_burnt_offering_l";
    card.Name = "Altar of Burnt Offering [L]";
    card.Type = "Artifact";
    card.zone = ZONES.DECK;
    card.controllerId = "p1";
    card.ownerId = "p1";
    player[ZONES.DECK].push(card);

    const cardLookup = new Map([[card.id, card]]);
    SearchHelper.setupContext(player, state, {
      zone: ZONES.DECK,
      cards: [card],
      isInteractive: true,
      originalOwnerId: "p1",
      actionTakerId: "p1",
    });

    const client = {
      sessionId: "p1",
      userData: { playerName: "Test1" },
      send: jest.fn(),
    };
    const room = {
      state,
      cardLookup,
      broadcast: jest.fn(),
      broadcastGameLog: jest.fn(),
    };

    const cmd = new ResolveSearchPileCommand(room, client);
    cmd.execute({
      selectedCards: [{ id: "c_altar" }],
      toZone: ZONES.HAND,
    });

    expect(room.broadcastGameLog).toHaveBeenCalledWith(
      "Test1 selected {{altar_burnt_offering_l|Altar of Burnt Offering [L]}} from deck and moved to hand.",
    );
  });

  test("EffectChronicleService.passItem formats real card links while keeping virtual chronicle items unlinked", () => {
    const state = new RoomState();
    const player = new PlayerState();
    player.sessionId = "p1";
    player.name = "Test1";
    state.players.set("p1", player);

    const card = new Card();
    card.id = "c_real";
    card.templateId = "12345";
    card.Name = "Covenant Hero [L]";

    state.effectChronicle.priorityPlayerId = "p1";
    state.effectChronicle.items.push(
      new ChronicleItem({
        id: "item_real",
        cardId: "c_real",
        title: "Covenant Hero [L]",
        controllerId: "p1",
        status: CHRONICLE_STATUS.PENDING,
        order: 1,
      }),
      new ChronicleItem({
        id: "item_virtual",
        cardId: "",
        title: "Lost Souls",
        controllerId: "p1",
        status: CHRONICLE_STATUS.PENDING,
        order: 2,
      }),
    );

    const room = {
      state,
      cardLookup: new Map([[card.id, card]]),
      clients: [{ sessionId: "p1" }],
      broadcast: jest.fn(),
      broadcastGameLog: jest.fn(),
    };
    const client = { sessionId: "p1" };

    EffectChronicleService.passItem(room, client, "item_real");
    expect(room.broadcastGameLog).toHaveBeenCalledWith(
      "Test1 passes on {{12345|Covenant Hero [L]}}.",
    );

    EffectChronicleService.passItem(room, client, "item_virtual");
    expect(room.broadcastGameLog).toHaveBeenCalledWith(
      "Test1 passes on Lost Souls.",
    );
  });
});
