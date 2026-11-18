// server/tests/multiAbilityBattleEntry.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { MoveCardCommand } = require("../src/commands/MoveCardCommand");
const { RespondOptionalAbilityCommand } = require("../src/commands/RespondOptionalAbilityCommand");
const { SelectTargetCommand } = require("../src/commands/SelectTargetCommand");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { AbilityLookup } = require("../src/ast/AbilityLookup");
const { BattleTriggerService } = require("../src/services/BattleTriggerService");
const { CardRepository } = require("../../shared/CardRepository");
const { cardDatabase } = require("../src/data/cardDatabase");
const { ZONES } = require("../../shared/zones");
const { PHASES } = require("../../shared/phases");
const { AST_MESSAGES, AST_ACTIVATION_MODES } = require("../../shared/astConstants");
const { CHRONICLE_STATUS } = require("../../shared/effectChronicleConstants");

describe("Multi-Ability Battle Entry Resolution & Tabletop Fallbacks", () => {
  let room;
  let state;
  let p1;
  let p2;
  let client1;
  let client2;
  let registeredIds;

  beforeAll(() => {
    if (!CardRepository.isInitialized) {
      CardRepository.initialize(cardDatabase);
    }
  });

  beforeEach(() => {
    registeredIds = [];
    state = new RoomState();
    state.round = 2;
    p1 = Object.assign(new PlayerState(), { sessionId: "p1", name: "Hero Player" });
    p2 = Object.assign(new PlayerState(), { sessionId: "p2", name: "Evil Player" });
    state.players.set("p1", p1);
    state.players.set("p2", p2);
    state.activePlayer = "p1";
    state.currentPhase = PHASES.BATTLE;

    client1 = { sessionId: "p1", send: jest.fn() };
    client2 = { sessionId: "p2", send: jest.fn() };

    room = {
      roomId: "multi-ability-room",
      state,
      clients: [client1, client2],
      cardLookup: new Map(),
      broadcastGameLog: jest.fn(),
      broadcast: jest.fn(),
      _turnPlayedEnhancements: {},
    };
    room.abilityResolver = new AbilityResolver(room);
  });

  afterEach(() => {
    const logicMap = AbilityLookup._loadData();
    for (const id of registeredIds) {
      delete logicMap[id];
    }
  });

  function createCard(id, templateId, name, zone, ownerId, extra = {}) {
    const card = Object.assign(
      new Card(),
      {
        id,
        templateId,
        Name: name,
        ImageFile: `${templateId}_art`,
        zone,
        ownerId,
        originalOwnerId: ownerId,
        controllerId: ownerId,
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

  test("23236407 Legion of Angels executes static protect + draw, and also enqueues conditional dominant take when >= 2 ECs block", () => {
    const gospelHero = createCard("gh_1", "101", "Gospel Hero", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
      Identifier: "Gospel",
    });
    createCard("p1_deck_1", "102", "Deck Card", ZONES.DECK, "p1");
    const domCard = createCard("p1_dom_1", "103", "Son of God", ZONES.DECK, "p1", {
      Type: "Dominant",
      Alignment: "Good",
    });
    createCard("ec_1", "201", "Blocker 1", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });
    createCard("ec_2", "202", "Blocker 2", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });

    const legion = createCard("legion_1", "23236407", "Legion of Angels (GoC)", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
      Brigade: "Silver",
    });

    state.battle.initiativePlayerId = "p1";
    new MoveCardCommand(room, client1).execute({
      from: ZONES.TERRITORY,
      to: ZONES.BATTLEFIELD,
      cardId: legion.id,
    });

    // Static protect auto-executed silently; draw_x_limit_3 and take_good_dominant_from_deck remain queued
    expect(gospelHero.isProtected).toBe(true);
    expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual([
      "draw_x_limit_3",
      "take_good_dominant_from_deck",
    ]);
    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({ abilityId: "draw_x_limit_3" })
    );

    // Accept draw_x_limit_3 -> advances to take_good_dominant_from_deck prompt
    client1.send.mockClear();
    new RespondOptionalAbilityCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: true,
    });
    expect(p1.hand.length).toBe(1);
    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({ abilityId: "take_good_dominant_from_deck" })
    );

    // Accept take_good_dominant_from_deck -> requests target selection -> take Son of God
    new RespondOptionalAbilityCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: true,
    });
    new SelectTargetCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      abilityId: "take_good_dominant_from_deck",
      selectedCardIds: [domCard.id],
    });

    expect(p1.hand.map((c) => c.id)).toContain(domCard.id);
    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.effectChronicle.isResolving).toBe(false);

    // With only 1 blocking EC, take_good_dominant_from_deck must NOT be enqueued
    state.battlefield.splice(0, state.battlefield.length);
    createCard("ec_solo", "203", "Solo Blocker", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });
    const legion2 = createCard("legion_2", "23236407", "Legion 2", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });
    BattleTriggerService.handleCardBattleEntry(room, p1, legion2, { from: ZONES.TERRITORY, to: ZONES.BATTLEFIELD });
    expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual(["draw_x_limit_3"]);
  });

  test("111410953 Temple Spears and Shields applies static protect, bands Red Warrior, and bounces EC", () => {
    const royalPriest = createCard("h_royal_priest", "101", "Royal O.T. Priest", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero",
      Alignment: "Good",
      Brigade: "Red",
      Testament: "OT",
      Class: "Warrior",
      Identifier: "Royal, Priest",
      IsCharacter: true,
    });
    const redWarrior = createCard("h_red_war", "102", "Red Warrior Hero", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      Brigade: "Red",
      Class: "Warrior",
      IsCharacter: true,
    });
    const ec1 = createCard("ec_1", "201", "Enemy Guard 1", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });
    createCard("ec_2", "202", "Enemy Guard 2", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });

    const spears = createCard("spears_1", "111410953", "Temple Spears and Shields (LoC)", ZONES.HAND, "p1", {
      Type: "GE",
      Alignment: "Good",
      Brigade: "Red",
      IsEnhancement: true,
    });

    state.battle.initiativePlayerId = "p1";
    new MoveCardCommand(room, client1).execute({
      from: ZONES.HAND,
      to: ZONES.BATTLEFIELD,
      cardId: spears.id,
    });

    // Static protect applied to royalPriest; band & bounce queued in order
    expect(royalPriest.isProtected).toBe(true);
    expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual([
      "temple_spears_shields_band_red_warrior",
      "temple_spears_shields_bounce_ec",
    ]);

    // Accept band (auto-bands single eligible Red Warrior) -> advances to bounce prompt
    client1.send.mockClear();
    new RespondOptionalAbilityCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: true,
    });
    expect(room.cardLookup.get(redWarrior.id).zone).toBe(ZONES.BATTLEFIELD);
    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({ abilityId: "temple_spears_shields_bounce_ec" })
    );

    // Accept bounce -> select ec1 -> ec1 returns to p2 hand
    new RespondOptionalAbilityCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: true,
    });
    new SelectTargetCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      abilityId: "temple_spears_shields_bounce_ec",
      selectedCardIds: [ec1.id],
    });
    expect(room.cardLookup.get(ec1.id).zone).toBe(ZONES.HAND);
    expect(state.effectChronicle.items.length).toBe(0);
  });

  test("119893825 Malakh the Nameless keeps multi-pile choice_group unified as 1 modal before executing static protect", () => {
    const otDeckHero = createCard("h_deck", "102", "Moses", ZONES.DECK, "p1", {
      Type: "Hero",
      Alignment: "Good",
      Testament: "OT",
      IsCharacter: true,
    });
    createCard("h_res", "103", "Aaron", ZONES.RESERVE, "p1", {
      Type: "Hero",
      Alignment: "Good",
      Testament: "OT",
      IsCharacter: true,
    });

    const malakh = createCard("malakh_1", "119893825", "Malakh the Nameless [2023 - State]", ZONES.HAND, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
      Brigade: "Silver",
    });

    state.battle.initiativePlayerId = "p1";
    new MoveCardCommand(room, client1).execute({
      from: ZONES.HAND,
      to: ZONES.BATTLEFIELD,
      cardId: malakh.id,
    });

    // Choice group stays unified as 1 item (abilityId: ""), followed by ab_2_protect
    expect(state.effectChronicle.items.length).toBe(2);
    expect(state.effectChronicle.items[0].abilityId).toBe("");
    expect(state.effectChronicle.items[1].abilityId).toBe("ab_2_protect");

    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        action: "choose",
        choices: expect.arrayContaining([
          expect.objectContaining({ abilityId: "ab_1_take__scope_deck" }),
          expect.objectContaining({ abilityId: "ab_1_take__scope_reserve_pile" }),
        ]),
      })
    );

    // Choose deck option and pick otDeckHero -> ab_2_protect auto-executes next!
    new RespondOptionalAbilityCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: true,
      chosenAbilityId: "ab_1_take__scope_deck",
    });
    new SelectTargetCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      abilityId: "ab_1_take__scope_deck",
      selectedCardIds: [otDeckHero.id],
    });

    expect(p1.hand.map((c) => c.id)).toContain(otDeckHero.id);
    expect(room.cardLookup.get(malakh.id).isProtected).toBe(true);
    expect(state.effectChronicle.items.length).toBe(0);
  });

  test("100324668 Joanna executes discard + static immunity automatically and prompts tabletop fallback for negate", () => {
    const herodsDungeon = createCard("site_hd", "-810076672", "Herod's Dungeon", ZONES.TERRITORY, "p2", {
      Type: "Site",
      Alignment: "Evil",
    });
    createCard("ec_weak", "201", "Weak Demon", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
      Toughness: "2",
    });

    const joanna = createCard("joanna_1", "100324668", "Joanna (Di)", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
      Brigade: "Purple",
    });

    state.battle.initiativePlayerId = "p1";
    new MoveCardCommand(room, client1).execute({
      from: ZONES.TERRITORY,
      to: ZONES.BATTLEFIELD,
      cardId: joanna.id,
    });

    // discard_herods_dungeon and immune_to_herods auto-executed; negate_toughness_2_or_less awaits tabletop confirmation
    expect(room.cardLookup.get(herodsDungeon.id).zone).toBe(ZONES.DISCARD);
    expect(room.cardLookup.get(joanna.id).isImmune).toBe(true);
    expect(state.effectChronicle.items.length).toBe(1);
    expect(state.effectChronicle.items[0].abilityId).toBe("negate_toughness_2_or_less");
    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        abilityId: "negate_toughness_2_or_less",
        action: "negate",
        promptText: "Negate evil character?",
      })
    );

    new RespondOptionalAbilityCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: true,
    });
    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.effectChronicle.isResolving).toBe(false);
  });

  test("61588602 Nebuchadnezzar applies static protect and prompts tabletop capture only when opponent has board_advantage", () => {
    const heroInBattle = createCard("h_1", "101", "Attacking Hero", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
      Brigade: "Gold",
    });
    createCard("h_2", "102", "Territory Hero", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });

    const neb = createCard("neb_1", "61588602", "Nebuchadnezzar [T2C AB]", ZONES.HAND, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
      Brigade: "Brown",
    });

    state.battle.initiativePlayerId = "p2";
    new MoveCardCommand(room, client2).execute({
      from: ZONES.HAND,
      to: ZONES.BATTLEFIELD,
      cardId: neb.id,
    });

    // p1 has 2 cards in play vs p2's 1 -> board_advantage == opponent holds -> protect auto-applied, capture prompts
    expect(room.cardLookup.get(neb.id).isProtected).toBe(true);
    expect(state.effectChronicle.items.length).toBe(1);
    expect(state.effectChronicle.items[0].abilityId).toBe("nebuchadnezzar_capture");
    expect(client2.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        abilityId: "nebuchadnezzar_capture",
        action: "capture",
        promptText: "Capture good hero?",
      })
    );

    new RespondOptionalAbilityCommand(room, client2).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: false,
    });
    expect(state.effectChronicle.items.length).toBe(0);

    // Without opponent board_advantage, nebuchadnezzar_capture is NOT enqueued
    const neb2 = createCard("neb_2", "61588602", "Nebuchadnezzar 2", ZONES.HAND, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });
    createCard("ec_extra_1", "201", "Extra EC 1", ZONES.TERRITORY, "p2");
    createCard("ec_extra_2", "202", "Extra EC 2", ZONES.TERRITORY, "p2");
    client2.send.mockClear();

    BattleTriggerService.handleCardBattleEntry(room, p2, neb2, { from: ZONES.HAND, to: ZONES.BATTLEFIELD });
    expect(neb2.isProtected).toBe(true);
    expect(state.effectChronicle.items.length).toBe(0);
    expect(client2.send).not.toHaveBeenCalledWith(AST_MESSAGES.REQUEST_OPTIONAL_ABILITY, expect.anything());
  });

  test("never triggers is_star: true abilities in battle even when mixed with static/immediate abilities", () => {
    const customId = "star_plus_static_test";
    registeredIds.push(customId);
    AbilityLookup._loadData()[customId] = {
      card_id: customId,
      card_name: "Star Hero Mix",
      sides: {
        top: {
          abilities: [
            {
              ability_id: "ab_star_only",
              is_star: true,
              activation_mode: AST_ACTIVATION_MODES.IMMEDIATE,
              is_optional: false,
              conditions: [],
              effects: [{ action: "draw", target: { count: { fixed_value: 2 } } }],
            },
            {
              ability_id: "ab_battle_static",
              is_star: false,
              activation_mode: AST_ACTIVATION_MODES.STATIC,
              is_optional: false,
              conditions: [],
              effects: [
                {
                  action: "protect",
                  target: { selection_mode: "automatic_self", zone_owner: "controller", scope: ["battle"] },
                  protection_filter: { from_harm: true },
                },
              ],
            },
          ],
        },
      },
    };

    createCard("p1_deck", "101", "Deck Card", ZONES.DECK, "p1");
    const hero = createCard("sh_mix", customId, "Star Hero Mix", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });

    new MoveCardCommand(room, client1).execute({
      from: ZONES.TERRITORY,
      to: ZONES.BATTLEFIELD,
      cardId: hero.id,
    });

    expect(p1.hand.length).toBe(0);
    expect(room.cardLookup.get(hero.id).isProtected).toBe(true);
    expect(state.effectChronicle.history.map((h) => h.abilityId)).toEqual(["ab_battle_static"]);
  });

  test("-293124111 Judith (LoC) wires opponent banish cost to protect_edomites (was_cost_paid == false) end-to-end", () => {
    createCard("atk_hero", "100", "Attacking Hero", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
      Brigade: "Silver",
    });
    const edomite = createCard("ec_edom", "201", "Doeg", ZONES.TERRITORY, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
      Identifier: "Edomite",
    });
    const oppGoodDiscard = createCard("g_disc_1", "101", "Good Card", ZONES.DISCARD, "p1", {
      Type: "GE",
      Alignment: "Good",
    });

    const judith = createCard("judith_1", "-293124111", "Judith (LoC)", ZONES.HAND, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
      Brigade: "Pale Green",
    });

    state.battle.initiativePlayerId = "p2";
    new MoveCardCommand(room, client2).execute({
      from: ZONES.HAND,
      to: ZONES.BATTLEFIELD,
      cardId: judith.id,
    });

    // Judith enqueued opponent_banish_good_card (choice), protect_edomites, band_to_esau
    expect(state.effectChronicle.items.length).toBe(3);

    // Scenario A: p2 triggers opponent_banish_good_card, opponent (p1) CANCELS banishing -> Edomites become protected!
    new RespondOptionalAbilityCommand(room, client2).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: true,
      chosenAbilityId: "opponent_banish_good_card__scope_discard_pile",
    });
    expect(state.effectChronicle.priorityPlayerId).toBe("p1");
    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_TARGET_SELECTION,
      expect.objectContaining({ canCancel: true, eligibleCardIds: [oppGoodDiscard.id] })
    );

    new SelectTargetCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      abilityId: "opponent_banish_good_card__scope_discard_pile",
      cancelled: true,
    });

    expect(edomite.isProtected).toBe(true);
    expect(room.cardLookup.get(judith.id)._lastCostPaid).toBe(false);
    // Remaining item: band_to_esau (auto-completes with no Esau -> 0 items left)
    expect(state.effectChronicle.items.length).toBe(0);

    // Scenario B: opponent DOES banish the good card -> protect_edomites skips (was_cost_paid == true)
    const edomite2 = createCard("ec_edom_2", "202", "Esau Follower", ZONES.TERRITORY, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
      Identifier: "Edomite",
    });
    const judith2 = createCard("judith_2", "-293124111", "Judith 2", ZONES.HAND, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });

    BattleTriggerService.handleCardBattleEntry(room, p2, judith2, { from: ZONES.HAND, to: ZONES.BATTLEFIELD });
    new RespondOptionalAbilityCommand(room, client2).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: true,
      chosenAbilityId: "opponent_banish_good_card__scope_discard_pile",
    });
    new SelectTargetCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      abilityId: "opponent_banish_good_card__scope_discard_pile",
      selectedCardIds: [oppGoodDiscard.id],
    });

    expect(room.cardLookup.get(oppGoodDiscard.id).zone).toBe(ZONES.BANISH);
    expect(judith2._lastCostPaid).toBe(true);
    expect(edomite2.isProtected).toBe(false);
    expect(state.effectChronicle.history.some((h) => h.abilityId === "protect_edomites" && h.status === CHRONICLE_STATUS.PASSED)).toBe(true);
  });
});
