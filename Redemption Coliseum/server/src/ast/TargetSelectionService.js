// server/src/ast/TargetSelectionService.js
const { ZONES } = require("../../../shared/zones");
const {
  AST_SELECTION_MODES,
  AST_SCOPES,
  AST_ZONE_OWNERS,
  AST_ACTIONS,
} = require("../../../shared/astConstants");
const { BattleCharacterClassifier } = require("../services/BattleCharacterClassifier");
const { ProtectionService } = require("../../../shared/rules/ProtectionService");
const { matchesCardType, matchesTargetType } = require("../../../shared/cardHierarchy");

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
   * @param {object} [targetDef={}] Target definition from AST.
   * @param {object} [context={}] Additional context (e.g. sourceCard, actionType).
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

    // 1. Evaluate Pile-Targeting effects (e.g. deck/discard/reserve targeting)
    if (this._isPileTargeting(scope, targetType)) {
      const eligiblePiles = [];
      const scopes = this._normalizeScopes(scope);
      let pileZone = ZONES.DECK;
      let pileLabelSuffix = "Deck";
      if (scopes.some((s) => s === "discard_pile" || s === "discard")) {
        pileZone = ZONES.DISCARD;
        pileLabelSuffix = "Discard";
      } else if (scopes.some((s) => s === "reserve_pile" || s === "reserve")) {
        pileZone = ZONES.RESERVE;
        pileLabelSuffix = "Reserve";
      } else if (scopes.some((s) => s === "banish_pile" || s === "banish")) {
        pileZone = ZONES.BANISH;
        pileLabelSuffix = "Banish";
      }

      for (const p of playersToScan) {
        const isSelf = p.sessionId === actingPlayer.sessionId;
        const pileLabel = isSelf ? `My ${pileLabelSuffix}` : `${p.name}'s ${pileLabelSuffix}`;

        // Check if the pile is protected from sourceCard
        if (context.sourceCard && ProtectionService.isZoneProtected(room, p, pileZone, context.sourceCard, context.actionType || targetDef.action)) {
          continue;
        }

        eligiblePiles.push({
          id: `${p.sessionId}:${pileZone}`,
          label: pileLabel,
          ownerId: p.sessionId,
          zone: pileZone,
        });
      }

      const defaultPrompt = pileZone === ZONES.DECK
        ? "Select a target deck to discard from"
        : `Select a target ${pileLabelSuffix.toLowerCase()} to affect`;

      const requiresSelection = (isManual || eligiblePiles.length > 1) && eligiblePiles.length >= 1;

      return {
        targetType: "pile",
        eligibleCardIds: [],
        eligiblePiles,
        requiresSelection,
        minTargets: eligiblePiles.length > 0 ? 1 : 0,
        maxTargets: 1,
        canCancel: Boolean(targetDef.can_cancel),
        promptText: targetDef.prompt_text || defaultPrompt,
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
          ? (room?.state?.battlefield || []).filter((c) => (c.controllerId || c.ownerId) === p.sessionId)
          : (p[zName] || []);

        for (const card of zoneCards) {
          if (isBand) {
            if (context.sourceCard && card.id === context.sourceCard.id) continue;
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
   * @param {object} eligible Result of resolveEligibleTargets.
   * @returns {{ valid: boolean, reason?: string }} Validation result.
   */
  static validateSelection(selection, eligible) {
    if (!selection || !eligible) return { valid: false, reason: "MISSING_PAYLOAD" };
    if (eligible.targetType === "pile") {
      const chosenPile = selection.selectedPileId;
      if (!chosenPile) return { valid: false, reason: "MISSING_PILE_ID" };
      return eligible.eligiblePiles.some((p) => p.id === chosenPile)
        ? { valid: true }
        : { valid: false, reason: "INVALID_PILE_TARGET" };
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
   * @param {object} [targetDef={}] AST filter definition.
   * @param {object} [context={}] Additional context.
   * @returns {boolean} True if card qualifies.
   */
  static matchesFilter(card, targetDef = {}, context = {}) {
    if (!card) return false;

    // 1. Fast-Path: Explicit target_card_ids filter (O(1))
    if (Array.isArray(targetDef.target_card_ids) && targetDef.target_card_ids.length > 0) {
      const cardId = String(card.templateId || card.id || "");
      if (!targetDef.target_card_ids.some((id) => String(id) === cardId)) {
        return false;
      }
      // Protection check applies even to specifically targeted cards
      if (context && context.sourceCard) {
        if (ProtectionService.isProtected(card, context.sourceCard, context.actionType || targetDef.action)) {
          return false;
        }
      }
      return true;
    }

    // 2. Check alignment filter
    if (targetDef.alignment) {
      let cardAlign = card.inGameAlignment || card.Alignment || "";
      if (Array.isArray(cardAlign)) cardAlign = cardAlign.join("/");
      cardAlign = String(cardAlign).toLowerCase();
      if (!cardAlign.includes(targetDef.alignment.toLowerCase())) {
        return false;
      }
    }

    // 3. Check card type filter using taxonomy and subtype resolution
    const rawType = (targetDef.target_type || "").toLowerCase().trim();
    if (rawType) {
      if (rawType === "self" || rawType === "this card") {
        if (context.sourceCard && card.id !== context.sourceCard.id) return false;
      } else {
        let activeType = (card.zone === ZONES.BATTLEFIELD || card.zone === ZONES.TERRITORY) && card.inGameType
          ? card.inGameType
          : (card.Type || "");

        if (!activeType && card.templateId) {
          try {
            const { CardRepository } = require("../../../shared/CardRepository");
            activeType = CardRepository.getById(card.templateId)?.Type || "";
          } catch (_e) {}
        }

        if (!activeType) {
          if (BattleCharacterClassifier.isHero(card)) activeType = "Hero";
          else if (BattleCharacterClassifier.isEvilCharacter(card)) activeType = "Evil Character";
          else if (card.IsEnhancement || BattleCharacterClassifier.isGoodEnhancement(card) || BattleCharacterClassifier.isEvilEnhancement(card)) activeType = "Enhancement";
          else if (card.IsArtifact) activeType = "Artifact";
          else if (card.isLostSoul || (card.Name && card.Name.startsWith("Lost Soul"))) activeType = "Lost Soul";
        }

        if (!matchesTargetType(card, rawType, activeType)) {
          return false;
        }
      }
    }

    // 4. Check brigades filter
    if (Array.isArray(targetDef.brigades) && targetDef.brigades.length > 0) {
      const cardBrigades = Array.isArray(card.Brigades)
        ? card.Brigades.map((b) => b.toLowerCase())
        : (card.Brigade ? String(card.Brigade).split("/").map((b) => b.trim().toLowerCase()) : []);
      if (!targetDef.brigades.some((b) => cardBrigades.includes(b.toLowerCase()))) return false;
    }

    // 5. Check card titles filter (with fallback for uncompiled category titles)
    if (Array.isArray(targetDef.card_titles) && targetDef.card_titles.length > 0) {
      const cardName = String(card.Name || card.card_name || "").toLowerCase();
      const hasTitleMatch = targetDef.card_titles.some((t) => {
        const titleLower = String(t).toLowerCase().trim();
        if (cardName.includes(titleLower) || titleLower.includes(cardName)) {
          return true;
        }
        // Fallback for uncompiled category titles (e.g. "Genesis Philistine", "Joshua Hero")
        let ordirList = card.ORDIR;
        let cardIdent = card.Identifier;
        if ((!ordirList || ordirList.length === 0) && card.templateId) {
          try {
            const { CardRepository } = require("../../../shared/CardRepository");
            const dbCard = CardRepository.getById(card.templateId) || CardRepository.get(card.templateId);
            if (dbCard) {
              if (!ordirList || ordirList.length === 0) ordirList = dbCard.ORDIR;
              if (!cardIdent) cardIdent = dbCard.Identifier;
            }
          } catch (_e) {}
        }
        const ordirStr = (Array.isArray(ordirList) ? ordirList.join(" ") : "").toLowerCase();
        const identStr = String(cardIdent || "").toLowerCase();
        const classStr = String(card.Class || "").toLowerCase();
        const combinedMeta = `${cardName} ${ordirStr} ${identStr} ${classStr}`;
        const tokens = titleLower.split(/\s+/).filter(Boolean);
        return tokens.length > 0 && tokens.every((token) => {
          const esc = token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          return new RegExp(`(^|[^a-zA-Z0-9])${esc}([^a-zA-Z0-9]|$)`, "i").test(combinedMeta);
        });
      });
      if (!hasTitleMatch) return false;
    }

    // 6. Check identifiers & ORDIR filter
    if (Array.isArray(targetDef.identifiers) && targetDef.identifiers.length > 0) {
      let idents = targetDef.identifiers;
      const act = context.actionType || targetDef.action || "";
      if (act === AST_ACTIONS.SET_IMMUNITY || act === AST_ACTIONS.PROTECT || act === AST_ACTIONS.IMMUNE || act.includes("protect") || act.includes("immune")) {
        idents = idents.filter((id) => {
          const l = String(id).toLowerCase();
          return !l.includes("discard") && !l.includes("capture") && !l.includes("harm") &&
                 !l.includes("convert") && !l.includes("banish") && !l.includes("remove") &&
                 !l.includes("ability") && !l.includes("evil card") && !l.includes("opponent");
        });
      }
      if (idents.length > 0) {
        let ordirList = card.ORDIR;
        if ((!ordirList || ordirList.length === 0) && card.templateId) {
          try {
            const { CardRepository } = require("../../../shared/CardRepository");
            ordirList = CardRepository.getById(card.templateId)?.ORDIR;
          } catch (_e) {}
        }
        // Dual card in play: use active side ORDIR if available
        const isInPlay = card.zone === ZONES.BATTLEFIELD || card.zone === ZONES.TERRITORY;
        if (isInPlay && Array.isArray(card.sides) && card.sides.length > 1) {
          const activeSideIndex = (card.inGameAlignment || "").toLowerCase().includes("evil") ? 1 : 0;
          const sideOrdir = card.sides[activeSideIndex]?.ORDIR;
          if (Array.isArray(sideOrdir) && sideOrdir.length > 0) {
            ordirList = sideOrdir;
          }
        }
        const cardIdent = String(card.Identifier || "").toLowerCase();
        const ordir = Array.isArray(ordirList) ? ordirList.join(" ").toLowerCase() : "";
        const cardClass = String(card.Class || "").toLowerCase();
        const hasIdentMatch = idents.some((id) => {
          const needle = String(id).toLowerCase();
          return cardIdent.includes(needle) || ordir.includes(needle) || cardClass.includes(needle);
        });
        if (!hasIdentMatch) return false;
      }
    }

    // 7. Protection check: protected or immune cards cannot be targeted by harm
    if (context && context.sourceCard) {
      if (ProtectionService.isProtected(card, context.sourceCard, context.actionType || targetDef.action)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Normalizes scope input to a string array.
   *
   * @private
   * @param {string|string[]} scopeInput Scope definition.
   * @returns {string[]} List of lowercase scope identifiers.
   */
  static _normalizeScopes(scopeInput) {
    if (Array.isArray(scopeInput)) {
      return scopeInput.map((s) => String(s || "").toLowerCase().trim()).filter(Boolean);
    }
    if (typeof scopeInput === "string" && scopeInput.trim()) {
      return [scopeInput.toLowerCase().trim()];
    }
    return [AST_SCOPES.IN_PLAY];
  }

  /**
   * Identifies if targeting criteria correspond to a pile rather than individual cards.
   *
   * @private
   * @param {string|string[]} scope Scope definition.
   * @param {string} targetType Target type.
   * @returns {boolean} True if effect targets a pile.
   */
  static _isPileTargeting(scope, targetType) {
    const scopes = this._normalizeScopes(scope);
    const t = (targetType || "").toLowerCase().replace(/[\s_-]+/g, "_").trim();
    const pileScopes = ["deck", "discard_pile", "discard", "reserve_pile", "reserve", "banish_pile", "banish"];
    const hasPileScope = scopes.some((s) => pileScopes.includes(s));
    if (!hasPileScope) return false;

    if (scopes.includes("deck")) return true;
    if (scopes.some((s) => ["discard_pile", "discard", "reserve_pile", "reserve", "banish_pile", "banish"].includes(s))) {
      return !t || ["discard_pile", "pile", "top_card", "deck", "reserve_pile", "banish_pile"].includes(t);
    }
    return false;
  }

  /**
   * Resolves relevant zone names for given target scopes.
   *
   * @private
   * @param {string|string[]} scope Scope definition.
   * @returns {string[]} Zone identifiers.
   */
  static _resolveTargetZones(scope) {
    const scopes = this._normalizeScopes(scope);
    const resolved = new Set();

    for (const s of scopes) {
      switch (s) {
        case "hand":
        case AST_SCOPES.HAND:
          resolved.add(ZONES.HAND);
          break;
        case "deck":
        case AST_SCOPES.DECK:
          resolved.add(ZONES.DECK);
          break;
        case "discard_pile":
        case "discard":
        case AST_SCOPES.DISCARD_PILE:
          resolved.add(ZONES.DISCARD);
          break;
        case "banish_pile":
        case "banish":
        case AST_SCOPES.BANISH_PILE:
          resolved.add(ZONES.BANISH);
          break;
        case "reserve_pile":
        case "reserve":
        case AST_SCOPES.RESERVE_PILE:
          resolved.add(ZONES.RESERVE);
          break;
        case "set_aside":
        case AST_SCOPES.SET_ASIDE:
          resolved.add(ZONES.SET_ASIDE);
          break;
        case "land_of_bondage":
        case AST_SCOPES.LAND_OF_BONDAGE:
          resolved.add(ZONES.LAND_OF_BONDAGE);
          break;
        case "land_of_redemption":
        case "land_of_promise":
        case AST_SCOPES.LAND_OF_REDEMPTION:
          resolved.add(ZONES.LAND_OF_REDEMPTION);
          break;
        case "artifact_pile":
        case "artifact":
        case AST_SCOPES.ARTIFACT_PILE:
          resolved.add(ZONES.ARTIFACT);
          break;
        case "territory":
        case AST_SCOPES.TERRITORY:
          resolved.add(ZONES.TERRITORY);
          break;
        case "battle":
        case "battlefield":
        case AST_SCOPES.BATTLE:
          resolved.add(ZONES.BATTLEFIELD);
          break;
        case "any":
        case AST_SCOPES.ANY:
          [ZONES.TERRITORY, ZONES.BATTLEFIELD, ZONES.HAND, ZONES.DECK, ZONES.DISCARD, ZONES.RESERVE, ZONES.BANISH, ZONES.SET_ASIDE, ZONES.LAND_OF_BONDAGE, ZONES.LAND_OF_REDEMPTION, ZONES.ARTIFACT].forEach((z) => resolved.add(z));
          break;
        case "in_play":
        case AST_SCOPES.IN_PLAY:
        default:
          resolved.add(ZONES.TERRITORY);
          resolved.add(ZONES.BATTLEFIELD);
          break;
      }
    }

    return Array.from(resolved);
  }

  /**
   * Resolves list of players according to AST zone ownership constraints.
   *
   * @private
   * @param {import('../../rooms/GameRoom').GameRoom} room Active room.
   * @param {object} actingPlayer Acting player.
   * @param {string} [zoneOwner=AST_ZONE_OWNERS.EITHER] Zone owner filter.
   * @returns {Array<object>} Players to scan.
   */
  static _getPlayersToScan(room, actingPlayer, zoneOwner = AST_ZONE_OWNERS.EITHER) {
    if (!room?.state?.players) return [];
    return Array.from(room.state.players.values()).filter((p) => {
      const isSelf = p.sessionId === actingPlayer.sessionId;
      if (zoneOwner === AST_ZONE_OWNERS.CONTROLLER) return isSelf;
      if (zoneOwner === AST_ZONE_OWNERS.OPPONENT) return !isSelf;
      return true;
    });
  }
}

module.exports = { TargetSelectionService };
