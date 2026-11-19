// server/src/ast/EffectMutationReverser.js
const { restoreCardAtIndex } = require("../services/cardService");
const { ZONES } = require("../../../shared/zones");
const { AST_ACTIONS } = require("../../../shared/astConstants");
const { formatCardLink } = require("../utils/gameLogFormatter");

/**
 * Pure mutation reversal utility for AST execution snapshots.
 * Supports strict player Undo rollbacks and REG-compliant selective reversal
 * (e.g. Negate/Interrupt skipping cards that left the target zone or diverted Lost Souls).
 */
class EffectMutationReverser {
  /**
   * Extracts unified card movements from a MutationSnapshot.
   * Supports generic `movedCards` as well as legacy DRAW and DISCARD snapshot schemas.
   *
   * @param {object} snapshot Mutation snapshot.
   * @param {object} [defaultPlayer] Fallback acting player.
   * @returns {Array<object>} Ordered movement descriptors.
   */
  static extractMovements(snapshot, defaultPlayer = null) {
    if (!snapshot) return [];
    if (Array.isArray(snapshot.movedCards) && snapshot.movedCards.length > 0) {
      return snapshot.movedCards;
    }

    const movements = [];
    const fallbackOwnerId = snapshot.playerId || defaultPlayer?.sessionId || "";

    if (snapshot.action === AST_ACTIONS.DRAW) {
      for (const cardId of snapshot.movedCardIds || []) {
        movements.push({
          cardId,
          fromZone: ZONES.DECK,
          toZone: snapshot.toZone || ZONES.HAND,
          ownerId: fallbackOwnerId,
          wasLostSoulDiversion: false,
        });
      }
      for (const cardId of snapshot.divertedCardIds || []) {
        movements.push({
          cardId,
          fromZone: ZONES.DECK,
          toZone: ZONES.LAND_OF_BONDAGE,
          ownerId: fallbackOwnerId,
          wasLostSoulDiversion: true,
        });
      }
    } else if (snapshot.action === AST_ACTIONS.DISCARD) {
      for (const entry of snapshot.discardedCards || []) {
        movements.push({
          ...entry,
          fromZone: entry.fromZone || ZONES.TERRITORY,
          toZone: entry.toZone || ZONES.DISCARD,
          ownerId: entry.ownerId || fallbackOwnerId,
        });
      }
    }
    return movements;
  }

  /**
   * Reverses a single AST MutationSnapshot (movements, stat modifications, immunity/protection).
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active game room.
   * @param {object} snapshot Captured pre-mutation snapshot.
   * @param {object} [actingPlayer] Acting player performing the rollback.
   * @param {object} [options={}] Reversal flags.
   * @param {boolean} [options.requireCurrentZoneMatch=false] REG rule: skip cards no longer in `toZone`.
   * @param {boolean} [options.skipDivertedLostSouls=false] REG rule: leave rule-diverted Lost Souls in LoB.
   * @param {boolean} [options.isUndo=true] Indicates player Undo context.
   * @returns {{
   *   reversedMovements: Array<{ cardOrName: any, fromZone: string, toZone: string, isOpponent: boolean }>,
   *   extraDetails: string[],
   *   battlefieldAffected: boolean
   * }}
   */
  static revertSnapshot(room, snapshot, actingPlayer = null, options = {}) {
    const emptyResult = { reversedMovements: [], extraDetails: [], battlefieldAffected: false };
    if (!room || !room.state || !snapshot) return emptyResult;

    const {
      requireCurrentZoneMatch = false,
      skipDivertedLostSouls = false,
    } = options;

    const reversedMovements = [];
    const extraDetails = [];
    let battlefieldAffected = false;

    // 1. Reverse card zone movements in reverse execution order
    const movements = this.extractMovements(snapshot, actingPlayer);
    for (let i = movements.length - 1; i >= 0; i--) {
      const move = movements[i];
      if (!move || !move.cardId) continue;
      if (skipDivertedLostSouls && move.wasLostSoulDiversion) continue;

      const card = room.cardLookup?.get(move.cardId);
      if (!card) continue;
      if (requireCurrentZoneMatch && card.zone !== move.toZone) continue;

      const targetOwnerId =
        move.previousControllerId ||
        move.ownerId ||
        move.cardSnapshot?.controllerId ||
        actingPlayer?.sessionId;
      const owner = (targetOwnerId && room.state.players?.get(targetOwnerId)) || actingPlayer;

      restoreCardAtIndex(
        owner,
        room.state,
        room.cardLookup,
        move.cardId,
        card.zone || move.toZone,
        move.fromZone,
        typeof move.fromIndex === "number" ? move.fromIndex : -1,
        move.cardSnapshot || null,
        { clearLostSoulActions: Boolean(move.wasLostSoulDiversion) }
      );

      if (move.fromZone === ZONES.BATTLEFIELD || move.toZone === ZONES.BATTLEFIELD) {
        battlefieldAffected = true;
      }

      const isOwnerOpponent = Boolean(owner && actingPlayer && owner.sessionId !== actingPlayer.sessionId);
      reversedMovements.push({
        cardOrName: card || move,
        fromZone: move.toZone,
        toZone: move.fromZone,
        isOpponent: isOwnerOpponent,
      });
    }

    // 2. Reverse stat counter modifications in reverse order
    const mods = Array.isArray(snapshot.modifications) ? snapshot.modifications : [];
    for (let i = mods.length - 1; i >= 0; i--) {
      const mod = mods[i];
      const card = mod?.cardId ? room.cardLookup?.get(mod.cardId) : null;
      if (!card || !card.counters) continue;

      this._restoreCounterValue(card.counters, "strength_mod", mod.prevStrengthMod, mod.hadStrengthMod);
      this._restoreCounterValue(card.counters, "toughness_mod", mod.prevToughnessMod, mod.hadToughnessMod);

      if (card.zone === ZONES.BATTLEFIELD) {
        battlefieldAffected = true;
      }
      extraDetails.push(`reverted stats on ${formatCardLink(card)}`);
    }

    // 3. Reverse immunity / protection flags and zone protections
    if (snapshot.zoneProtectionChange?.cardId) {
      const sourceCard = room.cardLookup?.get(snapshot.zoneProtectionChange.cardId);
      if (sourceCard) {
        const prevZP = snapshot.zoneProtectionChange.prevZoneProtection;
        sourceCard._zoneProtection = prevZP ? { ...prevZP } : null;
      }
    }

    const immunityChanges = Array.isArray(snapshot.immunityChanges) ? snapshot.immunityChanges : [];
    for (let i = immunityChanges.length - 1; i >= 0; i--) {
      const chg = immunityChanges[i];
      const card = chg?.cardId ? room.cardLookup?.get(chg.cardId) : null;
      if (!card) continue;

      card.isImmune = Boolean(chg.prevIsImmune);
      card.isProtected = Boolean(chg.prevIsProtected);
      card.protectionReason = chg.prevProtectionReason || "";
      card._protection = chg.prevProtection ? { ...chg.prevProtection } : null;

      if (card.zone === ZONES.BATTLEFIELD) {
        battlefieldAffected = true;
      }
      extraDetails.push(`reverted protection on ${formatCardLink(card)}`);
    }

    return { reversedMovements, extraDetails, battlefieldAffected };
  }

  /**
   * Reverses an array of MutationSnapshots in reverse chronological order.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active game room.
   * @param {Array<object>} snapshots Mutation snapshot sequence.
   * @param {object} [actingPlayer] Acting player performing the rollback.
   * @param {object} [options={}] Reversal flags forwarded to `revertSnapshot`.
   * @returns {{
   *   reversedMovements: Array<{ cardOrName: any, fromZone: string, toZone: string, isOpponent: boolean }>,
   *   extraDetails: string[],
   *   battlefieldAffected: boolean
   * }}
   */
  static revertSnapshots(room, snapshots, actingPlayer = null, options = {}) {
    const reversedMovements = [];
    const extraDetails = [];
    let battlefieldAffected = false;

    if (!Array.isArray(snapshots) || snapshots.length === 0) {
      return { reversedMovements, extraDetails, battlefieldAffected };
    }

    for (let i = snapshots.length - 1; i >= 0; i--) {
      const res = this.revertSnapshot(room, snapshots[i], actingPlayer, options);
      if (res.reversedMovements.length > 0) reversedMovements.push(...res.reversedMovements);
      if (res.extraDetails.length > 0) extraDetails.push(...res.extraDetails);
      if (res.battlefieldAffected) battlefieldAffected = true;
    }

    return { reversedMovements, extraDetails, battlefieldAffected };
  }

  /** @private */
  static _restoreCounterValue(counters, key, prevValue = 0, hadKey = true) {
    if (!counters) return;
    const numericPrev = typeof prevValue === "number" ? prevValue : 0;
    if (typeof counters.set === "function") {
      if (hadKey === false && numericPrev === 0 && typeof counters.delete === "function") {
        counters.delete(key);
      } else {
        counters.set(key, numericPrev);
      }
    } else if (hadKey === false && numericPrev === 0) {
      delete counters[key];
    } else {
      counters[key] = numericPrev;
    }
  }
}

module.exports = { EffectMutationReverser };
