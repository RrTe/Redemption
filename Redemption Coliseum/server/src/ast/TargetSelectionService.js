// server/src/ast/TargetSelectionService.js
const { ZONES } = require("../../../shared/zones");
const {
  AST_SELECTION_MODES,
  AST_SCOPES,
  AST_ZONE_OWNERS,
  AST_ALIGNMENTS,
  AST_ACTIONS,
} = require("../../../shared/astConstants");
const { BattleCharacterClassifier } = require("../services/BattleCharacterClassifier");
const { ProtectionService } = require("../../../shared/rules/ProtectionService");

/**
 * Service for querying and evaluating valid targets according to card AST rules.
 * Pure and deterministic: inspects RoomState and returns eligible targets without direct mutation.
 */
class TargetSelectionService {
  /**
   * Evaluates valid target cards or piles based on AST target definitions.
   *
   * @param {import('../rooms/GameRoom').GameRoom} room Active game room instance.
   * @param {object} actingPlayer Player executing the ability.
   * @param {object} [context={}] Additional context (e.g. sourceCard).
   * @returns {{
   *   targetType: "card" | "pile",
   *   eligibleCardIds: string[],
   *   eligiblePiles: Array<{ id: string, label: string, ownerId: string, zone: string }>,
   *   requiresSelection: boolean,
   *   minTargets: number,
   *   maxTargets: number,
   *   canCancel: boolean,
   *   promptText: string
   * }} Evaluated target resolution details.
   */
  static resolveEligibleTargets(room, actingPlayer, targetDef = {}, context = {}) {
    const scope = targetDef.scope || AST_SCOPES.IN_PLAY;
    const targetType = targetDef.target_type || "";
    const playersToScan = this._getPlayersToScan(room, actingPlayer, targetDef.zone_owner);
    const isAll = targetDef.selection_mode === AST_SELECTION_MODES.AUTOMATIC_ALL || targetDef.all === true;
    const count = isAll
      ? Infinity
      : (typeof targetDef.count?.fixed_value === "number" ? targetDef.count.fixed_value : 1);
    const isManual = targetDef.selection_mode === AST_SELECTION_MODES.MANUAL_CONTROLLER;

    // 1. Evaluate Pile-Targeting effects (e.g. deck/discard targeting)
    if (this._isPileTargeting(scope, targetType)) {
      const eligiblePiles = [];
      const pileZone = (scope || "").toLowerCase() === AST_SCOPES.DISCARD_PILE ? ZONES.DISCARD : ZONES.DECK;

      for (const p of playersToScan) {
        const isSelf = p.sessionId === actingPlayer.sessionId;
        const pileLabel = isSelf ? "My Deck" : `${p.name}'s Deck`;
        eligiblePiles.push({
          id: `${p.sessionId}:${pileZone}`,
          label: pileLabel,
          ownerId: p.sessionId,
          zone: pileZone,
        });
      }

      return {
        targetType: "pile",
        eligibleCardIds: [],
        eligiblePiles,
        requiresSelection: isManual && eligiblePiles.length >= 1,
        minTargets: eligiblePiles.length > 0 ? 1 : 0,
        maxTargets: 1,
        canCancel: Boolean(targetDef.can_cancel),
        promptText: targetDef.prompt_text || "Select a target deck to discard from",
      };
    }

    // 2. Evaluate Card-Targeting effects
    const action = context.actionType || context.action || targetDef.action;
    const isBand = action === AST_ACTIONS.BAND || action === AST_ACTIONS.ADD_TO_BATTLE;
    const defaultZoneNames = this._resolveTargetZones(scope);
    const eligibleCardIds = [];

    for (const p of playersToScan) {
      const isSelf = p.sessionId === actingPlayer.sessionId;
      const zoneNames = isBand
        ? (isSelf ? [ZONES.TERRITORY, ZONES.HAND] : [ZONES.TERRITORY])
        : defaultZoneNames;

      for (const zName of zoneNames) {
        const zoneCards = zName === ZONES.BATTLEFIELD
          ? (room?.state?.battlefield || []).filter(c => (c.controllerId || c.ownerId) === p.sessionId)
          : (p[zName] || []);
        for (const card of zoneCards) {
          if (isBand) {
            const isChar = BattleCharacterClassifier.isHero(card) || BattleCharacterClassifier.isEvilCharacter(card);
            if (!isChar) continue;
            if (context.sourceCard) {
              const isHeroLeader = BattleCharacterClassifier.isHero(context.sourceCard);
              const isEvilLeader = BattleCharacterClassifier.isEvilCharacter(context.sourceCard);
              const cardAlign = (card.inGameAlignment || card.Alignment || "").toString().toLowerCase();
              if (isHeroLeader && !cardAlign.includes("good") && !BattleCharacterClassifier.isHero(card)) continue;
              if (isEvilLeader && !cardAlign.includes("evil") && !BattleCharacterClassifier.isEvilCharacter(card)) continue;
            }
          }
          if (this.matchesFilter(card, targetDef, context)) {
            eligibleCardIds.push(card.id);
          }
        }
      }
    }

    const minTargets = isAll ? eligibleCardIds.length : Math.min(count, eligibleCardIds.length);
    const maxTargets = isAll ? eligibleCardIds.length : count;
    const requiresSelection = isManual && eligibleCardIds.length > 0;

    return {
      targetType: "card",
      eligibleCardIds,
      eligiblePiles: [],
      requiresSelection,
      minTargets,
      maxTargets,
      canCancel: Boolean(targetDef.can_cancel),
      promptText: targetDef.prompt_text || `Select ${count} card(s) to target`,
    };
  }

  /**
   * Validates client-submitted target choices against evaluated eligible targets.
   *
   * @param {object} selection Client payload.
   * @param {string[]} [selection.selectedCardIds] Selected card IDs.
   * @param {string} [selection.selectedPileId] Selected pile ID.
   * @param {object} eligible Result of resolveEligibleTargets.
   * @returns {{ valid: boolean, reason?: string }} Validation result.
   */
  static validateSelection(selection, eligible) {
    if (!selection || !eligible) {
      return { valid: false, reason: "MISSING_PAYLOAD" };
    }

    if (eligible.targetType === "pile") {
      const chosenPile = selection.selectedPileId;
      if (!chosenPile) {
        return { valid: false, reason: "MISSING_PILE_ID" };
      }
      const isAllowed = eligible.eligiblePiles.some((p) => p.id === chosenPile);
      if (!isAllowed) {
        return { valid: false, reason: "INVALID_PILE_TARGET" };
      }
      return { valid: true };
    }

    const chosenIds = Array.isArray(selection.selectedCardIds) ? selection.selectedCardIds : [];
    if (chosenIds.length < eligible.minTargets || chosenIds.length > eligible.maxTargets) {
      return { valid: false, reason: "INVALID_TARGET_COUNT" };
    }

    for (const cardId of chosenIds) {
      if (!eligible.eligibleCardIds.includes(cardId)) {
        return { valid: false, reason: `CARD_NOT_ELIGIBLE: ${cardId}` };
      }
    }

    return { valid: true };
  }

  /**
   * Checks whether a card matches specific AST filter criteria.
   *
   * @param {object} card Card instance.
   * @param {object} targetDef AST filter definition.
   * @returns {boolean} True if card qualifies.
   */
  static matchesFilter(card, targetDef = {}, context = {}) {
    if (!card) return false;

    // Check alignment filter
    if (targetDef.alignment) {
      let cardAlign = card.inGameAlignment || card.Alignment || "";
      if (Array.isArray(cardAlign)) cardAlign = cardAlign.join("/");
      cardAlign = String(cardAlign).toLowerCase();
      if (!cardAlign.includes(targetDef.alignment.toLowerCase())) {
        return false;
      }
    }

    // Check card type filter
    const rawType = (targetDef.target_type || "").toLowerCase().trim();
    if (rawType) {
      const isCardEnh = Boolean(card.IsEnhancement) ||
        BattleCharacterClassifier.isGoodEnhancement(card) ||
        BattleCharacterClassifier.isEvilEnhancement(card) ||
        String(card.Type || "").toLowerCase().includes("enhancement");
      const isCardHero = BattleCharacterClassifier.isHero(card);
      const isCardEvilChar = BattleCharacterClassifier.isEvilCharacter(card);
      const isCardChar = card.IsCharacter || isCardHero || isCardEvilChar;
      const isCardSoul = card.isLostSoul || (card.Name && card.Name.startsWith("Lost Soul"));
      const isCardArt = Boolean(card.IsArtifact) || String(card.Type || "").toLowerCase() === "artifact";

      if (rawType.includes("enhancement")) {
        if (!isCardEnh) return false;
        if (rawType.includes("evil") && !BattleCharacterClassifier.isEvilEnhancement(card)) return false;
        if (rawType.includes("good") && !BattleCharacterClassifier.isGoodEnhancement(card)) return false;
      } else if (rawType === "hero") {
        if (!isCardHero) return false;
      } else if (rawType.includes("evil character") || rawType.includes("evil_character") || rawType === "ec") {
        if (!isCardEvilChar) return false;
      } else if (rawType.includes("character")) {
        if (!isCardChar) return false;
      } else if (rawType === "lost soul" || rawType === "lost_soul") {
        if (!isCardSoul) return false;
      } else if (rawType === "artifact") {
        if (!isCardArt) return false;
      }
    }

    // Check brigades filter
    if (Array.isArray(targetDef.brigades) && targetDef.brigades.length > 0) {
      const cardBrigades = Array.isArray(card.Brigades) ? card.Brigades.map((b) => b.toLowerCase()) : [];
      const hasMatch = targetDef.brigades.some((b) => cardBrigades.includes(b.toLowerCase()));
      if (!hasMatch) return false;
    }

    // Check card titles filter
    if (Array.isArray(targetDef.card_titles) && targetDef.card_titles.length > 0) {
      const cardName = String(card.Name || card.card_name || "").toLowerCase();
      if (!targetDef.card_titles.some((t) => cardName.includes(String(t).toLowerCase()))) {
        return false;
      }
    }

    // Check identifiers filter (matches Identifier box and ORDIR descriptors)
    if (Array.isArray(targetDef.identifiers) && targetDef.identifiers.length > 0) {
      const cardIdent = String(card.Identifier || "").toLowerCase();
      const ordir = Array.isArray(card.ORDIR) ? card.ORDIR.join(" ").toLowerCase() : "";
      const hasIdentMatch = targetDef.identifiers.some((id) => {
        const needle = String(id).toLowerCase();
        return cardIdent.includes(needle) || ordir.includes(needle);
      });
      if (!hasIdentMatch) return false;
    }

    // Check explicit card IDs filter
    if (Array.isArray(targetDef.target_card_ids) && targetDef.target_card_ids.length > 0) {
      const cardId = String(card.templateId || card.id || "");
      if (!targetDef.target_card_ids.some((id) => String(id) === cardId)) {
        return false;
      }
    }

    // Protection check: protected or immune cards cannot be targeted by harm
    if (context && context.sourceCard) {
      if (ProtectionService.isProtected(card, context.sourceCard, context.actionType || targetDef.action)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Identifies if targeting criteria correspond to a pile rather than individual cards.
   * @private
   */
  static _isPileTargeting(scope, targetType) {
    const s = (scope || "").toLowerCase().trim();
    const t = (targetType || "").toLowerCase().replace(/[\s_-]+/g, "_").trim();

    // Any targeting in deck scope is pile targeting (selecting a player's deck)
    if (s === "deck") {
      return true;
    }
    if (s === "discard_pile" || s === "discard") {
      return !t || t === "discard_pile" || t === "pile" || t === "top_card" || t === "deck";
    }
    return false;
  }

  /**
   * Resolves relevant zone names for a given target scope.
   * @private
   */
  static _resolveTargetZones(scope) {
    const s = (scope || "").toLowerCase();
    if (s === AST_SCOPES.HAND) return [ZONES.HAND];
    if (s === AST_SCOPES.DECK) return [ZONES.DECK];
    if (s === AST_SCOPES.DISCARD_PILE) return [ZONES.DISCARD];
    if (s === "territory") return [ZONES.TERRITORY];
    if (s === "battlefield" || s === AST_SCOPES.BATTLE) return [ZONES.BATTLEFIELD];
    return [ZONES.TERRITORY, ZONES.BATTLEFIELD];
  }

  /**
   * Resolves list of players according to AST zone ownership constraints.
   * @private
   */
  static _getPlayersToScan(room, actingPlayer, zoneOwner = AST_ZONE_OWNERS.EITHER) {
    const players = [];
    if (!room?.state?.players) return players;

    for (const p of room.state.players.values()) {
      const isSelf = p.sessionId === actingPlayer.sessionId;
      if (zoneOwner === AST_ZONE_OWNERS.CONTROLLER && isSelf) {
        players.push(p);
      } else if (zoneOwner === AST_ZONE_OWNERS.OPPONENT && !isSelf) {
        players.push(p);
      } else if (zoneOwner === AST_ZONE_OWNERS.EITHER || zoneOwner === AST_ZONE_OWNERS.BOTH) {
        players.push(p);
      }
    }
    return players;
  }
}

module.exports = { TargetSelectionService };
