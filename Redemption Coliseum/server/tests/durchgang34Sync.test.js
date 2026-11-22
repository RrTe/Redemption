// server/tests/durchgang34Sync.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { CardAction } = require("../../shared/actionSchema");
const { AbilityLookup } = require("../src/ast/AbilityLookup");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { BattleTriggerService } = require("../src/services/BattleTriggerService");
const { RespondOptionalAbilityCommand } = require("../src/commands/RespondOptionalAbilityCommand");
const { SubmitDrawSequenceCommand } = require("../src/commands/SubmitDrawSequenceCommand");
const { MoveCardCommand } = require("../src/commands/MoveCardCommand");
const { CardRepository } = require("../../shared/CardRepository");
const { cardDatabase } = require("../src/data/cardDatabase");
const { ZONES } = require("../../shared/zones");
const { PHASES, DRAW_STEPS } = require("../../shared/phases");
const { ActionType } = require("../../shared/actions");
const { AST_MESSAGES, AST_ACTIVATION_MODES } = require("../../shared/astConstants");

describe("Durchgang 3 & 4 AST Sync Verification", () => {
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
    p1 = Object.assign(new PlayerState(), { sessionId: "p1", name: "Player 1" });
    p2 = Object.assign(new PlayerState(), { sessionId: "p2", name: "Player 2" });
    state.players.set("p1", p1);
    state.players.set("p2", p2);
    state.activePlayer = "p1";
    state.currentPhase = PHASES.BATTLE;

    client1 = { sessionId: "p1", send: jest.fn() };
    client2 = { sessionId: "p2", send: jest.fn() };

    room = {
      roomId: "durchgang-34-room",
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

  describe("1. Durchgang 3: isStarAbility, activation_mode & cleaned automatic_self/identifiers", () => {
    test("139226334 Isaiah separates regular star-referencing abilities from Star Phase ability", () => {
      const regularAbilities = AbilityLookup.resolveAbilities("139226334");
      expect(regularAbilities.map((a) => a.ability_id)).toEqual([
        "activate_isaiah_star_ability",
        "marked_star_cards_cannot_be_negated",
      ]);

      const starAbilities = AbilityLookup.resolveAbilities("139226334", {
        actionType: ActionType.ACTIVATE_STAR_ABILITY,
        isStarCard: true,
      });
      expect(starAbilities.map((a) => a.ability_id)).toEqual(["star_topdeck_isaiah_from_reserve"]);
    });

    test("non-star abilities containing 'star' in ability_id or trigger_event are NOT filtered as Star abilities", () => {
      const hailstones = AbilityLookup.resolveAbilities("152967169");
      expect(hailstones.map((a) => a.ability_id)).toEqual([
        "hailstones_decrease_per_turn",
        "hailstones_discard_if_zero",
      ]);

      const called = AbilityLookup.resolveAbilities("554291683");
      expect(called.map((a) => a.ability_id)).toEqual(["called_to_prophesy_shuffle_and_restart_battle"]);

      const mary = AbilityLookup.resolveAbilities("135440967");
      expect(mary.map((a) => a.ability_id)).toEqual([
        "negate_and_reserve_card_in_territory",
        "take_star_card_from_reserve",
        "convert_self_to_meek",
      ]);
    });

    test("-1123127951 Saint Patrick (GoC) resolves only star_ab_1_topdeck in Star Phase", () => {
      expect(AbilityLookup.resolveAbilities("-1123127951")).toEqual([]);
      const starAbilities = AbilityLookup.resolveAbilities("-1123127951", {
        actionType: ActionType.ACTIVATE_STAR_ABILITY,
        isStarCard: true,
      });
      expect(starAbilities.map((a) => a.ability_id)).toEqual(["star_ab_1_topdeck"]);
    });

    test("-431554481 Goliath, Fear Bringer & -422285470 Ramses II have empty target.identifiers on protect_from_lone_heroes", () => {
      const goliathProtect = AbilityLookup.getCardLogic("-431554481").sides.top.abilities[0];
      const ramsesProtect = AbilityLookup.getCardLogic("-422285470").sides.top.abilities[0];

      expect(goliathProtect.effects[0].target.identifiers).toEqual([]);
      expect(ramsesProtect.effects[0].target.identifiers).toEqual([]);

      createCard("atk_hero", "101", "Attacking Hero", ZONES.BATTLEFIELD, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });
      const goliath = createCard("c_goliath", "-431554481", "Goliath, Fear Bringer [Fundraiser]", ZONES.HAND, "p2", {
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
      });

      state.battle.initiativePlayerId = "p2";
      new MoveCardCommand(room, client2).execute({
        from: ZONES.HAND,
        to: ZONES.BATTLEFIELD,
        cardId: goliath.id,
      });
      expect(room.cardLookup.get(goliath.id).isProtected).toBe(true);
      expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual(["look_at_hand"]);
    });
  });

  describe("2. Pure Modals, Multi-Group & Cleaned Singletons", () => {
    test("-1265515809 Covenant with Abraham (PoC) top side presents both Reserve take and automatic_self reserve as viable", () => {
      createCard("h_res", "101", "Abraham", ZONES.RESERVE, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });
      const cov = createCard("cov_abr", "-1265515809", "Covenant with Abraham (PoC)", ZONES.ARTIFACT, "p1", {
        Type: "Covenant",
        Alignment: "Neutral",
        inGameType: "Covenant",
        inGameAlignment: "Neutral",
      });

      const res = room.abilityResolver.resolve({
        id: "item_cov_1",
        cardId: cov.id,
        controllerId: "p1",
        title: cov.Name,
        abilityId: "",
      });

      expect(res.handled).toBe(true);
      expect(res.awaitingConfirmation).toBe(true);
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({
          action: "choose",
          allowDecline: true,
          choices: [
            expect.objectContaining({ abilityId: "ab_1_take", disabled: false }),
            expect.objectContaining({ abilityId: "ab_2_reserve", disabled: false, label: "Reserve this card" }),
          ],
        })
      );
    });

    test("383853753 Broken Covenant keeps manually_triggered excluded in BattleTriggerService, but presents 6 distinct choices via direct AbilityResolver", () => {
      const evilHand = createCard("ec_hand", "201", "Evil Hand", ZONES.HAND, "p2", {
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
      });
      const goodEnhHand = createCard("ge_hand", "102", "Good Enh Hand", ZONES.HAND, "p2", {
        Type: "GE",
        Alignment: "Good",
        IsEnhancement: true,
      });
      const covHand = createCard("cov_hand", "-1265515809", "Covenant in Hand", ZONES.HAND, "p2", {
        Type: "Covenant",
        Alignment: "Neutral",
      });
      createCard("d_p2_1", "202", "Deck 1", ZONES.DECK, "p2");

      const brokenCov = createCard("bc_1", "383853753", "Broken Covenant", ZONES.HAND, "p2", {
        Type: "EE",
        Alignment: "Evil",
        inGameType: "EE",
        inGameAlignment: "Evil",
        IsEnhancement: true,
      });

      // Strict A1: BattleTriggerService skips manually_triggered AST abilities and uses tabletop fallback
      const triggerEntries = BattleTriggerService.findBattleEntryAstAbilities(
        room,
        p2,
        brokenCov,
        ActionType.PLAY_EVIL_ENHANCEMENT
      );
      expect(triggerEntries).toEqual([]);

      // Direct AbilityResolver resolution opens all 6 distinct options in choice_1
      const directItem = {
        id: "item_bc_1",
        cardId: brokenCov.id,
        controllerId: "p2",
        title: brokenCov.Name,
        actionType: ActionType.ACTIVATE_ABILITY,
        abilityId: "",
      };
      const res = room.abilityResolver.resolve(directItem);

      expect(res.handled).toBe(true);
      expect(res.awaitingConfirmation).toBe(true);
      const call = client2.send.mock.calls.find((c) => c[0] === AST_MESSAGES.REQUEST_OPTIONAL_ABILITY);
      expect(call).toBeDefined();
      const payload = call[1];
      expect(payload.action).toBe("choose");
      expect(payload.allowDecline).toBe(true);
      expect(payload.choices).toHaveLength(6);
      const labels = payload.choices.map((c) => c.label);
      expect(new Set(labels).size).toBe(6);

      // Selecting draw option executes draw exclusively without triggering discard options
      const drawRes = room.abilityResolver.resolve(directItem, {
        accepted: true,
        chosenAbilityId: "broken_covenant_cost_evilhand_drawx",
      });
      expect(drawRes.handled).toBe(true);
      expect(evilHand.zone).toBe(ZONES.HAND);
      expect(goodEnhHand.zone).toBe(ZONES.HAND);
      expect(covHand.zone).toBe(ZONES.HAND);
      expect(p2.hand.length).toBe(5); // drew d_p2_1
    });

    test("-706183812 Haggai (PoC) enqueues dual choice_groups (choice_2 then choice_1) in order", () => {
      createCard("fort_ot_res", "109", "Temple of Jerusalem", ZONES.RESERVE, "p1", {
        Type: "Fortress",
        Alignment: "Good",
        Testament: "OT",
      });
      const haggai = createCard("haggai_1", "-706183812", "Haggai (PoC)", ZONES.HAND, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });
      state.battle.initiativePlayerId = "p1";

      new MoveCardCommand(room, client1).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: haggai.id });

      expect(state.effectChronicle.items).toHaveLength(2);
      expect(state.effectChronicle.items.map((i) => i._choiceGroup)).toEqual(["choice_2", "choice_1"]);
    });

    test("672692497 Antonius Felix & -155125577 Gabriel (GoC) have cleaned singletons without bogus modals", () => {
      createCard("hero_in_battle_fg", "100", "Battle Hero", ZONES.BATTLEFIELD, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });
      const oppHand = createCard("opp_h", "101", "Opp Card", ZONES.HAND, "p1");
      const felix = createCard("felix_1", "672692497", "Antonius Felix", ZONES.HAND, "p2", {
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
      });
      state.battle.initiativePlayerId = "p2";
      new MoveCardCommand(room, client2).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: felix.id });

      // protect_nt_lost_soul auto-executes, opponent_give_card is ungrouped optional (not choice_1 modal)
      expect(state.effectChronicle.items.map((i) => i.abilityId)).toEqual(["opponent_give_card", "band_to_drusilla"]);
      const felixPrompt = client2.send.mock.calls.find((c) => c[0] === AST_MESSAGES.REQUEST_OPTIONAL_ABILITY)?.[1];
      expect(felixPrompt?.action).not.toBe("choose");
      expect(oppHand.zone).toBe(ZONES.HAND);

      state.effectChronicle.items.splice(0, state.effectChronicle.items.length);
      state.battlefield.splice(0, state.battlefield.length);
      state.battle.rescueAttemptOccurred = false;
      state.battle.blockOccurred = false;
      state.lastBattleCardPlayerId = "";
      createCard("ec_tgt", "201", "Opp Evil", ZONES.TERRITORY, "p2", {
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
      });
      const gabriel = createCard("gab_1", "-155125577", "Gabriel, Mouth of God [UR+] (GoC)", ZONES.HAND, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });
      state.battle.initiativePlayerId = "p1";
      client1.send.mockClear();
      new MoveCardCommand(room, client1).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: gabriel.id });

      // Gabriel enqueues ungrouped negate, expanded take (deck/discard), and intact band_or_reserve choice_group
      expect(state.effectChronicle.items.map((i) => i._choiceGroup || i.abilityId)).toEqual([
        "negate_evil_card",
        "take_silver_gospel_deck_pile_choice",
        "band_or_reserve",
      ]);
      const gabChoices = room.abilityResolver._evaluateChoiceOptions(
        AbilityLookup.resolveAbilities("-155125577").filter((a) => a.choice_group === "band_or_reserve"),
        p1,
        gabriel
      ).evaluatedChoices;
      const gabLabels = gabChoices.map((c) => c.label);
      expect(new Set(gabLabels).size).toBe(gabLabels.length);
    });

    test("604564708 Coliseum, -198798044 Coliseum (CoW AB), -560458496 Tartaros have no choice_group", () => {
      for (const id of ["604564708", "-198798044", "-560458496"]) {
        const abilities = AbilityLookup.resolveAbilities(id);
        expect(abilities.length).toBeGreaterThan(0);
        expect(abilities.every((a) => !a.choice_group)).toBe(true);
      }
    });
  });

  describe("3. Mandatory choice_group enforcement (allowDecline: false)", () => {
    test("278813735 Stricken & 264801956 Hospitality of Martha refuse decline and require selecting a valid option", () => {
      createCard("h_battle_str", "100", "Battle Hero", ZONES.BATTLEFIELD, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
      });
      createCard("ec_battle_str", "200", "Battle EC", ZONES.BATTLEFIELD, "p2", {
        Type: "Evil Character",
        Alignment: "Evil",
        IsCharacter: true,
      });
      const stricken = createCard("str_m1", "278813735", "Stricken", ZONES.HAND, "p2", {
        Type: "EE",
        Alignment: "Evil",
        IsEnhancement: true,
      });
      state.battle.initiativePlayerId = "p2";
      new MoveCardCommand(room, client2).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: stricken.id });

      expect(state.effectChronicle.items).toHaveLength(1);
      const itemId = state.effectChronicle.items[0].id;
      expect(client2.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({ action: "choose", allowDecline: false })
      );

      // Attempting to decline mandatory choice keeps item in chronicle and re-prompts
      client2.send.mockClear();
      const declineCmd = new RespondOptionalAbilityCommand(room, client2);
      declineCmd.execute({ itemId, accepted: false });

      expect(declineCmd.canUndo).toBe(false);
      expect(state.effectChronicle.items).toHaveLength(1);
      expect(client2.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({ action: "choose", allowDecline: false })
      );

      // Selecting valid choice completes cleanly
      new RespondOptionalAbilityCommand(room, client2).execute({
        itemId,
        accepted: true,
        chosenAbilityId: "ab_1_negate",
      });
      expect(state.effectChronicle.items).toHaveLength(0);

      // 264801956 Hospitality of Martha: mandatory choice_group martha_draw emits allowDecline: false and draws 1 each
      createCard("d_p1_m", "101", "P1 Deck", ZONES.DECK, "p1");
      createCard("d_p2_m", "201", "P2 Deck", ZONES.DECK, "p2");
      const martha = createCard("martha_1", "264801956", "Hospitality of Martha (Di)", ZONES.HAND, "p1", {
        Type: "GE",
        Alignment: "Good",
        IsEnhancement: true,
      });
      state.battle.initiativePlayerId = "p1";
      state.lastBattleCardPlayerId = "p2";
      client1.send.mockClear();
      new MoveCardCommand(room, client1).execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: martha.id });

      expect(state.effectChronicle.items[0]._choiceGroup).toBe("martha_draw");
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({
          action: "choose",
          allowDecline: false,
          choices: [
            expect.objectContaining({ abilityId: "martha_draw_1_each", disabled: false }),
            expect.objectContaining({
              abilityId: "martha_draw_3_each_female",
              disabled: true,
              label: expect.stringContaining("(Condition not met)"),
            }),
          ],
        })
      );

      new RespondOptionalAbilityCommand(room, client1).execute({
        itemId: state.effectChronicle.items[0].id,
        accepted: true,
        chosenAbilityId: "martha_draw_1_each",
      });
      expect(p1.hand.length).toBe(1);
    });
  });

  describe("4. Star Phase & Lost Soul Phase choice_group in SubmitDrawSequenceCommand", () => {
    test("1693574528 Tamar (LoC) in ACTIVE_STARS enqueues ONE unified choice_group item with distinct labels", () => {
      state.currentPhase = PHASES.DRAW;
      state.drawStep = DRAW_STEPS.ACTIVE_STARS;
      state.priorityPlayerId = "p1";
      room._drawSequencePlan = [DRAW_STEPS.ACTIVE_STARS];
      room._drawSequenceIndex = 0;

      createCard("opp_h_t", "201", "Opp Hand", ZONES.HAND, "p2");
      createCard("opp_r_t", "202", "Opp Reserve", ZONES.RESERVE, "p2");

      const tamar = createCard("tamar_star", "1693574528", "Tamar, the Widow (LoC)", ZONES.HAND, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
        IsStarCard: true,
      });
      const starAct = new CardAction();
      starAct.id = "act_star_tamar";
      starAct.type = ActionType.ACTIVATE_STAR_ABILITY;
      tamar.availableActions.push(starAct);

      new SubmitDrawSequenceCommand(room, client1).execute({
        step: DRAW_STEPS.ACTIVE_STARS,
        orderedCardIds: [tamar.id],
      });

      expect(state.effectChronicle.items).toHaveLength(1);
      expect(state.effectChronicle.items[0]._choiceGroup).toBe("choice_look");
      expect(state.effectChronicle.items[0].abilityId).toBe("");

      room.abilityResolver.resolve(state.effectChronicle.items[0], { accepted: true });
      expect(client1.send).toHaveBeenCalledWith(
        AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
        expect.objectContaining({
          action: "choose",
          allowDecline: true,
          choices: [
            expect.objectContaining({ abilityId: "star_look_at_hand", label: "Look at hand" }),
            expect.objectContaining({ abilityId: "star_look_at_reserve", label: "Look at reserve" }),
          ],
        })
      );

      new RespondOptionalAbilityCommand(room, client1).execute({
        itemId: state.effectChronicle.items[0].id,
        accepted: true,
        chosenAbilityId: "star_look_at_reserve",
      });
      expect(state.effectChronicle.items).toHaveLength(0);
      expect(state.drawStep).toBe(DRAW_STEPS.NONE);
    });

    test("174979637 Joel (PoC) in ACTIVE_STARS & 126493631 Lost Soul Darkness in ACTIVE_SOULS enqueue ONE choice_group item", () => {
      state.currentPhase = PHASES.DRAW;
      state.drawStep = DRAW_STEPS.ACTIVE_STARS;
      state.priorityPlayerId = "p1";
      room._drawSequencePlan = [DRAW_STEPS.ACTIVE_STARS, DRAW_STEPS.ACTIVE_SOULS];
      room._drawSequenceIndex = 0;

      createCard("d_joel", "101", "Deck Card", ZONES.DECK, "p1");
      const joel = createCard("joel_star", "174979637", "Joel (PoC)", ZONES.HAND, "p1", {
        Type: "Hero",
        Alignment: "Good",
        IsCharacter: true,
        IsStarCard: true,
      });
      const joelAct = new CardAction();
      joelAct.id = "act_star_joel";
      joelAct.type = ActionType.ACTIVATE_STAR_ABILITY;
      joel.availableActions.push(joelAct);

      const ls = createCard("ls_dark", "126493631", 'Lost Soul "Darkness" [Job 30:26]', ZONES.LAND_OF_BONDAGE, "p1", {
        Type: "Lost Soul",
        Alignment: "Neutral",
      });
      const lsAct = new CardAction();
      lsAct.id = "act_ls_dark";
      lsAct.type = ActionType.ACTIVATE_ABILITY;
      ls.availableActions.push(lsAct);

      new SubmitDrawSequenceCommand(room, client1).execute({
        step: DRAW_STEPS.ACTIVE_STARS,
        orderedCardIds: [joel.id],
      });

      expect(state.effectChronicle.items).toHaveLength(1);
      expect(state.effectChronicle.items[0]._choiceGroup).toBe("choice_1");

      new RespondOptionalAbilityCommand(room, client1).execute({
        itemId: state.effectChronicle.items[0].id,
        accepted: false,
      });
      expect(state.drawStep).toBe(DRAW_STEPS.ACTIVE_SOULS);

      new SubmitDrawSequenceCommand(room, client1).execute({
        step: DRAW_STEPS.ACTIVE_SOULS,
        orderedCardIds: [ls.id],
      });

      // Lost Soul Darkness has single choice_group across 2 abilities (each multi-pile) -> unified into 1 item
      expect(state.effectChronicle.items).toHaveLength(1);
      expect(state.effectChronicle.items[0]._choiceGroup).toBe("choice_1");
      expect(state.effectChronicle.items[0].abilityId).toBe("");
    });
  });
});
