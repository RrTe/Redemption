// server/services/cardService.js
const logger = require("../utils/logger");
const { ZONES, ALL_ZONES, PILE_ZONES } = require("../../../shared/zones");
const {
  CARD_TYPES,
  MANAGED_TERRITORY_TYPES,
  MAX_HAND_SIZE,
} = require("../../../shared/card-constants");
const { PHASES } = require("../../../shared/phases");
const { BattleCharacterClassifier } = require("./BattleCharacterClassifier");
const { ArraySchema, $changes } = require("@colyseus/schema");
const { PlayerState } = require("../state/PlayerState");
const { ActionType } = require("../../../shared/actions");
const { CardAction } = require("../../../shared/actionSchema");
const { ACTION_DESCRIPTIONS } = require("../../../shared/actionStrings");
const util = require("util");

const CHANGES_SYMBOL = $changes || "~changes";

/**
 * Synchronizes parentIndex across all elements in an ArraySchema after
 * an unshift, shift, or splice operation.
 *
 * @param {ArraySchema} zoneArr The zone collection.
 */
function _syncParentIndexes(zoneArr) {
  if (!zoneArr || !zoneArr[CHANGES_SYMBOL]) return;
  const changeTree = zoneArr[CHANGES_SYMBOL];
  const root = changeTree.root;
  for (let i = 0; i < zoneArr.length; i++) {
    const item = zoneArr[i];
    if (item && item[CHANGES_SYMBOL]) {
      const itemChanges = item[CHANGES_SYMBOL];
      if (itemChanges.hasParent && itemChanges.hasParent((p) => p && p[CHANGES_SYMBOL] === changeTree)) {
        itemChanges.addParent(zoneArr, i);
      } else if (itemChanges.setParent) {
        itemChanges.setParent(zoneArr, root, i);
      }
    }
  }
}

/**
 * Unshifts a card to the beginning of a zone (e.g. top of DECK), fixing the
 * @colyseus/schema ArraySchema bug where unshift does not attach the instance
 * to the parent or root ChangeTree.
 *
 * @param {ArraySchema} zoneArr The target zone ArraySchema.
 * @param {Card} card The card to unshift.
 */
function _unshiftToZone(zoneArr, card) {
  const changeTree = zoneArr[CHANGES_SYMBOL];
  zoneArr.unshift(card);
  if (changeTree && card[CHANGES_SYMBOL]) {
    card[CHANGES_SYMBOL].setParent(zoneArr, changeTree.root, 0);
  }
  _syncParentIndexes(zoneArr);
  if (changeTree?.root) {
    if (changeTree.filteredChanges !== undefined) {
      changeTree.root.enqueueChangeTree(changeTree, "filteredChanges");
    } else {
      changeTree.root.enqueueChangeTree(changeTree, "changes");
    }
  }
}


/**
 * Helper function for human-readable zone names in the log.
 */
function getZoneDisplayName(zone, isOpponent = false) {
  const prefix = isOpponent ? "opponent's " : "their ";
  
  switch (zone) {
    case ZONES.DECK: return prefix + "Deck";
    case ZONES.HAND: return prefix + "Hand";
    case ZONES.DISCARD: return prefix + "Discard Pile";
    case ZONES.RESERVE: return prefix + "Reserve";
    case ZONES.BANISH: return prefix + "Banish Zone";
    case ZONES.TERRITORY: return prefix + "Territory";
    default: return zone;
  }
}

/**
 * Helper function: Returns the appropriate zone collection.
 * Uses ZONES for consistent references.
 *
 * @param {PlayerState} player - The player state.
 * @param {RoomState} state - The room state.
 * @param {string} zone - The target zone identifier.
 * @returns {ArraySchema<Card>} The zone collection.
 */
function getZoneCollection(player, state, zone) {
  // Global zones are retrieved directly from the room state.
  if (zone === ZONES.BATTLEFIELD) return state.battlefield;
  if (zone === ZONES.SET_ASIDE) return state.setAside;

  if (!Object.values(ZONES).includes(zone) || zone === ZONES.BATTLEFIELD) {
    throw new Error(`Unknown zone: ${zone}`);
  }

  // Player-specific zones require a valid player context.
  if (!player) {
    throw new Error(`Player context missing for zone: ${zone}`);
  }

  switch (zone) {
    case ZONES.DECK:
      return player[ZONES.DECK];
    case ZONES.HAND:
      return player[ZONES.HAND];
    case ZONES.DISCARD:
      return player[ZONES.DISCARD];
    case ZONES.RESERVE:
      return player[ZONES.RESERVE];
    case ZONES.BANISH:
      return player[ZONES.BANISH];
    case ZONES.TERRITORY:
      return player[ZONES.TERRITORY];
    case ZONES.LAND_OF_BONDAGE:
      return player[ZONES.LAND_OF_BONDAGE];
    case ZONES.LAND_OF_REDEMPTION:
      return player[ZONES.LAND_OF_REDEMPTION];
    default:
      throw new Error(`Unknown zone: ${zone}`);
  }
}

/**
 * Validation logic for card movements.
 *
 * @param {Card} card - The card to move.
 * @param {RoomState} state - The current game state.
 * @param {string} cardControllerId - The ID of the controlling player.
 * @param {string} targetPlayerId - The ID of the target player.
 * @param {string} fromZone - Source zone name.
 * @param {string} toZone - Target zone name.
 * @param {object} [options={}] - Additional move options.
 * @returns {{valid: boolean, error?: string}} Validation result.
 */
function _validateMove(
  card,
  state,
  cardControllerId,
  targetPlayerId,
  fromZone,
  toZone,
  options = {},
) {
  // If this is an undo operation, bypass game rules restrictions (e.g. Reserve in Round 1, Hand limit, etc.)
  if (options && options.isUndo) {
    return { valid: true };
  }

  // ✨ Support Dual Card resolution: if inGameType or inGameAlignment is provided in options,
  // evaluate combat rules against an effectiveCard instance reflecting the player's chosen side.
  const effectiveInGameType = options.inGameType || card.inGameType || "";
  const effectiveInGameAlignment = options.inGameAlignment || card.inGameAlignment || "";
  const effectiveCard = (effectiveInGameType || effectiveInGameAlignment)
    ? Object.assign(Object.create(card), {
        inGameType: effectiveInGameType,
        inGameAlignment: effectiveInGameAlignment,
      })
    : card;

  // ✨ COMBAT GUARDS (Rule Validation for Battlefield Moves)
  // In Arena Mode, all combat guards (phase lock, character/enhancement restrictions, brigade match) are bypassed.
  const isArena = Boolean(state?.isArenaMode ?? state?.isSandboxMode);
  if (toZone === ZONES.BATTLEFIELD && !isArena) {

    // 1. Phase Guard: Moving cards to battlefield is only permitted during BATTLE phase.
    if (state?.currentPhase !== PHASES.BATTLE) {
      logger.warn(
        `[COMBAT_GUARD] Invalid move: Battlefield is only accessible during Battle Phase (current phase: '${state?.currentPhase}').`,
      );
      return { valid: false, error: "Only allowed during Battle!" };
    }

    // Role determined by who controls the card on their side of the battlefield:
    // Active player is Attacker, non-active player is Defender (Blocker).
    // Note: Banding allows players to bring opponent characters into battle on their side.
    const isAttacker = targetPlayerId === state.activePlayer;
    const isHero = BattleCharacterClassifier.isHero(effectiveCard);
    const isGoodEnhancement = BattleCharacterClassifier.isGoodEnhancement(effectiveCard);
    const isEvilChar = BattleCharacterClassifier.isEvilCharacter(effectiveCard);
    const isEvilEnhancement = BattleCharacterClassifier.isEvilEnhancement(effectiveCard);

    if (isAttacker) {
      // 2. Attacker (active player): Only Heroes and Good Enhancements may enter battle.
      if (isEvilEnhancement) {
        logger.warn(
          `[COMBAT_GUARD] Attacker '${targetPlayerId}' attempted to play Evil Enhancement '${card.Name}' into battle.`,
        );
        return { valid: false, error: "Evil cards cannot attack!" };
      }
      if (isEvilChar) {
        logger.warn(
          `[COMBAT_GUARD] Attacker '${targetPlayerId}' attempted to play Evil Character '${card.Name}' into battle.`,
        );
        return { valid: false, error: "Evil cards cannot attack!" };
      }
      if (!isHero && !isGoodEnhancement) {
        logger.warn(
          `[COMBAT_GUARD] Attacker '${targetPlayerId}' attempted to play invalid card '${card.Name}' into battle.`,
        );
        return { valid: false, error: "Invalid card for battle!" };
      }

      // 4. Enhancement prerequisite: Good Enhancements require a Hero in battle with a matching brigade.
      if (isGoodEnhancement && fromZone !== ZONES.BATTLEFIELD) {
        const heroesInBattle = (state.battlefield || []).filter(
          (c) => c.controllerId === state.activePlayer && BattleCharacterClassifier.isHero(c)
        );
        if (heroesInBattle.length === 0) {
          logger.warn(
            `[COMBAT_GUARD] Attacker '${targetPlayerId}' attempted to play Good Enhancement '${card.Name}' without a Hero in battle.`,
          );
          return { valid: false, error: "No Hero in battle!" };
        }
        const hasMatchingBrigade = heroesInBattle.some((hero) =>
          BattleCharacterClassifier.canEnhancementMatchCharacter(effectiveCard, hero)
        );
        if (!hasMatchingBrigade) {
          logger.warn(
            `[COMBAT_GUARD] Attacker '${targetPlayerId}' attempted to play Good Enhancement '${card.Name}' without matching brigade.`,
          );
          return { valid: false, error: "Brigade mismatch!" };
        }
      }
    } else {
      // 3. Defender (non-active player): Only Evil Characters and Evil Enhancements may enter battle.
      if (isGoodEnhancement) {
        logger.warn(
          `[COMBAT_GUARD] Defender '${targetPlayerId}' attempted to play Good Enhancement '${card.Name}' into battle.`,
        );
        return { valid: false, error: "Good cards cannot block!" };
      }
      if (isHero) {
        logger.warn(
          `[COMBAT_GUARD] Defender '${targetPlayerId}' attempted to play Hero '${card.Name}' into battle.`,
        );
        return { valid: false, error: "Good cards cannot block!" };
      }
      if (!isEvilChar && !isEvilEnhancement) {
        logger.warn(
          `[COMBAT_GUARD] Defender '${targetPlayerId}' attempted to play invalid card '${card.Name}' into battle.`,
        );
        return { valid: false, error: "Invalid card for battle!" };
      }

      // 4. Enhancement prerequisite: Evil Enhancements require an Evil Character in battle with a matching brigade.
      if (isEvilEnhancement && fromZone !== ZONES.BATTLEFIELD) {
        const evilCharsInBattle = (state.battlefield || []).filter(
          (c) => c.controllerId !== state.activePlayer && BattleCharacterClassifier.isEvilCharacter(c)
        );
        if (evilCharsInBattle.length === 0) {
          logger.warn(
            `[COMBAT_GUARD] Defender '${targetPlayerId}' attempted to play Evil Enhancement '${card.Name}' without an Evil Character in battle.`,
          );
          return { valid: false, error: "No Evil Character in battle!" };
        }
        const hasMatchingBrigade = evilCharsInBattle.some((ec) =>
          BattleCharacterClassifier.canEnhancementMatchCharacter(effectiveCard, ec)
        );
        if (!hasMatchingBrigade) {
          logger.warn(
            `[COMBAT_GUARD] Defender '${targetPlayerId}' attempted to play Evil Enhancement '${card.Name}' without matching brigade.`,
          );
          return { valid: false, error: "Brigade mismatch!" };
        }
      }
    }
  }

  // Rule verification for Lost Souls:
  if (card.Type === CARD_TYPES.LOST_SOUL) {
    // Permitted moves for Lost Souls:
    // 1. Own or opponent's Land of Bondage
    // 2. Own Deck
    // 3. Own Discard Pile
    // 4. Opponent's Land of Redemption (only from own Land of Bondage)
    const canMoveToAnyBondage = toZone === ZONES.LAND_OF_BONDAGE;
    const canMoveToOwnDeck =
      toZone === ZONES.DECK && targetPlayerId === card.originalOwnerId;
    const canMoveToOwnDiscard =
      toZone === ZONES.DISCARD && targetPlayerId === card.originalOwnerId;

    const canMoveToOpponentRedemption =
      toZone === ZONES.LAND_OF_REDEMPTION &&
      targetPlayerId !== card.originalOwnerId &&
      fromZone === ZONES.LAND_OF_BONDAGE &&
      cardControllerId === card.originalOwnerId;

    if (
      canMoveToAnyBondage ||
      canMoveToOwnDeck ||
      canMoveToOwnDiscard ||
      canMoveToOpponentRedemption
    ) {
      return { valid: true }; // Move is valid.
    }

    // If none of the above conditions are met, the move is invalid for a Lost Soul.
    logger.warn(
      `Invalid move for Lost Soul from '${fromZone}' to '${toZone}'.`,
    );
    return { valid: false, error: "Invalid move for Lost Soul!" };
  }

  // Rule: Cards cannot be placed into another player's pile zones (Deck, Discard, Reserve, Banish).
  if (PILE_ZONES.includes(toZone) && card.originalOwnerId !== targetPlayerId) {
    logger.warn(
      `Invalid move: Attempted to place a card into another player's '${toZone}' zone. Action cancelled.`,
    );
    return { valid: false, error: "Cannot move cards to opponent's pile!" };
  }

  // Rule: Cards cannot be taken from Reserve in Round 1.
  if (fromZone === ZONES.RESERVE && toZone !== ZONES.RESERVE) {
    const isFirstRound =
      state?.round !== undefined && state?.round !== null
        ? state.round <= 1
        : Array.from(state?.players?.values() || []).every((p) => p.turn <= 1);

    if (isFirstRound) {
      logger.warn(
        `Invalid move: Cards cannot be taken from Reserve in the first round.`,
      );
      return { valid: false, error: "Cannot take cards from Reserve in Round 1!" };
    }
  }

  // Rule: Maximum hand size limit check
  if (toZone === ZONES.HAND) {
    const targetPlayer = state.players.get(targetPlayerId);
    if (targetPlayer && targetPlayer[ZONES.HAND]?.length >= MAX_HAND_SIZE) {
      logger.warn(
        `Invalid move: Hand limit reached for player '${targetPlayerId}' (${targetPlayer[ZONES.HAND].length}/${MAX_HAND_SIZE}).`,
      );
      return { valid: false, error: `Hand limit reached (${MAX_HAND_SIZE}/${MAX_HAND_SIZE})!` };
    }
  }

  return { valid: true };
}

/**
 * Finds a card and its controller using the central lookup map.
 *
 * @param {Map<string, Card>} cardLookup - Central lookup map for all cards.
 * @param {RoomState} state - Global room state.
 * @param {string} cardId - Card ID to find.
 * @param {string} fromZone - Expected source zone.
 * @returns {{card: Card, controller: PlayerState, fromArr: ArraySchema<Card>, cardIndex: number, actualZone: string, controllerId: string} | null}
 */
function _findCardAndOwner(cardLookup, state, cardId, fromZone) {
  if (!cardId || typeof cardId !== "string") {
    logger.error(
      `[FIND_CARD_ERROR] Invalid cardId provided: ${cardId} (type: ${typeof cardId})`,
    );
    return null;
  }

  const card = cardLookup.get(cardId);
  if (!card) {
    logger.warn(
      `[FIND_CARD] Card with ID '${cardId}' not found in global lookup map.`,
    );
    return null;
  }

  logger.debug(
    `[FIND_CARD] Found card '${card.Name}' (${card.id}). Its controllerId is '${card.controllerId}'.`,
  );

  const controller = state.players.get(card.controllerId);
  if (!controller) {
    logger.error(
      `[FIND_CARD_ERROR] Controller with ID '${card.controllerId}' not found in state for card '${cardId}'.`,
    );
    return null;
  }

  // Use actual current zone of the card if it doesn't match 'fromZone'
  const actualZone = card.zone || fromZone || "unknown";
  let fromArr = getZoneCollection(controller, state, actualZone);
  let cardIndex = fromArr.findIndex((c) => c.id === cardId);

  if (cardIndex === -1 && state.players) {
    for (const [pId, p] of state.players.entries()) {
      if (pId === card.controllerId) continue;
      const candidateArr = getZoneCollection(p, state, actualZone);
      const idx = candidateArr.findIndex((c) => c.id === cardId);
      if (idx !== -1) {
        logger.warn(
          `[FIND_CARD_RECOVER] Card '${cardId}' was registered to controller '${card.controllerId}', but found in player '${pId}' ${actualZone}. Auto-correcting controller.`,
        );
        card.controllerId = pId;
        fromArr = candidateArr;
        cardIndex = idx;
        break;
      }
    }
  }

  if (cardIndex === -1) {
    logger.warn(
      `[FIND_CARD_FAIL] Card '${cardId}' not found in its reported zone '${actualZone}'. State inconsistency detected.`,
    );
    return null;
  }

  if (actualZone !== fromZone) {
    logger.debug(`[FIND_CARD_RECOVER] Card '${cardId}' found in '${actualZone}' instead of expected '${fromZone}'. Proceeding with actual zone.`);
  }

  return {
    card,
    controller,
    fromArr,
    cardIndex,
    actualZone,
    controllerId: card.controllerId,
  };
}

/**
 * Draws cards from deck, applying the Lost Soul rule.
 * Lost Souls are automatically diverted to Land of Bondage and a replacement card is drawn.
 *
 * @param {PlayerState} player - The player drawing cards.
 * @param {RoomState} state - Global room state.
 * @param {number} count - Number of valid cards to draw.
 * @param {Map<string, Card>} cardLookup - Central lookup map.
 * @returns {{validCards: Card[], divertedCards: Card[]}}
 */
function _drawCardsWithLostSoulRule(player, state, count, cardLookup) {
  const deck = getZoneCollection(player, state, ZONES.DECK);
  const landOfBondage = getZoneCollection(player, state, ZONES.LAND_OF_BONDAGE);
  const validCards = [];
  const divertedCards = [];
  let drawnCount = 0;

  while (drawnCount < count && deck.length > 0) {
    const shiftedCard = deck.shift();
    const card = shiftedCard.clone();
    
    // Update cardLookup with cloned instance
    if (cardLookup) cardLookup.set(card.id, card);

    if (card.Type === CARD_TYPES.LOST_SOUL || (card.Type && card.Type.includes("Lost Soul"))) {
      logger.debug(
        `[LOST_SOUL_RULE] Lost Soul '${card.Name}' drawn from deck. Diverting to ${ZONES.LAND_OF_BONDAGE}.`,
      );
      card.zone = ZONES.LAND_OF_BONDAGE;
      card.lastMoved = Date.now();
      card.counters.clear();
      landOfBondage.push(card);
      divertedCards.push(card);

      // Add available action for Lost Soul moved to Land of Bondage
      const action = new CardAction();
      action.id = `soul_${Date.now()}_${card.id}`;
      action.type = ActionType.ACTIVATE_ABILITY;
      action.description = ACTION_DESCRIPTIONS.ACTIVATE_ABILITY;
      action.isMandatory = false;
      addAvailableAction(state, card, action);


      // ✨ FIX: StateView update for Lost Soul
      if (state._clientViews) {
        const oldView = state._clientViews.get(shiftedCard.controllerId);
        if (oldView) {
          oldView.remove(shiftedCard);
        }
        
        const newView = state._clientViews.get(card.controllerId);
        if (newView) {
          newView.add(card);
          logger.debug(`[DRAW_FROM_DECK/LS] Added cloned Lost Soul ${card.Name} to StateView of ${card.controllerId}`);
        }
      }
    } else {
      validCards.push(card);
      drawnCount++;
    }
  }

  _syncParentIndexes(deck);

  return { validCards, divertedCards };
}

/**
 * ✨ NEW HELPER: Moves a single card by its ID from one zone to another.
 * This function handles all moves where a specific card is identified by its ID.
 * @param {PlayerState} actingPlayer - The player initiating the move.
 * @param {RoomState} state - global room state
 * @param {Map<string, Card>} cardLookup - The central lookup map.
 * @param {string} from - Source zone (from ZONES)
 * @param {string} to - Target zone (from ZONES)
 * @param {string} cardId - ID of the card to move
 * @param {object} coords - Coordinates for the drop
 */
function _moveCardById(
  actingPlayer,
  state,
  cardLookup,
  from,
  to,
  cardId,
  coords = null,
  inGameType = "",
  inGameAlignment = "",
  options = {},
) {
  logger.debug(
    `[MOVE_BY_ID] Attempting to move card '${cardId}' from '${from}' to '${to}' by player '${actingPlayer.sessionId}'.`,
    `[MOVE_BY_ID] Attempting to move card '${cardId}' from '${from}' to '${to}' by player '${actingPlayer.name}'.`,
  );


  const findResult = _findCardAndOwner(cardLookup, state, cardId, from);
  if (!findResult) {
    logger.warn(
      `[MOVE_BY_ID_FAIL] Card '${cardId}' not found in zone '${from}' or controller info missing.`,
    );
    return { movedCards: [], logEntry: "" };
  }
  const { fromArr: actualFromArr, controllerId, cardIndex, card, actualZone: detectedZone } = findResult;

  const effectiveFromZone = detectedZone || from || card.zone || "unknown";

  // Determine target player:
  // If an explicit targetPlayerId is requested (e.g. user manually drags onto a specific player's board/pile),
  // use that requested target so _validateMove can enforce pile protection.
  // Otherwise, for personal pile zones (Deck, Discard, Reserve, Banish), default to the card's true owner!
  const targetPlayerIdFromCoords = coords?.targetPlayerId;
  const trueOwnerId = card.originalOwnerId || card.ownerId;
  let targetPlayer;

  if (targetPlayerIdFromCoords) {
    targetPlayer = state.players.get(targetPlayerIdFromCoords);
  } else if (PILE_ZONES.includes(to) && trueOwnerId && state.players.has(trueOwnerId)) {
    targetPlayer = state.players.get(trueOwnerId);
  } else {
    targetPlayer = actingPlayer;
  }

  // ✨ FIX: Prevent moving the card if it's already in the target zone to avoid 
  // index corruption and double-move side effects.
  // EXCEPT when reordering within the same zone (e.g. Look/Reveal top/bottom placement).
  const isReordering = effectiveFromZone === to && (coords?.position === "top" || coords?.position === "bottom");
  if (effectiveFromZone === to && card.controllerId === targetPlayer?.sessionId && !isReordering) {
    logger.debug(`[MOVE_SKIP] Card '${card.id}' is already in target zone '${to}'. Skipping.`);
    // ✨ FIX: Even if skip, ensure visibility is correct for the zone.
    if (to === ZONES.HAND || to === ZONES.TERRITORY) {
      card.isFaceUp = true;
    }
    return { movedCards: [card], logEntry: "" };
  }

  logger.debug(
    `[MOVE_BY_ID] Card Controller determined via cardId: ${controllerId}`,
    `[MOVE_STATE] Card: ${card.Name}, FaceUp: ${card.isFaceUp}, Zone: ${effectiveFromZone}`
  );

  if (!targetPlayer) {
    logger.error(
      `[MOVE_BY_ID_FATAL] Critical error: targetPlayer could not be determined. ID from Coords: '${targetPlayerIdFromCoords}', Fallback player: '${actingPlayer?.sessionId}'`,
    );
    return { movedCards: [], logEntry: "" };
  }

  logger.debug(`[MOVE_BY_ID] moveCard determined targetPlayer: ${targetPlayer.sessionId}`);
  const validation = _validateMove(
    card,
    state,
    controllerId,
    targetPlayer.sessionId,
    from,
    to,
    { ...options, inGameType, inGameAlignment },
  );
  if (!validation.valid) {
    card.lastMoved = Date.now(); // Update timestamp to trigger client snap-back
    logger.warn(
      `[MOVE_BY_ID_FAIL] Move validation failed for card '${cardId}' from ${from} to ${to}. Reason: ${validation.error}`,
    );
    return { movedCards: [], logEntry: "", error: validation.error };
  }

  const pileController = state.players.get(controllerId);
  if (!pileController) {
    logger.error(
      `[MOVE_BY_ID_FATAL] Pile controller with ID '${controllerId}' not found in state. Aborting move.`,
    );
    return { movedCards: [], logEntry: "" };
  }

  // ✨ ATOMIC SYNC FIX: Update properties BEFORE splicing/pushing
  // This ensures the object carries the correct metadata when collection observers fire.
  card.zone = to;
  card.lastMoved = Date.now();
  card.controllerId = targetPlayer.sessionId;
  if (to === ZONES.HAND || to === ZONES.TERRITORY) {
    card.isFaceUp = true;
  }
  card.counters.clear();
  
  // Apply or clear inGame properties
  const isLeavingField = [ZONES.DECK, ZONES.DISCARD, ZONES.HAND, ZONES.BANISH, ZONES.RESERVE].includes(to);
  if (isLeavingField) {
    card.inGameType = "";
    card.inGameAlignment = "";
  } else {
    if (inGameType) card.inGameType = inGameType;
    if (inGameAlignment) card.inGameAlignment = inGameAlignment;
  }

  logger.debug(`[MOVE_ATOMIC] Updated properties for ${card.id}: zone=${card.zone}, isFaceUp=${card.isFaceUp}`);

  logger.debug(
    `[MOVE_BY_ID] SPLICING: Card '${cardId}' at index ${cardIndex} from '${effectiveFromZone}'. Array length BEFORE: ${actualFromArr.length}`,
  );
  const [splicedCard] = actualFromArr.splice(cardIndex, 1);
  _syncParentIndexes(actualFromArr);

  // Colyseus race condition mitigation: clone card before moving into another array
  // (onAdd fires before property sync).
  const movedCard = splicedCard.clone();
  cardLookup.set(cardId, movedCard); // Update lookup map to new instance
  
  logger.debug(
    `[MOVE_BY_ID] SPLICED & CLONED: Array '${effectiveFromZone}' length AFTER: ${actualFromArr.length}`,
  );

  // Tokens dissolve completely when moved to Discard or Banish.
  if (movedCard.isToken && (to === ZONES.DISCARD || to === ZONES.BANISH)) {
    const templateId = movedCard.templateId || movedCard.ImageFile;
    cardLookup.delete(cardId);
    if (state._clientViews) {
      const oldView = state._clientViews.get(controllerId);
      if (oldView) {
        oldView.remove(splicedCard);
      }
    }
    return { movedCards: [movedCard], logEntry: `${actingPlayer.name} dissolves token {{${templateId}|${movedCard.Name}}}.` };
  }

  if (coords) {
    movedCard.x = coords.x;
    movedCard.y = coords.y;
  }

  const toArr = getZoneCollection(targetPlayer, state, to);
  const position = coords?.position;

  if (to === ZONES.DECK && position === "bottom") {
    logger.debug(`[MOVE_BY_ID] PUSHING to bottom of ${to}.`);
    toArr.push(movedCard);
  } else if (to === ZONES.DECK) {
    logger.debug(`[MOVE_BY_ID] UNSHIFTING to top of ${to}.`);
    _unshiftToZone(toArr, movedCard);
  } else {
    logger.debug(`[MOVE_BY_ID] PUSHING to ${to}. New length: ${toArr.length + 1}`);
    toArr.push(movedCard);
  }

  // Restore snapshot properties if undoing
  if (options?.snapshot) {
    const snap = options.snapshot;
    if (snap.isFaceUp !== undefined) movedCard.isFaceUp = snap.isFaceUp;
    if (snap.rotation !== undefined) movedCard.rotation = snap.rotation;
    if (snap.isParalyzed !== undefined) movedCard.isParalyzed = snap.isParalyzed;
    if (snap.paralyzeRounds !== undefined) movedCard.paralyzeRounds = snap.paralyzeRounds;
    if (snap.isSetAside !== undefined) movedCard.isSetAside = snap.isSetAside;
    if (snap.setAsideRounds !== undefined) movedCard.setAsideRounds = snap.setAsideRounds;
    if (snap.attachedTo !== undefined) movedCard.attachedTo = snap.attachedTo;
    if (snap.inGameType !== undefined) movedCard.inGameType = snap.inGameType;
    if (snap.inGameAlignment !== undefined) movedCard.inGameAlignment = snap.inGameAlignment;
    if (snap.counters && typeof snap.counters === "object") {
      movedCard.counters.clear();
      for (const [k, v] of Object.entries(snap.counters)) {
        movedCard.counters.set(k, v);
      }
    }
  }

  let logEntry = "";
  const templateId = movedCard.templateId || movedCard.ImageFile;
  
  // Special logging for Lost Souls being moved to Land of Bondage
  if (movedCard && movedCard.Type === CARD_TYPES.LOST_SOUL && to === ZONES.LAND_OF_BONDAGE) {
      logEntry = `${actingPlayer.name} moves {{${templateId}|${movedCard.Name}}} to ${getZoneDisplayName(to, false)}. (Lost Soul rule)`;
  } else {
      const isFromOpponent = controllerId !== actingPlayer.sessionId;
      const isToOpponent = targetPlayer.sessionId !== actingPlayer.sessionId;
      
      let toDisplay = getZoneDisplayName(to, isToOpponent);
      if (to === ZONES.DECK) {
          toDisplay = position === "bottom" ? `the bottom of ${toDisplay}` : `the top of ${toDisplay}`;
      }

      if (effectiveFromZone === ZONES.HAND && to === ZONES.DECK) {
          logEntry = `${actingPlayer.name} moves a card from ${getZoneDisplayName(effectiveFromZone, isFromOpponent)} to ${toDisplay}.`;
      } else {
          logEntry = `${actingPlayer.name} moves {{${templateId}|${movedCard.Name}}} from ${getZoneDisplayName(effectiveFromZone, isFromOpponent)} to ${toDisplay}.`;
      }
  }

  // Format inspect string for debug logging
  const cardLog = util.inspect(
    {
      name: movedCard.Name,
      from,
      to,
      id: cardId,
      owner: movedCard.originalOwnerId,
      controller: movedCard.controllerId,
    },
    { colors: true, depth: null },
  );

  logger.debug(`[MOVE_BY_ID] SUCCESS: ${cardLog}`);

  // Update StateView AFTER the card has been added to the state array
  if (state._clientViews) {
    const oldView = state._clientViews.get(controllerId);
    if (oldView) {
      try {
        oldView.remove(splicedCard);
      } catch (e) {
        logger.debug(`[MOVE_BY_ID] oldView.remove skipped: ${e.message}`);
      }
    }
    
    const newView = state._clientViews.get(movedCard.controllerId);
    if (newView) {
      try {
        newView.add(movedCard);
        logger.debug(`[MOVE_BY_ID] Added cloned card ${movedCard.Name} to StateView of ${movedCard.controllerId}`);
      } catch (e) {
        logger.debug(`[MOVE_BY_ID] newView.add skipped: ${e.message}`);
      }
    } else {
      logger.warn(`[MOVE_BY_ID] StateView for controller ${movedCard.controllerId} NOT FOUND!`);
    }
  }

  return { movedCards: [movedCard], logEntry: logEntry };
}

/**
 * Draws cards from the deck, applying the Lost Soul rule.
 * Specifically handles drawing from the DECK.
 *
 * @param {PlayerState} player - The player drawing cards.
 * @param {RoomState} state - The global game state.
 * @param {Map<string, Card>} cardLookup - The central lookup map.
 * @param {string} to - The target zone for drawn cards (e.g. HAND).
 * @param {number} count - The number of valid cards to draw.
 * @param {object} [coords=null] - Optional drop coordinates.
 * @returns {{movedCards: Card[], divertedCards: Card[], logEntry: string, error?: string}}
 */
function _drawCardsFromDeck(
  player,
  state,
  cardLookup,
  to,
  count,
  coords = null,
) {
  // Check hand limit before drawing from deck
  let effectiveCount = count;
  if (to === ZONES.HAND) {
    if (!player[ZONES.DECK] || player[ZONES.DECK].length === 0) {
      logger.warn(
        `[DRAW_FROM_DECK] Deck of player '${player.sessionId}' is empty.`,
      );
      return {
        movedCards: [],
        logEntry: `${player.name} cannot draw: Deck is empty.`,
        error: "Deck is empty!",
      };
    }
    const currentHandSize = player[ZONES.HAND]?.length || 0;
    const capacity = Math.max(0, MAX_HAND_SIZE - currentHandSize);
    effectiveCount = Math.min(count, capacity);
    if (effectiveCount <= 0) {
      logger.warn(
        `[DRAW_FROM_DECK] Hand limit (${MAX_HAND_SIZE}/${MAX_HAND_SIZE}) reached for player '${player.name}'. Draw cancelled.`,
      );
      return {
        movedCards: [],
        logEntry: `${player.name} cannot draw: Hand limit reached (${MAX_HAND_SIZE}/${MAX_HAND_SIZE}).`,
        error: `Hand limit reached (${MAX_HAND_SIZE}/${MAX_HAND_SIZE})!`,
      };
    }
  }

  logger.debug(
    `[DRAW_FROM_DECK] Player '${player.sessionId}' drawing ${effectiveCount} cards to '${to}'.`,
  );
  const { validCards, divertedCards } = _drawCardsWithLostSoulRule(player, state, effectiveCount, cardLookup);

  if (validCards.length > 0) {
    const toArr = getZoneCollection(player, state, to);
    for (const card of validCards) {
      card.zone = to;
      card.lastMoved = Date.now();
      card.counters.clear(); // Clear counters on zone change
      if (to === ZONES.HAND || to === ZONES.TERRITORY) {
        card.isFaceUp = true;
      }
      // Controller remains the same as the player drawing
    }
    toArr.push(...validCards);
    
    // StateView update for all drawn cards
    if (state._clientViews) {
      for (const card of validCards) {
        const newView = state._clientViews.get(card.controllerId);
        if (newView) {
          newView.add(card);
          logger.debug(`[DRAW_FROM_DECK] Added cloned card ${card.Name} to StateView of ${card.controllerId}`);
        } else {
          logger.warn(`[DRAW_FROM_DECK] StateView for controller ${card.controllerId} NOT FOUND!`);
        }
      }
    }

    logger.debug(
      `[DRAW_FROM_DECK] Moved ${validCards.length} valid card(s) to ${to}.`,
      `[DRAW_FROM_DECK] ${player.name} moved ${validCards.length} card(s) to ${to}.`,
    );
  }

  let logEntry = `${player.name} draws ${validCards.length} card(s) from ${getZoneDisplayName(ZONES.DECK)}.`;
  if (to === ZONES.HAND && validCards.length < count) {
    logEntry += ` (Hand limit reached: ${player[ZONES.HAND]?.length}/${MAX_HAND_SIZE})`;
  }
  return { movedCards: validCards, divertedCards: divertedCards || [], logEntry: logEntry };
}

/**
 * Moves one or more cards from one zone to another after validating the move.
 * Acts as a dispatcher calling specific helpers.
 *
 * @param {PlayerState} player - Acting player state.
 * @param {RoomState} state - Global room state.
 * @param {Map<string, Card>} cardLookup - Central lookup map.
 * @param {string} from - Source zone (from ZONES).
 * @param {string} to - Destination zone (from ZONES).
 * @param {string|number} cardIdOrIndex - Card ID or deck index.
 * @param {number} [count=1] - Number of cards to move.
 * @param {object} [coords={}] - Coordinates for drop positioning.
 * @param {string} [inGameType=""] - Runtime type override.
 * @param {string} [inGameAlignment=""] - Runtime alignment override.
 * @param {object} [options={}] - Move options (e.g. isUndo, snapshot).
 * @returns {{movedCards: Card[], logEntry: string, divertedCards?: Card[], error?: string}}
 */
function moveCard(
  player,
  state,
  cardLookup,
  from,
  to,
  cardIdOrIndex,
  count = 1,
  coords = {}, // Default to empty object to allow coords?.position checks
  inGameType = "",
  inGameAlignment = "",
  options = {},
) {
  logger.debug(
    `[moveCard_DISPATCHER] Entered moveCard for player ${player?.sessionId}, from ${from} to ${to}, cardIdOrIndex ${cardIdOrIndex}, count ${count}, coords `,
    coords,
  );
  if (!player) {
    logger.error(
      "[moveCard_DISPATCHER_ERROR] moveCard called without valid player object.",
    );
    return { movedCards: [], logEntry: "" };
  }

  // Distinguish between drawing from deck (by index/count) and moving a specific card (by ID)
  if (from === ZONES.DECK && typeof cardIdOrIndex === "number") {
    return _drawCardsFromDeck(player, state, cardLookup, to, count, coords);
  }
  // Moving a specific card by its ID
  else if (typeof cardIdOrIndex === "string") {
    return _moveCardById(player, state, cardLookup, from, to, cardIdOrIndex, coords, inGameType, inGameAlignment, options);
  } else {
    logger.error(
      `[moveCard_DISPATCHER_ERROR] Invalid moveCard call. 'from' zone is not DECK and 'cardIdOrIndex' is not a string ID. from=${from}, cardIdOrIndex=${cardIdOrIndex}`,
    );
    return { movedCards: [], logEntry: "" };
  }
}

/**
 * Finds a card by its ID across all player zones.
 *
 * @param {RoomState} state - Global room state.
 * @param {string} cardId - Card ID to locate.
 * @returns {Card | null} Found card or null.
 */
function findCardById(state, cardId) {
  // Search across all zones of all players
  for (const player of state.players.values()) {
    for (const zoneName of ALL_ZONES) {
      if (!player[zoneName]) continue; // Skip zones that player doesn't have
      const zone = player[zoneName];
      const card = zone?.find((c) => c.id === cardId);
      if (card) return card;
    }
  }
  return null;
}

/**
 * In-place Fisher-Yates array shuffle.
 *
 * @param {Array} arr - The array to shuffle (e.g. deck).
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Adds an available action to a card and securely registers it in the
 * controller's StateView to prevent leaking.
 *
 * @param {RoomState} state - Global room state.
 * @param {Card} card - Card receiving the action.
 * @param {CardAction} action - New action instance.
 */
function addAvailableAction(state, card, action) {
  if (!card || !action) return;
  card.availableActions.push(action);
  
  if (state && state._clientViews) {
    const clientView = state._clientViews.get(card.controllerId);
    if (clientView) {
      // In Colyseus 0.15, when @view() is used on an ArraySchema,
      // the ArraySchema itself must be added to StateView for the encoder to inspect it.
      clientView.add(card.availableActions);
      clientView.add(action);
    }
  }
}

module.exports = {
  moveCard,
  getZoneCollection,
  shuffle,
  findCardById,
  getZoneDisplayName,
  addAvailableAction,
  _validateMove,
};
