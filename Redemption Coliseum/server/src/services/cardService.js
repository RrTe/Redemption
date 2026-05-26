// server/services/cardService.js
const logger = require("../utils/logger");
const { ZONES, ALL_ZONES, PILE_ZONES } = require("../../../shared/zones");
const {
  CARD_TYPES,
  MANAGED_TERRITORY_TYPES,
} = require("../../../shared/card-constants");
const { ArraySchema } = require("@colyseus/schema");
const { PlayerState } = require("../state/PlayerState");
const util = require("util");

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

  const fromArr = getZoneCollection(controller, state, fromZone);
  const cardIndex = fromArr.findIndex((c) => c.id === cardId);

  if (cardIndex === -1) {
    logger.warn(
      `[FIND_CARD] Karte '${cardId}' wurde im State gefunden, aber nicht in der erwarteten Zone '${fromZone}' des Controllers '${card.controllerId}'. Aktuelle Zone: '${card.zone}'.`,
    );
    return null;
  }

  return {
    card,
    controller,
    fromArr,
    cardIndex,
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
function _drawCardsWithLostSoulRule(player, state, count) {
  const deck = getZoneCollection(player, state, ZONES.DECK);
  const landOfBondage = getZoneCollection(player, state, ZONES.LAND_OF_BONDAGE);
  const validCards = [];
  let drawnCount = 0;

  while (drawnCount < count && deck.length > 0) {
    const card = deck.shift(); // Nimm eine Karte vom Deck

    if (card.Type === CARD_TYPES.LOST_SOUL) {
      // Fall A: Es ist eine Lost Soul -> umleiten
      logger.debug(
        `[LOST_SOUL_RULE] Lost Soul '${card.Name}' vom Deck gezogen. Wird nach ${ZONES.LAND_OF_BONDAGE} umgeleitet.`,
      );
      card.zone = ZONES.LAND_OF_BONDAGE;
      card.lastMoved = Date.now();
      card.counters.clear(); // ✨ NEU: Counter löschen bei Zonenwechsel
      landOfBondage.push(card);
      // drawnCount wird NICHT erhöht, damit eine Ersatzkarte gezogen wird.
    } else {
      // Fall B: Normale Karte -> sammeln
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
) {
  logger.debug(
    `[MOVE_BY_ID] Attempting to move card '${cardId}' from '${from}' to '${to}' by player '${actingPlayer.sessionId}'.`,
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
      `[MOVE_BY_ID_FAIL] Keine Karte mit ID '${cardId}' in Zone '${from}' gefunden oder Controller-Info fehlt.`,
    );
    return;
  }
  const { fromArr, controllerId, cardIndex, card } = findResult;
  logger.debug(
    `[MOVE_BY_ID] Card Controller determined via cardId: ${controllerId}`,
  );

  // ✨ FINALE KORREKTUR: Der Zielspieler MUSS aus den Coords ermittelt werden, wenn vorhanden.
  // `actingPlayer` ist nur der Fallback, wenn kein Ziel angegeben ist (z.B. Karte auf sich selbst ziehen).
  const targetPlayerIdFromCoords = coords?.targetPlayerId;
  const targetPlayer = targetPlayerIdFromCoords
    ? state.players.get(targetPlayerIdFromCoords)
    : actingPlayer;

  if (!targetPlayer) {
    logger.error(
      `[MOVE_BY_ID_FATAL] Critical error: targetPlayer could not be determined. ID from Coords: '${targetPlayerIdFromCoords}', Fallback player: '${actingPlayer?.sessionId}'`,
    );
    return;
  }
  // ✨ ENDE DER KORREKTUR

  logger.debug(
    `[MOVE_BY_ID] moveCard determined targetPlayer: ${targetPlayer.sessionId}`,
  );
  if (
    !_validateMove(card, state, controllerId, targetPlayer.sessionId, from, to)
  ) {
    card.lastMoved = Date.now(); // Update timestamp to trigger client snap-back
    logger.warn(
      `[MOVE_BY_ID_FAIL] Move validation failed for card '${cardId}' from ${from} to ${to}.`,
    );
    return;
  }

  const pileController = state.players.get(controllerId);
  if (!pileController) {
    logger.error(
      `[MOVE_BY_ID_FATAL] Pile controller with ID '${controllerId}' not found in state. Aborting move.`,
    );
    return;
  }
  const actualFromArr = getZoneCollection(pileController, state, from);

  logger.debug(
    `[MOVE_BY_ID] About to splice card from '${from}'. fromArr length BEFORE: ${actualFromArr.length}`,
  );
  const [movedCard] = actualFromArr.splice(cardIndex, 1);
  logger.debug(
    `[MOVE_BY_ID] Spliced card from '${from}'. fromArr length AFTER: ${actualFromArr.length}`,
  );

  movedCard.zone = to;
  movedCard.lastMoved = Date.now();
  movedCard.controllerId = targetPlayer.sessionId;
  movedCard.counters.clear(); // ✨ NEU: Counter löschen bei Zonenwechsel

  if (coords) {
    movedCard.x = coords.x;
    movedCard.y = coords.y;
  }

  const toArr = getZoneCollection(targetPlayer, state, to);
  const position = coords?.position;

  if (to === ZONES.DECK && position === "bottom") {
    toArr.push(movedCard);
  } else if (to === ZONES.DECK) {
    toArr.unshift(movedCard);
  } else {
    toArr.push(movedCard);
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
  const validCards = _drawCardsWithLostSoulRule(player, state, count);

  if (validCards.length > 0) {
    const toArr = getZoneCollection(player, state, to);
    for (const card of validCards) {
      card.zone = to;
      card.lastMoved = Date.now();
      card.counters.clear(); // ✨ NEU: Counter löschen bei Zonenwechsel
      // Controller remains the same as the player drawing
    }
    toArr.push(...validCards);
    logger.debug(
      `[DRAW_FROM_DECK] Moved ${validCards.length} valid card(s) to ${to}.`,
    );
  }

  // ✨ NEU: Gib die gezogenen Karten zurück, damit der GameRoom darauf reagieren kann.
  return validCards;
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
) {
  logger.debug(
    `[moveCard_DISPATCHER] Entered moveCard with player.sessionId=${player?.sessionId}, from=${from}, to=${to}, cardIdOrIndex=${cardIdOrIndex}, count=${count}, coords=`,
    coords,
  );
  if (!player) {
    logger.error(
      "[moveCard_DISPATCHER_ERROR] moveCard wurde ohne gültiges player-Objekt aufgerufen.",
    );
    return;
  }

  // ✨ FINALE KORREKTUR: Die Dispatcher-Logik muss zwischen "Ziehen" und "Suchen" unterscheiden.
  // Fall A: "Ziehen" vom Deck. Dies wird durch einen numerischen Index identifiziert.
  if (from === ZONES.DECK && typeof cardIdOrIndex === "number") {
    return _drawCardsFromDeck(player, state, cardLookup, to, count, coords);
  }
  // Fall B: Bewegen einer spezifischen Karte per ID. Dies gilt für Züge von der Hand,
  // aus dem Territorium, UND für das Ergebnis einer Suche (auch aus dem Deck).
  else if (typeof cardIdOrIndex === "string") {
    _moveCardById(player, state, cardLookup, from, to, cardIdOrIndex, coords);
    return []; // Kein Kartenziehen, also leeres Array zurückgeben.
  } else {
    logger.error(
      `[moveCard_DISPATCHER_ERROR] Ungültiger Aufruf von moveCard. 'from' Zone ist nicht DECK, aber 'cardIdOrIndex' ist keine string ID. from=${from}, cardIdOrIndex=${cardIdOrIndex}`,
    );
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

module.exports = {
  moveCard,
  getZoneCollection,
  shuffle,
  findCardById,
};
