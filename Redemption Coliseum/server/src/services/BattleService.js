// server/src/services/BattleService.js
const { BattleCalculator } = require("../../../shared/BattleCalculator");
const { CombatClassifier } = require("../../../shared/rules/CombatClassifier");
const { BATTLE_STATE_REASON } = require("../../../shared/battleConstants");
const { ZONES } = require("../../../shared/zones");
const { PHASES } = require("../../../shared/phases");
const logger = require("../utils/logger");

/**
 * Service orchestrating live battle calculations, tracking battle entrance,
 * and synchronizing BattleState schema properties across clients.
 */
class BattleService {
  /**
   * Finds the opponent (defender) session ID relative to the active player.
   *
   * @param {object} state RoomState instance.
   * @returns {string} Defender session ID or empty string.
   */
  static getDefenderSessionId(state) {
    if (!state || !state.players) return "";
    for (const sessionId of state.players.keys()) {
      if (sessionId !== state.activePlayer) {
        return sessionId;
      }
    }
    return "";
  }

  /**
   * Handles a card entering battle. Updates last card played tracker and triggers recalculation.
   * Dominants or moves outside ZONES.BATTLEFIELD never count as cards played in battle.
   *
   * @param {any} room GameRoom instance.
   * @param {object} player Acting player.
   * @param {object} card Card instance entering battle.
   * @param {string} toZone Destination zone.
   */
  static onCardEnteredBattle(room, player, card, toZone) {
    if (!room || !room.state || toZone !== ZONES.BATTLEFIELD) {
      return;
    }

    // Dominants are never played "in battle"
    const typeStr = (card?.inGameType || card?.Type || "").toString().toLowerCase();
    const isDominant = typeStr.includes("dominant") || (card?.Identifier || "").toLowerCase().includes("dominant");

    if (isDominant) {
      logger.debug(
        `[BattleService] Dominant '${card?.Name}' played during battle; does NOT count as played in battle.`
      );
      this.recalculate(room);
      return;
    }

    const playerId = player?.sessionId || card?.controllerId;
    const activePlayerId = room.state.activePlayer;
    const defenderId = this.getDefenderSessionId(room.state);
    const isChar = Boolean(
      card?.IsCharacter ||
      typeStr.includes("character") ||
      typeStr.includes("hero")
    );
    if (isChar && room.state.battle) {
      if (playerId === activePlayerId) {
        room.state.battle.rescueAttemptOccurred = true;
      } else if (playerId === defenderId) {
        room.state.battle.blockOccurred = true;
        logger.info(
          `[BattleService] Blocker '${card?.Name}' entered battle for defender '${defenderId}'. Set blockOccurred = true.`
        );
      }
    }

    if (playerId) {
      room.state.lastBattleCardPlayerId = playerId;
      logger.info(
        `[BattleService] Last card played in battle set to '${playerId}' (${card?.Name || card?.id}).`
      );

      if (room.state.battle) {
        room.state.battle.initiativeOverridePlayerId = "";
        if (room.state.battle.specialInitiativePlayerId === playerId) {
          room.state.battle.specialInitiativePlayerId = "";
          logger.info(
            `[BattleService] Special Initiative fulfilled by '${playerId}'. Cleared specialInitiativePlayerId.`
          );
        }
      }
    }

    this.recalculate(room);
  }

  /**
   * Determines whether a card is a Weapon-class Enhancement.
   *
   * @param {object} card Card instance.
   * @returns {boolean} True if the card is a weapon enhancement.
   */
  static isWeaponEnhancement(card) {
    if (!card) return false;
    if (!CombatClassifier.isGoodEnhancement(card) && !CombatClassifier.isEvilEnhancement(card)) {
      return false;
    }
    const cardClass = (card.Class || "").toString().toLowerCase();
    const identifier = (card.Identifier || "").toString().toLowerCase();
    return cardClass.includes("weapon") || identifier.includes("weapon");
  }

  /**
   * Enforces the 5th Edition Rulebook / REG state-based rule:
   * "If at any point an Enhancement in battle does not have a character brigade in battle
   * to use it, the Enhancement is immediately discarded."
   *
   * @param {any} roomOrState GameRoom instance or RoomState schema.
   * @returns {Array<object>} Discarded enhancement cards.
   */
  static discardOrphanedEnhancements(roomOrState) {
    const room = roomOrState?.state ? roomOrState : null;
    const state = roomOrState?.state || roomOrState;
    if (!state || !state.battlefield || state.battlefield.length === 0) return [];

    const isArena = Boolean(state.isArenaMode ?? state.isSandboxMode);
    if (isArena) return [];

    const activePlayerId = state.activePlayer || "";
    const currentSnapshot = Array.from(state.battlefield);
    const heroesInBattle = currentSnapshot.filter(
      (c) => c.controllerId === activePlayerId && CombatClassifier.isHero(c)
    );
    const ecsInBattle = currentSnapshot.filter(
      (c) => c.controllerId !== activePlayerId && CombatClassifier.isEvilCharacter(c)
    );

    const discardedEnhancements = [];
    const { moveCard } = require("./cardService");

    for (const card of currentSnapshot) {
      const isGE = CombatClassifier.isGoodEnhancement(card);
      const isEE = CombatClassifier.isEvilEnhancement(card);
      if (!isGE && !isEE) continue;

      const isResolvingInChronicle = Boolean(
        state.effectChronicle?.items?.some((item) => item.cardId === card.id)
      );
      const isSpecialInitPlayer = Boolean(
        state.battle?.specialInitiativePlayerId &&
        state.battle.specialInitiativePlayerId === card.controllerId
      );
      if (isResolvingInChronicle || isSpecialInitPlayer) continue;

      const relevantChars = isGE ? heroesInBattle : ecsInBattle;
      const hasMatchingChar = relevantChars.some((ch) =>
        CombatClassifier.canEnhancementMatchCharacter(card, ch)
      );

      if (!hasMatchingChar) {
        const ownerId = card.originalOwnerId || card.ownerId || card.controllerId;
        const owner = state.players?.get ? state.players.get(ownerId) : state.players?.[ownerId];

        if (owner && room?.cardLookup) {
          moveCard(
            owner,
            state,
            room.cardLookup,
            ZONES.BATTLEFIELD,
            ZONES.DISCARD,
            card.id,
            1,
            {},
            "",
            "",
            { isAbilityAction: true }
          );
        } else {
          const idx = state.battlefield.findIndex((c) => c.id === card.id);
          if (idx !== -1) {
            const [removed] = state.battlefield.splice(idx, 1);
            removed.zone = ZONES.DISCARD;
            if (removed.attachedTo) removed.attachedTo = null;
            if (owner && owner[ZONES.DISCARD]) {
              owner[ZONES.DISCARD].push(removed);
            }
          }
        }

        discardedEnhancements.push(card);
        const logMsg = `${card.Name || "Enhancement"} is discarded (no character with matching brigade in battle).`;
        logger.info(`[BattleService] ${logMsg}`);
        if (typeof room?.broadcastGameLog === "function") {
          room.broadcastGameLog(logMsg);
        }
      }
    }

    return discardedEnhancements;
  }

  /**
   * Recalculates battle numbers and updates state.battle schema.
   *
   * @param {any} roomOrState GameRoom instance or RoomState schema.
   * @returns {object|null} Evaluation result or null.
   */
  static recalculate(roomOrState) {
    const state = roomOrState?.state || roomOrState;
    if (!state || !state.battle) return null;

    const activePlayerId = state.activePlayer || "";
    const defenderPlayerId = this.getDefenderSessionId(state);

    const initialList = state.battlefield ? Array.from(state.battlefield) : [];
    const initialRescuer = BattleCalculator.calculateSide(initialList, activePlayerId);
    if (initialRescuer.characters.length > 0 && state.battle) {
      state.battle.rescueAttemptOccurred = true;
    }
    const initialBlocker = BattleCalculator.calculateSide(initialList, defenderPlayerId);
    if (initialBlocker.characters.length > 0 && state.battle) {
      state.battle.blockOccurred = true;
    }

    // State-based rule: discard any enhancement in battle lacking a matching character brigade
    this.discardOrphanedEnhancements(roomOrState);

    const battlefieldList = state.battlefield ? Array.from(state.battlefield) : [];

    const result = BattleCalculator.evaluateBattle({
      battlefield: battlefieldList,
      activePlayerId,
      defenderPlayerId,
      lastBattleCardPlayerId: state.lastBattleCardPlayerId || "",
      currentPhase: state.currentPhase || PHASES.BATTLE,
      blockOccurred: Boolean(state.battle?.blockOccurred),
    });

    state.battle.rescuerStrength = result.rescuer.strength;
    state.battle.rescuerToughness = result.rescuer.toughness;
    state.battle.blockerStrength = result.blocker.strength;
    state.battle.blockerToughness = result.blocker.toughness;
    if (result.initiativePlayerId && state.battle.initiativeOverridePlayerId) {
      state.battle.initiativePlayerId = state.battle.initiativeOverridePlayerId;
    } else {
      state.battle.initiativeOverridePlayerId = "";
      state.battle.initiativePlayerId = result.initiativePlayerId;
    }
    state.battle.stateReason = result.stateReason;
    state.battle.lastCardPlayedPlayerId = state.lastBattleCardPlayerId || "";

    logger.debug(
      `[BattleService] Recalculated: Rescuer ${result.rescuer.strength}/${result.rescuer.toughness}, ` +
      `Blocker ${result.blocker.strength}/${result.blocker.toughness}, Reason: ${result.stateReason}, ` +
      `Initiative: ${result.initiativePlayerId || "none"}`
    );

    return result;
  }

  /**
   * Resets battle state, cleans up temporary battle flags, discards non-weapon
   * battle enhancements, and returns surviving characters to their owner's territory.
   *
   * @param {any} roomOrState GameRoom instance or RoomState schema.
   */
  static reset(roomOrState) {
    const room = roomOrState?.state ? roomOrState : null;
    const state = roomOrState?.state || roomOrState;
    if (!state || !state.battle) return;

    state.lastBattleCardPlayerId = "";
    state.battle.rescuerStrength = 0;
    state.battle.rescuerToughness = 0;
    state.battle.blockerStrength = 0;
    state.battle.blockerToughness = 0;
    state.battle.initiativePlayerId = "";
    state.battle.specialInitiativePlayerId = "";
    state.battle.initiativeOverridePlayerId = "";
    state.battle.rescueAttemptOccurred = false;
    state.battle.blockOccurred = false;
    state.battle.stateReason = BATTLE_STATE_REASON.NO_BATTLE;
    state.battle.lastCardPlayedPlayerId = "";
    if (room) {
      room._pendingSpecialInitiativeItem = null;
    }

    const isArena = Boolean(state.isArenaMode ?? state.isSandboxMode);

    // Clean up banded cards, temporary control, phase immunities, and resolve remaining battlefield cards
    if (state.battlefield && state.battlefield.length > 0) {
      const snapshot = Array.from(state.battlefield);
      const survivingCharIds = new Set(
        snapshot
          .filter((c) => CombatClassifier.isHero(c) || CombatClassifier.isEvilCharacter(c))
          .map((c) => c.id)
      );

      for (const card of snapshot) {
        if (card.isBanded) {
          card.isBanded = false;
          card.bandedTo = "";
          if (card.originalOwnerId && card.controllerId !== card.originalOwnerId) {
            logger.info(
              `[BattleService] Reverting temporary control of banded card '${card.Name}' (${card.id}) to original owner '${card.originalOwnerId}'.`
            );
            card.controllerId = card.originalOwnerId;
          }
        }
        if (card.isImmune || card.isProtected) {
          if (!card._protection || card._protection.duration !== "permanent") {
            card.isImmune = false;
            card.isProtected = false;
            card.protectionReason = "";
            card._protection = null;
          }
        }
      }

      if (!isArena) {
        const { moveCard } = require("./cardService");
        for (const card of snapshot) {
          const ownerId = card.originalOwnerId || card.ownerId || card.controllerId;
          const owner = state.players?.get ? state.players.get(ownerId) : state.players?.[ownerId];
          if (!owner) continue;

          const isEnh = CombatClassifier.isGoodEnhancement(card) || CombatClassifier.isEvilEnhancement(card);
          const isChar = CombatClassifier.isHero(card) || CombatClassifier.isEvilCharacter(card);
          const isCarriedWeapon =
            isEnh &&
            this.isWeaponEnhancement(card) &&
            card.attachedTo &&
            survivingCharIds.has(card.attachedTo);

          const targetZone = isChar || isCarriedWeapon ? ZONES.TERRITORY : ZONES.DISCARD;
          const preservedAttachTo = isCarriedWeapon ? card.attachedTo : null;

          if (room?.cardLookup) {
            moveCard(
              owner,
              state,
              room.cardLookup,
              ZONES.BATTLEFIELD,
              targetZone,
              card.id,
              1,
              {},
              "",
              "",
              { isAbilityAction: true }
            );
            const updatedCard = room.cardLookup.get(card.id);
            if (updatedCard) {
              updatedCard.attachedTo = preservedAttachTo;
            }
          } else {
            const idx = state.battlefield.findIndex((c) => c.id === card.id);
            if (idx !== -1) {
              const [removed] = state.battlefield.splice(idx, 1);
              removed.zone = targetZone;
              removed.attachedTo = preservedAttachTo;
              if (owner[targetZone]) {
                owner[targetZone].push(removed);
              }
            }
          }
        }
      }
    }

    logger.debug("[BattleService] Battle state reset to default NO_BATTLE.");
  }
}

module.exports = { BattleService };

