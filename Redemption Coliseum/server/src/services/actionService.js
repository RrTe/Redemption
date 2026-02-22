// server/services/actionService.js
const logger = require("../utils/logger");
const { ZONES } = require("../../../shared/zones");
const { getZoneCollection, moveCard, shuffle } = require("./cardService");

/**
 * Handles a player's request to change their redeemed souls count.
 * @param {GameRoom} room The GameRoom instance.
 * @param {any} client The Colyseus client sending the request.
 * @param {object} message The message from the client.
 */
function handleChangeRedeemedSouls(room, client, message) {
  const player = room.state.players.get(client.sessionId);
  if (!player) return;

  const amount = Number(message.amount);
  if (isNaN(amount)) {
    logger.warn("Invalid amount for changeRedeemedSouls", {
      clientId: client.sessionId,
      message,
    });
    return;
  }

  player.redeemedSouls += amount;
  // Souls can't go below 0
  if (player.redeemedSouls < 0) player.redeemedSouls = 0;
  logger.info(
    `Player ${client.sessionId} changed redeemedSouls by ${amount}. New total: ${player.redeemedSouls}`
  );
}

/**
 * Handles a player's request to update a card's state (e.g., tapping).
 * @param {GameRoom} room The GameRoom instance.
 * @param {any} client The Colyseus client sending the request.
 * @param {object} message The message from the client.
 */
function handleUpdateCardState(room, client, message) {
  const { cardId, updates } = message;
  if (!cardId || !updates) return;

  const card = room.cardLookup.get(cardId);
  if (!card) {
    logger.warn(`Card with id ${cardId} not found for update.`, {
      clientId: client.sessionId,
    });
    return;
  }

  // Apply the updates
  for (const key in updates) {
    // ✨ FIX: Spezielle Behandlung für 'counters', da es ein MapSchema ist.
    // Wir iterieren über das Update-Objekt und setzen die Werte einzeln.
    if (key === "counters" && typeof updates[key] === "object") {
      for (const counterKey in updates[key]) {
        card.counters.set(counterKey, updates[key][counterKey]);
      }
    } else if (Object.prototype.hasOwnProperty.call(card, key)) {
      card[key] = updates[key];
    }
  }
  logger.info(`Card ${card.Name} (${cardId}) updated with`, { updates });
}

/**
 * Handles the request to search a pile.
 * @param {GameRoom} room The GameRoom instance.
 * @param {any} client The Colyseus client sending the request.
 * @param {object} message The message from the client.
 */
function handleRequestSearchPile(room, client, message) {
  const requestingPlayer = room.state.players.get(client.sessionId);
  if (!requestingPlayer || requestingPlayer.status !== "playing") {
    logger.warn(
      `Player ${client.sessionId} tried to search pile while not in 'playing' state.`
    );
    return;
  }

  const { zone, targetPlayerId } = message;
  logger.info({
    message: `[handleRequestSearchPile] Received data`,
    requesting_player: client.sessionId,
    requested_zone: zone,
    raw_targetPlayerId_from_message: targetPlayerId,
  });

  const targetPlayer =
    room.state.players.get(targetPlayerId) ||
    room.state.players.get(client.sessionId);

  if (!targetPlayer) {
    logger.warn(`Target player ${targetPlayerId} not found for pile search.`);
    logger.info(
      `[handleRequestSearchPile] Fallback to requesting player: ${client.sessionId}`
    );
    return;
  }

  const pileToSearch = getZoneCollection(targetPlayer, room.state, zone);

  if (pileToSearch.length === 0) {
    logger.info(
      `Player ${client.sessionId} tried to search an empty pile: ${zone} of player ${targetPlayer.sessionId}`
    );
    return;
  }

  const searchableCards = [...pileToSearch];
  requestingPlayer.status = "searching";
  requestingPlayer.searchContext.zone = zone;
  // ✨ KORREKTUR: Speichere explizit, wessen Stapel durchsucht wird.
  requestingPlayer.searchContext.originalOwnerId = targetPlayer.sessionId;
  requestingPlayer.searchContext.isInteractive = true; // ✨ NEU: Dies ist eine interaktive Suche.
  requestingPlayer.searchContext.cards.clear();
  searchableCards.forEach((card) => {
    const cardClone = card.clone();
    cardClone.controllerId = card.controllerId;
    requestingPlayer.searchContext.cards.push(cardClone);
  });

  room.state.actionTakerId = client.sessionId;
  logger.info({
    message: `[handleRequestSearchPile] Final decision: Player is searching pile.`,
    searching_player: client.sessionId,
    searched_pile_owner: targetPlayer.sessionId,
  });

  const defaultTargetZones = [
    { label: "To Hand", toZone: ZONES.HAND },
    { label: "To Deck", toZone: ZONES.DECK },
    { label: "To Reserve", toZone: ZONES.RESERVE },
    { label: "To Discard", toZone: ZONES.DISCARD },
    { label: "To Banish", toZone: ZONES.BANISH },
    { label: "To Territory", toZone: ZONES.TERRITORY },
    { label: "To Opp. Territory", toZone: ZONES.TERRITORY, target: "opponent" },
  ];

  const possibleActions = defaultTargetZones
    .filter((action) => action.toZone !== zone)
    .map((action) => ({
      label: action.label,
      actionId: `MOVE_TO_${action.toZone.toUpperCase()}${
        action.target ? "_OPPONENT" : ""
      }`,
      toZone: action.toZone,
      target: action.target,
    }));

  client.send("presentPileSearchResult", {
    cards: searchableCards.map((c) => c.toJSON()),
    possibleActions: possibleActions,
  });
}

/**
 * Handles the resolution of a pile search.
 * @param {GameRoom} room The GameRoom instance.
 * @param {any} client The Colyseus client sending the request.
 * @param {object} message The message from the client.
 */
function handleResolveSearchPile(room, client, message) {
  const player = room.state.players.get(client.sessionId);
  if (!player || player.status !== "searching") {
    logger.warn(
      `Player ${client.sessionId} tried to resolve search while not in 'searching' state.`
    );
    return;
  }

  logger.info(
    `[DEBUG] Received 'resolveSearchPile' with raw message:`,
    message
  );
  const { selectedCardIds, toZone, coords } = message;
  const originalZone = player.searchContext.zone;
  // ✨ KORREKTUR: Hole den ursprünglichen Besitzer des Stapels aus dem Kontext.
  const originalOwnerId = player.searchContext.originalOwnerId;
  const wasInteractive = player.searchContext.isInteractive; // ✨ NEU: Merke dir, ob es interaktiv war.
  const originalOwner = room.state.players.get(originalOwnerId);

  if (!originalOwner) {
    logger.error(
      `[RESOLVE_SEARCH] Original pile owner with id '${originalOwnerId}' not found! Aborting.`
    );
    return; // Sicherheitsabbruch
  }

  const validSelectedCards = selectedCardIds.filter((id) =>
    player.searchContext.cards.some((c) => c.id === id)
  );

  if (validSelectedCards.length !== selectedCardIds.length) {
    logger.error(
      `Player ${client.sessionId} tried to select invalid cards from search. Aborting.`
    );
    player.status = "playing";
    player.searchContext.cards.clear();
    player.searchContext.zone = "";
    player.searchContext.originalOwnerId = "";
    player.searchContext.isInteractive = false;
    return;
  }

  for (const cardId of validSelectedCards) {
    const cardIndexInContext = player.searchContext.cards.findIndex(
      (c) => c.id === cardId
    );
    if (cardIndexInContext > -1) {
      player.searchContext.cards.splice(cardIndexInContext, 1);
    }
  }

  for (const cardId of validSelectedCards) {
    logger.info(
      `[handleResolveSearchPile] Preparing to call moveCard for card '${cardId}' from ${originalZone} to ${toZone}`
    );
    // ✨ KORREKTUR: Rufe moveCard im Kontext des Stapelbesitzers auf, nicht des suchenden Spielers.
    // Der erste Parameter (actingPlayer) ist der, dessen Stapel modifiziert wird.
    moveCard(
      originalOwner,
      room.state,
      room.cardLookup,
      originalZone,
      toZone,
      cardId,
      1,
      coords
    );
  }
  logger.info(
    `Moved ${validSelectedCards.length} card(s) for player ${player.sessionId} from ${originalZone} to ${toZone}.`
  );

  // ✨ KORREKTUR: Die Logik zum Mischen des Decks nach der Suche muss wiederhergestellt werden.
  // Wenn aus einem Deck gesucht wurde, müssen die verbleibenden Karten im Originaldeck gemischt werden.
  // ✨ NEU: Mische nur, wenn es eine interaktive Suche war.
  if (originalZone === ZONES.DECK && wasInteractive) {
    // Finde den Besitzer des durchsuchten Stapels. Wir können die controllerId der ersten
    // Wir haben ihn ja jetzt direkt.
    if (originalOwner) {
      const deckToShuffle = getZoneCollection(
        originalOwner,
        room.state,
        originalZone
      );
      shuffle(deckToShuffle);
      logger.info(
        `Shuffled the remaining cards in the deck for player ${originalOwner.sessionId}.`
      );
      // ✨ NEU (SOUND): Sende eine Nachricht an alle Clients, dass gemischt wurde.
      room.broadcast("pileShuffled", {
        zone: originalZone,
        playerId: originalOwnerId,
      });
    }
  }

  player.status = "playing";
  player.searchContext.cards.clear();
  player.searchContext.zone = "";
  player.searchContext.originalOwnerId = "";
  player.searchContext.isInteractive = false;
  room.state.actionTakerId = "";

  // ✨ NEU: Wenn die Interaktion beendet ist (z.B. nach Reveal & Take),
  // müssen auch die öffentlich angezeigten Karten abgeräumt werden.
  room.state.revealedCards.clear();

  const finalPlayerState = room.state.players.get(client.sessionId);
  logger.info(
    `[DEBUG] Server's final player deck length after resolveSearchPile: ${finalPlayerState?.deck.length}`
  );
}

/**
 * Handles the request to look at cards from a pile.
 * @param {GameRoom} room The GameRoom instance.
 * @param {any} client The Colyseus client sending the request.
 * @param {object} message The message from the client.
 */
function handleRequestLookAtCards(room, client, message) {
  const requestingPlayer = room.state.players.get(client.sessionId);
  if (!requestingPlayer || requestingPlayer.status !== "playing") {
    logger.warn(
      `Player ${client.sessionId} tried to look at cards while not in 'playing' state.`
    );
    return;
  }

  const { zone, targetPlayerId, count, position = "top" } = message;
  const targetPlayer = room.state.players.get(
    targetPlayerId || client.sessionId
  );

  if (!targetPlayer) {
    logger.warn(`Target player ${targetPlayerId} not found for lookAtCards.`);
    return;
  }

  const pile = getZoneCollection(targetPlayer, room.state, zone);

  if (pile.length === 0) {
    logger.info(
      `Player ${client.sessionId} tried to look at an empty pile: ${zone}`
    );
    return;
  }

  let cardsToLookAt;
  if (position === "bottom") {
    cardsToLookAt = pile.slice(-count);
  } else {
    cardsToLookAt = pile.slice(0, count);
  }

  requestingPlayer.status = "searching";
  requestingPlayer.searchContext.zone = zone;
  // ✨ FIX: Speichere, wessen Stapel durchsucht wird. Ohne diese Information kann der Server den Status nicht zurücksetzen.
  requestingPlayer.searchContext.originalOwnerId = targetPlayer.sessionId;
  requestingPlayer.searchContext.isInteractive = false; // ✨ NEU: Dies ist KEINE interaktive Suche.
  requestingPlayer.searchContext.cards.clear();
  cardsToLookAt.forEach((card) => {
    const cardClone = card.clone();
    cardClone.controllerId = card.controllerId;
    requestingPlayer.searchContext.cards.push(cardClone);
  });

  room.state.actionTakerId = client.sessionId;
  logger.info(
    `Player ${client.sessionId} is now looking at ${count} card(s) from the ${position} of ${zone}.`
  );

  // ✨ FIX: Auch bei "Look" müssen Aktionen möglich sein ("Look and Take"),
  // daher generieren wir hier die möglichen Zielzonen, genau wie bei "Search".
  const defaultTargetZones = [
    { label: "To Hand", toZone: ZONES.HAND },
    { label: "To Deck", toZone: ZONES.DECK },
    { label: "To Reserve", toZone: ZONES.RESERVE },
    { label: "To Discard", toZone: ZONES.DISCARD },
    { label: "To Banish", toZone: ZONES.BANISH },
    { label: "To Territory", toZone: ZONES.TERRITORY },
    { label: "To Opp. Territory", toZone: ZONES.TERRITORY, target: "opponent" },
  ];

  const possibleActions = defaultTargetZones
    .filter((action) => action.toZone !== zone)
    .map((action) => ({
      label: action.label,
      actionId: `MOVE_TO_${action.toZone.toUpperCase()}${
        action.target ? "_OPPONENT" : ""
      }`,
      toZone: action.toZone,
      target: action.target,
    }));

  client.send("presentPileSearchResult", {
    cards: cardsToLookAt.map((c) => c.toJSON()),
    // ✨ FIX: Sende die Aktionen mit. Da 'searchContext.isInteractive' oben auf false gesetzt wurde,
    // wird beim Auflösen (resolve) NICHT gemischt, aber das Nehmen von Karten ist erlaubt.
    possibleActions: possibleActions,
  });
}

/**
 * Handles the request to publicly reveal cards.
 * @param {GameRoom} room The GameRoom instance.
 * @param {any} client The Colyseus client sending the request.
 * @param {object} message The message from the client.
 */
function handleRequestRevealCards(room, client, message) {
  const { zone, targetPlayerId, count, position = "top" } = message;
  const targetPlayer = room.state.players.get(
    targetPlayerId || client.sessionId
  );

  if (!targetPlayer) {
    logger.warn(`Target player ${targetPlayerId} not found for reveal.`);
    return;
  }

  const pile = getZoneCollection(targetPlayer, room.state, zone);
  let cardsToReveal =
    position === "bottom" ? pile.slice(-count) : pile.slice(0, count);

  // 1. Öffentliches Reveal (für alle sichtbar)
  room.state.actionTakerId = client.sessionId;
  room.state.revealedCards.clear();
  cardsToReveal.forEach((card) => room.state.revealedCards.push(card.clone()));
  logger.info(
    `[REVEAL] Added ${cardsToReveal.length} card(s) to revealedCards state for actionTaker ${client.sessionId}.`
  );

  // 2. Interaktiver Modus für den Auslöser (Karten nehmen erlauben)
  // Wir nutzen die gleiche Logik wie bei "Look", damit NICHT gemischt wird.
  const requestingPlayer = room.state.players.get(client.sessionId);
  requestingPlayer.status = "searching";
  requestingPlayer.searchContext.zone = zone;
  requestingPlayer.searchContext.originalOwnerId = targetPlayer.sessionId;
  requestingPlayer.searchContext.isInteractive = false; // ✨ WICHTIG: false bedeutet "Kein Mischen nach Aktion"
  requestingPlayer.searchContext.cards.clear();

  cardsToReveal.forEach((card) => {
    const cardClone = card.clone();
    cardClone.controllerId = card.controllerId;
    requestingPlayer.searchContext.cards.push(cardClone);
  });

  const defaultTargetZones = [
    { label: "To Hand", toZone: ZONES.HAND },
    { label: "To Deck", toZone: ZONES.DECK },
    { label: "To Reserve", toZone: ZONES.RESERVE },
    { label: "To Discard", toZone: ZONES.DISCARD },
    { label: "To Banish", toZone: ZONES.BANISH },
    { label: "To Territory", toZone: ZONES.TERRITORY },
    { label: "To Opp. Territory", toZone: ZONES.TERRITORY, target: "opponent" },
  ];

  // Sende den interaktiven Dialog an den Spieler
  client.send("presentPileSearchResult", {
    cards: cardsToReveal.map((c) => c.toJSON()),
    possibleActions: defaultTargetZones.map((action) => ({
      label: action.label,
      actionId: `MOVE_TO_${action.toZone.toUpperCase()}${
        action.target ? "_OPPONENT" : ""
      }`,
      toZone: action.toZone,
      target: action.target,
    })),
  });
}

/**
 * Handles automatic counter reduction during Upkeep phase.
 * @param {GameRoom} room The GameRoom instance.
 */
function handleUpkeepPhase(room) {
  const activePlayerId = room.state.activePlayer;
  logger.info(`Processing Upkeep Phase for player ${activePlayerId}: Updating counters...`);

  for (const card of room.cardLookup.values()) {
    // ✨ FIX: Nur Counter von Karten des aktiven Spielers reduzieren.
    if (card.controllerId !== activePlayerId) continue;

    if (card.counters && card.counters.size > 0) {
      const keys = Array.from(card.counters.keys());
      for (const key of keys) {
        const val = card.counters.get(key);
        const newVal = val - 1;
        if (newVal <= 0) {
          card.counters.delete(key);
        } else {
          card.counters.set(key, newVal);
        }
      }
    }
  }
}

module.exports = {
  handleChangeRedeemedSouls,
  handleUpdateCardState,
  handleRequestSearchPile,
  handleResolveSearchPile,
  handleRequestLookAtCards,
  handleRequestRevealCards,
  handleUpkeepPhase,
};
