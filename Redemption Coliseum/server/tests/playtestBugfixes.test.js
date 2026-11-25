// server/tests/playtestBugfixes.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { MoveCardCommand } = require("../src/commands/MoveCardCommand");
const { RespondOptionalAbilityCommand } = require("../src/commands/RespondOptionalAbilityCommand");
const { SelectTargetCommand } = require("../src/commands/SelectTargetCommand");
const { SubmitDrawSequenceCommand } = require("../src/commands/SubmitDrawSequenceCommand");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { AbilityLookup } = require("../src/ast/AbilityLookup");
const { TargetSelectionService } = require("../src/ast/TargetSelectionService");
const { EffectLabelFormatter } = require("../src/ast/EffectLabelFormatter");
const { BandHandler } = require("../src/ast/handlers/BandHandler");
const { CardRepository } = require("../../shared/CardRepository");
const { cardDatabase } = require("../src/data/cardDatabase");
const { ZONES } = require("../../shared/zones");
const { PHASES, DRAW_STEPS } = require("../../shared/phases");
const { AST_MESSAGES, AST_ACTIONS } = require("../../shared/astConstants");

describe("Playtest Bugfixes Regression Suite", () => {
  let room;
  let state;
  let p1;
  let p2;
  let client1;
  let client2;

  beforeAll(() => {
    if (!CardRepository.isInitialized) {
      CardRepository.initialize(cardDatabase);
    }
  });

  beforeEach(() => {
    state = new RoomState();
    state.round = 2;
    p1 = Object.assign(new PlayerState(), { sessionId: "p1", name: "Player 1", turn: 2 });
    p2 = Object.assign(new PlayerState(), { sessionId: "p2", name: "Player 2", turn: 2 });
    state.players.set("p1", p1);
    state.players.set("p2", p2);
    state.activePlayer = "p1";
    state.currentPhase = PHASES.BATTLE;

    client1 = { sessionId: "p1", send: jest.fn() };
    client2 = { sessionId: "p2", send: jest.fn() };

    room = {
      roomId: "playtest-bugfix-room",
      state,
      clients: [client1, client2],
      cardLookup: new Map(),
      broadcastGameLog: jest.fn(),
      broadcast: jest.fn(),
      _turnPlayedEnhancements: {},
    };
    room.abilityResolver = new AbilityResolver(room);
  });

  function createCard(id, templateId, name, zone, ownerId, extra = {}) {
    const dbCard = CardRepository.getById(String(templateId));
    const baseData = dbCard
      ? {
          Brigade: Array.isArray(dbCard.Brigade) ? dbCard.Brigade.join("/") : (dbCard.Brigade || ""),
          Type: Array.isArray(dbCard.Type) ? dbCard.Type.join("/") : (dbCard.Type || ""),
          Alignment: Array.isArray(dbCard.Alignment) ? dbCard.Alignment.join("/") : (dbCard.Alignment || ""),
          Class: Array.isArray(dbCard.Class) ? dbCard.Class.join("/") : (dbCard.Class || ""),
          Identifier: dbCard.Identifier || "",
          SpecialAbility: dbCard.SpecialAbility || "",
          IsCharacter: Boolean(dbCard.IsCharacter),
          IsEnhancement: Boolean(dbCard.IsEnhancement),
          IsStarCard: Boolean(dbCard.IsStarCard),
        }
      : {};
    const card = Object.assign(new Card(), baseData, {
      id,
      templateId: String(templateId),
      Name: name,
      ImageFile: `${templateId}_art`,
      zone,
      ownerId,
      originalOwnerId: ownerId,
      controllerId: ownerId,
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

  describe("Bug 1: Elhanan (1501337366) two-step zone_owner='either' pile search", () => {
    test("prompts player to choose which Reserve first when both Reserves are non-empty, searches only that Reserve, and supports Undo", () => {
      const myEvil = createCard("my_ec_res", "203", "My Evil Reserve", ZONES.RESERVE, "p1", { Type: "Evil Character", Alignment: "Evil", IsCharacter: true });
      createCard("opp_ec_res", "204", "Opp Evil Reserve", ZONES.RESERVE, "p2", { Type: "Evil Character", Alignment: "Evil", IsCharacter: true });
      createCard("ec_giant", "205", "Giant Foe", ZONES.BATTLEFIELD, "p2", { Type: "Evil Character", Alignment: "Evil", IsCharacter: true, Identifier: "Giant" });
      const elhanan = createCard("el1", "1501337366", "Elhanan, Son of Dodo [RR2]", ZONES.HAND, "p1", { Type: "Hero", Alignment: "Good", IsCharacter: true });

      state.battle.initiativePlayerId = "p1";
      new MoveCardCommand(room, client1).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: elhanan.id });

      client1.send.mockClear();
      new RespondOptionalAbilityCommand(room, client1).execute({
        itemId: state.effectChronicle.items[0].id,
        accepted: true,
        chosenAbilityId: "elhanan_discard_reserve",
      });

      // Step 1: Must ask player which player's Reserve to search
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({
          abilityId: "elhanan_discard_reserve",
          targetType: "pile",
          eligiblePiles: [
            expect.objectContaining({ id: "p1:reserve", ownerId: "p1", zone: ZONES.RESERVE }),
            expect.objectContaining({ id: "p2:reserve", ownerId: "p2", zone: ZONES.RESERVE }),
          ],
        })
      );

      // Step 1 submission: Player picks own Reserve -> opens ONLY p1:reserve
      client1.send.mockClear();
      const selectCmdStep1 = new SelectTargetCommand(room, client1);
      selectCmdStep1.execute({
        itemId: state.effectChronicle.items[0].id,
        abilityId: "elhanan_discard_reserve",
        selectedPileId: "p1:reserve",
      });
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({
          targetType: "card",
          isPileTarget: true,
          searchedPiles: ["p1:reserve"],
          eligibleCardIds: [myEvil.id],
        })
      );

      // Undo Step 1 restores _selectedPileId="" and re-prompts pile selection
      client1.send.mockClear();
      selectCmdStep1.undo();
      expect(state.effectChronicle.items[0]._selectedPileId || "").toBe("");
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({ targetType: "pile", eligiblePiles: expect.any(Array) })
      );

      // Re-pick p1:reserve and discard myEvil -> advances to elhanan_discard_giant
      new SelectTargetCommand(room, client1).execute({ itemId: state.effectChronicle.items[0].id, abilityId: "elhanan_discard_reserve", selectedPileId: "p1:reserve" });
      new SelectTargetCommand(room, client1).execute({ itemId: state.effectChronicle.items[0].id, abilityId: "elhanan_discard_reserve", selectedCardIds: [myEvil.id] });
      expect(room.cardLookup.get(myEvil.id).zone).toBe(ZONES.DISCARD);
      expect(state.effectChronicle.items[0].abilityId).toBe("elhanan_discard_giant");
    });

    test("opens read-only view when chosen Reserve has only non-matching cards and cleanly advances on close", () => {
      createCard("my_ec_res", "203", "My Evil Reserve", ZONES.RESERVE, "p1", { Type: "Evil Character", Alignment: "Evil", IsCharacter: true });
      createCard("opp_good_res", "206", "Opp Good Reserve", ZONES.RESERVE, "p2", { Type: "Hero", Alignment: "Good", IsCharacter: true });
      createCard("ec_giant", "205", "Giant Foe", ZONES.BATTLEFIELD, "p2", { Type: "Evil Character", Alignment: "Evil", IsCharacter: true, Identifier: "Giant" });
      const elhanan = createCard("el1", "1501337366", "Elhanan, Son of Dodo [RR2]", ZONES.HAND, "p1", { Type: "Hero", Alignment: "Good", IsCharacter: true });

      new MoveCardCommand(room, client1).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: elhanan.id });
      new RespondOptionalAbilityCommand(room, client1).execute({ itemId: state.effectChronicle.items[0].id, accepted: true, chosenAbilityId: "elhanan_discard_reserve" });

      client1.send.mockClear();
      new SelectTargetCommand(room, client1).execute({ itemId: state.effectChronicle.items[0].id, abilityId: "elhanan_discard_reserve", selectedPileId: "p2:reserve" });
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({ searchedPiles: ["p2:reserve"], eligibleCardIds: [], minTargets: 0, maxTargets: 0, canCancel: true })
      );

      new SelectTargetCommand(room, client1).execute({ itemId: state.effectChronicle.items[0].id, abilityId: "elhanan_discard_reserve", cancelled: true });
      expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual(["elhanan_discard_giant"]);
    });

    test("equipped Elhanan choosing deck prompts both decks and searches selected opponent deck", () => {
      createCard("wpn1", "210", "Iron Sword", ZONES.TERRITORY, "p1", { Type: "GE", Alignment: "Good", Class: "Weapon", IsEnhancement: true });
      createCard("p1_deck_good", "211", "Good Deck Card", ZONES.DECK, "p1", { Type: "Hero", Alignment: "Good", IsCharacter: true });
      const p2DeckEvil = createCard("p2_deck_evil", "212", "Opp Evil Deck Card", ZONES.DECK, "p2", { Type: "Evil Character", Alignment: "Evil", IsCharacter: true });
      const elhanan = createCard("el1", "1501337366", "Elhanan, Son of Dodo [RR2]", ZONES.HAND, "p1", { Type: "Hero", Alignment: "Good", IsCharacter: true });

      new MoveCardCommand(room, client1).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: elhanan.id });
      client1.send.mockClear();
      new RespondOptionalAbilityCommand(room, client1).execute({ itemId: state.effectChronicle.items[0].id, accepted: true, chosenAbilityId: "elhanan_discard_deck_if_equipped" });

      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({
          targetType: "pile",
          eligiblePiles: [
            expect.objectContaining({ id: "p1:deck", zone: ZONES.DECK }),
            expect.objectContaining({ id: "p2:deck", zone: ZONES.DECK }),
          ],
        })
      );

      client1.send.mockClear();
      new SelectTargetCommand(room, client1).execute({ itemId: state.effectChronicle.items[0].id, abilityId: "elhanan_discard_deck_if_equipped", selectedPileId: "p2:deck" });
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({ targetType: "card", searchedPiles: ["p2:deck"], eligibleCardIds: [p2DeckEvil.id] })
      );

      new SelectTargetCommand(room, client1).execute({ itemId: state.effectChronicle.items[0].id, abilityId: "elhanan_discard_deck_if_equipped", selectedCardIds: [p2DeckEvil.id] });
      expect(room.cardLookup.get(p2DeckEvil.id).zone).toBe(ZONES.DISCARD);
    });

    test("Round 1 Elhanan reserve labels '(Round 1 - View Only)' and opens opponent Reserve read-only", () => {
      state.round = 1;
      createCard("opp_ec_res", "204", "Opp Evil Reserve", ZONES.RESERVE, "p2", { Type: "Evil Character", Alignment: "Evil", IsCharacter: true });
      const elhanan = createCard("el1", "1501337366", "Elhanan, Son of Dodo [RR2]", ZONES.HAND, "p1", { Type: "Hero", Alignment: "Good", IsCharacter: true });

      client1.send.mockClear();
      new MoveCardCommand(room, client1).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: elhanan.id });
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({
          choices: expect.arrayContaining([
            expect.objectContaining({ abilityId: "elhanan_discard_reserve", disabled: false, label: expect.stringContaining("(Round 1 - View Only)") }),
          ]),
        })
      );

      client1.send.mockClear();
      new RespondOptionalAbilityCommand(room, client1).execute({ itemId: state.effectChronicle.items[0].id, accepted: true, chosenAbilityId: "elhanan_discard_reserve" });
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_TARGET_SELECTION,
        expect.objectContaining({ searchedPiles: ["p2:reserve"], minTargets: 0, maxTargets: 0, canCancel: true })
      );
    });
  });

  describe("Bug 2: Optional discard promptText uses target phrase", () => {
    test("Elhanan giant discard emits 'Discard evil giant?' and EffectLabelFormatter handles generic, plural, and all", () => {
      createCard("my_ec_res", "203", "My Evil Reserve", ZONES.RESERVE, "p1", { Type: "Evil Character", Alignment: "Evil", IsCharacter: true });
      createCard("ec_giant", "205", "Giant Foe", ZONES.BATTLEFIELD, "p2", { Type: "Evil Character", Alignment: "Evil", IsCharacter: true, Identifier: "Giant" });
      const elhanan = createCard("el1", "1501337366", "Elhanan, Son of Dodo [RR2]", ZONES.HAND, "p1", { Type: "Hero", Alignment: "Good", IsCharacter: true });
      new MoveCardCommand(room, client1).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: elhanan.id });

      client1.send.mockClear();
      new RespondOptionalAbilityCommand(room, client1).execute({ itemId: state.effectChronicle.items[0].id, accepted: false });
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({
          abilityId: "elhanan_discard_giant",
          promptText: "Discard evil giant?",
          choices: [expect.objectContaining({ label: "Discard evil giant" })],
        })
      );

      expect(EffectLabelFormatter.formatOptionalPromptText({ action: AST_ACTIONS.DISCARD, target: { target_type: "card", count: { fixed_value: 1 } } })).toBe("Discard 1 card?");
      expect(EffectLabelFormatter.formatOptionalPromptText({ action: AST_ACTIONS.DISCARD, target: { target_type: "evil_character", count: { fixed_value: 2 } } })).toBe("Discard 2 evil characters?");
      expect(EffectLabelFormatter.formatOptionalPromptText({ action: AST_ACTIONS.DISCARD, target: { target_type: "evil_character", alignment: "evil", identifiers: ["Giant"], count: { fixed_value: "all" } } })).toBe("Discard all evil giants?");
    });
  });

  describe("Bug 3: A Royal Priesthood (1553336041) matches Herod's Temple (1411151281) & Temples", () => {
    test("Round 2 Star Ability enables Reserve option for Herod's Temple (GoC) and topdecks it", () => {
      state.currentPhase = PHASES.DRAW;
      state.drawStep = DRAW_STEPS.ACTIVE_STARS;
      state.priorityPlayerId = "p1";

      const rp = createCard("rp1", "1553336041", "A Royal Priesthood", ZONES.HAND, "p1", { IsStarCard: true });
      const ht = createCard("ht1", "1411151281", "Herod's Temple (GoC)", ZONES.RESERVE, "p1");
      createCard("deck_fill", "200", "Generic Hero", ZONES.DECK, "p1", { Type: "Hero", Alignment: "Good" });

      new SubmitDrawSequenceCommand(room, client1).execute({ step: DRAW_STEPS.ACTIVE_STARS, orderedCardIds: [rp.id] });

      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({
          action: "choose",
          choices: [
            expect.objectContaining({ abilityId: "star_topdeck_from_deck", disabled: true, label: "Topdeck The Tabernacle or temple from deck (No valid targets)" }),
            expect.objectContaining({ abilityId: "star_topdeck_from_reserve", disabled: false, label: "Topdeck The Tabernacle or temple from reserve" }),
          ],
        })
      );

      new RespondOptionalAbilityCommand(room, client1).execute({ itemId: state.effectChronicle.items[0].id, accepted: true, chosenAbilityId: "star_topdeck_from_reserve" });
      new SelectTargetCommand(room, client1).execute({ itemId: state.effectChronicle.items[0].id, abilityId: "star_topdeck_from_reserve", selectedCardIds: [ht.id] });
      expect(p1.deck[0].id).toBe(ht.id);

      // With both The Tabernacle in Deck and another Herod's Temple in Reserve, both options are enabled
      state.drawStep = DRAW_STEPS.ACTIVE_STARS;
      state.priorityPlayerId = "p1";
      createCard("rp2", "1553336041", "A Royal Priesthood", ZONES.HAND, "p1", { IsStarCard: true });
      createCard("tab_deck", "-2130586086", "The Tabernacle", ZONES.DECK, "p1", { Type: "Fortress", Alignment: "Good" });
      createCard("ht2", "1411151281", "Herod's Temple (GoC)", ZONES.RESERVE, "p1");
      client1.send.mockClear();
      new SubmitDrawSequenceCommand(room, client1).execute({ step: DRAW_STEPS.ACTIVE_STARS, orderedCardIds: ["rp2"] });
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({
          action: "choose",
          choices: [
            expect.objectContaining({ abilityId: "star_topdeck_from_deck", disabled: false }),
            expect.objectContaining({ abilityId: "star_topdeck_from_reserve", disabled: false }),
          ],
        })
      );
    });

    test("disjunctive matching accepts Temple Fortresses & The Tabernacle while rejecting Temple Artifacts, Temple Priests, and protecting Desecrate/Smashing Tablets", () => {
      const rpTarget = AbilityLookup.getCardLogic("1553336041").sides.top.abilities[2].effects[0].target;
      const tab = createCard("c_tab", "-2130586086", "The Tabernacle", ZONES.RESERVE, "p1", { Type: "Fortress", Alignment: "Good" });
      const herod = createCard("c_ht", "1411151281", "Herod's Temple (GoC)", ZONES.RESERVE, "p1");
      const herodSite = createCard("c_hts", "691417922", "Herod's Temple (G)", ZONES.RESERVE, "p1");
      const solomon = createCard("c_st", "-1454927819", "Solomon's Temple (Pa)", ZONES.RESERVE, "p1");
      const zerub = createCard("c_zt", "730431348", "Zerubbabel's Temple (LoC)", ZONES.RESERVE, "p1");
      const heaven = createCard("c_hvt", "-755815350", "Heavenly Temple (RoJ)", ZONES.RESERVE, "p1");
      const dagon = createCard("c_dagon", "-1125828096", "Temple of Dagon", ZONES.RESERVE, "p1");
      const altar = createCard("c_altar", "-1040635263", "Altar of Burnt Offering", ZONES.TERRITORY, "p1", { ORDIR: ["Temple Artifact"] });
      const priest = createCard("c_priest", "439012927", "Amariah the High Priest", ZONES.TERRITORY, "p1", { ORDIR: ["Temple Priest"] });

      [tab, herod, herodSite, solomon, zerub, heaven, dagon].forEach((c) => {
        expect(TargetSelectionService.matchesFilter(c, rpTarget, { actionType: AST_ACTIONS.TOPDECK })).toBe(true);
      });
      [altar, priest].forEach((c) => {
        expect(TargetSelectionService.matchesFilter(c, rpTarget, { actionType: AST_ACTIONS.TOPDECK })).toBe(false);
      });

      const fillingTempleArtTarget = AbilityLookup.getCardLogic("1622407641")
        .sides.top.abilities.find((a) => a.ability_id === "search_temple_artifact_discard")
        .effects[0].target;
      expect(TargetSelectionService.matchesFilter(altar, fillingTempleArtTarget, { actionType: AST_ACTIONS.SEARCH })).toBe(true);

      const desecrateTarget = AbilityLookup.getCardLogic("401121449").sides.top.abilities[0].effects[0].target;
      const goodTempleArtifact = createCard("c_temple_veil", "301", "Temple Veil", ZONES.TERRITORY, "p2", {
        Type: "Artifact",
        Alignment: "Good",
        ORDIR: ["Temple Artifact"],
      });
      expect(TargetSelectionService.matchesFilter(goodTempleArtifact, desecrateTarget, { actionType: AST_ACTIONS.DISCARD })).toBe(true);

      const smashTarget = AbilityLookup.getCardLogic("24285051").sides.top.abilities[0].effects[0].target;
      expect(TargetSelectionService.matchesFilter(altar, smashTarget, { actionType: AST_ACTIONS.BANISH })).toBe(false);
    });
  });

  describe("Bug 4: Abishai (-1777999383) bands dual-alignment Joab from Hand into Battle", () => {
    test("bands Joab (CoW AB) (684551618) from Hand with Hero/Good side and Asahel into Battlefield", () => {
      const abishai = createCard("ab1", "-1777999383", "Abishai (Wa)", ZONES.HAND, "p1", { Type: "Hero", Alignment: "Good", IsCharacter: true });
      const joab = createCard("j1", "684551618", "Joab (CoW AB)", ZONES.HAND, "p1", { inGameType: "", inGameAlignment: "", IsCharacter: true });
      const asahel = createCard("as1", "-1070093237", "Asahel", ZONES.HAND, "p1", { Type: "Hero", Alignment: "Good", IsCharacter: true });
      state.battle.initiativePlayerId = "p1";

      new MoveCardCommand(room, client1).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: abishai.id });
      expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual(["band_with_joab", "band_with_asahel"]);

      // Accept band_with_joab -> Joab moves to BATTLEFIELD and enqueues Joab's Hero abilities at head of chronicle
      new RespondOptionalAbilityCommand(room, client1).execute({ itemId: state.effectChronicle.items[0].id, accepted: true });
      const movedJoab = room.cardLookup.get("j1");
      expect(movedJoab.zone).toBe(ZONES.BATTLEFIELD);
      expect(movedJoab.inGameType).toBe("Hero");
      expect(movedJoab.inGameAlignment).toBe("Good");
      expect(movedJoab.isBanded).toBe(true);
      expect(p1.hand.length).toBe(1); // Only Asahel remains in Hand

      // Decline remaining Joab prompt(s) until Asahel prompt reaches front
      while (state.effectChronicle.items.length > 0 && state.effectChronicle.items[0].abilityId !== "band_with_asahel") {
        new RespondOptionalAbilityCommand(room, client1).execute({ itemId: state.effectChronicle.items[0].id, accepted: false });
      }
      new RespondOptionalAbilityCommand(room, client1).execute({ itemId: state.effectChronicle.items[0].id, accepted: true });

      const battleIds = Array.from(state.battlefield).map((c) => c.id);
      expect(battleIds).toEqual(expect.arrayContaining(["ab1", "j1", "as1"]));
    });

    test("paralyzed character whose moveCard validation fails is NOT treated as banded and does NOT trigger battle-entry abilities", () => {
      const abishai = createCard("ab1", "-1777999383", "Abishai (Wa)", ZONES.BATTLEFIELD, "p1", { Type: "Hero", Alignment: "Good", IsCharacter: true });
      const joab = createCard("j_para", "65394445", "Joab (Promo)", ZONES.TERRITORY, "p1", { Type: "Hero", Alignment: "Good", IsCharacter: true, isParalyzed: true });

      const res = BandHandler.execute({
        room,
        player: p1,
        effect: { action: AST_ACTIONS.BAND, target: { card_titles: ["Joab"] } },
        item: { id: "it_band_fail", cardId: abishai.id, controllerId: "p1", abilityId: "band_with_joab" },
        options: { targetCardIds: [joab.id] },
      });

      expect(res.success).toBe(true);
      expect(res.snapshot.bandedCards).toEqual([]);
      expect(joab.zone).toBe(ZONES.TERRITORY);
      expect(joab.isBanded).toBe(false);
      expect(state.effectChronicle.items.length).toBe(0);
    });
  });
});
