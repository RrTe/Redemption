// server/src/ast/handlers/ZoneTransferHandler.js
const { moveCard } = require("../../services/cardService");
const { ZONES } = require("../../../../shared/zones");
const { MAX_HAND_SIZE } = require("../../../../shared/card-constants");
const {
  AST_ACTIONS,
  AST_SELECTION_MODES,
} = require("../../../../shared/astConstants");
const { TargetSelectionService } = require("../TargetSelectionService");
const { BattleCharacterClassifier } = require("../../services/BattleCharacterClassifier");
const { SpecialInitiativeService } = require("../../services/SpecialInitiativeService");
const { ActionTelegraphService } = require("../../services/ActionTelegraphService");
const { BattleService } = require("../../services/BattleService");
const logger = require("../../utils/logger");

/**
 * Handler for executing zone transfer ability primitives:
 * - bounce / return to hand (moves cards to owner's hand, handling overflow per REG 1074)
 * - topdeck (moves cards to top of owner's deck)
 * - underdeck (moves cards to bottom of owner's deck)
 * - banish / remove from the game (moves cards to owner's banish pile)
 * - place (moves cards to specified destination zone)
 */
class ZoneTransferHandler {
  /**
   * Executes a zone transfer effect step.
   *
   * @param {object} context Execution context.
   * @param {import('../../rooms/GameRoom').GameRoom} context.room Active game room.
   * @param {object} context.player Acting player.
   * @param {object} context.effect AST effect object.
   * @param {object} context.item Chronicle item being executed.
   * @param {object} [context.options] Optional parameters (e.g. explicit targetCardIds).
   * @param {object} [context.previousSnapshot] Snapshot from previous step for chained targets.
   * @returns {{ success: boolean, snapshot: object, logEntry?: string, error?: string }} Execution result.
   */
  static execute(context) {
    const { room, player, effect, item, options = {}, previousSnapshot } = context;

    if (!room || !player) {
      return { success: false, snapshot: null, error: "Missing context" };
    }

    const action = effect?.action || AST_ACTIONS.BOUNCE;
    const { toZone, position } = this._determineDestination(effect, action);
    const targetDef = effect?.target || {};
    const isAll = targetDef.selection_mode === AST_SELECTION_MODES.AUTOMATIC_ALL || targetDef.all === true;
    const count = isAll
      ? Infinity
      : (typeof targetDef.count?.fixed_value === "number" ? targetDef.count.fixed_value : 1);

    const sourceCard = item?.cardId ? room.cardLookup?.get(item.cardId) : null;
    const targets = this._resolveTargets(
      room,
      player,
      targetDef,
      options,
      count,
      sourceCard,
      action,
      previousSnapshot,
      toZone
    );

    if (targets.length === 0) {
      logger.info(`[ZoneTransferHandler] No eligible targets found for action '${action}'.`);
      return {
        success: true,
        snapshot: {
          action,
          timestamp: Date.now(),
          playerId: player.sessionId,
          cardId: item?.cardId || "",
          transferredCards: [],
          movedCards: [],
        },
        logEntry: `${player.name} finds no eligible targets for ${action}.`,
      };
    }

    // Special Initiative Interception Check:
    // Triggers if removing target cards would clear all opponent battle characters.
    const siResult = SpecialInitiativeService.checkAndTrigger(
      room,
      player,
      targets,
      item,
      options,
      `targeted for ${action}`
    );
    if (siResult) {
      return siResult;
    }

    // Broadcast action telegraph to both players for deterministic/resolved targets
    const explicitPileId =
      options.targetPileId ||
      (targets[0]?.card?.zone === ZONES.DECK ? `${targets[0].owner.sessionId}:${ZONES.DECK}` : undefined);
    ActionTelegraphService.send(room, {
      sourceCardId: item?.cardId,
      targetCardIds: targets.map((t) => t.card.id),
      targetPileId: explicitPileId,
      action,
      durationMs: 500,
    });

    if (options.specialInitiativeDeclined && room.state?.battle) {
      room.state.battle.specialInitiativePlayerId = "";
    }

    const transferredSnapshots = [];
    const logEntries = [];

    // Execute zone transfers for each resolved target
    for (const { card, owner } of targets) {
      const fromZone = card.zone;
      const trueOwnerId = card.originalOwnerId || card.ownerId;
      const trueOwner = (trueOwnerId && room.state.players.get(trueOwnerId)) || owner;

      // Determine effective destination zone (handling hand limit overflow per REG 1074)
      let effectiveToZone = toZone;
      if (toZone === ZONES.HAND) {
        const currentHand = trueOwner[ZONES.HAND] || [];
        if (currentHand.length >= MAX_HAND_SIZE) {
          const isArtifact = card?.Type && String(card.Type).toLowerCase().includes("artifact");
          const isChar = BattleCharacterClassifier.isHero(card) || BattleCharacterClassifier.isEvilCharacter(card);
          if (isArtifact) {
            effectiveToZone = ZONES.ARTIFACT;
          } else if (isChar) {
            effectiveToZone = ZONES.TERRITORY;
          } else {
            effectiveToZone = ZONES.DISCARD;
          }
          logger.info(
            `[ZoneTransferHandler] Hand limit (${MAX_HAND_SIZE}) reached for ${trueOwner.name}. Overflowing ${card.Name} to ${effectiveToZone} per REG 1074.`
          );
        }
      }

      const moveCoords = {
        position,
        targetPlayerId: trueOwner.sessionId,
      };

      const result = moveCard(
        trueOwner,
        room.state,
        room.cardLookup,
        fromZone,
        effectiveToZone,
        card.id,
        1,
        moveCoords,
        "",
        "",
        { isAbilityAction: true }
      );

      const movedOrDiverted =
        (result?.movedCards && result.movedCards[0]) ||
        (result?.divertedCards && result.divertedCards[0]);

      if (movedOrDiverted) {
        transferredSnapshots.push({
          cardId: card.id,
          name: card.Name,
          fromZone,
          toZone: movedOrDiverted.zone || effectiveToZone,
          ownerId: trueOwner.sessionId,
          position: position || "as_is",
        });
        if (result.logEntry) logEntries.push(result.logEntry);
      }
    }

    if (transferredSnapshots.some((s) => s.fromZone === ZONES.BATTLEFIELD)) {
      BattleService.recalculate(room);
    }

    const snapshot = {
      action,
      timestamp: Date.now(),
      playerId: player.sessionId,
      cardId: item?.cardId || "",
      movedCards: transferredSnapshots,
      transferredCards: transferredSnapshots,
    };

    return {
      success: true,
      snapshot,
      logEntry:
        logEntries.join(" ") ||
        `${player.name} executes ${action} on ${transferredSnapshots.length} card(s).`,
    };
  }

  /**
   * Maps action and AST effect definition to destination zone and position.
   *
   * @param {object} effect AST effect definition.
   * @param {string} action AST action name.
   * @returns {{ toZone: string, position: string | null }} Target zone and deck position.
   * @private
   */
  static _determineDestination(effect, action) {
    if (action === AST_ACTIONS.BOUNCE || action === AST_ACTIONS.RETURN_TO_HAND) {
      return { toZone: ZONES.HAND, position: null };
    }
    if (action === AST_ACTIONS.TOPDECK) {
      return { toZone: ZONES.DECK, position: "top" };
    }
    if (action === AST_ACTIONS.UNDERDECK) {
      return { toZone: ZONES.DECK, position: "bottom" };
    }
    if (action === AST_ACTIONS.BANISH || action === AST_ACTIONS.REMOVE_FROM_THE_GAME) {
      return { toZone: ZONES.BANISH, position: null };
    }
    if (action === AST_ACTIONS.TAKE) {
      const dest = effect?.destination;
      if (dest === "territory") return { toZone: ZONES.TERRITORY, position: null };
      if (dest === "battle" || dest === "battlefield") return { toZone: ZONES.BATTLEFIELD, position: null };
      if (dest === "deck") {
        return {
          toZone: ZONES.DECK,
          position: effect?.destination_position === "bottom" ? "bottom" : "top",
        };
      }
      return { toZone: ZONES.HAND, position: null };
    }
    if (action === AST_ACTIONS.PLACE) {
      const dest = effect?.destination;
      const pos = effect?.destination_position === "bottom" ? "bottom" : (effect?.destination_position === "top" ? "top" : null);
      if (dest === "hand") return { toZone: ZONES.HAND, position: null };
      if (dest === "deck") return { toZone: ZONES.DECK, position: pos || "top" };
      if (dest === "discard_pile" || dest === "discard") return { toZone: ZONES.DISCARD, position: null };
      if (dest === "banish_pile" || dest === "banish") return { toZone: ZONES.BANISH, position: null };
      if (dest === "reserve_pile" || dest === "reserve") return { toZone: ZONES.RESERVE, position: null };
      if (dest === "land_of_bondage") return { toZone: ZONES.LAND_OF_BONDAGE, position: null };
      if (dest === "land_of_redemption") return { toZone: ZONES.LAND_OF_REDEMPTION, position: null };
      return { toZone: ZONES.TERRITORY, position: null };
    }
    return { toZone: ZONES.HAND, position: null };
  }

  /**
   * Resolves target cards matching AST filter criteria.
   *
   * @param {import('../../rooms/GameRoom').GameRoom} room Active room.
   * @param {object} actingPlayer Acting player.
   * @param {object} targetDef AST target definition.
   * @param {object} options Options with explicit targetCardIds or targetPileId.
   * @param {number} count Maximum count to select.
   * @param {object} [sourceCard] Source card initiating the effect.
   * @param {string} [action] AST action name.
   * @param {object} [previousSnapshot] Snapshot from previous effect step.
   * @param {string} [toZone] Resolved destination zone.
   * @returns {Array<{ card: object, owner: object }>} Selected targets with owners.
   * @private
   */
  static _resolveTargets(
    room,
    actingPlayer,
    targetDef,
    options,
    count,
    sourceCard = null,
    action = AST_ACTIONS.BOUNCE,
    previousSnapshot = null,
    toZone = ZONES.HAND
  ) {
    // 1. Explicit pile target (e.g. top of target deck)
    if (options.targetPileId) {
      const [targetOwnerId, targetZone] = options.targetPileId.split(":");
      const targetPlayer = room.state.players.get(targetOwnerId);
      const zoneName = targetZone || ZONES.DECK;
      if (targetPlayer && targetPlayer[zoneName] && targetPlayer[zoneName].length > 0) {
        const topCard = targetPlayer[zoneName][0];
        return [{ card: topCard, owner: targetPlayer }];
      }
      return [];
    }

    // 2. Automatic self target
    if (targetDef.selection_mode === AST_SELECTION_MODES.AUTOMATIC_SELF && sourceCard) {
      const owner =
        room.state.players.get(sourceCard.controllerId || sourceCard.ownerId) || actingPlayer;
      return [{ card: sourceCard, owner }];
    }

    // 3. Resolve explicit or chained card IDs
    let explicitIds = options.targetCardIds || [];
    if (
      explicitIds.length === 0 &&
      targetDef.selection_mode === "chained_target" &&
      previousSnapshot?.movedCards
    ) {
      explicitIds = previousSnapshot.movedCards.map((c) => c.cardId);
    }

    const candidates = [];
    const zoneOwner = targetDef.zone_owner || "either";
    const playersToScan = [];

    for (const p of room.state.players.values()) {
      if (zoneOwner === "controller" && p.sessionId === actingPlayer.sessionId) {
        playersToScan.push(p);
      } else if (zoneOwner === "opponent" && p.sessionId !== actingPlayer.sessionId) {
        playersToScan.push(p);
      } else if (zoneOwner === "either" || zoneOwner === "both") {
        playersToScan.push(p);
      }
    }

    const zoneNames = TargetSelectionService._resolveTargetZones(targetDef.scope);

    for (const p of playersToScan) {
      for (const zName of zoneNames) {
        const zoneCards =
          zName === ZONES.BATTLEFIELD
            ? (room?.state?.battlefield || []).filter(
                (c) => (c.controllerId || c.ownerId) === p.sessionId
              )
            : (p[zName] || []);

        for (let i = 0; i < zoneCards.length; i++) {
          const card = zoneCards[i];

          // REG line 2829: If topdeck/underdeck would not change location of a card, not a valid target
          if (toZone === ZONES.DECK && zName === ZONES.DECK) {
            if (action === AST_ACTIONS.TOPDECK && i === 0) continue;
            if (action === AST_ACTIONS.UNDERDECK && i === zoneCards.length - 1) continue;
          }

          const filterContext = { sourceCard, actionType: action };
          if (explicitIds.length > 0) {
            if (
              explicitIds.includes(card.id) &&
              TargetSelectionService.matchesFilter(card, targetDef, filterContext)
            ) {
              candidates.push({ card, owner: p });
              if (candidates.length >= count) return candidates;
            }
          } else if (TargetSelectionService.matchesFilter(card, targetDef, filterContext)) {
            candidates.push({ card, owner: p });
            if (candidates.length >= count) return candidates;
          }
        }
      }
    }

    return candidates;
  }
}

module.exports = { ZoneTransferHandler };

