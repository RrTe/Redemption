// server/tests/chroniclePerEffectDisplay.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { MoveCardCommand } = require("../src/commands/MoveCardCommand");
const { RespondOptionalAbilityCommand } = require("../src/commands/RespondOptionalAbilityCommand");
const { SelectTargetCommand } = require("../src/commands/SelectTargetCommand");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { AbilityLookup } = require("../src/ast/AbilityLookup");
const { EffectLabelFormatter } = require("../src/ast/EffectLabelFormatter");
const { ZONES } = require("../../shared/zones");
const { PHASES } = require("../../shared/phases");
const { CHRONICLE_STATUS } = require("../../shared/effectChronicleConstants");
const {
  AST_ACTIONS,
  AST_ACTIVATION_MODES,
  AST_MESSAGES,
  AST_SCOPES,
  AST_SELECTION_MODES,
} = require("../../shared/astConstants");

describe("Per-Effect Chronicle Items, Labels & History Summary", () => {
  let room;
  let state;
  let p1;
  let p2;
  let client1;
  let client2;
  let registeredIds;

  beforeEach(() => {
    registeredIds = [];
    state = new RoomState();
    state.currentPhase = PHASES.BATTLE;
    state.activePlayer = "p1";

    p1 = Object.assign(new PlayerState(), { sessionId: "p1", name: "Player 1" });
    p2 = Object.assign(new PlayerState(), { sessionId: "p2", name: "Player 2" });
    state.players.set("p1", p1);
    state.players.set("p2", p2);

    client1 = { sessionId: "p1", send: jest.fn(), userData: { playerName: "Player 1" } };
    client2 = { sessionId: "p2", send: jest.fn(), userData: { playerName: "Player 2" } };

    room = {
      roomId: "per-effect-room",
      state,
      clients: [client1, client2],
      cardLookup: new Map(),
      broadcastGameLog: jest.fn(),
      broadcast: jest.fn(),
    };
    room.abilityResolver = new AbilityResolver(room);
  });

  afterEach(() => {
    const logicMap = AbilityLookup._loadData();
    for (const id of registeredIds) {
      delete logicMap[id];
    }
  });

  function registerAbility(templateId, abilities) {
    registeredIds.push(templateId);
    AbilityLookup._loadData()[templateId] = {
      card_id: templateId,
      card_name: `Card ${templateId}`,
      sides: { top: { abilities } },
    };
  }

  function createCard(id, templateId, name, zone, ownerId, extra = {}) {
    const card = Object.assign(
      new Card(),
      {
        id,
        templateId,
        Name: name,
        ImageFile: `${templateId}_img`,
        zone,
        ownerId,
        originalOwnerId: ownerId,
        controllerId: ownerId,
        isFaceUp: zone !== ZONES.DECK,
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

  test("1. Multi-effect ability expands into 1 ChronicleItem per step with templateId, effectLabel & resultSummary", () => {
    registerAbility("t_multi_step", [
      {
        ability_id: "ab_banish_then_draw",
        activation_mode: AST_ACTIVATION_MODES.IMMEDIATE,
        is_optional: true,
        conditions: [],
        effects: [
          {
            step: 1,
            action: AST_ACTIONS.BANISH,
            target: {
              selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
              zone_owner: "opponent",
              scope: [AST_SCOPES.TERRITORY],
              target_type: "evil_character",
              count: { fixed_value: 1 },
            },
          },
          {
            step: 2,
            action: AST_ACTIONS.DRAW,
            target: { count: { fixed_value: 1 } },
          },
        ],
      },
    ]);

    const ec1 = createCard("ec_1", "201", "Balaam", ZONES.TERRITORY, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });
    createCard("ec_2", "202", "Goliath", ZONES.TERRITORY, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });
    const d1 = createCard("d_1", "101", "Deck Hero", ZONES.DECK, "p1");
    const hero = createCard("h_multi", "t_multi_step", "Joshua", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });

    const moveCmd = new MoveCardCommand(room, client1);
    moveCmd.execute({ from: ZONES.TERRITORY, to: ZONES.BATTLEFIELD, cardId: hero.id });

    // Expect 2 distinct pending ChronicleItems for the 2 effect steps
    expect(state.effectChronicle.items.length).toBe(2);
    expect(state.effectChronicle.items[0]).toMatchObject({
      title: "Joshua",
      templateId: "t_multi_step",
      effectStepIndex: 0,
      effectLabel: "Banish evil character",
      isOptional: true,
    });
    expect(state.effectChronicle.items[1]).toMatchObject({
      title: "Joshua",
      templateId: "t_multi_step",
      effectStepIndex: 1,
      effectLabel: "Draw 1 card(s)",
      isOptional: false,
    });
    expect(state.effectChronicle.items[0]._abilityGroupId).toBeTruthy();
    expect(state.effectChronicle.items[0]._abilityGroupId).toBe(state.effectChronicle.items[1]._abilityGroupId);

    // Accept step 0 -> choose ec_1 -> step 0 completes and step 1 (Draw 1) auto-executes!
    const optCmd = new RespondOptionalAbilityCommand(room, client1);
    optCmd.execute({ itemId: state.effectChronicle.items[0].id, accepted: true });

    const selCmd = new SelectTargetCommand(room, client1);
    selCmd.execute({
      itemId: state.effectChronicle.items[0].id,
      abilityId: "ab_banish_then_draw",
      selectedCardIds: [ec1.id],
    });

    expect(room.cardLookup.get(ec1.id).zone).toBe(ZONES.BANISH);
    expect(p1.hand.map((c) => c.id)).toEqual([d1.id]);
    expect(state.effectChronicle.items.length).toBe(0);

    // History contains 2 separate per-effect records with stripped plain-text resultSummary
    expect(state.effectChronicle.history.length).toBe(2);
    expect(state.effectChronicle.history[0]).toMatchObject({
      title: "Joshua",
      templateId: "t_multi_step",
      effectLabel: "Banish evil character",
      status: CHRONICLE_STATUS.COMPLETED,
    });
    expect(state.effectChronicle.history[0].resultSummary).toContain("Balaam");
    expect(state.effectChronicle.history[0].resultSummary).not.toContain("{{");

    expect(state.effectChronicle.history[1]).toMatchObject({
      title: "Joshua",
      templateId: "t_multi_step",
      effectLabel: "Draw 1 card(s)",
      status: CHRONICLE_STATUS.COMPLETED,
    });
    expect(state.effectChronicle.history[1].resultSummary).toContain("draws 1 card(s)");
  });

  test("2. Chained target propagates snapshot across separate effect-step items, decline skips siblings, and undo restores both", () => {
    registerAbility("t_chained", [
      {
        ability_id: "ab_chained",
        activation_mode: AST_ACTIVATION_MODES.IMMEDIATE,
        is_optional: true,
        conditions: [],
        effects: [
          {
            step: 1,
            action: AST_ACTIONS.MODIFY_STATS,
            strength_mod: 1,
            toughness_mod: 1,
            target: {
              selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
              zone_owner: "controller",
              scope: [AST_SCOPES.TERRITORY],
              target_type: "hero",
              count: { fixed_value: 1 },
            },
          },
          {
            step: 2,
            action: AST_ACTIONS.UNDERDECK,
            target: {
              selection_mode: "chained_target",
              ref_step: 1,
              scope: [AST_SCOPES.TERRITORY],
              target_type: "hero",
            },
          },
        ],
      },
    ]);

    const ally1 = createCard("h_ally1", "101", "Ally One", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });
    createCard("h_ally2", "102", "Ally Two", ZONES.TERRITORY, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });
    const source = createCard("h_src", "t_chained", "Chainer", ZONES.HAND, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });

    new MoveCardCommand(room, client1).execute({
      from: ZONES.HAND,
      to: ZONES.BATTLEFIELD,
      cardId: source.id,
    });

    expect(state.effectChronicle.items.length).toBe(2);
    expect(state.effectChronicle.items[0].effectLabel).toBe("Increase hero (+1/+1)");
    expect(state.effectChronicle.items[1].effectLabel).toBe("Underdeck hero from territory");

    // Decline step 0 -> step 1 sibling is skipped as PASSED; undo restores BOTH pending items!
    const declineCmd = new RespondOptionalAbilityCommand(room, client1);
    declineCmd.execute({ itemId: state.effectChronicle.items[0].id, accepted: false });

    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.effectChronicle.history.length).toBe(2);
    expect(state.effectChronicle.history[0].status).toBe(CHRONICLE_STATUS.PASSED);
    expect(state.effectChronicle.history[1].status).toBe(CHRONICLE_STATUS.PASSED);

    declineCmd.undo();
    expect(state.effectChronicle.history.length).toBe(0);
    expect(state.effectChronicle.items.length).toBe(2);
    expect(state.effectChronicle.items[0].effectStepIndex).toBe(0);
    expect(state.effectChronicle.items[1].effectStepIndex).toBe(1);

    // Accept step 0 -> select ally1 -> step 1 underdecks ally1 via chained snapshot across items!
    const optCmd = new RespondOptionalAbilityCommand(room, client1);
    optCmd.execute({ itemId: state.effectChronicle.items[0].id, accepted: true });

    const selCmd = new SelectTargetCommand(room, client1);
    selCmd.execute({
      itemId: state.effectChronicle.items[0].id,
      abilityId: "ab_chained",
      selectedCardIds: [ally1.id],
    });

    expect(room.cardLookup.get(ally1.id).zone).toBe(ZONES.DECK);

    // Undoing selCmd rolls back BOTH the chained underdeck (step 1) AND the stat modification (step 0)!
    selCmd.undo();
    expect(room.cardLookup.get(ally1.id).zone).toBe(ZONES.TERRITORY);
    expect(room.cardLookup.get(ally1.id).counters.has("strength_mod")).toBe(false);
    expect(state.effectChronicle.items.length).toBe(2);
  });

  test("3. Choice group updates effectLabel, expands multi-step choice, and undoes back to unresolved choice", () => {
    registerAbility("t_choice_multi", [
      {
        ability_id: "opt_a_draw",
        choice_group: "cg_1",
        activation_mode: AST_ACTIVATION_MODES.IMMEDIATE,
        is_optional: true,
        conditions: [],
        effects: [
          { step: 1, action: AST_ACTIONS.DRAW, target: { count: { fixed_value: 1 } } },
          {
            step: 2,
            action: AST_ACTIONS.PROTECT,
            target: { selection_mode: AST_SELECTION_MODES.AUTOMATIC_SELF, scope: [AST_SCOPES.BATTLE] },
            protection_filter: { from_harm: true },
          },
        ],
      },
      {
        ability_id: "opt_b_discard",
        choice_group: "cg_1",
        activation_mode: AST_ACTIVATION_MODES.IMMEDIATE,
        is_optional: true,
        conditions: [],
        effects: [
          {
            step: 1,
            action: AST_ACTIONS.DISCARD,
            target: {
              selection_mode: AST_SELECTION_MODES.MANUAL_CONTROLLER,
              zone_owner: "opponent",
              scope: [AST_SCOPES.TERRITORY],
              target_type: "evil_character",
              count: { fixed_value: 1 },
            },
          },
        ],
      },
    ]);

    const d1 = createCard("d_cg", "101", "Deck CG", ZONES.DECK, "p1");
    createCard("ec_cg", "201", "Evil CG", ZONES.TERRITORY, "p2", {
      Type: "Evil Character",
      Alignment: "Evil",
      IsCharacter: true,
    });
    const hero = createCard("h_cg", "t_choice_multi", "Choice Hero", ZONES.HAND, "p1", {
      Type: "Hero",
      Alignment: "Good",
      IsCharacter: true,
    });

    new MoveCardCommand(room, client1).execute({
      from: ZONES.HAND,
      to: ZONES.BATTLEFIELD,
      cardId: hero.id,
    });

    expect(state.effectChronicle.items.length).toBe(1);
    expect(state.effectChronicle.items[0].effectStepIndex).toBe(-1);
    expect(state.effectChronicle.items[0].effectLabel).toContain("Choose");

    const chooseCmd = new RespondOptionalAbilityCommand(room, client1);
    chooseCmd.execute({
      itemId: state.effectChronicle.items[0].id,
      accepted: true,
      chosenAbilityId: "opt_a_draw",
    });

    expect(p1.hand.map((c) => c.id)).toEqual([d1.id]);
    expect(room.cardLookup.get(hero.id).isProtected).toBe(true);
    expect(state.effectChronicle.history.length).toBe(2);
    expect(state.effectChronicle.history[0].effectLabel).toBe("Draw 1 card(s)");
    expect(state.effectChronicle.history[1].effectLabel).toBe("Protect this card from harm");

    // Undo restores unresolved choice group item and reverts BOTH draw and protection!
    client1.send.mockClear();
    chooseCmd.undo();

    expect(p1.hand.length).toBe(0);
    expect(p1.deck.map((c) => c.id)).toEqual([d1.id]);
    expect(room.cardLookup.get(hero.id).isProtected).toBe(false);
    expect(state.effectChronicle.history.length).toBe(0);
    expect(state.effectChronicle.items.length).toBe(1);
    expect(state.effectChronicle.items[0].abilityId).toBe("");
    expect(state.effectChronicle.items[0].effectStepIndex).toBe(-1);
    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({ action: "choose" })
    );
  });

  test("4. EffectLabelFormatter produces clean labels without snake_case across all AST actions", () => {
    expect(
      EffectLabelFormatter.formatSingleEffectLabel({
        action: AST_ACTIONS.MODIFY_STATS,
        strength_mod: 2,
        toughness_mod: 2,
        target: { target_type: "hero" },
      })
    ).toBe("Increase hero (+2/+2)");

    expect(
      EffectLabelFormatter.formatSingleEffectLabel({
        action: AST_ACTIONS.MODIFY_STATS,
        strength_mod: -3,
        toughness_mod: -1,
        target: { target_type: "evil_character" },
      })
    ).toBe("Decrease evil character (-3/-1)");

    expect(
      EffectLabelFormatter.formatSingleEffectLabel({
        action: AST_ACTIONS.MODIFY_STATS,
        strength_mod: -1,
        toughness_mod: 2,
        target: { selection_mode: AST_SELECTION_MODES.AUTOMATIC_SELF },
      })
    ).toBe("Modify this card (-1/+2)");

    expect(
      EffectLabelFormatter.formatSingleEffectLabel({
        action: AST_ACTIONS.BOUNCE,
        target: { target_type: "evil_character" },
      })
    ).toBe("Return evil character to hand");

    expect(
      EffectLabelFormatter.formatSingleEffectLabel({
        action: AST_ACTIONS.BANISH,
        target: { target_type: "artifact" },
      })
    ).toBe("Banish artifact");

    expect(
      EffectLabelFormatter.formatSingleEffectLabel({
        action: "look_and_choose",
        target: { scope: ["deck"] },
      })
    ).toBe("Look and choose card");

    expect(EffectLabelFormatter.stripCardLinks("{{101|Moses}} draws 1 card(s) and discards {{201|Pharaoh}}.")).toBe(
      "Moses draws 1 card(s) and discards Pharaoh."
    );
  });
});
