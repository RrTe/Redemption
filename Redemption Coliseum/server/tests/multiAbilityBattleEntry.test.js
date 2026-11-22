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

  test("mixed ungrouped -> choice_group cards (-627605698, -888694675, 278813735) execute ungrouped first then choice modal", () => {
    // 1. -627605698 Supercilious Scribes (GoC): ungrouped protect executes automatically, then choice_1 modal
    createCard("h_atk_1", "101", "Attacking Hero", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });
    const phariseeTerr = createCard("ec_phar", "202", "Territory Pharisee", ZONES.TERRITORY, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
      Identifier: "Pharisee",
    });
    createCard("good_hand_1", "102", "Good Hand Card", ZONES.HAND, "p2", {
      Type: "GE",
      Alignment: "Good",
    });
    const scribes = createCard("scribes_1", "-627605698", "Supercilious Scribes (GoC)", ZONES.HAND, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });

    state.battle.initiativePlayerId = "p2";
    new MoveCardCommand(room, client2).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: scribes.id });

    expect(room.cardLookup.get(scribes.id).isProtected).toBe(true);
    expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual([""]);
    expect(client2.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        action: "choose",
        allowDecline: true,
        choices: expect.arrayContaining([
          expect.objectContaining({ abilityId: "supercilious_scribes_band_pharisee_sadducee", disabled: false }),
          expect.objectContaining({ abilityId: "supercilious_scribes_exchange_with_reserve", disabled: false }),
        ]),
      })
    );
    new RespondOptionalAbilityCommand(room, client2).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: true,
      chosenAbilityId: "supercilious_scribes_band_pharisee_sadducee",
    });
    expect(room.cardLookup.get(phariseeTerr.id).zone).toBe(ZONES.BATTLEFIELD);
    expect(state.effectChronicle.items.length).toBe(0);

    // 2. -888694675 Zerubbabel, the Chosen (LoC): ungrouped optional draw first, then choice_1 modal (star skipped)
    state.battlefield.splice(0, state.battlefield.length);
    state.battle.rescueAttemptOccurred = false;
    state.battle.blockOccurred = false;
    state.lastBattleCardPlayerId = "";
    createCard("d_z1", "103", "Deck 1", ZONES.DECK, "p1");
    createCard("d_z2", "104", "Deck 2", ZONES.DECK, "p1");
    const postexilicHero = createCard("h_post", "105", "Postexilic Ally", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
      Identifier: "Postexilic",
    });
    const zerubbabel = createCard("zerub_1", "-888694675", "Zerubbabel, the Chosen (LoC)", ZONES.HAND, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
      IsStarCard: true,
    });
    state.battle.initiativePlayerId = "p1";
    client1.send.mockClear();

    new MoveCardCommand(room, client1).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: zerubbabel.id });
    expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual(["zerubbabel_convert_to_meek_draw", ""]);
    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({ abilityId: "zerubbabel_convert_to_meek_draw" })
    );

    client1.send.mockClear();
    new RespondOptionalAbilityCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: true,
    });
    expect(p1.hand.length).toBe(2);
    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        action: "choose",
        allowDecline: true,
        choices: expect.arrayContaining([
          expect.objectContaining({ abilityId: "zerubbabel_band_postexilic", disabled: false }),
          expect.objectContaining({ abilityId: "zerubbabel_play_postexilic" }),
        ]),
      })
    );
    new RespondOptionalAbilityCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: true,
      chosenAbilityId: "zerubbabel_band_postexilic",
    });
    expect(room.cardLookup.get(postexilicHero.id).zone).toBe(ZONES.BATTLEFIELD);
    expect(state.effectChronicle.items.length).toBe(0);

    // 3. 278813735 Stricken: star ability skipped in battle, mandatory choice_1 modal with allowDecline: false
    const stricken = createCard("stricken_1", "278813735", "Stricken", ZONES.HAND, "p2", {
      Type: "EE",
      Alignment: "Evil",
      IsEnhancement: true,
      IsStarCard: true,
    });
    createCard("ec_blk_str", "209", "Blocking EC", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });
    state.battle.initiativePlayerId = "p2";
    client2.send.mockClear();
    new MoveCardCommand(room, client2).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: stricken.id });
    expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual([""]);
    expect(client2.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        action: "choose",
        allowDecline: false,
        choices: [
          expect.objectContaining({ abilityId: "ab_1_negate" }),
          expect.objectContaining({ abilityId: "ab_2_reserve" }),
        ],
      })
    );
  });

  test("mixed choice_group -> ungrouped cards (-1834781300 Zimri, 1501337366 Elhanan) prompt choice first then ungrouped", () => {
    createCard("h_atk_z", "100", "Battle Hero", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });
    createCard("h_opp_terr", "101", "Target Good", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });
    const otCurseDisc = createCard("curse_disc", "202", "OT Curse", ZONES.DISCARD, "p2", {
      Type: "Curse",
      Alignment: "Evil",
      Testament: "OT",
    });
    const zimri = createCard("zimri_1", "-1834781300", "Zimri, Son of Salu [IR]", ZONES.HAND, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });

    state.battle.initiativePlayerId = "p2";
    client2.send.mockClear();
    new MoveCardCommand(room, client2).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: zimri.id });

    expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual(["", "zimri_son_of_salu_ir_reserve_ot_curse"]);
    expect(client2.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        action: "choose",
        choices: expect.arrayContaining([
          expect.objectContaining({ abilityId: "zimri_son_of_salu_ir_negate_good" }),
          expect.objectContaining({ abilityId: "zimri_son_of_salu_ir_reserve_multi_brigade" }),
        ]),
      })
    );
    new RespondOptionalAbilityCommand(room, client2).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: false,
    });
    expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual(["zimri_son_of_salu_ir_reserve_ot_curse"]);
    new RespondOptionalAbilityCommand(room, client2).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: false,
    });
    expect(state.effectChronicle.items.length).toBe(0);
    expect(room.cardLookup.get(otCurseDisc.id).zone).toBe(ZONES.DISCARD);

    // 1501337366 Elhanan, Son of Dodo [RR2]: unequipped -> deck option disabled with Condition not met, followed by giant discard
    state.battlefield.splice(0, state.battlefield.length);
    state.battle.rescueAttemptOccurred = false;
    state.battle.blockOccurred = false;
    state.lastBattleCardPlayerId = "";
    const evilResCard = createCard("ec_res", "203", "Evil Reserve", ZONES.RESERVE, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });
    createCard("ec_deck", "204", "Evil Deck", ZONES.DECK, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });
    const giant = createCard("ec_giant", "205", "Goliath Giant", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
      Identifier: "Giant",
    });
    const elhanan = createCard("elhanan_1", "1501337366", "Elhanan, Son of Dodo [RR2]", ZONES.HAND, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });

    state.battle.initiativePlayerId = "p1";
    client1.send.mockClear();
    new MoveCardCommand(room, client1).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: elhanan.id });

    expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual(["", "elhanan_discard_giant"]);
    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        action: "choose",
        choices: [
          expect.objectContaining({ abilityId: "elhanan_discard_reserve", disabled: false }),
          expect.objectContaining({
            abilityId: "elhanan_discard_deck_if_equipped",
            disabled: true,
            label: expect.stringContaining("(Condition not met)"),
          }),
        ],
      })
    );
    new RespondOptionalAbilityCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: true,
      chosenAbilityId: "elhanan_discard_reserve",
    });
    new SelectTargetCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      abilityId: "elhanan_discard_reserve",
      selectedCardIds: [evilResCard.id],
    });
    expect(room.cardLookup.get(evilResCard.id).zone).toBe(ZONES.DISCARD);

    expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual(["elhanan_discard_giant"]);
    new RespondOptionalAbilityCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: true,
    });
    new SelectTargetCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      abilityId: "elhanan_discard_giant",
      selectedCardIds: [giant.id],
    });
    // Giant is last EC in battle -> Special Initiative triggers; defender p2 declines -> Giant discarded
    expect(state.effectChronicle.items[0].pendingSpecialInitiative).toBeTruthy();
    new RespondOptionalAbilityCommand(room, client2).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: false,
    });
    expect(room.cardLookup.get(giant.id).zone).toBe(ZONES.DISCARD);
    expect(state.effectChronicle.items.length).toBe(0);
  });

  test("pure modal pairs (1830061607, -1542044403, 848128688) execute exclusively the chosen option", () => {
    const prophetAlly = createCard("h_gen_proph", "101", "Generic Prophet", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
      IsGeneric: true,
      Identifier: "Generic, Prophet",
    });
    const d1 = createCard("d_p1", "102", "Deck 1", ZONES.DECK, "p1");
    const d2 = createCard("d_p2", "103", "Deck 2", ZONES.DECK, "p1");

    const prophetK = createCard("pog_k", "1830061607", "The Prophet of God [K]", ZONES.HAND, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });
    state.battle.initiativePlayerId = "p1";
    new MoveCardCommand(room, client1).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: prophetK.id });
    expect(state.effectChronicle.items.length).toBe(1);
    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        action: "choose",
        choices: [
          expect.objectContaining({ abilityId: "prophet_of_god_k_band" }),
          expect.objectContaining({ abilityId: "prophet_of_god_k_draw" }),
        ],
      })
    );
    // Pick draw -> band MUST NOT happen
    new RespondOptionalAbilityCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: true,
      chosenAbilityId: "prophet_of_god_k_draw",
    });
    expect(p1.hand.map((c) => c.id)).toEqual(expect.arrayContaining([d1.id, d2.id]));
    expect(room.cardLookup.get(prophetAlly.id).zone).toBe(ZONES.TERRITORY);
    expect(state.effectChronicle.items.length).toBe(0);

    // -1542044403 The Prophet of God (1st Print - K): pick band -> draw does not happen
    state.battlefield.splice(0, state.battlefield.length);
    state.battle.rescueAttemptOccurred = false;
    state.battle.blockOccurred = false;
    state.lastBattleCardPlayerId = "";
    state.battle.initiativePlayerId = "p1";
    const prophet1st = createCard("pog_1st", "-1542044403", "The Prophet of God (1st Print - K)", ZONES.HAND, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });
    new MoveCardCommand(room, client1).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: prophet1st.id });
    expect(state.effectChronicle.items.length).toBe(1);
    new RespondOptionalAbilityCommand(room, client1).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: true,
      chosenAbilityId: "prophet_of_god_band",
    });
    expect(room.cardLookup.get(prophetAlly.id).zone).toBe(ZONES.BATTLEFIELD);
    expect(p1.deck.length).toBe(0);
    expect(state.effectChronicle.items.length).toBe(0);

    // 848128688 The Fallen King: single modal choice_1 with distinct Play Deck vs Play Reserve labels
    const royalFemale = createCard("ec_rf", "201", "Queen Athaliah", ZONES.TERRITORY, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
      Testament: "OT",
      Gender: "Female",
      Identifier: "Royal",
    });
    const fallenKing = createCard("fk_1", "848128688", "The Fallen King", ZONES.HAND, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });
    state.battle.initiativePlayerId = "p2";
    client2.send.mockClear();
    new MoveCardCommand(room, client2).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: fallenKing.id });
    expect(state.effectChronicle.items.length).toBe(1);
    expect(client2.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        action: "choose",
        choices: expect.arrayContaining([
          expect.objectContaining({ abilityId: "fallen_king_band", disabled: false }),
          expect.objectContaining({ abilityId: "fallen_king_play__scope_deck" }),
          expect.objectContaining({ abilityId: "fallen_king_play__scope_reserve_pile" }),
        ]),
      })
    );
    const fkPayload = client2.send.mock.calls.find((c) => c[0] === AST_MESSAGES.REQUEST_OPTIONAL_ABILITY)[1];
    const labels = fkPayload.choices.map((c) => c.label);
    expect(new Set(labels).size).toBe(labels.length);

    new RespondOptionalAbilityCommand(room, client2).execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: true,
      chosenAbilityId: "fallen_king_band",
    });
    expect(room.cardLookup.get(royalFemale.id).zone).toBe(ZONES.BATTLEFIELD);
    expect(state.effectChronicle.items.length).toBe(0);
  });

  test("and/or (-1777999383, 1693574528) and additive (-1206252778) abilities run sequentially without modal prompts", () => {
    // 1. -1777999383 Abishai (Wa): band_with_joab and band_with_asahel queued sequentially
    const joab = createCard("h_joab", "65394445", "Joab", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });
    const asahel = createCard("h_asahel", "78123623", "Asahel", ZONES.HAND, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });
    const abishai = createCard("h_abishai", "-1777999383", "Abishai (Wa)", ZONES.HAND, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });
    state.battle.initiativePlayerId = "p1";
    client1.send.mockClear();
    new MoveCardCommand(room, client1).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: abishai.id });

    expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual(["band_with_joab", "band_with_asahel"]);
    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({ abilityId: "band_with_joab" })
    );
    new RespondOptionalAbilityCommand(room, client1).execute({ itemId: state.effectChronicle.items[0].id, accepted: true });
    new RespondOptionalAbilityCommand(room, client1).execute({ itemId: state.effectChronicle.items[0].id, accepted: true });
    expect(room.cardLookup.get(joab.id).zone).toBe(ZONES.BATTLEFIELD);
    expect(room.cardLookup.get(asahel.id).zone).toBe(ZONES.BATTLEFIELD);
    expect(state.effectChronicle.items.length).toBe(0);

    // 2. 1693574528 Tamar, the Widow (LoC): tamar_band_judah and tamar_play_perez queued sequentially (after_battle & star excluded)
    state.battlefield.splice(0, state.battlefield.length);
    state.battle.rescueAttemptOccurred = false;
    state.battle.blockOccurred = false;
    state.lastBattleCardPlayerId = "";
    state.battle.initiativePlayerId = "p1";
    createCard("h_judah", "234399770", "Judah", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });
    const tamar = createCard("h_tamar", "1693574528", "Tamar, the Widow (LoC)", ZONES.HAND, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
      IsStarCard: true,
    });
    new MoveCardCommand(room, client1).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: tamar.id });
    expect(state.effectChronicle.items.map((i) => i._choiceGroup || i.abilityId)).toEqual([
      "tamar_band_judah",
      "tamar_play_perez_pile_choice",
    ]);
    state.effectChronicle.items.splice(0, state.effectChronicle.items.length);

    // 3. -1206252778 Captured by Assyria: additive condition appends capture_extra_human_if_assyrian sequentially
    const assyrian = createCard("ec_assyr", "201", "Assyrian Archer", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
      Identifier: "Assyrian",
    });
    createCard("h_cap_battle", "109", "Attacking Hero", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });
    const captured = createCard("ee_cap", "-1206252778", "Captured by Assyria", ZONES.HAND, "p2", {
      Type: "EE",
      Alignment: "Evil",
      IsEnhancement: true,
    });
    state.battle.initiativePlayerId = "p2";
    new MoveCardCommand(room, client2).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: captured.id });
    expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual([
      "capture_one_human",
      "capture_extra_human_if_assyrian",
    ]);
    expect(assyrian.zone).toBe(ZONES.BATTLEFIELD);
  });
});
