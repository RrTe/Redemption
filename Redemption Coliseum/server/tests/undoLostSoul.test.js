const { MoveCardCommand } = require("../src/commands/MoveCardCommand");
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { ZONES } = require("../../shared/zones");
const { CARD_TYPES } = require("../../shared/card-constants");

describe("MoveCardCommand - Lost Soul Undo", () => {
  let room;
  let client;
  let player;

  beforeEach(() => {
    room = {
      state: new RoomState(),
      send: jest.fn(),
      broadcast: jest.fn(),
      cardLookup: new Map(),
      broadcastGameLog: jest.fn(),
    };

    client = {
      sessionId: "p1",
      send: jest.fn(),
      userData: { playerName: "Player 1" },
    };

    player = new PlayerState();
    player.sessionId = "p1";
    player.name = "Player 1";
    room.state.players.set("p1", player);
  });

  test("should rollback both replacement card and diverted Lost Soul on undo", () => {
    // Top card is Lost Soul
    const lsCard = new Card();
    lsCard.id = "ls_1";
    lsCard.Name = "Lost Soul (Dull)";
    lsCard.Type = CARD_TYPES.LOST_SOUL;
    lsCard.controllerId = "p1";
    lsCard.originalOwnerId = "p1";
    lsCard.zone = ZONES.DECK;
    room.cardLookup.set("ls_1", lsCard);
    player[ZONES.DECK].push(lsCard);

    // Second card is regular Hero
    const heroCard = new Card();
    heroCard.id = "hero_1";
    heroCard.Name = "Michael";
    heroCard.Type = CARD_TYPES.HERO;
    heroCard.controllerId = "p1";
    heroCard.originalOwnerId = "p1";
    heroCard.zone = ZONES.DECK;
    room.cardLookup.set("hero_1", heroCard);
    player[ZONES.DECK].push(heroCard);

    expect(player[ZONES.DECK].length).toBe(2);
    expect(player[ZONES.HAND].length).toBe(0);
    expect(player[ZONES.LAND_OF_BONDAGE].length).toBe(0);

    const cmd = new MoveCardCommand(room, client);
    cmd.execute({
      from: ZONES.DECK,
      to: ZONES.HAND,
      count: 1,
    });

    // Verify after execute:
    // Hero is in hand, Lost Soul is in Land of Bondage, deck is empty
    expect(cmd.canUndo).toBe(true);
    expect(player[ZONES.HAND].length).toBe(1);
    expect(player[ZONES.HAND][0].id).toBe("hero_1");
    expect(player[ZONES.LAND_OF_BONDAGE].length).toBe(1);
    expect(player[ZONES.LAND_OF_BONDAGE][0].id).toBe("ls_1");
    expect(player[ZONES.DECK].length).toBe(0);

    // Perform Undo
    cmd.undo();

    // Verify after undo:
    // Hand is empty, Land of Bondage is empty, Deck has both cards in original order
    expect(player[ZONES.HAND].length).toBe(0);
    expect(player[ZONES.LAND_OF_BONDAGE].length).toBe(0);
    expect(player[ZONES.DECK].length).toBe(2);
    expect(player[ZONES.DECK][0].id).toBe("ls_1");
    expect(player[ZONES.DECK][1].id).toBe("hero_1");
    expect(player[ZONES.DECK][0].zone).toBe(ZONES.DECK);
    expect(player[ZONES.DECK][1].zone).toBe(ZONES.DECK);
  });
});
