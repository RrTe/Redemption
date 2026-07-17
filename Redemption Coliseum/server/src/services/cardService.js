// server/services/cardService.js
const logger = require("../utils/logger");
const { ZONES, ALL_ZONES, PILE_ZONES } = require("../../../shared/zones");
const {
  CARD_TYPES,
  MANAGED_TERRITORY_TYPES,
} = require("../../../shared/card-constants");
const { ArraySchema } = require("@colyseus/schema");
const { PlayerState } = require("../state/PlayerState");
const { generateCardId } = require("../../../shared/utils");
const util = require("util");

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
 * Hilfsfunktion: Gibt die richtige Zone-Collection zurück.
 * Nutzt ZONES für konsistente Referenzen.
 */
function getZoneCollection(player, state, zone) {
  // ✨ NEU: Globale Zonen direkt vom State abfragen.
  if (zone === ZONES.BATTLEFIELD) return state.battlefield;
  if (zone === ZONES.SET_ASIDE) return state.setAside; // Falls wir das später brauchen

  if (!Object.values(ZONES).includes(zone) || zone === ZONES.BATTLEFIELD) {
    throw new Error(`Unbekannte Zone: ${zone}`);
  }

  // Wenn kein Spieler übergeben wurde, kann keine spielerspezifische Zone gefunden werden.
  if (!player) {
    throw new Error(`Spieler-Kontext fehlt für die Zone: ${zone}`);
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
      throw new Error(`Unbekannte Zone: ${zone}`);
  }
}

/**
 * ✨ REFACTORING: Validierungslogik für Kartenbewegungen ausgelagert.
 * @param {Card} card Die zu bewegende Karte.
 * @param {RoomState} state Der aktuelle Spielzustand.
 * @param {string} cardControllerId Die ID des Spielers, der die Karte kontrolliert.
 * @param {string} targetPlayerId Die ID des Spielers, der das Ziel der Bewegung ist.
 * @param {string} fromZone Der Name der Quellzone.
 * @param {string} toZone Der Name der Zielzone.
 * @returns {boolean} True, wenn die Bewegung gültig ist, sonst false.
 */
function _validateMove(
  card,
  state,
  cardControllerId,
  targetPlayerId,
  fromZone,
  toZone,
) {
  // ✨ PHASE 1: Karten im Land of Redemption sind permanent aus dem Spiel.
  if (fromZone === ZONES.LAND_OF_REDEMPTION) {
    logger.warn(
      `Ungültiger Zug: Versuch, eine Karte aus dem '${ZONES.LAND_OF_REDEMPTION}' zu bewegen.`,
    );
    return false;
  }

  // ✨ Kompakte und vollständige Regelprüfung für Lost Souls.
  if (card.Type === CARD_TYPES.LOST_SOUL) {
    // Definiere alle erlaubten Züge für eine Lost Soul.
    const canMoveToAnyBondage = toZone === ZONES.LAND_OF_BONDAGE;
    const canMoveToOwnDeck =
      toZone === ZONES.DECK && targetPlayerId === card.originalOwnerId;

    // Sonderregel: Ins gegnerische Land of Redemption nur aus dem eigenen Land of Bondage.
    const canMoveToOpponentRedemption =
      toZone === ZONES.LAND_OF_REDEMPTION &&
      targetPlayerId !== card.originalOwnerId &&
      fromZone === ZONES.LAND_OF_BONDAGE &&
      cardControllerId === card.originalOwnerId;

    if (
      canMoveToAnyBondage ||
      canMoveToOwnDeck ||
      canMoveToOpponentRedemption
    ) {
      return true; // Der Zug ist gültig.
    }

    // Wenn keine der obigen Regeln zutrifft, ist der Zug für eine Lost Soul ungültig.
    logger.warn(
      `Ungültiger Zug für Lost Soul von '${fromZone}' nach '${toZone}'.`,
    );
    return false;
  }

  // ✨ Regel: Karten dürfen nicht in die Pile-Zonen (Deck, Discard) eines anderen Spielers gelegt werden.
  if (PILE_ZONES.includes(toZone) && card.originalOwnerId !== targetPlayerId) {
    logger.warn(
      `Ungültiger Zug: Versuch, eine Karte in die Zone '${toZone}' eines anderen Spielers zu legen. Aktion wird abgebrochen.`,
    );
    return false;
  }

  // ✨ Regel 4: Karten mit dem Type EVIL_CHARACTERS dürfen nicht ins eigene Territory gespielt werden.
  // if (card.Type === CARD_TYPES.EVIL_CHARACTERS && targetPlayerId === cardOwnerId && toZone === ZONES.TERRITORY) {
  //   logger.warn("Ungültige Bewegung: Evil Characters dürfen nicht ins eigene Territory gespielt werden.");
  //   return false;
  // }

  return true;
}

/**
 * ✨ REFACTORING: Findet eine Karte und ihren Besitzer mithilfe der zentralen Lookup-Map.
 * @param {Map<string, Card>} cardLookup - Die zentrale Lookup-Map für alle Karten.
 * @param {RoomState} state - Der globale Spielzustand, um den PlayerState zu finden.
 * @param {string} cardId - Die ID der zu suchenden Karte.
 * @param {string} fromZone - Die Zone, in der die Karte erwartet wird.
 * @returns {{card: Card, controller: PlayerState, fromArr: ArraySchema<Card>, cardIndex: number, controllerId: string} | null} Ein Objekt mit Karte, Controller und Quell-Array oder null.
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
      `[FIND_CARD] Karte mit ID '${cardId}' in der globalen Lookup-Map nicht gefunden.`,
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

  // ✨ FIX: Use the actual current zone of the card if it doesn't match 'fromZone'
  const actualZone = card.zone || fromZone || "unknown";
  const fromArr = getZoneCollection(controller, state, actualZone);
  const cardIndex = fromArr.findIndex((c) => c.id === cardId);

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
 * ✨ NEU (SCHRITT 1): Zieht Karten vom Deck unter Berücksichtigung der "Lost Soul"-Sonderregel.
 * Lost Souls werden direkt ins Land of Bondage umgeleitet und es wird eine Ersatzkarte gezogen.
 * @param {PlayerState} player - Der Spieler, der die Karten zieht.
 * @param {RoomState} state - Der globale Spielzustand.
 * @param {number} count - Die Anzahl der zu ziehenden "gültigen" Karten.
 * @returns {Card[]} Ein Array der "gültigen" Karten, die in die Zielzone (z.B. Hand) gelegt werden sollen.
 */
function _drawCardsWithLostSoulRule(player, state, count, cardLookup) {
  const deck = getZoneCollection(player, state, ZONES.DECK);
  const landOfBondage = getZoneCollection(player, state, ZONES.LAND_OF_BONDAGE);
  const validCards = [];
  let drawnCount = 0;

  while (drawnCount < count && deck.length > 0) {
    const shiftedCard = deck.shift();
    const card = shiftedCard.clone();
    
    // ✨ WICHTIG: cardLookup auf die geklonte Instanz aktualisieren
    if (cardLookup) cardLookup.set(card.id, card);

    if (card.Type === CARD_TYPES.LOST_SOUL) {
      logger.debug(
        `[LOST_SOUL_RULE] Lost Soul '${card.Name}' vom Deck gezogen. Wird nach ${ZONES.LAND_OF_BONDAGE} umgeleitet.`,
      );
      card.zone = ZONES.LAND_OF_BONDAGE;
      card.lastMoved = Date.now();
      card.counters.clear();
      landOfBondage.push(card);

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

  return validCards;
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
  inGameAlignment = ""
) {
  logger.debug(
    `[MOVE_BY_ID] Attempting to move card '${cardId}' from '${from}' to '${to}' by player '${actingPlayer.sessionId}'.`,
    `[MOVE_BY_ID] Attempting to move card '${cardId}' from '${from}' to '${to}' by player '${actingPlayer.name}'.`,
  );

  // Lost Soul redirection logic - this needs to be here as it's specific to the card being moved
  const cardForCheck = cardLookup.get(cardId);
  if (cardForCheck && cardForCheck.Type === CARD_TYPES.LOST_SOUL) {
    if (to === ZONES.TERRITORY || to === ZONES.HAND) {
      const owner = state.players.get(cardForCheck.originalOwnerId);
      if (owner) {
        logger.debug(
          `[MOVE_REDIRECT] Lost Soul '${cardForCheck.Name}' will be redirected from '${to}' to '${ZONES.LAND_OF_BONDAGE}'.`,
        );
        to = ZONES.LAND_OF_BONDAGE;
        coords = { ...coords, targetPlayerId: owner.sessionId };
      }
    }
  }

  const findResult = _findCardAndOwner(cardLookup, state, cardId, from);
  if (!findResult) {
    logger.warn(
      `[MOVE_BY_ID_FAIL] Card '${cardId}' not found in zone '${from}' or controller info missing.`,
    );
    return { movedCards: [], logEntry: "" };
  }
  const { fromArr: actualFromArr, controllerId, cardIndex, card, actualZone: detectedZone } = findResult;

  const effectiveFromZone = detectedZone || from || card.zone || "unknown";

  // ✨ FINALE KORREKTUR: Der Zielspieler MUSS aus den Coords ermittelt werden, wenn vorhanden.
  // `actingPlayer` ist nur der Fallback, wenn kein Ziel angegeben ist (z.B. Karte auf sich selbst ziehen).
  const targetPlayerIdFromCoords = coords?.targetPlayerId;
  const targetPlayer = targetPlayerIdFromCoords
    ? state.players.get(targetPlayerIdFromCoords)
    : actingPlayer;

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
  if (
    !_validateMove(card, state, controllerId, targetPlayer.sessionId, from, to)
  ) {
    card.lastMoved = Date.now(); // Update timestamp to trigger client snap-back
    logger.warn(
      `[MOVE_BY_ID_FAIL] Move validation failed for card '${cardId}' from ${from} to ${to}.`,
    );
    return { movedCards: [], logEntry: "" };
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
  
  // ✨ NEU: inGame-Eigenschaften anwenden oder zurücksetzen
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
  // ✨ CLONE FIX: Colyseus kann Race Conditions erzeugen, wenn dieselbe Referenz in ein 
  // anderes Array verschoben wird (onAdd feuert vor Property-Sync). Wir klonen die Karte.
  const movedCard = splicedCard.clone();
  cardLookup.set(cardId, movedCard); // WICHTIG: Lookup-Map auf die neue Instanz aktualisieren!
  
  logger.debug(
    `[MOVE_BY_ID] SPLICED & CLONED: Array '${effectiveFromZone}' length AFTER: ${actualFromArr.length}`,
  );

  // ✨ NEU: Token werden vollständig aufgelöst, wenn sie in Discard oder Banish verschoben werden.
  if (movedCard.isToken && (to === ZONES.DISCARD || to === ZONES.BANISH)) {
    const templateId = generateCardId(movedCard.ImageFile, movedCard.Set, movedCard.Name);
    cardLookup.delete(cardId);
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
    toArr.unshift(movedCard);
  } else {
    logger.debug(`[MOVE_BY_ID] PUSHING to ${to}. New length: ${toArr.length + 1}`);
    toArr.push(movedCard);
  }

  let logEntry = "";
  const templateId = generateCardId(movedCard.ImageFile, movedCard.Set, movedCard.Name);
  
  // Special logging for Lost Souls being redirected
  if (cardForCheck && cardForCheck.Type === CARD_TYPES.LOST_SOUL && (to === ZONES.LAND_OF_BONDAGE || to === ZONES.TERRITORY)) {
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



  

  // ✨ FIX: Nutze util.inspect innerhalb eines Template-Literals, um die Ausgabe zu erzwingen
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

  // ✨ FIX: Update StateView AFTER the card has been added to the state array!
  if (state._clientViews) {
    const oldView = state._clientViews.get(oldControllerId);
    if (oldView) {
      oldView.remove(splicedCard);
    }
    
    const newView = state._clientViews.get(movedCard.controllerId);
    if (newView) {
      newView.add(movedCard);
      logger.debug(`[MOVE_BY_ID] Added cloned card ${movedCard.Name} to StateView of ${movedCard.controllerId}`);
    } else {
      logger.warn(`[MOVE_BY_ID] StateView for controller ${movedCard.controllerId} NOT FOUND!`);
    }
  }

  return { movedCards: [movedCard], logEntry: logEntry };
}

/**
 * ✨ NEW HELPER: Draws cards from the deck, applying the Lost Soul rule.
 * This function is specifically for drawing from the DECK.
 * @param {PlayerState} player - The player drawing cards.
 * @param {RoomState} state - The global game state.
 * @param {Map<string, Card>} cardLookup - The central lookup map.
 * @param {string} to - The target zone for drawn cards (e.g., HAND).
 * @param {number} count - The number of "valid" cards to draw.
 * @param {object} coords - Optional coordinates for the drop (though usually not relevant for drawing).
 */
function _drawCardsFromDeck(
  player,
  state,
  cardLookup,
  to,
  count,
  coords = null,
) {
  logger.debug(
    `[DRAW_FROM_DECK] Player '${player.sessionId}' drawing ${count} cards to '${to}'.`,
  );
  const validCards = _drawCardsWithLostSoulRule(player, state, count, cardLookup);

  if (validCards.length > 0) {
    const toArr = getZoneCollection(player, state, to);
    for (const card of validCards) {
      card.zone = to;
      card.lastMoved = Date.now();
      card.counters.clear(); // ✨ NEU: Counter löschen bei Zonenwechsel
      if (to === ZONES.HAND || to === ZONES.TERRITORY) {
        card.isFaceUp = true;
      }
      // Controller remains the same as the player drawing
    }
    toArr.push(...validCards);
    
    // ✨ FIX: StateView update for all drawn cards
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

  const logEntry = `${player.name} draws ${validCards.length} card(s) from ${getZoneDisplayName(ZONES.DECK)}.`;
  return { movedCards: validCards, logEntry: logEntry };
}

/**
 * Verschiebt eine oder mehrere Karten von einer Zone in eine andere, nachdem der Zug validiert wurde.
 * Dies ist jetzt ein Dispatcher, der die spezifischen Helfer aufruft.
 * @param {PlayerState} player - Spielerzustand (der Spieler, der die Aktion ausführt)
 * @param {RoomState} state - globaler Raumzustand
 * @param {Map<string, Card>} cardLookup - Die zentrale Lookup-Map.
 * @param {string} from - Ausgangszone (aus ZONES)
 * @param {string} to - Zielzone (aus ZONES)
 * @param {string|number} cardIdOrIndex - ID der Karte oder Index im Stapel (für Deck)
 * @param {number} count - Anzahl der zu verschiebenden Karten (Standard: 1)
 * @param {object} coords - Koordinaten für den Drop
 */
function moveCard(
  player,
  state,
  cardLookup,
  from,
  to,
  cardIdOrIndex,
  count = 1,
  coords = {}, // ✨ FIX: Standardwert von null auf {} geändert, damit coords?.position funktioniert
  inGameType = "",
  inGameAlignment = ""
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
    return _moveCardById(player, state, cardLookup, from, to, cardIdOrIndex, coords, inGameType, inGameAlignment);
  } else {
    logger.error(
      `[moveCard_DISPATCHER_ERROR] Invalid moveCard call. 'from' zone is not DECK and 'cardIdOrIndex' is not a string ID. from=${from}, cardIdOrIndex=${cardIdOrIndex}`,
    );
    return { movedCards: [], logEntry: "" };
  }
}

/**
 * Findet eine Karte anhand ihrer ID über alle Zonen hinweg.
 * @param {RoomState} state - Der globale Raumzustand.
 * @param {string} cardId - Die ID der zu suchenden Karte.
 * @returns {Card | null} Die gefundene Karte oder null.
 */
function findCardById(state, cardId) {
  // Durchsuche alle Zonen aller Spieler
  for (const player of state.players.values()) {
    for (const zoneName of ALL_ZONES) {
      if (!player[zoneName]) continue; // Überspringe Zonen, die der Spieler nicht hat
      const zone = player[zoneName];
      const card = zone?.find((c) => c.id === cardId);
      if (card) return card;
    }
  }
  return null;
}

/**
 * Mischt ein Array in-place (Fisher-Yates).
 * @param {Array} arr - Das zu mischende Array (z.B. Deck)
 */
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
}

/**
 * Fügt einer Karte eine verfügbare Aktion hinzu und registriert diese 
 * sicher in der StateView des Controllers, sodass sie nicht geleakt wird.
 * @param {RoomState} state - Der globale Raumzustand.
 * @param {Card} card - Die Karte, die die Aktion erhält.
 * @param {CardAction} action - Die neue Aktion.
 */
function addAvailableAction(state, card, action) {
  if (!card || !action) return;
  card.availableActions.push(action);
  
  if (state && state._clientViews) {
    const clientView = state._clientViews.get(card.controllerId);
    if (clientView) {
      // ✨ FIX: In Colyseus 0.15 muss bei einem @view() auf ein ArraySchema
      // zwingend das ArraySchema SELBST der StateView hinzugefügt werden,
      // damit der Encoder überhaupt in das Array hineinschaut!
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
  addAvailableAction
};
