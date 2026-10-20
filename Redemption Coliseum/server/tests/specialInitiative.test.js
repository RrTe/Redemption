// server/tests/specialInitiative.test.js
const { RoomState } = require("../src/state/RoomState");
const { PlayerState } = require("../src/state/PlayerState");
const { Card } = require("../src/state/Card");
const { MoveCardCommand } = require("../src/commands/MoveCardCommand");
const { SelectTargetCommand } = require("../src/commands/SelectTargetCommand");
const { RespondOptionalAbilityCommand } = require("../src/commands/RespondOptionalAbilityCommand");
const { AbilityResolver } = require("../src/ast/AbilityResolver");
const { AbilityLookup } = require("../src/ast/AbilityLookup");
const { EffectChronicleService } = require("../src/services/EffectChronicleService");
const { BattleCharacterClassifier } = require("../src/services/BattleCharacterClassifier");
const { ZONES } = require("../../shared/zones");
const { PHASES } = require("../../shared/phases");
const { AST_MESSAGES } = require("../../shared/astConstants");
const { CHRONICLE_STATUS } = require("../../shared/effectChronicleConstants");
const { ActionType } = require("../../shared/actions");

describe("Special Initiative (Transition Scaffolding)", () => {
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
    state.currentPhase = PHASES.BATTLE;

    sentMessages1 = [];
    sentMessages2 = [];
    client1 = { sessionId: "p1", send: jest.fn((m, p) => sentMessages1.push({ msgType: m, payload: p })) };
    client2 = { sessionId: "p2", send: jest.fn((m, p) => sentMessages2.push({ msgType: m, payload: p })) };

    room = {
      roomId: "test-special-initiative-room",
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
      id,
      templateId,
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

  test("1. BattleCharacterClassifier.isLastCharacterInBattle accurately detects last character status", () => {
    const ec1 = createCard("ec_1", "t_ec1", "Evil Character 1", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character", Alignment: "Evil", IsCharacter: true,
    });

    expect(BattleCharacterClassifier.isLastCharacterInBattle(state.battlefield, ec1, "p2")).toBe(true);

    const ec2 = createCard("ec_2", "t_ec2", "Evil Character 2", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character", Alignment: "Evil", IsCharacter: true,
    });

    // Now there are 2 evil characters in battle
    expect(BattleCharacterClassifier.isLastCharacterInBattle(state.battlefield, ec1, "p2")).toBe(false);
    // Removing both leaves 0
    expect(BattleCharacterClassifier.isLastCharacterInBattle(state.battlefield, [ec1, ec2], "p2")).toBe(true);
  });

  test("2. Discarding opponent's last Evil Character in battle pauses discard and prompts for Special Initiative", () => {
    // Setup Hero in battle with targeted discard ability
    AbilityLookup._loadData()["hero_discard_test"] = {
      card_id: "hero_discard_test",
      card_name: "Hero Discarder",
      sides: {
        top: {
          abilities: [
            {
              ability_id: "ab_hero_discard",
              activation_mode: "immediate",
              is_optional: false,
              effects: [
                {
                  action: "discard",
                  target: {
                    selection_mode: "manual_controller",
                    zone_owner: "opponent",
                    scope: "battlefield",
                    target_type: "character",
                    count: { fixed_value: 1 },
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const hero = createCard("c_hero_p1", "hero_discard_test", "Hero Discarder", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero", Alignment: "Good", IsCharacter: true, Brigade: "Red",
    });
    const ec = createCard("c_ec_p2", "t_ec_only", "Only Blocker", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character", Alignment: "Evil", IsCharacter: true, Brigade: "Black",
    });

    // Enqueue Hero's discard ability into the chronicle
    EffectChronicleService.enqueueCards(room, [hero], "p1", ActionType.RESCUE_ATTEMPT, {
      abilityId: "ab_hero_discard",
      autoExecute: true,
      autoExecuteSupported: true,
    });

    // The hero's ability requires target selection from player 1
    const item = state.effectChronicle.items[0];
    expect(item).toBeDefined();

    // Player 1 targets the only Evil Character in battle
    const selectCmd = new SelectTargetCommand(room, client1);
    selectCmd.execute({
      itemId: item.id,
      abilityId: "ab_hero_discard",
      selectedCardIds: [ec.id],
    });

    // Interception! The card must NOT be discarded immediately
    expect(ec.zone).toBe(ZONES.BATTLEFIELD);
    expect(state.battlefield.length).toBe(2);

    // Priority transferred to defending player (p2)
    expect(state.effectChronicle.priorityPlayerId).toBe("p2");
    expect(item.pendingSpecialInitiative).toBeDefined();
    expect(item.pendingSpecialInitiative.targetCardId).toBe(ec.id);

    // Defending player received Special Initiative prompt
    expect(client2.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        abilityId: "special_initiative",
        cardId: ec.id,
        promptText: expect.stringContaining("Declare Special Initiative?"),
      })
    );
  });

  test("3. Defending player declining Special Initiative executes the pending discard", () => {
    AbilityLookup._loadData()["hero_discard_test"] = {
      card_id: "hero_discard_test",
      card_name: "Hero Discarder",
      sides: {
        top: {
          abilities: [
            {
              ability_id: "ab_hero_discard",
              activation_mode: "immediate",
              is_optional: false,
              effects: [
                {
                  action: "discard",
                  target: {
                    selection_mode: "manual_controller",
                    zone_owner: "opponent",
                    scope: "battlefield",
                    target_type: "character",
                    count: { fixed_value: 1 },
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const hero = createCard("c_hero_p1", "hero_discard_test", "Hero Discarder", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero", Alignment: "Good", IsCharacter: true, Brigade: "Red",
    });
    const ec = createCard("c_ec_p2", "t_ec_only", "Only Blocker", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character", Alignment: "Evil", IsCharacter: true, Brigade: "Black",
    });

    EffectChronicleService.enqueueCards(room, [hero], "p1", ActionType.RESCUE_ATTEMPT, {
      abilityId: "ab_hero_discard",
      autoExecute: true,
      autoExecuteSupported: true,
    });

    const item = state.effectChronicle.items[0];
    const selectCmd = new SelectTargetCommand(room, client1);
    selectCmd.execute({ itemId: item.id, abilityId: "ab_hero_discard", selectedCardIds: [ec.id] });

    expect(ec.zone).toBe(ZONES.BATTLEFIELD);

    // Defending player declines Special Initiative
    const optCmd = new RespondOptionalAbilityCommand(room, client2);
    optCmd.execute({ itemId: item.id, accepted: false });

    // EC is now discarded to player 2's discard pile
    expect(ec.zone).toBe(ZONES.DISCARD);
    expect(player2[ZONES.DISCARD].length).toBe(1);
    expect(state.battlefield.length).toBe(1); // Only Hero remains

    // Chronicle item completed
    expect(state.effectChronicle.items.length).toBe(0);
    expect(state.effectChronicle.history.length).toBe(1);
    expect(room.broadcastGameLog).toHaveBeenCalledWith(
      expect.stringContaining("Defending Player declines Special Initiative")
    );
  });

  test("4. Defending player accepting Special Initiative keeps character in battle to enable Enhancement play", () => {
    AbilityLookup._loadData()["hero_discard_test"] = {
      card_id: "hero_discard_test",
      card_name: "Hero Discarder",
      sides: {
        top: {
          abilities: [
            {
              ability_id: "ab_hero_discard",
              activation_mode: "immediate",
              is_optional: false,
              effects: [
                {
                  action: "discard",
                  target: {
                    selection_mode: "manual_controller",
                    zone_owner: "opponent",
                    scope: "battlefield",
                    target_type: "character",
                    count: { fixed_value: 1 },
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const hero = createCard("c_hero_p1", "hero_discard_test", "Hero Discarder", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero", Alignment: "Good", IsCharacter: true, Brigade: "Red",
    });
    const ec = createCard("c_ec_p2", "t_ec_only", "Only Blocker", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character", Alignment: "Evil", IsCharacter: true, Brigade: "Black",
    });

    EffectChronicleService.enqueueCards(room, [hero], "p1", ActionType.RESCUE_ATTEMPT, {
      abilityId: "ab_hero_discard",
      autoExecute: true,
      autoExecuteSupported: true,
    });

    const item = state.effectChronicle.items[0];
    const selectCmd = new SelectTargetCommand(room, client1);
    selectCmd.execute({ itemId: item.id, abilityId: "ab_hero_discard", selectedCardIds: [ec.id] });

    // Defending player accepts Special Initiative
    const optCmd = new RespondOptionalAbilityCommand(room, client2);
    optCmd.execute({ itemId: item.id, accepted: true });

    // Character STAYS in battle!
    expect(ec.zone).toBe(ZONES.BATTLEFIELD);
    expect(player2[ZONES.DISCARD].length).toBe(0);
    expect(state.battlefield.length).toBe(2);

    expect(room.broadcastGameLog).toHaveBeenCalledWith(
      expect.stringContaining("Defending Player declares Special Initiative to defend Only Blocker")
    );

    // Now, defending player can legally play an Evil Enhancement into battle
    const evilEnh = createCard("ee_hand_1", "ee_t1", "Evil Enhancement", ZONES.HAND, "p2", {
      Type: "Evil Enhancement", Alignment: "Evil", IsEnhancement: true, Brigade: "Black",
    });

    const moveCmd = new MoveCardCommand(room, client2);
    expect(() => {
      moveCmd.execute({ from: ZONES.HAND, to: ZONES.BATTLEFIELD, cardId: evilEnh.id });
    }).not.toThrow();

    // Enhancement successfully moved to battle (combat guard allowed it because EC is in battle)
    expect(evilEnh.zone).toBe(ZONES.BATTLEFIELD);
  });

  test("5. Discarding one of two characters in battle does NOT trigger Special Initiative", () => {
    AbilityLookup._loadData()["hero_discard_test"] = {
      card_id: "hero_discard_test",
      card_name: "Hero Discarder",
      sides: {
        top: {
          abilities: [
            {
              ability_id: "ab_hero_discard",
              activation_mode: "immediate",
              is_optional: false,
              effects: [
                {
                  action: "discard",
                  target: {
                    selection_mode: "manual_controller",
                    zone_owner: "opponent",
                    scope: "battlefield",
                    target_type: "character",
                    count: { fixed_value: 1 },
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const hero = createCard("c_hero_p1", "hero_discard_test", "Hero Discarder", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero", Alignment: "Good", IsCharacter: true, Brigade: "Red",
    });
    const ec1 = createCard("c_ec1_p2", "t_ec1", "First Blocker", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character", Alignment: "Evil", IsCharacter: true, Brigade: "Black",
    });
    const ec2 = createCard("c_ec2_p2", "t_ec2", "Second Blocker", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character", Alignment: "Evil", IsCharacter: true, Brigade: "Black",
    });

    EffectChronicleService.enqueueCards(room, [hero], "p1", ActionType.RESCUE_ATTEMPT, {
      abilityId: "ab_hero_discard",
      autoExecute: true,
      autoExecuteSupported: true,
    });

    const item = state.effectChronicle.items[0];
    const selectCmd = new SelectTargetCommand(room, client1);
    selectCmd.execute({ itemId: item.id, abilityId: "ab_hero_discard", selectedCardIds: [ec1.id] });

    // ec1 is discarded immediately because ec2 remains in battle
    expect(ec1.zone).toBe(ZONES.DISCARD);
    expect(ec2.zone).toBe(ZONES.BATTLEFIELD);
    expect(client2.send).not.toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.anything()
    );
  });

  test("6. Discarding a banded opponent-controlled card owned by acting player routes to true owner's discard pile", () => {
    AbilityLookup._loadData()["hero_discard_test"] = {
      card_id: "hero_discard_test",
      card_name: "Hero Discarder",
      sides: {
        top: {
          abilities: [
            {
              ability_id: "ab_hero_discard",
              activation_mode: "immediate",
              is_optional: false,
              effects: [
                {
                  action: "discard",
                  target: {
                    selection_mode: "manual_controller",
                    zone_owner: "opponent",
                    scope: "battlefield",
                    target_type: "character",
                    count: { fixed_value: 1 },
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const hero = createCard("c_hero_p1", "hero_discard_test", "Hero Discarder", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero", Alignment: "Good", IsCharacter: true, Brigade: "Red",
    });

    // Player 2 controls their own blocker
    const ownEc = createCard("c_own_ec_p2", "t_ec_own", "Own Blocker", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character", Alignment: "Evil", IsCharacter: true, Brigade: "Black",
      ownerId: "p2", originalOwnerId: "p2", controllerId: "p2",
    });

    // Player 2 also controls an Evil Character originally owned by Player 1 (banded into battle)
    const bandedEc = createCard("c_banded_ec", "t_ec_banded", "Banded Egyptian Charioteers", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character", Alignment: "Evil", IsCharacter: true, Brigade: "Black",
      ownerId: "p1", originalOwnerId: "p1", controllerId: "p2",
    });

    EffectChronicleService.enqueueCards(room, [hero], "p1", ActionType.RESCUE_ATTEMPT, {
      abilityId: "ab_hero_discard",
      autoExecute: true,
      autoExecuteSupported: true,
    });

    const item = state.effectChronicle.items[0];
    const selectCmd = new SelectTargetCommand(room, client1);

    // Player 1 targets the banded EC (fighting on Player 2's side, but owned by Player 1)
    selectCmd.execute({ itemId: item.id, abilityId: "ab_hero_discard", selectedCardIds: [bandedEc.id] });

    // 1. Special Initiative does not trigger because ownEc remains in battle on Player 2's side
    expect(client2.send).not.toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.anything()
    );

    // 2. The card is successfully discarded to its TRUE OWNER's discard pile (player 1), NOT player 2
    expect(bandedEc.zone).toBe(ZONES.DISCARD);
    expect(player1[ZONES.DISCARD].length).toBe(1);
    expect(player1[ZONES.DISCARD][0].id).toBe(bandedEc.id);
    expect(player2[ZONES.DISCARD].length).toBe(0);

    // 3. Player 2's own blocker is still in the battlefield
    expect(ownEc.zone).toBe(ZONES.BATTLEFIELD);
    expect(state.battlefield.length).toBe(2); // hero + ownEc
  });

  test("7. Optional ability requiring targeting executes target discard and prompts Special Initiative cleanly", () => {
    AbilityLookup._loadData()["optional_enhancement_test"] = {
      card_id: "optional_enhancement_test",
      card_name: "Optional Discard Enhancement",
      sides: {
        top: {
          abilities: [
            {
              ability_id: "ab_opt_discard",
              activation_mode: "immediate",
              is_optional: true,
              effects: [
                {
                  action: "discard",
                  target: {
                    selection_mode: "manual_controller",
                    zone_owner: "opponent",
                    scope: "battlefield",
                    target_type: "character",
                    count: { fixed_value: 1 },
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const hero = createCard("c_hero_p1", "t_hero", "Attacking Hero", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero", Alignment: "Good", IsCharacter: true, Brigade: "Red",
    });

    const ec = createCard("c_ec_p2", "optional_enhancement_test", "Evil Blocker", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character", Alignment: "Evil", IsCharacter: true, Brigade: "Black",
    });

    // Enqueue evil character's optional battle ability
    EffectChronicleService.enqueueCards(room, [ec], "p2", ActionType.BLOCK_RESCUE, {
      abilityId: "ab_opt_discard",
      autoExecute: true,
      autoExecuteSupported: true,
      isOptional: true,
    });

    const item = state.effectChronicle.items[0];

    // 1. Initial execution prompts defending player (p2) for optional confirmation
    expect(client2.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        abilityId: "ab_opt_discard",
        itemId: item.id,
      })
    );

    // 2. Player 2 accepts optional activation -> prompts target selection
    const respondCmd = new RespondOptionalAbilityCommand(room, client2);
    respondCmd.execute({ itemId: item.id, abilityId: "ab_opt_discard", accepted: true });

    expect(client2.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_TARGET_SELECTION,
      expect.objectContaining({
        itemId: item.id,
        eligibleCardIds: [hero.id],
      })
    );

    // 3. Player 2 selects Hero as target
    const selectCmd = new SelectTargetCommand(room, client2);
    selectCmd.execute({ itemId: item.id, abilityId: "ab_opt_discard", selectedCardIds: [hero.id] });

    // 4. Special Initiative MUST trigger for Player 1 (the targeted hero's controller)!
    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        action: "special_initiative",
        cardId: hero.id,
      })
    );

    // 5. Player 2 must NOT receive a duplicate confirmation prompt
    const p2OptCalls = sentMessages2.filter((m) => m.msgType === AST_MESSAGES.REQUEST_OPTIONAL_ABILITY);
    expect(p2OptCalls.length).toBe(1); // Only the initial prompt, never a duplicate!

    // 6. Chronicle item must NOT be prematurely deleted
    expect(state.effectChronicle.items.length).toBe(1);

    // 7. Player 1 declines Special Initiative -> hero is discarded
    const respondSiCmd = new RespondOptionalAbilityCommand(room, client1);
    respondSiCmd.execute({ itemId: item.id, abilityId: "special_initiative", accepted: false });

    expect(hero.zone).toBe(ZONES.DISCARD);
    expect(state.effectChronicle.items.length).toBe(0);
  });

  test("8. Automatic_all mass-discard in battle scope targets all heroes and triggers Special Initiative", () => {
    // Setup Thrown into the Nile style ability
    AbilityLookup._loadData()["thrown_into_nile_test"] = {
      card_id: "thrown_into_nile_test",
      card_name: "Thrown into the Nile",
      sides: {
        top: {
          abilities: [
            {
              ability_id: "ab_mass_discard",
              activation_mode: "immediate",
              is_optional: false,
              effects: [
                {
                  action: "discard",
                  target: {
                    selection_mode: "automatic_all",
                    zone_owner: "either",
                    scope: "battle",
                    target_type: "hero",
                    alignment: "good",
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const hero1 = createCard("c_hero1_p1", "t_hero1", "First Hero", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero", Alignment: "Good", IsCharacter: true, Brigade: "Red",
    });
    const hero2 = createCard("c_hero2_p1", "t_hero2", "Second Hero", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero", Alignment: "Good", IsCharacter: true, Brigade: "Green",
    });
    const ec = createCard("c_ec_p2", "thrown_into_nile_test", "Pharaoh's Guard", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character", Alignment: "Evil", IsCharacter: true, Brigade: "Pale Green",
    });

    // Enqueue mass discard ability for player 2
    EffectChronicleService.enqueueCards(room, [ec], "p2", ActionType.BLOCK_RESCUE, {
      abilityId: "ab_mass_discard",
      autoExecute: true,
      autoExecuteSupported: true,
    });

    const item = state.effectChronicle.items[0];
    expect(item).toBeDefined();

    // Special initiative triggered for player 1 because all player 1 heroes in battle are targeted
    expect(hero1.zone).toBe(ZONES.BATTLEFIELD);
    expect(hero2.zone).toBe(ZONES.BATTLEFIELD);
    expect(state.effectChronicle.priorityPlayerId).toBe("p1");
    expect(item.pendingSpecialInitiative).toBeDefined();
    expect(item.pendingSpecialInitiative.targetCardIds).toEqual([hero1.id, hero2.id]);

    expect(client1.send).toHaveBeenCalledWith(
      AST_MESSAGES.REQUEST_OPTIONAL_ABILITY,
      expect.objectContaining({
        action: "special_initiative",
        cardId: hero1.id,
        promptText: expect.stringContaining("All characters (2) in battle targeted for discard!"),
      })
    );

    // Player 1 declines Special Initiative -> BOTH heroes must be discarded!
    const respondCmd = new RespondOptionalAbilityCommand(room, client1);
    respondCmd.execute({ itemId: item.id, abilityId: "special_initiative", accepted: false });

    expect(hero1.zone).toBe(ZONES.DISCARD);
    expect(hero2.zone).toBe(ZONES.DISCARD);
    expect(state.battlefield.filter(c => c.controllerId === "p1").length).toBe(0);
    expect(state.effectChronicle.items.length).toBe(0);
  });

  test("9. Automatic_all mass-discard accepted Special Initiative keeps all heroes in battle", () => {
    AbilityLookup._loadData()["thrown_into_nile_test"] = {
      card_id: "thrown_into_nile_test",
      card_name: "Thrown into the Nile",
      sides: {
        top: {
          abilities: [
            {
              ability_id: "ab_mass_discard",
              activation_mode: "immediate",
              is_optional: false,
              effects: [
                {
                  action: "discard",
                  target: {
                    selection_mode: "automatic_all",
                    zone_owner: "either",
                    scope: "battle",
                    target_type: "hero",
                    alignment: "good",
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const hero1 = createCard("c_hero1_p1", "t_hero1", "First Hero", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero", Alignment: "Good", IsCharacter: true, Brigade: "Red",
    });
    const hero2 = createCard("c_hero2_p1", "t_hero2", "Second Hero", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero", Alignment: "Good", IsCharacter: true, Brigade: "Green",
    });
    const ec = createCard("c_ec_p2", "thrown_into_nile_test", "Pharaoh's Guard", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character", Alignment: "Evil", IsCharacter: true, Brigade: "Pale Green",
    });

    EffectChronicleService.enqueueCards(room, [ec], "p2", ActionType.BLOCK_RESCUE, {
      abilityId: "ab_mass_discard",
      autoExecute: true,
      autoExecuteSupported: true,
    });

    const item = state.effectChronicle.items[0];

    // Player 1 accepts Special Initiative -> BOTH heroes remain in battle!
    const respondCmd = new RespondOptionalAbilityCommand(room, client1);
    respondCmd.execute({ itemId: item.id, abilityId: "special_initiative", accepted: true });

    expect(hero1.zone).toBe(ZONES.BATTLEFIELD);
    expect(hero2.zone).toBe(ZONES.BATTLEFIELD);
    expect(state.battlefield.filter(c => c.controllerId === "p1").length).toBe(2);
    expect(state.effectChronicle.items.length).toBe(0);
  });

  test("10. Mass enhancement discard (Given to Israel pattern) only discards enhancements and never triggers Special Initiative", () => {
    // Given to Israel discard ability targeting evil enhancements in battle
    AbilityLookup._loadData()["given_to_israel_test"] = {
      card_id: "given_to_israel_test",
      card_name: "Given to Israel",
      sides: {
        top: {
          abilities: [
            {
              ability_id: "ab_discard_evil_enhancements",
              activation_mode: "immediate",
              is_optional: false,
              effects: [
                {
                  action: "discard",
                  target: {
                    selection_mode: "automatic_all",
                    zone_owner: "either",
                    scope: "battle",
                    target_type: "enhancement",
                    alignment: "evil",
                  },
                },
              ],
            },
          ],
        },
      },
    };

    const hero = createCard("c_hero_p1", "t_hero", "Attacking Hero", ZONES.BATTLEFIELD, "p1", {
      Type: "Hero", Alignment: "Good", IsCharacter: true, Brigade: "Purple",
    });
    const ge = createCard("c_ge_p1", "given_to_israel_test", "Given to Israel", ZONES.BATTLEFIELD, "p1", {
      Type: "GE", Alignment: "Good", IsEnhancement: true, Brigade: "Purple",
    });
    const ec = createCard("c_ec_p2", "t_ec_achish", "King Achish", ZONES.BATTLEFIELD, "p2", {
      Type: "Evil Character", Alignment: "Evil", IsCharacter: true, Brigade: "Black",
    });
    const ee = createCard("c_ee_p2", "t_ee_card", "Opponent EE", ZONES.BATTLEFIELD, "p2", {
      Type: "EE", Alignment: "Evil", IsEnhancement: true, Brigade: "Black",
    });

    // Enqueue Given to Israel's discard ability for player 1
    EffectChronicleService.enqueueCards(room, [ge], "p1", ActionType.PLAY_GOOD_ENHANCEMENT, {
      abilityId: "ab_discard_evil_enhancements",
      autoExecute: true,
      autoExecuteSupported: true,
    });

    // Discard must execute directly without triggering Special Initiative on King Achish!
    expect(ee.zone).toBe(ZONES.DISCARD);
    expect(ec.zone).toBe(ZONES.BATTLEFIELD);
    expect(hero.zone).toBe(ZONES.BATTLEFIELD);
    expect(ge.zone).toBe(ZONES.BATTLEFIELD);

    // No Special Initiative message sent to player 2
    const siCalls = sentMessages2.filter(
      (m) => m.msgType === AST_MESSAGES.REQUEST_OPTIONAL_ABILITY && m.payload?.action === "special_initiative"
    );
    expect(siCalls.length).toBe(0);
  });
});


