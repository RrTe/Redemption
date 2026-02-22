// server/services/phaseService.js
const logger = require("../utils/logger");
const { moveCard } = require("./cardService");
const { ZONES } = require("../../../shared/zones");
const { PHASES } = require("../../../shared/phases");

/**
 * ✨ NEU: Interne Hilfsfunktion, um den Gegner zu finden.
 * @param {RoomState} state - Der globale Spielzustand.
 * @param {PlayerState} player - Der Spieler, dessen Gegner gesucht wird.
 * @returns {PlayerState | undefined} Der Gegner oder undefined.
 */
function _getOpponentFromState(state, player) {
  for (const p of state.players.values()) {
    if (p.sessionId !== player.sessionId) {
      return p;
    }
  }
  return undefined;
}

/**
 * Kümmert sich um den Wechsel zur nächsten Phase oder zum nächsten Zug.
 * (Diese Funktion wird in späteren Schritten befüllt)
 */
function advancePhase(state, player, clients, cardLookup) {
  // ✨ FIX: Die Phasenreihenfolge wird jetzt dynamisch aus den Konstanten erstellt.
  const phaseOrder = Object.values(PHASES);
  const currentPhaseIndex = phaseOrder.indexOf(state.currentPhase);

  if (currentPhaseIndex === -1) {
    logger.warn(`Unbekannte Phase ${state.currentPhase} im Phasenwechsel.`);
    return;
  }

  // Wenn wir in der letzten Phase sind, beende den Zug
  if (currentPhaseIndex === phaseOrder.length - 1) {
    // ✨ FINALE KORREKTUR: Fange die gezogenen Karten vom Zugende ab und gib sie zurück.
    return handleEndTurn(state, clients, cardLookup);
  } else {
    // Ansonsten, gehe zur nächsten Phase
    const nextPhase = phaseOrder[currentPhaseIndex + 1];
    state.currentPhase = nextPhase;

    // Wenn die neue Phase die DRAW-Phase ist, führe die entsprechende Logik aus
    // (Dies ist für den Fall, dass man manuell in die Draw-Phase wechselt, ohne den Zug zu beenden)
    if (nextPhase === PHASES.DRAW) {
      // ✨ FINALE KORREKTUR: Gib auch hier die gezogenen Karten zurück.
      return handleDrawPhaseStart(state, cardLookup);
    }

    logger.info(`Player ${player.sessionId} advanced to ${nextPhase} phase.`);
  }
}

/**
 * ✨ SCHRITT 2: Führt die Aktionen zu Beginn der Draw-Phase aus (Karten ziehen).
 * @param {RoomState} state
 * @param {Map<string, Card>} cardLookup
 */
function handleDrawPhaseStart(state, cardLookup) {
  const player = state.players.get(state.activePlayer);
  if (!player) return;

  const isFirstTurnOfGame =
    player.turn === 1 && _getOpponentFromState(state, player)?.turn === 0;

  if (!isFirstTurnOfGame) {
    // ✨ FINALE KORREKTUR: Gib die gezogenen Karten zurück, damit der GameRoom eine Nachricht senden kann.
    return moveCard(
      player,
      state,
      cardLookup,
      ZONES.DECK,
      ZONES.HAND,
      0,
      3,
      null
    );
  }
  // Wenn keine Karten gezogen wurden, gib ein leeres Array zurück.
  return [];
}

/**
 * ✨ SCHRITT 3: Beendet den aktuellen Zug und startet den Zug des nächsten Spielers.
 * @param {RoomState} state
 * @param {any[]} clients - Die Liste der Colyseus-Clients.
 * @param {Map<string, Card>} cardLookup
 */
function handleEndTurn(state, clients, cardLookup) {
  const currentPlayerIndex = clients.findIndex(
    (c) => c.sessionId === state.activePlayer
  );
  const nextPlayerIndex = (currentPlayerIndex + 1) % clients.length;
  const nextPlayerClient = clients[nextPlayerIndex];
  const nextPlayerState = state.players.get(nextPlayerClient.sessionId);

  state.activePlayer = nextPlayerClient.sessionId;
  nextPlayerState.turn++;
  state.currentPhase = PHASES.DRAW;
  logger.info(
    `Turn ended. New active player is ${state.activePlayer}. Turn: ${nextPlayerState.turn}`
  );

  // ✨ FINALE KORREKTUR: Gib die gezogenen Karten zurück, damit der GameRoom eine Nachricht senden kann.
  return handleDrawPhaseStart(state, cardLookup);
}

module.exports = { advancePhase, handleDrawPhaseStart, handleEndTurn };
