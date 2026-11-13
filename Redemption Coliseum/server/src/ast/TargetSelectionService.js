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
const { MovementRules } = require("../../../shared/rules/MovementRules");
const { StatFilterEvaluator } = require("../../../shared/rules/StatFilterEvaluator");
const { matchesCardType, matchesTargetType } = require("../../../shared/cardHierarchy");

const RESERVE_REMOVAL_ACTIONS = [
  AST_ACTIONS.TAKE,
  AST_ACTIONS.TOPDECK,
  AST_ACTIONS.UNDERDECK,
  AST_ACTIONS.BOUNCE,
  AST_ACTIONS.RETURN_TO_HAND,
  AST_ACTIONS.DISCARD,
  AST_ACTIONS.BANISH,
  AST_ACTIONS.REMOVE_FROM_THE_GAME,
  AST_ACTIONS.PLACE,
  AST_ACTIONS.BAND,
  AST_ACTIONS.ADD_TO_BATTLE,
];

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
    const hasCustomMin = typeof targetDef.count?.min_value === "number";
    const hasCustomMax = typeof targetDef.count?.max_value === "number";
    const count = isAll
      ? Infinity
      : (typeof targetDef.count?.fixed_value === "number"
        ? targetDef.count.fixed_value
        : (hasCustomMax ? targetDef.count.max_value : 1));
    const isManualOpponent = targetDef.selection_mode === AST_SELECTION_MODES.MANUAL_OPPONENT;
    const isManual =
      targetDef.selection_mode === AST_SELECTION_MODES.MANUAL_CONTROLLER || isManualOpponent;

    let selectingPlayerId = actingPlayer?.sessionId || "";
    if (isManualOpponent && room?.state?.players) {
      const opponent = Array.from(room.state.players.values()).find(
        (p) => p.sessionId !== actingPlayer?.sessionId
      );
      if (opponent) {
        selectingPlayerId = opponent.sessionId;
      }
    }

    // 1. Evaluate Pile-Targeting effects (e.g. deck/discard/reserve targeting)
    if (this._isPileTargeting(scope, targetType, targetDef, context)) {
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
        selectingPlayerId,
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
    const effectiveScope = isBand && (!targetDef.scope || (Array.isArray(targetDef.scope) && targetDef.scope.length === 0))
      ? [AST_SCOPES.IN_PLAY, AST_SCOPES.HAND]
      : scope;
    const defaultZoneNames = this._resolveTargetZones(effectiveScope);
    const eligibleCardIds = [];
    const searchedPiles = [];
    let blockedByRound1Reserve = false;
    let canInspectOpponentReserve = false;

    for (const p of playersToScan) {
      const isSelf = p.sessionId === actingPlayer.sessionId;
      const zoneNames = isBand
        ? defaultZoneNames.filter((z) => z !== ZONES.BATTLEFIELD && (isSelf || z !== ZONES.HAND))
        : defaultZoneNames;

      for (const zName of zoneNames) {
        // Concealed opponent draw deck is never scanned unless explicitly targeted via zone_owner: "opponent"
        if (zName === ZONES.DECK && !isSelf && targetDef.zone_owner !== AST_ZONE_OWNERS.OPPONENT) {
          continue;
        }

        const zoneCards = zName === ZONES.BATTLEFIELD
          ? (room?.state?.battlefield || []).filter((c) => (c.controllerId || c.ownerId) === p.sessionId)
          : (p[zName] || []);

        // Enforce Official REG Round 1 Reserve Rule during target pre-validation
        if (
          zName === ZONES.RESERVE &&
          action &&
          RESERVE_REMOVAL_ACTIONS.includes(action) &&
          typeof room?.state?.round === "number"
        ) {
          const reserveRule = MovementRules.reserveFirstRoundRule({
            fromZone: ZONES.RESERVE,
            toZone: ZONES.HAND,
            state: room?.state,
          });
          if (!reserveRule.valid) {
            blockedByRound1Reserve = true;
            if (!isSelf && zoneCards.length > 0) {
              canInspectOpponentReserve = true;
              const oppPileKey = `${p.sessionId}:${zName}`;
              if (!searchedPiles.includes(oppPileKey)) {
                searchedPiles.push(oppPileKey);
              }
            }
            continue;
          }
        }

        if (
          [ZONES.RESERVE, ZONES.DISCARD, ZONES.BANISH, ZONES.DECK, ZONES.ARTIFACT].includes(zName)
        ) {
          const pileKey = `${p.sessionId}:${zName}`;
          if (!searchedPiles.includes(pileKey)) {
            searchedPiles.push(pileKey);
          }
        }

        for (const card of zoneCards) {
          if (isBand) {
            // Characters already in the battle cannot be banded into battle
            if (card.zone === ZONES.BATTLEFIELD || zName === ZONES.BATTLEFIELD) continue;
            if (room?.state?.battlefield?.some((bc) => bc.id === card.id)) continue;

            if (context.sourceCard && card.id === context.sourceCard.id) continue;
            const isChar = BattleCharacterClassifier.isHero(card) || BattleCharacterClassifier.isEvilCharacter(card);
            if (!isChar) continue;
            if (context.sourceCard) {
              let effectiveLeader = context.sourceCard;
              if (!BattleCharacterClassifier.isHero(effectiveLeader) && !BattleCharacterClassifier.isEvilCharacter(effectiveLeader)) {
                effectiveLeader = (room?.state?.battlefield || []).find(
                  (bc) => bc.controllerId === actingPlayer.sessionId && (BattleCharacterClassifier.isHero(bc) || BattleCharacterClassifier.isEvilCharacter(bc))
                ) || context.sourceCard;
              }
              const isHeroLeader = BattleCharacterClassifier.isHero(effectiveLeader);
              const isEvilLeader = BattleCharacterClassifier.isEvilCharacter(effectiveLeader);
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

    const isOptionalUpTo = hasCustomMin && targetDef.count.min_value === 0;
    const minTargets = hasCustomMin
      ? Math.min(targetDef.count.min_value, eligibleCardIds.length)
      : (isAll ? eligibleCardIds.length : Math.min(count, eligibleCardIds.length));
    const maxTargets = hasCustomMax
      ? Math.min(targetDef.count.max_value, eligibleCardIds.length)
      : (isAll ? eligibleCardIds.length : count);
    const requiresSelection = (isManual && (eligibleCardIds.length > 0 || isOptionalUpTo)) || (isBand && isAll && eligibleCardIds.length > 1);

    const defaultPrompt = isOptionalUpTo
      ? `Select up to ${targetDef.count.max_value} card(s) to target`
      : `Select ${count} card(s) to target`;

    const normScopes = this._normalizeScopes(effectiveScope);
    const PILE_SCOPES = [
      "deck",
      "discard_pile",
      "discard",
      "reserve_pile",
      "reserve",
      "banish_pile",
      "banish",
      "artifact_pile",
      "artifact",
    ];
    const isPileTarget =
      normScopes.length > 0 &&
      normScopes.every((s) => PILE_SCOPES.includes(s));
    let targetZone = undefined;
    if (isPileTarget) {
      if (defaultZoneNames.length === 1) {
        targetZone = defaultZoneNames[0];
      } else if (eligibleCardIds.length > 0) {
        const firstCard = room?.cardLookup?.get(eligibleCardIds[0]);
        targetZone = firstCard?.zone || defaultZoneNames[0];
      } else {
        targetZone = defaultZoneNames[0];
      }
    } else if (defaultZoneNames.length === 1) {
      targetZone = defaultZoneNames[0];
    }

    return {
      targetType: "card",
      targetZone,
      isPileTarget,
      selectingPlayerId,
      searchedPiles: isPileTarget ? searchedPiles : [],
      blockedByRound1Reserve,
      canInspectOpponentReserve,
      eligibleCardIds,
      eligiblePiles: [],
      requiresSelection,
      minTargets,
      maxTargets,
      canCancel: Boolean(targetDef.can_cancel || isOptionalUpTo || context.isOptional),
      promptText: targetDef.prompt_text || defaultPrompt,
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

    // 3. Check testament filter (Bucket 3: "OT" or "NT")
    if (targetDef.testament) {
      const reqTestament = String(targetDef.testament).trim().toUpperCase();
      let cardTestament = card.Testament || "";
      let ordirList = card.ORDIR;
      if (!cardTestament && card.templateId) {
        try {
          const { CardRepository } = require("../../../shared/CardRepository");
          const dbCard = CardRepository.getById(card.templateId) || CardRepository.get(card.templateId);
          if (dbCard) {
            cardTestament = dbCard.Testament || "";
            if (!ordirList || ordirList.length === 0) ordirList = dbCard.ORDIR;
          }
        } catch (_e) { }
      }
      const cardTestStr = String(cardTestament).toUpperCase();
      const matchesDirect = cardTestStr !== "UNKNOWN" && cardTestStr.includes(reqTestament);
      const ordirStr = Array.isArray(ordirList) ? ordirList.join(" ").toUpperCase() : "";
      const matchesOrdir = ordirStr.includes(`${reqTestament} CARD`) ||
        ordirStr.includes(`${reqTestament} CHARACTER`) ||
        ordirStr.includes(`${reqTestament} HERO`) ||
        ordirStr.includes(`${reqTestament} EVIL CHARACTER`) ||
        ordirStr.includes(`${reqTestament} ENHANCEMENT`) ||
        new RegExp(`(^|[^a-zA-Z0-9])${reqTestament}([^a-zA-Z0-9]|$)`, "i").test(ordirStr);
      if (!matchesDirect && !matchesOrdir) {
        return false;
      }
    }

    // 4. Check references filter (Bucket 4: Biblical Book Citations)
    if (Array.isArray(targetDef.references) && targetDef.references.length > 0) {
      let cardRef = card.Reference || "";
      let ordirList = card.ORDIR;
      if (!cardRef && card.templateId) {
        try {
          const { CardRepository } = require("../../../shared/CardRepository");
          const dbCard = CardRepository.getById(card.templateId) || CardRepository.get(card.templateId);
          if (dbCard) {
            cardRef = dbCard.Reference || "";
            if (!ordirList || ordirList.length === 0) ordirList = dbCard.ORDIR;
          }
        } catch (_e) { }
      }
      const cardRefStr = String(cardRef || "").toLowerCase();
      const ordirStr = Array.isArray(ordirList) ? ordirList.join(" ").toLowerCase() : "";
      const hasRefMatch = targetDef.references.some((ref) => {
        const needle = String(ref || "").trim().toLowerCase();
        if (!needle) return false;
        if (ordirStr.includes(needle)) return true;
        const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const regex = new RegExp(`(^|[^a-zA-Z0-9])${esc}([^a-zA-Z0-9]|$)`, "i");
        return regex.test(cardRefStr) || cardRefStr.startsWith(needle);
      });
      if (!hasRefMatch) {
        return false;
      }
    }

    // 5. Check card type filter using taxonomy and subtype resolution (Bucket 1: Canonical base types)
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
          } catch (_e) { }
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

    // 6. Check brigades filter (Bucket 5: Specific Brigade Colors)
    if (Array.isArray(targetDef.brigades) && targetDef.brigades.length > 0) {
      const cardBrigades = Array.isArray(card.Brigades)
        ? card.Brigades.map((b) => b.toLowerCase())
        : (card.Brigade ? String(card.Brigade).split("/").map((b) => b.trim().toLowerCase()) : []);
      if (!targetDef.brigades.some((b) => cardBrigades.includes(b.toLowerCase()))) return false;
    }

    // 7. Check card titles filter (Bucket 6: Specifically named titles & IDs)
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
          } catch (_e) { }
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

    // 8. Check identifiers & ORDIR filter (Bucket 2: Subtypes, Nationalities, Roles & Composites)
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
        let cardIdent = card.Identifier;
        let cardClass = card.Class;
        if ((!ordirList || ordirList.length === 0) && card.templateId) {
          try {
            const { CardRepository } = require("../../../shared/CardRepository");
            const dbCard = CardRepository.getById(card.templateId) || CardRepository.get(card.templateId);
            if (dbCard) {
              if (!ordirList || ordirList.length === 0) ordirList = dbCard.ORDIR;
              if (!cardIdent) cardIdent = dbCard.Identifier;
              if (!cardClass) cardClass = dbCard.Class;
            }
          } catch (_e) { }
        }
        // Dual card in play: use active side ORDIR if available
        const isInPlay = card.zone === ZONES.BATTLEFIELD || card.zone === ZONES.TERRITORY;
        if (isInPlay && Array.isArray(card.sides) && card.sides.length > 1) {
          const activeSideIndex = (card.inGameAlignment || "").toLowerCase().includes("evil") ? 1 : 0;
          const side = card.sides[activeSideIndex];
          if (side) {
            if (Array.isArray(side.ORDIR) && side.ORDIR.length > 0) ordirList = side.ORDIR;
            if (side.Identifier) cardIdent = side.Identifier;
            if (side.Class) cardClass = side.Class;
          }
        }
        const cardIdentStr = String(cardIdent || "").toLowerCase();
        const ordirStr = Array.isArray(ordirList) ? ordirList.join(" ").toLowerCase() : "";
        const cardClassStr = String(cardClass || "").toLowerCase();
        const hasIdentMatch = idents.some((id) => {
          const needle = String(id).trim().toLowerCase();
          if (!needle) return false;

          // Official REG Rule: All Characters are Human unless identified as an Angel, Demon, or Animal
          if (needle === "human") {
            const isChar = BattleCharacterClassifier.isHero(card) || BattleCharacterClassifier.isEvilCharacter(card);
            if (!isChar) return false;
            const nonHuman = ["angel", "demon", "animal"];
            const isNonHuman = nonHuman.some((nh) =>
              cardIdentStr.includes(nh) || cardClassStr.includes(nh) || ordirStr.includes(nh)
            );
            return !isNonHuman;
          }

          const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
          const regex = new RegExp(`(^|[^a-zA-Z0-9])${esc}([^a-zA-Z0-9]|$)`, "i");
          return regex.test(cardIdentStr) || regex.test(cardClassStr) || regex.test(ordirStr) ||
            (Array.isArray(ordirList) && ordirList.some((item) => String(item).trim().toLowerCase() === needle));
        });
        if (!hasIdentMatch) return false;
      }
    }

    // 9. Check structured stat_filters (strength, toughness, both, either)
    if (Array.isArray(targetDef.stat_filters) && targetDef.stat_filters.length > 0) {
      if (!StatFilterEvaluator.matchesStatFilters(card, targetDef.stat_filters, context)) {
        return false;
      }
    }

    // 10. Protection check: protected or immune cards cannot be targeted by harm
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
  static _isPileTargeting(scope, targetType, targetDef = {}, context = {}) {
    const scopes = this._normalizeScopes(scope);
    const t = (targetType || "").toLowerCase().replace(/[\s_-]+/g, "_").trim();
    const pileScopes = ["deck", "discard_pile", "discard", "reserve_pile", "reserve", "banish_pile", "banish"];
    const hasPileScope = scopes.some((s) => pileScopes.includes(s));
    if (!hasPileScope) return false;

    // Card-level types or card filters always target cards inside piles, not the pile container itself
    const CARD_TYPES = [
      "card", "cards", "enhancement", "hero", "evil_character", "character",
      "artifact", "dominant", "lost_soul", "site", "fortress", "curse", "covenant",
      "good_enhancement", "evil_enhancement", "good_character"
    ];
    const hasCardFilters = Boolean(
      (targetDef.alignment && targetDef.alignment !== "either") ||
      (Array.isArray(targetDef.brigades) && targetDef.brigades.length > 0) ||
      (Array.isArray(targetDef.references) && targetDef.references.length > 0) ||
      (Array.isArray(targetDef.identifiers) && targetDef.identifiers.length > 0) ||
      (Array.isArray(targetDef.card_titles) && targetDef.card_titles.length > 0) ||
      (Array.isArray(targetDef.stat_filters) && targetDef.stat_filters.length > 0) ||
      targetDef.testament
    );
    if (CARD_TYPES.includes(t) || hasCardFilters) {
      const action = context.actionType || context.action || targetDef.action;
      const isCardTransfer = [
        AST_ACTIONS.UNDERDECK,
        AST_ACTIONS.TOPDECK,
        AST_ACTIONS.TAKE,
        AST_ACTIONS.BOUNCE,
        AST_ACTIONS.RETURN_TO_HAND,
        AST_ACTIONS.PLACE,
        AST_ACTIONS.SEARCH,
        AST_ACTIONS.BAND,
      ].includes(action);
      if (isCardTransfer || hasCardFilters || (t && t !== "card" && CARD_TYPES.includes(t))) {
        return false;
      }
    }

    if (scopes.includes("deck")) {
      return !t || ["deck", "pile", "top_card"].includes(t);
    }
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
