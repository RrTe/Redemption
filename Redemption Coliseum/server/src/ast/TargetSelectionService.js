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
const { GenderEvaluator } = require("../../../shared/rules/GenderEvaluator");
const { SideAttributeEvaluator, CANONICAL_CLASSES } = require("../../../shared/rules/SideAttributeEvaluator");
const { parseTargetCount } = require("./TargetCountResolver");
const { matchesCardType, matchesTargetType, resolveActiveSideIndex } = require("../../../shared/cardHierarchy");

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

const SEARCHABLE_PILE_ZONES = [
  ZONES.RESERVE,
  ZONES.DECK,
  ZONES.DISCARD,
  ZONES.BANISH,
  ZONES.ARTIFACT,
];

const CONSTRAINT_IDENT_REGEX = /^(?:non-warrior(?:\s+class)?|non-weapon(?:\s+class)?|except\s+(?:(?:a|an)\s+)?(?:human|non-human|warrior(?:\s+class)?|weapon(?:\s+class)?|good\s+warriors?|good\s+weapons?|lost\s+souls?))$/i;
const STATE_IDENT_REGEX = /^(?:blocking|attacking)$/i;
const NON_DISJUNCTIVE_IDENT_REGEX = /^(?:activated|captured|target|half|contents|and\s+its\s+contents|enter\s+battle|cannot\s+enter\s+battle|battle|protect|protect\s+abilities|play|special\s+abilities|withdraw|face\s+down|300|blocking|attacking|opposite\s+gender|or|from\s+hand.*)$/i;
const CLAUSE_IDENT_REGEX = /\b(?:in\s+the\s+title|used\s+by|played\s+on|placed\s+onto|from\s+hand|in\s+discard\s+pile)\b/i;

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
    const { isAll, hasCustomMin, hasCustomMax, count } = parseTargetCount(targetDef);
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

    let effectivePlayersToScan = playersToScan;
    let selectedZoneOverride = null;
    let allowSelectedOpponentDeck = targetDef.zone_owner === AST_ZONE_OWNERS.OPPONENT;

    if (context.selectedPileId && typeof context.selectedPileId === "string") {
      const [selectedOwnerId, selectedZoneName] = context.selectedPileId.split(":");
      effectivePlayersToScan = playersToScan.filter((p) => p.sessionId === selectedOwnerId);
      if (selectedZoneName) {
        selectedZoneOverride = selectedZoneName;
      }
      allowSelectedOpponentDeck = true;
    } else if (this.isTwoStepPileSearch(targetDef, context)) {
      const targetZones = this._resolveTargetZones(targetDef.scope);
      const pileZone = targetZones[0];
      const isRound1BlockedReserve =
        pileZone === ZONES.RESERVE &&
        action &&
        RESERVE_REMOVAL_ACTIONS.includes(action) &&
        typeof room?.state?.round === "number" &&
        !MovementRules.reserveFirstRoundRule({
          fromZone: ZONES.RESERVE,
          toZone: ZONES.HAND,
          state: room?.state,
        }).valid;

      if (!isRound1BlockedReserve) {
        const pileLabel = this._getPileDisplayLabel(pileZone);
        const eligiblePiles = [];
        for (const p of playersToScan) {
          const cardsInPile = p[pileZone] || [];
          if (cardsInPile.length === 0) continue;
          if (
            context.sourceCard &&
            ProtectionService.isZoneProtected(room, p, pileZone, context.sourceCard, action)
          ) {
            continue;
          }
          const isSelf = p.sessionId === actingPlayer?.sessionId;
          eligiblePiles.push({
            id: `${p.sessionId}:${pileZone}`,
            label: isSelf ? `My ${pileLabel}` : `${p.name}'s ${pileLabel}`,
            ownerId: p.sessionId,
            zone: pileZone,
          });
        }

        if (eligiblePiles.length > 1) {
          return {
            targetType: "pile",
            targetZone: pileZone,
            isPileTarget: false,
            isTwoStepPileChoice: true,
            selectingPlayerId,
            searchedPiles: [],
            blockedByRound1Reserve: false,
            canInspectOpponentReserve: false,
            eligibleCardIds: [],
            eligiblePiles,
            requiresSelection: true,
            minTargets: 1,
            maxTargets: 1,
            canCancel: Boolean(targetDef.can_cancel || context.isOptional),
            promptText: targetDef.prompt_text || `Select a ${pileLabel} to search`,
          };
        }

        if (eligiblePiles.length === 1) {
          const onlyOwnerId = eligiblePiles[0].ownerId;
          effectivePlayersToScan = playersToScan.filter((p) => p.sessionId === onlyOwnerId);
          allowSelectedOpponentDeck = true;
        }
      }
    }

    const defaultZoneNames = selectedZoneOverride
      ? [selectedZoneOverride]
      : this._resolveTargetZones(effectiveScope);
    const eligibleCardIds = [];
    const searchedPiles = [];
    let blockedByRound1Reserve = false;
    let canInspectOpponentReserve = false;

    for (const p of effectivePlayersToScan) {
      const isSelf = p.sessionId === actingPlayer.sessionId;
      const zoneNames = isBand
        ? defaultZoneNames.filter((z) => z !== ZONES.BATTLEFIELD && (isSelf || z !== ZONES.HAND))
        : defaultZoneNames;

      for (const zName of zoneNames) {
        // Concealed opponent draw deck is never scanned unless explicitly targeted via zone_owner: "opponent" or chosen in step 1
        if (zName === ZONES.DECK && !isSelf && !allowSelectedOpponentDeck) {
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
      : (isAll
        ? (isManual ? Math.min(1, eligibleCardIds.length) : eligibleCardIds.length)
        : Math.min(count, eligibleCardIds.length));
    const maxTargets = hasCustomMax
      ? Math.min(targetDef.count.max_value, eligibleCardIds.length)
      : (isAll ? eligibleCardIds.length : count);
    const requiresSelection = (isManual && (eligibleCardIds.length > 0 || isOptionalUpTo)) || (isBand && isAll && eligibleCardIds.length > 1);

    const defaultPrompt = isOptionalUpTo
      ? `Select up to ${targetDef.count.max_value} card(s) to target`
      : (isAll ? "Select card(s) to target" : `Select ${count} card(s) to target`);

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
  /**
   * Evaluates a TargetSelector `testament` ("OT" / "NT") constraint against a card.
   *
   * @param {object} card Candidate card instance.
   * @param {string} [reqTestament] Required testament token.
   * @returns {boolean} True if testament filter passes or is unspecified.
   */
  static _matchesTestament(card, reqTestament) {
    if (!reqTestament) return true;
    const normalizedReq = String(reqTestament).trim().toUpperCase();
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
    const matchesDirect = cardTestStr !== "UNKNOWN" && cardTestStr.includes(normalizedReq);
    const ordirStr = Array.isArray(ordirList) ? ordirList.join(" ").toUpperCase() : "";
    const matchesOrdir = ordirStr.includes(`${normalizedReq} CARD`) ||
      ordirStr.includes(`${normalizedReq} CHARACTER`) ||
      ordirStr.includes(`${normalizedReq} HERO`) ||
      ordirStr.includes(`${normalizedReq} EVIL CHARACTER`) ||
      ordirStr.includes(`${normalizedReq} ENHANCEMENT`) ||
      new RegExp(`(^|[^a-zA-Z0-9])${normalizedReq}([^a-zA-Z0-9]|$)`, "i").test(ordirStr);
    return matchesDirect || matchesOrdir;
  }

  /**
   * Evaluates unambiguous typed constraints (`testament`, `gender`, `is_generic`, `classes`, `stat_filters`).
   * Shared by the main filter path and the `target_card_ids` fast-path so noisy title/identifier
   * metadata on resolved IDs is bypassed while typed runtime bounds remain enforced.
   *
   * @param {object} card Candidate card instance.
   * @param {object} targetDef AST target definition.
   * @param {object} [context={}] Filter context.
   * @param {object} [options={}] Evaluation options.
   * @returns {boolean} True if all specified typed constraints match.
   */
  static _matchesStructuredConstraints(card, targetDef, context = {}, { includeTestament = true } = {}) {
    if (includeTestament && targetDef.testament) {
      if (!this._matchesTestament(card, targetDef.testament)) {
        return false;
      }
    }
    if (targetDef.gender) {
      if (!GenderEvaluator.matchesGender(card, targetDef.gender, { targetDef })) {
        return false;
      }
    }
    if (typeof targetDef.is_generic === "boolean") {
      if (!SideAttributeEvaluator.matchesIsGeneric(card, targetDef.is_generic, { targetDef })) {
        return false;
      }
    }
    if (Array.isArray(targetDef.classes) && targetDef.classes.length > 0) {
      if (!SideAttributeEvaluator.matchesClasses(card, targetDef.classes, { targetDef })) {
        return false;
      }
    }
    if (Array.isArray(targetDef.stat_filters) && targetDef.stat_filters.length > 0) {
      if (!StatFilterEvaluator.matchesStatFilters(card, targetDef.stat_filters, context)) {
        return false;
      }
    }
    return true;
  }

  /**
   * Returns true when a card-search target targets a single pile zone with zone_owner: "either"
   * and manual_controller selection, requiring the acting player to pick whose pile first.
   *
   * @param {object} [targetDef={}] AST target definition.
   * @param {object} [context={}] Resolution context.
   * @returns {boolean} True when two-step pile ownership selection applies.
   */
  static isTwoStepPileSearch(targetDef = {}, context = {}) {
    if (!targetDef || targetDef.zone_owner !== AST_ZONE_OWNERS.EITHER) return false;
    if (targetDef.selection_mode !== AST_SELECTION_MODES.MANUAL_CONTROLLER) return false;
    const scope = targetDef.scope || AST_SCOPES.IN_PLAY;
    const targetType = targetDef.target_type || "";
    if (this._isPileTargeting(scope, targetType, targetDef, context)) return false;
    const zones = this._resolveTargetZones(scope);
    return zones.length === 1 && SEARCHABLE_PILE_ZONES.includes(zones[0]);
  }

  /**
   * Maps a pile zone constant to a human-readable pile label.
   *
   * @private
   * @param {string} zone Zone constant from ZONES.
   * @returns {string} Display label.
   */
  static _getPileDisplayLabel(zone) {
    switch (zone) {
      case ZONES.RESERVE: return "Reserve";
      case ZONES.DECK: return "Deck";
      case ZONES.DISCARD: return "Discard Pile";
      case ZONES.BANISH: return "Banish Zone";
      case ZONES.ARTIFACT: return "Artifact Pile";
      default: return "Pile";
    }
  }

  /**
   * Returns entity identifiers that act as disjunctive ("Title or <Identifier>")
   * alternatives alongside card_titles on a non-convert target selector.
   *
   * @private
   * @param {object} [targetDef={}] AST target definition.
   * @param {string} [action=""] AST action name.
   * @returns {string[]} Filtered disjunctive identifier tokens.
   */
  static _getDisjunctiveIdentifiers(targetDef = {}, action = "") {
    if (String(action || "").toLowerCase() === "convert") return [];
    if (!Array.isArray(targetDef.card_titles) || targetDef.card_titles.length === 0) return [];
    if (!Array.isArray(targetDef.identifiers) || targetDef.identifiers.length === 0) return [];

    return targetDef.identifiers
      .map((id) => String(id || "").trim())
      .filter((trimmed) => {
        if (!trimmed) return false;
        const low = trimmed.toLowerCase();
        if (CONSTRAINT_IDENT_REGEX.test(low)) return false;
        if (NON_DISJUNCTIVE_IDENT_REGEX.test(low)) return false;
        if (CLAUSE_IDENT_REGEX.test(low)) return false;
        return true;
      });
  }

  /**
   * Evaluates card_titles matching including ORDIR/metadata fallback for category titles.
   *
   * @private
   * @param {object} card Candidate card instance.
   * @param {string[]} cardTitles Target card_titles list.
   * @returns {boolean} True if any title matches.
   */
  static _matchesCardTitles(card, cardTitles) {
    const cardName = String(card.Name || card.card_name || "").toLowerCase();
    return cardTitles.some((t) => {
      const titleLower = String(t).toLowerCase().trim();
      if (!titleLower) return false;
      if (cardName && (cardName.includes(titleLower) || titleLower.includes(cardName))) {
        return true;
      }
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
  }

  /**
   * Evaluates the "Temple" identifier against Fortresses/Sites (e.g. Herod's Temple)
   * while preserving ORDIR/Identifier matching when target_type specifies artifact or character.
   *
   * @private
   * @param {object} card Candidate card instance.
   * @param {string} rawType Normalized target_type.
   * @param {string} cardIdentStr Lowercased card Identifier.
   * @param {string} cardClassStr Lowercased card Class.
   * @param {string} ordirStr Joined lowercased card ORDIR list.
   * @param {string[]} ordirList Raw ORDIR array.
   * @returns {boolean} True if candidate qualifies as a Temple target.
   */
  static _matchesTempleIdentifier(card, rawType, cardIdentStr, cardClassStr, ordirStr, ordirList) {
    if (
      rawType === "artifact" ||
      rawType === "hero" ||
      rawType === "character" ||
      rawType === "evil_character"
    ) {
      const regex = /(^|[^a-zA-Z0-9])temple([^a-zA-Z0-9]|$)/i;
      return regex.test(cardIdentStr) || regex.test(cardClassStr) || regex.test(ordirStr) ||
        (Array.isArray(ordirList) && ordirList.some((item) => String(item).trim().toLowerCase() === "temple"));
    }

    let cardName = String(card.Name || card.card_name || "");
    let rawCardType = String(card.inGameType || card.Type || "");
    let rawCardAlign = String(card.inGameAlignment || card.Alignment || "");
    if ((!cardName || !rawCardType) && card.templateId) {
      try {
        const { CardRepository } = require("../../../shared/CardRepository");
        const dbCard = CardRepository.getById(card.templateId) || CardRepository.get(card.templateId);
        if (dbCard) {
          if (!cardName) cardName = String(dbCard.Name || "");
          if (!rawCardType) rawCardType = String(dbCard.Type || "");
          if (!rawCardAlign) rawCardAlign = String(dbCard.Alignment || "");
        }
      } catch (_e) { }
    }

    const typeStr = rawCardType.toLowerCase();
    const alignStr = rawCardAlign.toLowerCase();
    const isFortressOrSite = typeStr.includes("fortress") || typeStr.includes("site");
    if (!isFortressOrSite) return false;

    const isNamedTemple = /\b(?:solomon'?s|zerubbabel'?s|herod'?s|heavenly)\s+temple\b/i.test(cardName);
    const isGoodTempleFortress = typeStr.includes("fortress") && !alignStr.includes("evil") && /\btemple\b/i.test(cardName);
    return isNamedTemple || isGoodTempleFortress;
  }

  static matchesFilter(card, targetDef = {}, context = {}) {
    if (!card) return false;

    const act = context.actionType || targetDef.action || "";
    const disjunctiveIdents = this._getDisjunctiveIdentifiers(targetDef, act);
    const hasDisjunctiveAlt = disjunctiveIdents.length > 0;

    // 1. Fast-Path: Explicit target_card_ids filter (O(1))
    if (Array.isArray(targetDef.target_card_ids) && targetDef.target_card_ids.length > 0) {
      const cardId = String(card.templateId || card.id || "");
      if (targetDef.target_card_ids.some((id) => String(id) === cardId)) {
        if (!this._matchesStructuredConstraints(card, targetDef, context)) {
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
      if (!hasDisjunctiveAlt) {
        return false;
      }
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
    if (targetDef.testament && !this._matchesTestament(card, targetDef.testament)) {
      return false;
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

        const allowsWeaponEnhancement =
          rawType === "character" &&
          Array.isArray(targetDef.classes) &&
          targetDef.classes.some((c) => /^weapon$/i.test(String(c || "")));
        if (
          !matchesTargetType(card, rawType, activeType) &&
          !(allowsWeaponEnhancement && matchesTargetType(card, "enhancement", activeType))
        ) {
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
    let matchedTitleFallback = false;
    if (Array.isArray(targetDef.card_titles) && targetDef.card_titles.length > 0) {
      const hasExplicitIds = Array.isArray(targetDef.target_card_ids) && targetDef.target_card_ids.length > 0;
      if (hasDisjunctiveAlt && hasExplicitIds) {
        // Explicit target_card_ids already did not match in Step 1; fall through to disjunctive identifiers in Step 8
      } else {
        const hasTitleMatch = this._matchesCardTitles(card, targetDef.card_titles);
        if (hasTitleMatch) {
          matchedTitleFallback = true;
        } else if (!hasDisjunctiveAlt) {
          return false;
        }
      }
    }

    // 8. Check identifiers & ORDIR filter (Bucket 2: Subtypes, Nationalities, Roles & Composites)
    if (Array.isArray(targetDef.identifiers) && targetDef.identifiers.length > 0) {
      let idents = targetDef.identifiers;
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
          const activeSideIndex = resolveActiveSideIndex(card, card.sides);
          const side = card.sides[activeSideIndex];
          if (side) {
            if (Array.isArray(side.ORDIR) && side.ORDIR.length > 0) ordirList = side.ORDIR;
            if (side.Identifier) cardIdent = side.Identifier;
            if (side.Class) cardClass = side.Class;
          }
        }
        const normalizedIdents = idents.filter((id) => {
          const l = String(id || "").trim().toLowerCase();
          // Ignore bare syntactic "or" connector when structured filters carry the semantics
          if (l === "or" && (Array.isArray(targetDef.classes) && targetDef.classes.length > 0 || targetDef.gender || typeof targetDef.is_generic === "boolean" || typeof targetDef.is_human === "boolean")) {
            return false;
          }
          return true;
        });

        const constraintIdents = [];
        const stateIdents = [];
        const standardIdents = [];

        for (const id of normalizedIdents) {
          const trimmed = String(id || "").trim();
          const low = trimmed.toLowerCase();
          if (low === "opposite gender") {
            const refCard =
              context.referenceCard ||
              context.selectedCard ||
              context.actorCard ||
              (GenderEvaluator.resolveCardGender(context.sourceCard) ? context.sourceCard : null);
            if (!GenderEvaluator.matchesOppositeGender(card, refCard, { targetDef })) {
              return false;
            }
          } else if (CONSTRAINT_IDENT_REGEX.test(low)) {
            constraintIdents.push(low);
          } else if (STATE_IDENT_REGEX.test(low)) {
            stateIdents.push(low);
          } else if (trimmed) {
            standardIdents.push(trimmed);
          }
        }

        for (const constraint of constraintIdents) {
          if (!this._matchesConstraintIdentifier(card, constraint, targetDef)) {
            return false;
          }
        }

        for (const stateIdent of stateIdents) {
          if (!this._matchesBattleStateIdentifier(card, stateIdent, context)) {
            return false;
          }
        }

        const effectiveStandardIdents = hasDisjunctiveAlt
          ? (matchedTitleFallback ? [] : disjunctiveIdents)
          : standardIdents;

        if (effectiveStandardIdents.length > 0) {
          const cardIdentStr = String(cardIdent || "").toLowerCase();
          const ordirStr = Array.isArray(ordirList) ? ordirList.join(" ").toLowerCase() : "";
          const cardClassStr = String(cardClass || "").toLowerCase();
          const hasIdentMatch = effectiveStandardIdents.some((id) => {
            const needle = String(id).trim().toLowerCase();
            if (!needle) return false;

            // Official ORDIR 7.0.0 Rule: Character humanity via IsHuman / descriptor fallback
            if (needle === "human" || needle === "humans") {
              return SideAttributeEvaluator.resolveIsHuman(card, { targetDef }) === true;
            }

            if (needle === "temple") {
              return this._matchesTempleIdentifier(card, rawType, cardIdentStr, cardClassStr, ordirStr, ordirList);
            }

            const esc = needle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
            const regex = new RegExp(`(^|[^a-zA-Z0-9])${esc}([^a-zA-Z0-9]|$)`, "i");
            return regex.test(cardIdentStr) || regex.test(cardClassStr) || regex.test(ordirStr) ||
              (Array.isArray(ordirList) && ordirList.some((item) => String(item).trim().toLowerCase() === needle));
          });
          if (!hasIdentMatch) return false;
        }
      }
    }

    // 8b. Check structured gender filter (ORDIR 7.0.0)
    // 8d. Check structured human/non-human filter (ORDIR 7.0.0)
    if (typeof targetDef.is_human === "boolean") {
      if (!SideAttributeEvaluator.matchesIsHuman(card, targetDef.is_human, { targetDef })) {
        return false;
      }
    }

    // 8b/8c/8e/9. Structured gender, is_generic, classes, and stat_filters constraints
    if (!this._matchesStructuredConstraints(card, targetDef, context, { includeTestament: false })) {
      return false;
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
   * Evaluates negative and exception identifier phrases that remain in AST identifiers
   * (e.g. "non-warrior", "non-weapon", "except a human", "except warrior class").
   *
   * @private
   * @param {object} card Candidate card instance.
   * @param {string} constraint Lowercased constraint phrase.
   * @param {object} targetDef Selector definition.
   * @returns {boolean} True if candidate card satisfies the constraint.
   */
  static _matchesConstraintIdentifier(card, constraint, targetDef) {
    const warriorClass = CANONICAL_CLASSES.find((c) => /^warrior$/i.test(c)) || "Warrior";
    const weaponClass = CANONICAL_CLASSES.find((c) => /^weapon$/i.test(c)) || "Weapon";
    if (/^(?:non-warrior(?:\s+class)?|except\s+warrior(?:\s+class)?)$/.test(constraint)) {
      return !SideAttributeEvaluator.matchesClasses(card, [warriorClass], { targetDef });
    }
    if (/^non-weapon(?:\s+class)?$/.test(constraint)) {
      return !SideAttributeEvaluator.matchesClasses(card, [weaponClass], { targetDef });
    }
    if (/^except\s+(?:(?:a|an)\s+)?human$/.test(constraint)) {
      return SideAttributeEvaluator.resolveIsHuman(card, { targetDef }) !== true;
    }
    if (/^except\s+non-human$/.test(constraint)) {
      return SideAttributeEvaluator.resolveIsHuman(card, { targetDef }) === true;
    }
    const cardAlign = String(card.inGameAlignment || card.Alignment || "").toLowerCase();
    if (/^except\s+good\s+warriors?$/.test(constraint)) {
      return !(cardAlign.includes("good") && SideAttributeEvaluator.matchesClasses(card, [warriorClass], { targetDef }));
    }
    if (/^except\s+good\s+weapons?$/.test(constraint)) {
      return !(cardAlign.includes("good") && SideAttributeEvaluator.matchesClasses(card, [weaponClass], { targetDef }));
    }
    if (/^except\s+lost\s+souls?$/.test(constraint)) {
      const activeType = card.inGameType || card.Type || "";
      return !(matchesTargetType(card, "lost_soul", activeType) || card.zone === ZONES.LAND_OF_BONDAGE || card.isLostSoul);
    }
    return true;
  }

  /**
   * Evaluates runtime battlefield role identifiers (e.g. "blocking", "attacking").
   *
   * @private
   * @param {object} card Candidate card instance.
   * @param {string} stateIdent Lowercased battle-state identifier.
   * @param {object} [context={}] Filter context containing room state when available.
   * @returns {boolean} True if candidate card is currently in that battle role.
   */
  static _matchesBattleStateIdentifier(card, stateIdent, context = {}) {
    if (!card || card.zone !== ZONES.BATTLEFIELD) return false;
    const activePlayer = context?.room?.state?.activePlayer;
    const cardController = card.controllerId || card.ownerId;
    if (stateIdent === "blocking") {
      return activePlayer
        ? Boolean(cardController && cardController !== activePlayer)
        : BattleCharacterClassifier.isEvilCharacter(card);
    }
    if (stateIdent === "attacking") {
      return activePlayer
        ? Boolean(cardController && cardController === activePlayer)
        : BattleCharacterClassifier.isHero(card);
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
      targetDef.gender ||
      typeof targetDef.is_generic === "boolean" ||
      typeof targetDef.is_human === "boolean" ||
      (Array.isArray(targetDef.classes) && targetDef.classes.length > 0) ||
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
