// server/tests/cardService.test.js
const { moveCard } = require("../src/services/cardService");
const { Card } = require("../src/state/Card");
const { PlayerState } = require("../src/state/PlayerState");
const { RoomState } = require("../src/state/RoomState");
const { ZONES } = require("../../shared/zones");
const { PHASES } = require("../../shared/phases");
const { CARD_TYPES, ALIGNMENTS } = require("../../shared/card-constants");

describe("cardService (moveCard)", () => {
  let player;
  let state;
  let cardLookup;
  let c1, c2;

  beforeEach(() => {
    // Erstelle einen sauberen Zustand für jeden Test
    player = new PlayerState();
    player.sessionId = "p1";

    state = new RoomState();
    state.players.set("p1", player);

    cardLookup = new Map();

    c1 = new Card();
    c1.id = "c1";
    c1.Name = "Feuerball";
    c1.controllerId = "p1";
    c1.originalOwnerId = "p1";
    c1.zone = ZONES.DECK;

    c2 = new Card();
    c2.id = "c2";
    c2.Name = "Krieger";
    c2.controllerId = "p1";
    c2.originalOwnerId = "p1";
    c2.zone = ZONES.DECK;

    player[ZONES.DECK].push(c1, c2);
    cardLookup.set(c1.id, c1);
    cardLookup.set(c2.id, c2);
  });

  // HINWEIS: Das direkte Ziehen vom Deck (ohne cardId) wird jetzt durch eine
  // spezielle Logik (_drawCardsWithLostSoulRule) gehandhabt und ist nicht mehr
  // Teil der generischen moveCard-Funktion. Wir testen daher ID-basierte Züge.

  test("sollte eine Karte von der Hand in den Ablagestapel verschieben", () => {
    // Setup: Eine Karte auf die Hand legen
    player[ZONES.HAND].push(player[ZONES.DECK].pop());
    c2.zone = ZONES.HAND;

    moveCard(player, state, cardLookup, ZONES.HAND, ZONES.DISCARD, "c2");

    expect(player[ZONES.HAND].length).toBe(0);
    expect(player[ZONES.DISCARD].length).toBe(1);
    expect(player[ZONES.DISCARD][0].Name).toBe("Krieger");
    expect(c2.zone).toBe(ZONES.DISCARD);
  });

  test("sollte eine Karte vom Ablagestapel zurück auf die Hand verschieben", () => {
    // Setup: Eine Karte auf den Ablagestapel legen
    player[ZONES.DISCARD].push(player[ZONES.DECK].pop());
    c2.zone = ZONES.DISCARD;

    moveCard(player, state, cardLookup, ZONES.DISCARD, ZONES.HAND, "c2");

    expect(player[ZONES.HAND].length).toBe(1);
    expect(player[ZONES.DISCARD].length).toBe(0);
    expect(c2.zone).toBe(ZONES.HAND);
  });

  test("sollte eine Karte von der Hand ins Territorium verschieben", () => {
    // Setup
    player[ZONES.HAND].push(player[ZONES.DECK].pop());
    c2.zone = ZONES.HAND;

    moveCard(player, state, cardLookup, ZONES.HAND, ZONES.TERRITORY, "c2");

    expect(player[ZONES.HAND].length).toBe(0);
    expect(player[ZONES.TERRITORY].length).toBe(1);
    expect(c2.zone).toBe(ZONES.TERRITORY);
  });

  test("sollte eine Karte vom Deck unter den Stapel legen, wenn position: 'bottom' angegeben ist", () => {
    // Die Karte "Krieger" (c2) ist unten, "Feuerball" (c1) ist oben.
    // Wir bewegen "Feuerball" von oben nach ganz unten.
    moveCard(player, state, cardLookup, ZONES.DECK, ZONES.DECK, "c1", 1, { position: "bottom" });

    expect(player[ZONES.DECK].length).toBe(2);
    expect(player[ZONES.DECK][0].Name).toBe("Krieger"); // "Krieger" ist jetzt oben
    expect(player[ZONES.DECK][1].Name).toBe("Feuerball"); // "Feuerball" ist jetzt unten
  });

  test("sollte eine Karte vom Deck in den Discard verschieben, wenn _clientViews aktiv sind", () => {
    const mockView = {
      add: jest.fn(),
      remove: jest.fn(),
    };
    state._clientViews = new Map();
    state._clientViews.set("p1", mockView);

    moveCard(player, state, cardLookup, ZONES.DECK, ZONES.DISCARD, "c1");

    expect(player[ZONES.DECK].length).toBe(1);
    expect(player[ZONES.DISCARD].length).toBe(1);
    expect(player[ZONES.DISCARD][0].Name).toBe("Feuerball");
    expect(mockView.remove).toHaveBeenCalled();
    expect(mockView.add).toHaveBeenCalled();
  });

  describe("Reserve-Regeln (Runde 1)", () => {
    let r1;

    beforeEach(() => {
      state.round = 1;
      player.turn = 1;

      r1 = new Card();
      r1.id = "r1";
      r1.Name = "ReserveCard";
      r1.controllerId = "p1";
      r1.originalOwnerId = "p1";
      r1.zone = ZONES.RESERVE;

      player[ZONES.RESERVE].push(r1);
      cardLookup.set(r1.id, r1);
    });

    test("sollte in Runde 1 das Entnehmen einer Karte aus der Reserve blockieren", () => {
      const result = moveCard(
        player,
        state,
        cardLookup,
        ZONES.RESERVE,
        ZONES.HAND,
        "r1"
      );

      expect(result.movedCards.length).toBe(0);
      expect(player[ZONES.RESERVE].length).toBe(1);
      expect(player[ZONES.HAND].length).toBe(0);
      expect(r1.zone).toBe(ZONES.RESERVE);
    });

    test("sollte in Runde 1 das Ablegen einer Karte IN die Reserve erlauben", () => {
      // Karte c1 ist im Deck -> in Reserve verschieben
      const result = moveCard(
        player,
        state,
        cardLookup,
        ZONES.DECK,
        ZONES.RESERVE,
        "c1"
      );

      expect(result.movedCards.length).toBe(1);
      expect(player[ZONES.RESERVE].length).toBe(2);
      expect(player[ZONES.DECK].length).toBe(1);
    });

    test("sollte ab Runde 2 das Entnehmen einer Karte aus der Reserve erlauben", () => {
      state.round = 2;
      player.turn = 2;

      const result = moveCard(
        player,
        state,
        cardLookup,
        ZONES.RESERVE,
        ZONES.HAND,
        "r1"
      );

      expect(result.movedCards.length).toBe(1);
      expect(player[ZONES.RESERVE].length).toBe(0);
      expect(player[ZONES.HAND].length).toBe(1);
      expect(player[ZONES.HAND][0].Name).toBe("ReserveCard");
    });
  });

  describe("Handlimit (MAX_HAND_SIZE = 16)", () => {
    test("sollte Kartenbewegungen in die Hand blockieren, wenn bereits 16 Karten auf der Hand liegen", () => {
      // 16 Dummy-Karten auf die Hand legen
      for (let i = 0; i < 16; i++) {
        const dummy = new Card();
        dummy.id = `h_${i}`;
        dummy.controllerId = "p1";
        dummy.originalOwnerId = "p1";
        dummy.zone = ZONES.HAND;
        player[ZONES.HAND].push(dummy);
        cardLookup.set(dummy.id, dummy);
      }
      expect(player[ZONES.HAND].length).toBe(16);

      // Versuch, c1 vom Deck auf die Hand zu ziehen per moveCard (ID-basiert)
      const result = moveCard(player, state, cardLookup, ZONES.DECK, ZONES.HAND, "c1");
      expect(result.movedCards.length).toBe(0);
      expect(player[ZONES.HAND].length).toBe(16);
      expect(c1.zone).toBe(ZONES.DECK);
    });

    test("sollte beim Ziehen vom Deck bei 15 Karten nur 1 Karte ziehen (Multi-Draw Cap)", () => {
      // 15 Dummy-Karten auf die Hand
      for (let i = 0; i < 15; i++) {
        const dummy = new Card();
        dummy.id = `h_${i}`;
        dummy.controllerId = "p1";
        dummy.originalOwnerId = "p1";
        dummy.zone = ZONES.HAND;
        player[ZONES.HAND].push(dummy);
        cardLookup.set(dummy.id, dummy);
      }
      // 3 Karten im Deck
      const c3 = new Card();
      c3.id = "c3";
      c3.Name = "Schild";
      c3.controllerId = "p1";
      c3.originalOwnerId = "p1";
      c3.zone = ZONES.DECK;
      player[ZONES.DECK].push(c3);
      cardLookup.set(c3.id, c3);

      // Versuche 3 Karten vom Deck zu ziehen
      const result = moveCard(player, state, cardLookup, ZONES.DECK, ZONES.HAND, 0, 3);
      expect(result.movedCards.length).toBe(1);
      expect(player[ZONES.HAND].length).toBe(16);
      expect(player[ZONES.DECK].length).toBe(2); // 2 Karten verbleiben im Deck
    });

    test("sollte das Ziehen komplett verweigern, wenn bereits 16 Karten auf der Hand sind", () => {
      for (let i = 0; i < 16; i++) {
        const dummy = new Card();
        dummy.id = `h_${i}`;
        dummy.controllerId = "p1";
        dummy.originalOwnerId = "p1";
        dummy.zone = ZONES.HAND;
        player[ZONES.HAND].push(dummy);
        cardLookup.set(dummy.id, dummy);
      }

      const result = moveCard(player, state, cardLookup, ZONES.DECK, ZONES.HAND, 0, 1);
      expect(result.movedCards.length).toBe(0);
      expect(player[ZONES.HAND].length).toBe(16);
      expect(result.error).toBe("Hand limit reached (16/16)!");
    });
  });

  describe("Lost Soul und Zonen-Validierungsregeln", () => {
    test("sollte Lost Souls nur in erlaubte Zonen (Bondage, eigenes Deck, eigener Discard, gegnerisches Redemption) erlauben", () => {
      const ls = new Card();
      ls.id = "ls_1";
      ls.Name = "Lost Soul (Hopper)";
      ls.Type = "Lost Soul";
      ls.controllerId = "p1";
      ls.originalOwnerId = "p1";
      ls.zone = ZONES.HAND;
      player[ZONES.HAND].push(ls);
      cardLookup.set(ls.id, ls);

      // Versuch 1: Lost Soul ins eigene Territorium -> ungültig
      const resTerritory = moveCard(player, state, cardLookup, ZONES.HAND, ZONES.TERRITORY, "ls_1");
      expect(resTerritory.movedCards.length).toBe(0);
      expect(resTerritory.error).toBe("Invalid move for Lost Soul!");

      // Versuch 2: Lost Soul in eigenes Land of Bondage -> gültig
      const resBondage = moveCard(player, state, cardLookup, ZONES.HAND, ZONES.LAND_OF_BONDAGE, "ls_1");
      expect(resBondage.movedCards.length).toBe(1);
      expect(player[ZONES.LAND_OF_BONDAGE].length).toBe(1);

      // Versuch 3: Lost Soul aus Land of Bondage in eigenen Discard-Stapel -> gültig
      const resDiscard = moveCard(player, state, cardLookup, ZONES.LAND_OF_BONDAGE, ZONES.DISCARD, "ls_1");
      expect(resDiscard.movedCards.length).toBe(1);
      expect(player[ZONES.DISCARD].length).toBe(1);
    });

    test("sollte Kartenbewegungen auf gegnerische Pile-Zonen blockieren", () => {
      const opponent = new PlayerState();
      opponent.sessionId = "p2";
      state.players.set("p2", opponent);

      // Versuch, c1 (Besitzer p1) in gegnerisches Deck zu legen
      const res = moveCard(player, state, cardLookup, ZONES.DECK, ZONES.DECK, "c1", 1, { targetPlayerId: "p2" });
      expect(res.movedCards.length).toBe(0);
      expect(res.error).toBe("Cannot move cards to opponent's pile!");
    });

    test("sollte das Bewegen von Karten aus dem Land of Redemption erlauben", () => {
      const redCard = new Card();
      redCard.id = "red_1";
      redCard.Name = "Redeemed Hero";
      redCard.controllerId = "p1";
      redCard.originalOwnerId = "p1";
      redCard.zone = ZONES.LAND_OF_REDEMPTION;
      player[ZONES.LAND_OF_REDEMPTION].push(redCard);
      cardLookup.set(redCard.id, redCard);

      const res = moveCard(player, state, cardLookup, ZONES.LAND_OF_REDEMPTION, ZONES.HAND, "red_1");
      expect(res.movedCards.length).toBe(1);
      expect(player[ZONES.HAND].length).toBe(1);
      expect(player[ZONES.LAND_OF_REDEMPTION].length).toBe(0);
    });

    test("sollte Undo einer gespielten Karte ohne Schema-Duplikate oder Korruption ausführen", () => {
      // 1. Karte in die Hand
      player[ZONES.HAND].push(c2);
      c2.zone = ZONES.HAND;

      // 2. Ausspielen: Hand -> Territory
      moveCard(player, state, cardLookup, ZONES.HAND, ZONES.TERRITORY, "c2");
      expect(player[ZONES.HAND].length).toBe(0);
      expect(player[ZONES.TERRITORY].length).toBe(1);

      // 3. Undo: Territory -> Hand
      const undoRes = moveCard(player, state, cardLookup, ZONES.TERRITORY, ZONES.HAND, "c2", 1, null, "", "", { isUndo: true });
      expect(undoRes.movedCards.length).toBe(1);
      expect(player[ZONES.TERRITORY].length).toBe(0);
      expect(player[ZONES.HAND].length).toBe(1);
      expect(player[ZONES.HAND][0].id).toBe("c2");
      expect(player[ZONES.HAND][0].zone).toBe(ZONES.HAND);

      // 4. Erneut ausspielen: Hand -> Territory
      const replayRes = moveCard(player, state, cardLookup, ZONES.HAND, ZONES.TERRITORY, "c2");
      expect(replayRes.movedCards.length).toBe(1);
      expect(player[ZONES.HAND].length).toBe(0);
      expect(player[ZONES.TERRITORY].length).toBe(1);
      expect(player[ZONES.TERRITORY][0].id).toBe("c2");
    });
  });

  describe("Combat Guards (Battlefield Moves)", () => {
    let attacker;
    let defender;

    beforeEach(() => {
      attacker = new PlayerState();
      attacker.sessionId = "p1";
      attacker.name = "Attacker";

      defender = new PlayerState();
      defender.sessionId = "p2";
      defender.name = "Defender";

      state.players.set("p1", attacker);
      state.players.set("p2", defender);
      state.activePlayer = "p1";
      state.currentPhase = PHASES.BATTLE;
    });

    test("1. Phasen-Sperre: Karten ins Kampffeld zu verschieben ist ausserhalb von BATTLE verboten", () => {
      state.currentPhase = PHASES.PREP;
      const hero = new Card();
      hero.id = "hero_1";
      hero.Name = "King David";
      hero.Type = CARD_TYPES.HERO;
      hero.Alignment = ALIGNMENTS.GOOD;
      hero.IsCharacter = true;
      hero.controllerId = "p1";
      hero.originalOwnerId = "p1";
      hero.zone = ZONES.HAND;
      attacker[ZONES.HAND].push(hero);
      cardLookup.set(hero.id, hero);

      const res = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, hero.id);
      expect(res.movedCards.length).toBe(0);
      expect(res.error).toBe("Only allowed during Battle!");
      expect(hero.zone).toBe(ZONES.HAND);
      expect(state.battlefield.length).toBe(0);
    });

    test("2. Angreifer: darf Heroes ins Kampffeld spielen, aber keine Evil Characters oder Evil Enhancements", () => {
      // Hero move -> valid
      const hero = new Card();
      hero.id = "hero_2";
      hero.Name = "Moses";
      hero.Type = CARD_TYPES.HERO;
      hero.Alignment = ALIGNMENTS.GOOD;
      hero.IsCharacter = true;
      hero.controllerId = "p1";
      hero.originalOwnerId = "p1";
      hero.zone = ZONES.HAND;
      attacker[ZONES.HAND].push(hero);
      cardLookup.set(hero.id, hero);

      const resHero = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, hero.id);
      expect(resHero.movedCards.length).toBe(1);
      expect(state.battlefield.length).toBe(1);
      expect(hero.zone).toBe(ZONES.BATTLEFIELD);

      // Evil Character -> forbidden for attacker
      const ec = new Card();
      ec.id = "ec_1";
      ec.Name = "Pharaoh";
      ec.Type = CARD_TYPES.EC;
      ec.Alignment = ALIGNMENTS.EVIL;
      ec.IsCharacter = true;
      ec.controllerId = "p1";
      ec.originalOwnerId = "p1";
      ec.zone = ZONES.HAND;
      attacker[ZONES.HAND].push(ec);
      cardLookup.set(ec.id, ec);

      const resEC = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ec.id);
      expect(resEC.movedCards.length).toBe(0);
      expect(resEC.error).toBe("Evil cards cannot attack!");
      expect(ec.zone).toBe(ZONES.HAND);

      // Evil Enhancement -> forbidden for attacker
      const ee = new Card();
      ee.id = "ee_1";
      ee.Name = "Balaam's Disobedience";
      ee.Type = CARD_TYPES.EE;
      ee.Alignment = ALIGNMENTS.EVIL;
      ee.IsEnhancement = true;
      ee.controllerId = "p1";
      ee.originalOwnerId = "p1";
      ee.zone = ZONES.HAND;
      attacker[ZONES.HAND].push(ee);
      cardLookup.set(ee.id, ee);

      const resEE = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ee.id);
      expect(resEE.movedCards.length).toBe(0);
      expect(resEE.error).toBe("Evil cards cannot attack!");
      expect(ee.zone).toBe(ZONES.HAND);
    });

    test("3. Verteidiger: darf Evil Characters ins Kampffeld spielen, aber keine Heroes oder Good Enhancements", () => {
      // Evil Character -> valid for blocker
      const ec = new Card();
      ec.id = "ec_def";
      ec.Name = "Goliath";
      ec.Type = CARD_TYPES.EC;
      ec.Alignment = ALIGNMENTS.EVIL;
      ec.IsCharacter = true;
      ec.controllerId = "p2";
      ec.originalOwnerId = "p2";
      ec.zone = ZONES.HAND;
      defender[ZONES.HAND].push(ec);
      cardLookup.set(ec.id, ec);

      const resEC = moveCard(defender, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ec.id);
      expect(resEC.movedCards.length).toBe(1);
      expect(state.battlefield.length).toBe(1);
      expect(ec.zone).toBe(ZONES.BATTLEFIELD);

      // Hero -> forbidden for defender
      const hero = new Card();
      hero.id = "hero_def";
      hero.Name = "Samson";
      hero.Type = CARD_TYPES.HERO;
      hero.Alignment = ALIGNMENTS.GOOD;
      hero.IsCharacter = true;
      hero.controllerId = "p2";
      hero.originalOwnerId = "p2";
      hero.zone = ZONES.HAND;
      defender[ZONES.HAND].push(hero);
      cardLookup.set(hero.id, hero);

      const resHero = moveCard(defender, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, hero.id);
      expect(resHero.movedCards.length).toBe(0);
      expect(resHero.error).toBe("Good cards cannot block!");
      expect(hero.zone).toBe(ZONES.HAND);

      // Good Enhancement -> forbidden for defender
      const ge = new Card();
      ge.id = "ge_def";
      ge.Name = "Sword of the Lord";
      ge.Type = CARD_TYPES.GE;
      ge.Alignment = ALIGNMENTS.GOOD;
      ge.IsEnhancement = true;
      ge.controllerId = "p2";
      ge.originalOwnerId = "p2";
      ge.zone = ZONES.HAND;
      defender[ZONES.HAND].push(ge);
      cardLookup.set(ge.id, ge);

      const resGE = moveCard(defender, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ge.id);
      expect(resGE.movedCards.length).toBe(0);
      expect(resGE.error).toBe("Good cards cannot block!");
      expect(ge.zone).toBe(ZONES.HAND);
    });

    test("4. Enhancement-Voraussetzung: Enhancements erfordern passenden Charakter mit matchender Brigade oder Multibrigade", () => {
      // Attacker plays Good Enhancement without a Hero in battlefield -> forbidden
      const ge = new Card();
      ge.id = "ge_atk";
      ge.Name = "Helmet of Salvation";
      ge.Type = CARD_TYPES.GE;
      ge.Alignment = ALIGNMENTS.GOOD;
      ge.Brigade = "Silver";
      ge.IsEnhancement = true;
      ge.controllerId = "p1";
      ge.originalOwnerId = "p1";
      ge.zone = ZONES.HAND;
      attacker[ZONES.HAND].push(ge);
      cardLookup.set(ge.id, ge);

      const resGEFail = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ge.id);
      expect(resGEFail.movedCards.length).toBe(0);
      expect(resGEFail.error).toBe("No Hero in battle!");

      // Put a Hero with non-matching Brigade ("Red") in battlefield for attacker
      const heroRed = new Card();
      heroRed.id = "hero_red";
      heroRed.Name = "David the Musician";
      heroRed.Type = CARD_TYPES.HERO;
      heroRed.Alignment = ALIGNMENTS.GOOD;
      heroRed.Brigade = "Red";
      heroRed.IsCharacter = true;
      heroRed.controllerId = "p1";
      heroRed.originalOwnerId = "p1";
      heroRed.zone = ZONES.BATTLEFIELD;
      state.battlefield.push(heroRed);
      cardLookup.set(heroRed.id, heroRed);

      // Silver GE fails because Hero has Red brigade (no match)
      const resGEMismatch = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ge.id);
      expect(resGEMismatch.movedCards.length).toBe(0);
      expect(resGEMismatch.error).toBe("Brigade mismatch!");

      // Put a Hero with matching Brigade ("Silver") in battlefield
      const heroSilver = new Card();
      heroSilver.id = "hero_silver";
      heroSilver.Name = "Archangel Michael";
      heroSilver.Type = CARD_TYPES.HERO;
      heroSilver.Alignment = ALIGNMENTS.GOOD;
      heroSilver.Brigade = "Silver";
      heroSilver.IsCharacter = true;
      heroSilver.controllerId = "p1";
      heroSilver.originalOwnerId = "p1";
      heroSilver.zone = ZONES.BATTLEFIELD;
      state.battlefield.push(heroSilver);
      cardLookup.set(heroSilver.id, heroSilver);

      // Silver GE succeeds with Silver Hero in battlefield
      const resGESuccess = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ge.id);
      expect(resGESuccess.movedCards.length).toBe(1);
      expect(ge.zone).toBe(ZONES.BATTLEFIELD);

      // Multibrigade GE ("Blue/Purple") succeeds even if hero only matches one brigade or is multibrigade
      const geMulti = new Card();
      geMulti.id = "ge_multi";
      geMulti.Name = "Shield of Faith";
      geMulti.Type = CARD_TYPES.GE;
      geMulti.Alignment = ALIGNMENTS.GOOD;
      geMulti.Brigade = "Blue/Purple";
      geMulti.IsEnhancement = true;
      geMulti.controllerId = "p1";
      geMulti.originalOwnerId = "p1";
      geMulti.zone = ZONES.HAND;
      attacker[ZONES.HAND].push(geMulti);
      cardLookup.set(geMulti.id, geMulti);

      const resGEMultiSuccess = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, geMulti.id);
      expect(resGEMultiSuccess.movedCards.length).toBe(1);
      expect(geMulti.zone).toBe(ZONES.BATTLEFIELD);
    });

    test("5. Undo-Kompatibilität: options.isUndo === true umgeht Kampf-Regelpruefungen", () => {
      // Phase ist NICHT Battle
      state.currentPhase = PHASES.DISCARD;
      const hero = new Card();
      hero.id = "hero_undo";
      hero.Name = "Gideon";
      hero.Type = CARD_TYPES.HERO;
      hero.Alignment = ALIGNMENTS.GOOD;
      hero.IsCharacter = true;
      hero.controllerId = "p1";
      hero.originalOwnerId = "p1";
      hero.zone = ZONES.BATTLEFIELD;
      state.battlefield.push(hero);
      cardLookup.set(hero.id, hero);

      // Undo movement back to hand must succeed despite phase lock
      const undoRes = moveCard(attacker, state, cardLookup, ZONES.BATTLEFIELD, ZONES.HAND, hero.id, 1, null, "", "", { isUndo: true });
      expect(undoRes.movedCards.length).toBe(1);
      expect(hero.zone).toBe(ZONES.HAND);
      expect(attacker[ZONES.HAND].length).toBe(1);
    });

    test("6. Banding mit gegnerischen Charakteren ins Kampffeld ist erlaubt", () => {
      // Opponent Hero in defender's territory
      const opponentHero = new Card();
      opponentHero.id = "c_opp_hero";
      opponentHero.Name = "Opponent Hero";
      opponentHero.Type = CARD_TYPES.HERO;
      opponentHero.Alignment = ALIGNMENTS.GOOD;
      opponentHero.IsCharacter = true;
      opponentHero.controllerId = "p2";
      opponentHero.originalOwnerId = "p2";
      opponentHero.zone = ZONES.TERRITORY;
      defender[ZONES.TERRITORY].push(opponentHero);
      cardLookup.set(opponentHero.id, opponentHero);

      // Attacker p1 bands with opponent Hero and brings it into battlefield
      const resBanding = moveCard(attacker, state, cardLookup, ZONES.TERRITORY, ZONES.BATTLEFIELD, opponentHero.id);
      expect(resBanding.movedCards.length).toBe(1);
      expect(resBanding.error).toBeUndefined();
      expect(opponentHero.zone).toBe(ZONES.BATTLEFIELD);
      expect(opponentHero.controllerId).toBe("p1"); // Controller becomes attacker in battle

      // But attacker cannot bring an opponent's Evil Character into battle on attacker's side
      const opponentEC = new Card();
      opponentEC.id = "c_opp_ec";
      opponentEC.Name = "Opponent EC";
      opponentEC.Type = CARD_TYPES.EC;
      opponentEC.Alignment = ALIGNMENTS.EVIL;
      opponentEC.IsCharacter = true;
      opponentEC.controllerId = "p2";
      opponentEC.originalOwnerId = "p2";
      opponentEC.zone = ZONES.TERRITORY;
      defender[ZONES.TERRITORY].push(opponentEC);
      cardLookup.set(opponentEC.id, opponentEC);

      const resECFail = moveCard(attacker, state, cardLookup, ZONES.TERRITORY, ZONES.BATTLEFIELD, opponentEC.id);
      expect(resECFail.movedCards.length).toBe(0);
      expect(resECFail.error).toBe("Evil cards cannot attack!");
    });

    test("6. MoveCardCommand sends gameToast and cardMoveFailed when defender plays hero into battle", () => {
      const { MoveCardCommand } = require("../src/commands/MoveCardCommand");
      const hero = new Card();
      hero.id = "hero_amminadab";
      hero.Name = "Amminadab, the Generous";
      hero.Type = CARD_TYPES.HERO;
      hero.Alignment = ALIGNMENTS.GOOD;
      hero.IsCharacter = true;
      hero.controllerId = "p2";
      hero.originalOwnerId = "p2";
      hero.zone = ZONES.TERRITORY;
      defender[ZONES.TERRITORY].push(hero);
      cardLookup.set(hero.id, hero);

      const client2 = {
        sessionId: "p2",
        send: jest.fn(),
      };
      const room = {
        roomId: "test_room",
        state,
        cardLookup,
        broadcastGameLog: jest.fn(),
      };

      const cmd = new MoveCardCommand(room, client2);
      cmd.execute({
        from: ZONES.TERRITORY,
        to: ZONES.BATTLEFIELD,
        cardId: hero.id,
      });

      expect(cmd.canUndo).toBe(false);
      expect(client2.send).toHaveBeenCalledWith("gameToast", {
        message: "Good cards cannot block!",
        type: "warning",
      });
      expect(client2.send).toHaveBeenCalledWith("cardMoveFailed", {
        cardId: "hero_amminadab",
        from: ZONES.TERRITORY,
        to: ZONES.BATTLEFIELD,
        error: "Good cards cannot block!",
      });
      expect(hero.zone).toBe(ZONES.TERRITORY);
    });

    test("7. Attacker playing dual GE/EE card with inGameType=GE and inGameAlignment=Good succeeds", () => {
      // Setup hero in battle with matching Green brigade
      const hero = new Card();
      hero.id = "hero_green";
      hero.Name = "Green Hero";
      hero.Type = CARD_TYPES.HERO;
      hero.Alignment = ALIGNMENTS.GOOD;
      hero.Brigade = "Green";
      hero.IsCharacter = true;
      hero.controllerId = "p1";
      hero.originalOwnerId = "p1";
      hero.zone = ZONES.BATTLEFIELD;
      state.battlefield.push(hero);
      cardLookup.set(hero.id, hero);

      // Setup dual GE/EE card in hand
      const dualCard = new Card();
      dualCard.id = "c_abandoned";
      dualCard.Name = "Abandoned";
      dualCard.Type = "GE/EE";
      dualCard.Alignment = "Good/Evil";
      dualCard.Brigade = "Green/Purple/Pale Green";
      dualCard.IsEnhancement = true;
      dualCard.sides = [
        { Type: "GE", Alignment: "Good", Brigade: ["Green", "Purple"] },
        { Type: "EE", Alignment: "Evil", Brigade: ["Pale Green"] },
      ];
      dualCard.controllerId = "p1";
      dualCard.originalOwnerId = "p1";
      dualCard.zone = ZONES.HAND;
      attacker[ZONES.HAND].push(dualCard);
      cardLookup.set(dualCard.id, dualCard);

      // Attempting to play as Evil Enhancement when attacking fails
      const resEvilFail = moveCard(
        attacker,
        state,
        cardLookup,
        ZONES.HAND,
        ZONES.BATTLEFIELD,
        dualCard.id,
        1,
        null,
        "EE",
        "Evil"
      );
      expect(resEvilFail.movedCards.length).toBe(0);
      expect(resEvilFail.error).toBe("Evil cards cannot attack!");

      // Playing as Good Enhancement succeeds!
      const resGoodSuccess = moveCard(
        attacker,
        state,
        cardLookup,
        ZONES.HAND,
        ZONES.BATTLEFIELD,
        dualCard.id,
        1,
        null,
        "GE",
        "Good"
      );
      expect(resGoodSuccess.movedCards.length).toBe(1);
      expect(dualCard.zone).toBe(ZONES.BATTLEFIELD);
      expect(dualCard.inGameType).toBe("GE");
      expect(dualCard.inGameAlignment).toBe("Good");
    });

    test("8. Defender playing dual GE/EE card with inGameType=EE and inGameAlignment=Evil succeeds", () => {
      // Setup evil character in battle with matching Pale Green brigade
      const ec = new Card();
      ec.id = "ec_palegreen";
      ec.Name = "Pale Green EC";
      ec.Type = CARD_TYPES.EC;
      ec.Alignment = ALIGNMENTS.EVIL;
      ec.Brigade = "Pale Green";
      ec.IsCharacter = true;
      ec.controllerId = "p2";
      ec.originalOwnerId = "p2";
      ec.zone = ZONES.BATTLEFIELD;
      state.battlefield.push(ec);
      cardLookup.set(ec.id, ec);

      // Setup dual GE/EE card in defender's hand
      const dualCard = new Card();
      dualCard.id = "c_abandoned_def";
      dualCard.Name = "Abandoned";
      dualCard.Type = "GE/EE";
      dualCard.Alignment = "Good/Evil";
      dualCard.Brigade = "Green/Purple/Pale Green";
      dualCard.IsEnhancement = true;
      dualCard.sides = [
        { Type: "GE", Alignment: "Good", Brigade: ["Green", "Purple"] },
        { Type: "EE", Alignment: "Evil", Brigade: ["Pale Green"] },
      ];
      dualCard.controllerId = "p2";
      dualCard.originalOwnerId = "p2";
      dualCard.zone = ZONES.HAND;
      defender[ZONES.HAND].push(dualCard);
      cardLookup.set(dualCard.id, dualCard);

      // Attempting to play as Good Enhancement when blocking fails
      const resGoodFail = moveCard(
        defender,
        state,
        cardLookup,
        ZONES.HAND,
        ZONES.BATTLEFIELD,
        dualCard.id,
        1,
        null,
        "GE",
        "Good"
      );
      expect(resGoodFail.movedCards.length).toBe(0);
      expect(resGoodFail.error).toBe("Good cards cannot block!");

      // Playing as Evil Enhancement succeeds!
      const resEvilSuccess = moveCard(
        defender,
        state,
        cardLookup,
        ZONES.HAND,
        ZONES.BATTLEFIELD,
        dualCard.id,
        1,
        null,
        "EE",
        "Evil"
      );
      expect(resEvilSuccess.movedCards.length).toBe(1);
      expect(dualCard.zone).toBe(ZONES.BATTLEFIELD);
      expect(dualCard.inGameType).toBe("EE");
      expect(dualCard.inGameAlignment).toBe("Evil");
    });
  });

  describe("Arena Mode (_validateMove bypasses Combat Guards)", () => {
    let attacker;
    let defender;

    beforeEach(() => {
      attacker = new PlayerState();
      attacker.sessionId = "p1";
      attacker.name = "Attacking Player";

      defender = new PlayerState();
      defender.sessionId = "p2";
      defender.name = "Defending Player";

      state = new RoomState();
      state.isArenaMode = true; // ✨ Arena Mode aktiviert
      state.players.set("p1", attacker);
      state.players.set("p2", defender);
      state.activePlayer = "p1";
      state.currentPhase = PHASES.PREP; // NICHT Battle Phase!
      cardLookup = new Map();
    });

    test("1. Erlaubt Kartenbewegung ins Kampffeld außerhalb der Battle-Phase", () => {
      const hero = new Card();
      hero.id = "sb_hero";
      hero.Name = "David";
      hero.Type = CARD_TYPES.HERO;
      hero.Alignment = ALIGNMENTS.GOOD;
      hero.IsCharacter = true;
      hero.controllerId = "p1";
      hero.originalOwnerId = "p1";
      hero.zone = ZONES.HAND;
      attacker[ZONES.HAND].push(hero);
      cardLookup.set(hero.id, hero);

      const res = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, hero.id);
      expect(res.movedCards.length).toBe(1);
      expect(res.error).toBeUndefined();
      expect(hero.zone).toBe(ZONES.BATTLEFIELD);
    });

    test("2. Erlaubt dem Angreifer Evil Characters und Evil Enhancements im Kampffeld", () => {
      const evilChar = new Card();
      evilChar.id = "sb_ec";
      evilChar.Name = "Goliath";
      evilChar.Type = CARD_TYPES.EC;
      evilChar.Alignment = ALIGNMENTS.EVIL;
      evilChar.IsCharacter = true;
      evilChar.controllerId = "p1";
      evilChar.originalOwnerId = "p1";
      evilChar.zone = ZONES.HAND;
      attacker[ZONES.HAND].push(evilChar);
      cardLookup.set(evilChar.id, evilChar);

      const res = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, evilChar.id);
      expect(res.movedCards.length).toBe(1);
      expect(res.error).toBeUndefined();
      expect(evilChar.zone).toBe(ZONES.BATTLEFIELD);
    });

    test("3. Erlaubt Enhancements ohne Charakter oder ohne passende Brigade im Kampffeld", () => {
      const ge = new Card();
      ge.id = "sb_ge";
      ge.Name = "Sword of the Spirit";
      ge.Type = CARD_TYPES.GE;
      ge.Alignment = ALIGNMENTS.GOOD;
      ge.Brigade = "Silver";
      ge.IsEnhancement = true;
      ge.controllerId = "p1";
      ge.originalOwnerId = "p1";
      ge.zone = ZONES.HAND;
      attacker[ZONES.HAND].push(ge);
      cardLookup.set(ge.id, ge);

      // Kein Hero im Kampffeld vorhanden!
      expect(state.battlefield.length).toBe(0);

      const res = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.BATTLEFIELD, ge.id);
      expect(res.movedCards.length).toBe(1);
      expect(res.error).toBeUndefined();
      expect(ge.zone).toBe(ZONES.BATTLEFIELD);
    });

    test("4. Schützt weiterhin gegen das Ablegen in gegnerische Piles", () => {
      const card = new Card();
      card.id = "c_stolen";
      card.Name = "My Card";
      card.controllerId = "p1";
      card.originalOwnerId = "p1";
      card.zone = ZONES.HAND;
      attacker[ZONES.HAND].push(card);
      cardLookup.set(card.id, card);

      // Versuch, die eigene Karte in den gegnerischen Discard-Pile zu legen via coords.targetPlayerId
      const res = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.DISCARD, card.id, 1, { targetPlayerId: "p2" });
      expect(res.movedCards.length).toBe(0);
      expect(res.error).toBe("Cannot move cards to opponent's pile!");
    });

    test("5. Schützt weiterhin Lost Soul Zonenregeln, Reserve Runde 1 und Handlimit", () => {
      // 5a. Lost Soul Zonen-Regel (Lost Soul darf nicht ins Territory gelegt werden)
      const ls = new Card();
      ls.id = "sb_ls";
      ls.Name = "Lost Soul (Hopper)";
      ls.Type = CARD_TYPES.LOST_SOUL;
      ls.controllerId = "p1";
      ls.originalOwnerId = "p1";
      ls.zone = ZONES.HAND;
      attacker[ZONES.HAND].push(ls);
      cardLookup.set(ls.id, ls);

      const resLS = moveCard(attacker, state, cardLookup, ZONES.HAND, ZONES.TERRITORY, ls.id);
      expect(resLS.movedCards.length).toBe(0);
      expect(resLS.error).toBe("Invalid move for Lost Soul!");

      // 5b. Handlimit Check (MAX_HAND_SIZE = 16)
      attacker[ZONES.HAND] = new Array(16).fill(null).map((_, i) => {
        const dummy = new Card();
        dummy.id = `dummy_${i}`;
        dummy.controllerId = "p1";
        dummy.originalOwnerId = "p1";
        return dummy;
      });

      const extraCard = new Card();
      extraCard.id = "extra_c";
      extraCard.controllerId = "p1";
      extraCard.originalOwnerId = "p1";
      extraCard.zone = ZONES.TERRITORY;
      attacker[ZONES.TERRITORY].push(extraCard);
      cardLookup.set(extraCard.id, extraCard);

      const resHandLimit = moveCard(attacker, state, cardLookup, ZONES.TERRITORY, ZONES.HAND, extraCard.id);
      expect(resHandLimit.movedCards.length).toBe(0);
      expect(resHandLimit.error).toContain("Hand limit reached");

      // 5c. Reserve Runde 1 Check
      attacker[ZONES.HAND] = [];
      state.round = 1;
      const resReserve = new Card();
      resReserve.id = "res_card";
      resReserve.controllerId = "p1";
      resReserve.originalOwnerId = "p1";
      resReserve.zone = ZONES.RESERVE;
      attacker[ZONES.RESERVE].push(resReserve);
      cardLookup.set(resReserve.id, resReserve);

      const resReserveFail = moveCard(attacker, state, cardLookup, ZONES.RESERVE, ZONES.HAND, resReserve.id);
      expect(resReserveFail.movedCards.length).toBe(0);
      expect(resReserveFail.error).toBe("Cannot take cards from Reserve in Round 1!");
    });
  });
});




