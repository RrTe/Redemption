const colyseus = require("colyseus");
// ✨ Erhöhe die Puffergröße für den Schema-Encoder, um den "buffer overflow"-Fehler zu beheben.
const { Encoder } = require("@colyseus/schema");
Encoder.BUFFER_SIZE = 512 * 1024; // 512 KB
const fs = require("fs"); // ✨ NEU: Dateisystem-Zugriff
const path = require("path"); // ✨ NEU: Pfad-Operationen
const crypto = require("crypto"); // ✨ NEU: Für HMAC Signatur

// ✨ FIX: Secret Key aus Umgebungsvariablen laden (Sicherheit!)
const SECRET_KEY =
  process.env.SAVE_GAME_SECRET || "RedemptionColiseum_SuperSecretKey_2026";

const logger = require("../utils/logger");
const { RoomState } = require("../state/RoomState");
const { Card } = require("../state/Card");
const { PlayerState } = require("../state/PlayerState");
const {
  moveCard,
  shuffle,
  findCardById,
  getZoneCollection,
} = require("../services/cardService");
const { ZONES } = require("../../../shared/zones");
const actionService = require("../services/actionService");
const { PHASES } = require("../../../shared/phases");
const { cardDatabase } = require("../data/cardDatabase");
const { hash } = require("../../../shared/utils"); // ✨ NEU: Hash-Funktion importieren

const STARTING_HAND_SIZE = 8;

// ✨ NEU: Hilfsfunktion zur Bestimmung öffentlicher Zonen
const isZonePublic = (zone) =>
  [
    ZONES.TERRITORY,
    ZONES.LAND_OF_BONDAGE,
    ZONES.BATTLEFIELD,
    ZONES.DISCARD,
    ZONES.BANISH,
    ZONES.LAND_OF_REDEMPTION,
  ].includes(zone);

class GameRoom extends colyseus.Room {
  // ✨ SCHRITT 1.3: Importiere den neuen Service für die zukünftige Verwendung.
  phaseService = require("../services/phaseService");

  maxClients = 2;

  constructor() {
    super();
    // ✨ NEU: Initialisiere die Kartendatenbank mit Hash-IDs.
    // Das stellt sicher, dass wir Karten anhand der IDs finden, die der DeckEditor generiert.
    cardDatabase.forEach((c) => {
      if (!c.id) {
        // ✨ FIX: Robuster Fallback, falls hash fehlschlägt oder nicht importiert wurde.
        if (typeof hash === 'function') {
            c.id = hash(c.Name);
        } else {
            c.id = Buffer.from(c.Name).toString('base64');
        }
      }
    });

    // ✨ NEU: Chat-Historie speichern
    this.chatHistory = [];
  }

  // ✨ NEU: Zentrale Methode für Game-Logs (senden + speichern)
  broadcastGameLog(text) {
    const msg = { type: "gameLog", text: text };
    this.chatHistory.push(msg);
    this.broadcast("gameLog", msg);
  }

  onCreate(options) {
    this.state = new RoomState();
    // ✨ DEINE IDEE: Eine zentrale, nicht-synchronisierte Map für schnellen Kartenzugriff.
    this.cardLookup = new Map();

    // ✨ NEU: Map zum Zuordnen alter zu neuen Session-IDs beim Laden eines Spiels
    this.oldToNewSessionIdMap = new Map();

    // ✨ NEU: Temporärer Speicher für geladene Spieler-Daten (für Save/Load)
    this.savedPlayers = [];
    if (options.savedState) {
      this.restoreState(options.savedState);
    }

    // ✨ NEU: Set, um zu speichern, welche Clients fertig geladen haben.
    this.readyClients = new Set();

    // ✨ NEU: Metadaten für die Lobby setzen (Name des Raums)
    // Diese werden automatisch an den LobbyRoom übertragen.
    const roomName = options.roomName || `Game ${this.roomId}`;
    this.setMetadata({
      name: roomName,
    });

    logger.info(`[GameRoom] Room created! roomId: ${this.roomId}`);

    // ✨ NEU: Chat-Handler
    this.onMessage("chat", (client, message) => {
      const msg = {
        type: "chat", // ✨ NEU: Typ explizit setzen
        sender: client.userData.playerName,
        text: message.text,
        sessionId: client.sessionId,
      };
      this.chatHistory.push(msg); // ✨ NEU: Speichern
      this.broadcast("chat", msg);
    });

    // ✨ NEU: Heartbeat-Handler gegen Timeouts (Render/Heroku)
    this.onMessage("ping", (client) => {
      // ✨ FIX: Logge den Empfang auf dem Server (wieder einkommentiert für Test)
      // console.log(`[Heartbeat] Ping received from ${client.sessionId}`); 
    });

    // ✨ NEU: Handler für Save-Game Anfrage
    this.onMessage("requestSaveGame", (client) => {
      // Sende den aktuellen State als JSON zurück an den Client
      // ✨ FIX: Wir verpacken den State und die ID des Speichernden, um die Zuordnung beim Laden zu sichern.
      const payload = {
        state: this.state.toJSON(),
        savedBySessionId: client.sessionId,
        chatHistory: this.chatHistory, // ✨ NEU: Chat mit speichern
      };

      // ✨ NEU: Signiere die Daten, um Manipulation zu verhindern.
      const payloadString = JSON.stringify(payload);
      const signature = crypto
        .createHmac("sha256", SECRET_KEY)
        .update(payloadString)
        .digest("hex");

      const saveData = { data: payload, signature: signature };
      client.send("saveGameData", saveData);
    });

    this.onMessage("moveCard", (client, message) => {
      logger.info(
        `[2/4] Received moveCard message from ${client.sessionId}:`,
        message,
      );
      // ✨ LOGGING: Überprüfen, ob der Spieler im State gefunden wird.
      const player = this.state.players.get(client.sessionId);
      if (!player) {
        // ✨ LOGGING: Kritischer Fehler, wenn der Spieler nicht im State gefunden wird.
        logger.error(
          `[FATAL] Player object not found in state for client.sessionId: ${client.sessionId}. Aborting moveCard.`,
        );
        return;
      }

      try {
        // ✨ Wir übergeben den aktiven Spieler. Die `moveCard`-Funktion ermittelt den Zielspieler selbst.
        const coordsWithTarget = message.coords; // Die targetPlayerId ist bereits in message.coords

        logger.info(
          `[3/4] Calling cardService.moveCard for player=${player} with player.sessionId=${player?.sessionId} and coords=`,
          coordsWithTarget,
        );
        // ✨ KORREKTUR: Verwende entweder cardId (wenn vorhanden) oder index.
        // Der `?? 0` Fallback stellt sicher, dass, wenn `index` `undefined` ist, der Index 0 verwendet wird,
        // was für das Ziehen vom Deck korrekt ist, wenn nur `from` und `to` gesendet werden.
        const drawnCards = moveCard(
          player,
          this.state,
          this.cardLookup,
          message.from,
          message.to,
          message.cardId ?? message.index ?? 0,
          message.count ?? 1,
          coordsWithTarget,
        );

        // ✨ NEU: Logik für Attached Cards (Schritt 1)
        // Wir müssen dies VOR dem eigentlichen moveCard-Aufruf tun, aber da moveCard hier synchron ist
        // und wir Zugriff auf die Lookup-Map haben, können wir es auch hier integrieren.
        // Besser: Wir prüfen VORHER, ob wir Anhängsel mitnehmen müssen.
        // Da moveCard oben bereits aufgerufen wurde, ist es für "Vorher"-Logik zu spät.
        // ABER: moveCard bewegt nur die EINE Karte. Wir können die Anhängsel danach bewegen.

        // 1. Prüfen, ob die bewegte Karte Anhängsel hatte.
        // Da die Karte jetzt schon bewegt ist, prüfen wir ihren Zustand oder suchen in der Lookup-Map.
        // Wir nutzen die ID aus der Message.
        const movedCardId =
          message.cardId ??
          (drawnCards && drawnCards[0] ? drawnCards[0].id : null);

        if (movedCardId) {
          const movedCard = this.cardLookup.get(movedCardId);

          // A. ABLÖSEN: Wenn die bewegte Karte selbst irgendwo angehängt war, Verbindung lösen.
          if (movedCard && movedCard.attachedTo) {
            logger.info(
              `[DETACH] Detaching card ${movedCard.id} from ${movedCard.attachedTo} because it moved.`,
            );
            movedCard.attachedTo = null;
          }

          // B. MITNEHMEN: Prüfen, ob andere Karten an dieser Karte hängen.
          // Wir iterieren über alle Karten (via Lookup), um Kinder zu finden.
          const isLeavingField = [
            "deck",
            "discard",
            "hand",
            "banish",
            "reserve",
          ].includes(message.to);

          if (isLeavingField) {
            for (const otherCard of this.cardLookup.values()) {
              if (otherCard.attachedTo === movedCardId) {
                // Verbindung lösen
                otherCard.attachedTo = null;
                // Mitbewegen in den Stapel des EIGENTÜMERS
                const owner = this.state.players.get(otherCard.originalOwnerId);
                if (owner) {
                  moveCard(
                    owner,
                    this.state,
                    this.cardLookup,
                    otherCard.zone,
                    message.to,
                    otherCard.id,
                    1,
                    null,
                  );
                }
              }
            }
          }
        }

        // ✨ FIX: Attach-Logik MUSS NACH der Detach-Logik kommen!
        // Sonst wird die gerade gesetzte Verbindung im Block oben (A. ABLÖSEN) sofort wieder gelöscht.
        if (message.coords && message.coords.attachTo) {
          const movedCardId =
            message.cardId ??
            (drawnCards && drawnCards[0] ? drawnCards[0].id : null);
          if (movedCardId) {
            const movedCard = this.cardLookup.get(movedCardId);
            const targetCard = this.cardLookup.get(message.coords.attachTo);

            if (movedCard && targetCard) {
              movedCard.attachedTo = targetCard.id;
              // ✨ LOGGING: Bestätigung, dass die Verbindung gesetzt wurde.
              logger.info(
                `[ATTACH] SUCCESS: Attached card ${movedCard.id} to ${targetCard.id}`,
              );
            }
          }
        }

        // ✨ NEU: Wenn Karten vom Deck gezogen wurden, sende eine Bestätigung an den Client.
        if (drawnCards && drawnCards.length > 0) {
          const cardIds = drawnCards.map((c) => c.id);
          logger.info(
            `[CARDS_DRAWN] Sending 'cardsDrawn' event to client ${
              client.sessionId
            } for cards: [${cardIds.join(", ")}]`,
          );
          client.send("cardsDrawn", { cardIds });
        }
        // DEBUG-LOG: Fügen wir einen Log hinzu, falls keine Karten zurückgegeben wurden.
        else {
          logger.info(
            `[CARDS_DRAWN] 'moveCard' completed, but no cards were reported as drawn. No 'cardsDrawn' event sent.`,
          );
        }

        // ✨ FIX: Verbessertes Logging mit Kontext (Source, Action, Visibility)
        const actualCard =
          this.cardLookup.get(message.cardId) || (drawnCards && drawnCards[0]);
        const realCardName = actualCard ? actualCard.Name : "Card";
        const fromZone = message.from;
        const toZone = message.to;
        const playerName = client.userData.playerName;

        // Sichtbarkeit bestimmen: Name zeigen, wenn Quelle ODER Ziel öffentlich sind.
        // Ausnahme: Deck -> Hand (Draw) ist privat.
        const isSourcePublic = isZonePublic(fromZone);
        const isDestPublic = isZonePublic(toZone);
        const showName = isSourcePublic || isDestPublic;
        const displayName = showName ? realCardName : "a card";

        let logText = "";
        if (fromZone === ZONES.DECK && toZone === ZONES.HAND) {
          logText = `${playerName} draws ${displayName}.`;
        } else if (
          fromZone === ZONES.HAND &&
          (toZone === ZONES.TERRITORY ||
            toZone === ZONES.LAND_OF_BONDAGE ||
            toZone === ZONES.BATTLEFIELD)
        ) {
          logText = `${playerName} plays ${displayName}.`;
        } else if (toZone === ZONES.DISCARD) {
          logText = `${playerName} discards ${displayName} from ${fromZone}.`;
        } else {
          logText = `${playerName} moves ${displayName} from ${fromZone} to ${toZone}.`;
        }
        this.broadcastGameLog(logText); // ✨ FIX: Nutzen der zentralen Methode
      } catch (err) {
        logger.error(
          `Fehler beim Verschieben der Karte(n) für Client ${client.sessionId}:`,
          {
            message,
            activePlayer: player.sessionId,
            error: err.message,
          },
        );
        // Optional: Fehler an den Client senden
      }
    });

    this.onMessage("changeRedeemedSouls", (client, message) => {
      actionService.handleChangeRedeemedSouls(this, client, message);

      // Nach der Änderung prüfen, ob jemand gewonnen hat (5 Seelen).
      const player = this.state.players.get(client.sessionId);
      if (player && player.redeemedSouls >= 5) {
        const opponentId = Array.from(this.state.players.keys()).find(
          (id) => id !== client.sessionId,
        );
        if (opponentId) {
          // Sicherstellen, dass ein Gegner da ist
          this._endGame(client.sessionId, opponentId, "souls");
        }
      }
    });

    this.onMessage("updateCardState", (client, message) => {
      actionService.handleUpdateCardState(this, client, message);
    });

    this.onMessage("nextPhase", (client) => {
      // Nur der aktive Spieler kann die Phase wechseln
      if (client.sessionId !== this.state.activePlayer) return;
      logger.info(
        `[NEXT_PHASE] Received 'nextPhase' message from active player ${client.sessionId}.`,
      );

      // ✨ SCHRITT 4: Delegiere die gesamte Logik an den Service.
      const player = this.state.players.get(client.sessionId);
      if (!player) return;

      // ✨ FINALE KORREKTUR: Merke dir den Spieler, der die Phase wechselt.
      const advancingPlayerClient = client;

      // ✨ FINALE KORREKTUR: Fange die gezogenen Karten vom Phasenwechsel ab.
      const drawnCards = this.phaseService.advancePhase(
        this.state,
        player,
        this.clients,
        this.cardLookup,
      );

      // ✨ NEU: Upkeep-Phase Logik: Counter automatisch reduzieren
      if (this.state.currentPhase === PHASES.UPKEEP) {
        actionService.handleUpkeepPhase(this);
      }

      // Wenn beim Phasenwechsel Karten gezogen wurden (z.B. in der DRAW-Phase),
      // sende die `cardsDrawn`-Nachricht an den Client.
      if (drawnCards && drawnCards.length > 0) {
        // ✨ FINALE KORREKTUR: Finde den Client, der die Karten tatsächlich erhält.
        // Das ist der `activePlayer` NACH dem Phasenwechsel.
        const receivingPlayerClient = this.clients.find(
          (c) => c.sessionId === this.state.activePlayer,
        );

        const cardIds = drawnCards.map((c) => c.id);
        if (receivingPlayerClient) {
          logger.info(
            `[PHASE_DRAW] Sending 'cardsDrawn' event to client ${
              receivingPlayerClient.sessionId
            } for cards: [${cardIds.join(", ")}]`,
          );
          receivingPlayerClient.send("cardsDrawn", { cardIds });
        } else {
          logger.warn(
            `[PHASE_DRAW] Could not find client for new active player ${this.state.activePlayer} to send 'cardsDrawn' message.`,
          );
        }

        // ✨ NEU: Log für automatisches Ziehen
        const pName = player.name || "Player";
        this.broadcastGameLog(
          `${pName} draws ${drawnCards.length} card(s) for turn.`,
        ); // ✨ FIX
      }

      // ✨ NEU: Log
      this.broadcastGameLog(`Phase changed to ${this.state.currentPhase}.`); // ✨ FIX
    });

    // ✨ NEU: Handler für das Starten einer Kartensuche in einem Stapel.
    this.onMessage("requestSearchPile", (client, message) =>
      actionService.handleRequestSearchPile(this, client, message),
    );

    // ✨ NEU: Handler für das Abschließen einer Kartensuche.
    this.onMessage("resolveSearchPile", (client, message) => {
      // Kontext holen, bevor der Service ihn löscht
      const player = this.state.players.get(client.sessionId);
      const fromZone = player.searchContext
        ? player.searchContext.zone
        : "Unknown Pile";

      actionService.handleResolveSearchPile(this, client, message);

      // ✨ NEU: Log für Auswahl aus Dialog
      const { selectedCardIds, toZone } = message;
      if (selectedCardIds && selectedCardIds.length > 0) {
        const cardNames = selectedCardIds.map((id) => {
          const c = this.cardLookup.get(id);
          return c ? c.Name : "Unknown";
        });
        // Bei expliziter Auswahl (Look/Search) zeigen wir die Namen an, wie gewünscht.
        this.broadcastGameLog(
          `${client.userData.playerName} selected ${cardNames.join(", ")} from ${fromZone} and moved to ${toZone}.`,
        ); // ✨ FIX
      }
    });

    // ✨ NEU: Handler für das Anschauen der obersten/untersten Karten eines Stapels.
    this.onMessage("requestLookAtCards", (client, message) =>
      actionService.handleRequestLookAtCards(this, client, message),
    );

    // ✨ NEU: Handler für das öffentliche Aufdecken von Karten.
    this.onMessage("requestRevealCards", (client, message) =>
      actionService.handleRequestRevealCards(this, client, message),
    );

    // ✨ NEU: Handler für das Schließen des "Reveal"-Dialogs.
    this.onMessage("resolveReveal", (client, message) => {
      // Leert das Array. Diese Änderung wird an alle Clients synchronisiert.
      this.state.revealedCards.clear();
      logger.info(
        `[RESOLVE REVEAL] Player ${client.sessionId} closed the reveal dialog. Clearing revealedCards and actionTakerId.`,
      );
      // ✨ NEU: Setze auch den auslösenden Spieler zurück.
      this.state.actionTakerId = "";
    });

    // ✨ NEU: Handler für das Mischen eines Stapels.
    this.onMessage("shufflePile", (client, message) => {
      const player = this.state.players.get(client.sessionId);
      const zone = message.zone; // "deck" oder "reserve"

      if (player && (zone === "deck" || zone === "reserve")) {
        const pile = player[zone];

        if (pile && pile.length > 1) {
          // ✨ FIX: Nutze die existierende shuffle-Funktion aus dem cardService
          shuffle(pile);

          // Bestätigung an alle senden (löst Sound/Animation im Client aus)
          this.broadcast("pileShuffled", {
            zone: zone,
            playerId: client.sessionId,
          });

          logger.info(`Player ${client.sessionId} shuffled ${zone}.`);
        }
      }

      // ✨ NEU: Log
      this.broadcastGameLog(`${client.userData.playerName} shuffled ${zone}.`); // ✨ FIX
    });

    // ✨ NEU: Handler für das Erstellen von Tokens
    this.onMessage("createToken", (client, message) => {
      // ✨ FIX: Syntaxfehler behoben (doppelte Deklaration) und Parameter ausgelesen
      const { cardId, zone, ownerId } = message;
      const targetPlayerId = ownerId || client.sessionId;
      const player = this.state.players.get(targetPlayerId);

      if (!player) return;

      // Definition in der Datenbank suchen
      const cardDef = cardDatabase.find((c) => c.Name === cardId);
      if (!cardDef) {
        logger.warn(`[CREATE_TOKEN] Token definition not found for: ${cardId}`);
        return;
      }

      // Neue Karte erstellen
      const card = new Card();
      // Eindeutige ID generieren
      card.id = `${client.sessionId}-token-${Date.now()}-${Math.floor(Math.random() * 1000)}`;
      card.controllerId = client.sessionId;
      card.originalOwnerId = targetPlayerId; // ✨ FIX: Es gehört in dessen Deck/Zone

      // Eigenschaften kopieren
      Object.entries(cardDef).forEach(([key, value]) => {
        // ✨ FIX: Überschreibe nicht die eindeutige Instanz-ID (String) mit der Datenbank-ID (Number).
        if (key !== "id") {
          card[key] = value;
        }
      });

      card.zone = zone || ZONES.TERRITORY; // ✨ FIX: Nutze die angegebene Zone (Standard: Territory)

      // Zur korrekten Liste hinzufügen (Territory oder LoB)
      if (player[card.zone]) {
        player[card.zone].push(card);
      } else {
        logger.warn(
          `[CREATE_TOKEN] Invalid zone '${card.zone}' for player ${targetPlayerId}`,
        );
        return;
      }

      this.cardLookup.set(card.id, card);

      logger.info(
        `[CREATE_TOKEN] Created token '${card.Name}' (${card.id}) in ${card.zone} of ${targetPlayerId} (Controller: ${client.sessionId})`,
      );

      // ✨ NEU: Log
      this.broadcastGameLog(
        `${client.userData.playerName} created token ${card.Name}.`,
      ); // ✨ FIX
    });

    // ✨ NEU: Handler für das "Ready"-Signal vom Client (nach dem Laden der Assets)
    this.onMessage("playerReady", (client) => {
      logger.info(`[DIAGNOSTIC_STEP_1] 'playerReady' received from ${client.sessionId}`);
      this.readyClients.add(client.sessionId);

      // ✨ FIX: Markiere den Spieler im State als bereit (für das UI-Overlay)
      const player = this.state.players.get(client.sessionId);
      if (player) player.ready = true;

      // ✨ FIX: Sende Chat-Historie erst hier, wenn der Client bereit ist.
      // Das verhindert, dass die Nachricht verloren geht, bevor der Client den Handler registriert hat.
      if (this.chatHistory.length > 0) {
        client.send("chatHistory", this.chatHistory);
      }

      logger.info(
        `[GameRoom] Client ${client.sessionId} is ready. (${this.readyClients.size}/${this.maxClients})`,
      );

      // Wenn alle Spieler da sind UND bereit sind:
      if (
        this.clients.length === this.maxClients &&
        this.readyClients.size === this.maxClients
      ) {
        // ✨ FIX: Prüfe, ob das Spiel bereits läuft (Phase gesetzt?), um doppelten Start/Draw zu verhindern.
        if (!this.state.currentPhase) {
          logger.info(`[DIAGNOSTIC_STEP_2] All players ready. Calling _initializeGame.`);
          // Kurze Verzögerung, um sicherzustellen, dass der Client bereit für Nachrichten ist
          this.clock.setTimeout(() => {
            this._initializeGame();
          }, 500);
        } else {
          logger.info(
            `[GameRoom] All players ready (reconnect). Game already running in phase '${this.state.currentPhase}'. Skipping init.`,
          );
        }
      }
      logger.info(
        `[DIAGNOSTIC_STEP_7] 'playerReady' handler finished for ${client.sessionId}`,
      );
    });

    // ✨ NEU: Handler für Aufgabe (Concede)
    this.onMessage("concede", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player && !this.state.winnerId) {
        // Nur wenn Spiel noch läuft
        const pName = player.name || "Player";
        this.broadcastGameLog(`${pName} has conceded the game.`);

        const winnerId = Array.from(this.state.players.keys()).find(
          (id) => id !== client.sessionId,
        );
        if (winnerId) {
          this._endGame(winnerId, client.sessionId, "concede");
        }
      }
    });
  }

  onJoin(client, options) {
    logger.info(`[DIAGNOSTIC_JOIN_1] onJoin started for ${client.sessionId}`);
    // ✨ FIX: Verhindere Beitritt zu "Zombie-Räumen" (Spiele, die bereits vorbei sind).
    // Wenn ein Raum gerade herunterfährt, aber noch im MatchMaker gelistet ist,
    // verhindern wir hier, dass Spieler in diesen instabilen Zustand geraten.
    if (this.state.winnerId) {
        logger.warn(`[GameRoom] Client ${client.sessionId} tried to join ended game ${this.roomId}. Rejecting.`);
        client.leave(4000, "Game is already over");
        return;
    }

    if (this.clients.length > this.maxClients) {
      logger.warn(`[GameRoom] Room ${this.roomId} full, kicking extra client`, {
        clientId: client.sessionId,
      });
      client.leave(1000, "Room is full");
      return;
    }

    try {
    // ✨ NEU: Save/Load Logik - Wenn wir geladene Spieler haben, weisen wir diesen Slot zu.
    if (this.savedPlayers.length > 0) {
      this._reclaimSavedPlayer(client, options);
      return;
    }

    // ✨ NEU: Speichere das übergebene Deck in den User-Daten des Clients
    client.userData = {
      deck: options.deck || [], // Erwartet ein Array von Kartennamen (Strings)
      playerName:
        options.playerName || `Player ${client.sessionId.substr(0, 4)}`, // ✨ NEU
      deckName: options.deckName || "Random Deck", // ✨ NEU
    };

    const p = new PlayerState();

    this._createPlayer(client);
    // ✨ NEU: Verbessertes Logging, das alle Spieler-IDs im Raum anzeigt
    const playerIds = Array.from(this.state.players.keys());
    logger.info(
      `[GameRoom] Player joined: ${client.sessionId}. RoomId: ${this.roomId}. Players in room (${
        this.clients.length
      }): [${playerIds.join(", ")}]. Locked: ${this.locked}`,
    );

    // ✨ ÄNDERUNG: Wir starten das Spiel NICHT mehr hier.
    // Wir warten auf das "playerReady"-Signal von allen Clients.
    } catch (err) {
        logger.error(`[GameRoom] Error in onJoin for ${client.sessionId}:`, err);
    }
    logger.info(`[DIAGNOSTIC_JOIN_2] onJoin finished for ${client.sessionId}`);
  }

  async onLeave(client, consented) {
    const player = this.state.players.get(client.sessionId);
    if (player) {
      player.connected = false; // ✨ NEU: Als getrennt markieren
      player.ready = false; // ✨ FIX: Spieler ist nicht mehr bereit (muss neu laden)
    }

    // ✨ FIX: Auch aus dem internen Set entfernen, damit das Ready-Event beim Reconnect feuert
    this.readyClients.delete(client.sessionId);

    logger.info(
      `[GameRoom] Player left: ${client.sessionId}. Consented: ${consented}`,
    );

    // ✨ FIX: Wenn das Spiel bereits vorbei ist (Winner steht fest), erlauben wir keine Reconnection mehr.
    // Das stellt sicher, dass der Spieler sauber entfernt wird und beim nächsten Spielstart (auch im selben Raum) als "neu" gilt.
    if (this.state.winnerId) {
      this.state.players.delete(client.sessionId);
      logger.info(`[GameRoom] Game Over. Removing player ${client.sessionId} immediately (no reconnect).`);

      // ✨ FIX: If the last player leaves an ended game, destroy the room immediately.
      // This prevents the room from being reused in a "zombie" state for the next game.
      if (this.state.players.size === 0) {
        logger.info(`[GameRoom] Last player left an ended game. Disposing room ${this.roomId}.`);
        this.disconnect();
      }

      return;
    }

    try {
      // Wenn der Spieler absichtlich geht (z.B. Fenster schließen, wenn das vom Client so gesendet wird),
      // oder wir keine Wiederverbindung wollen (consented), werfen wir einen Fehler.
      // ✨ FIX: Wir ignorieren 'consented' hier, damit ein Tab-Close (was oft als consented gilt)
      // trotzdem einen Reconnect erlaubt. Wir verlassen uns voll auf den Timeout.
      // if (consented) {
      //    throw new Error("consented leave");
      // }

      // ✨ NEU: Erlaube Wiederverbindung für 60 Sekunden
      logger.info(
        `[GameRoom] Starting allowReconnection for ${client.sessionId} (60s)`,
      ); // ✨ DEBUG
      await this.allowReconnection(client, 60);
      logger.info(`[GameRoom] Reconnected successfully: ${client.sessionId}`); // ✨ DEBUG

      // Wenn wir hier ankommen, war die Wiederverbindung erfolgreich!
      if (player) {
        player.connected = true;
        logger.info(`[GameRoom] Player reconnected: ${client.sessionId}`);
      }
    } catch (e) {
      // Timeout abgelaufen oder absichtliches Verlassen -> Spieler endgültig entfernen
      this.state.players.delete(client.sessionId);

      logger.info(
        `[GameRoom] Player removed after timeout/consent: ${client.sessionId}. Error: ${e.message}`,
      ); // ✨ DEBUG
      // Hier könnte man das Spiel beenden und den verbleibenden Spieler zum Sieger erklären.
    }
  }

  // ✨ NEU: Stellt den Spielzustand aus einem JSON-Objekt wieder her
  restoreState(incomingData) {
    logger.info("[GameRoom] Restoring saved game state...");

    let savedDataWrapper = incomingData;

    // ✨ NEU: Sicherheitsprüfung (HMAC)
    // Prüfen, ob das Format { data, signature } ist
    if (incomingData.signature && incomingData.data) {
      const payloadString = JSON.stringify(incomingData.data);
      const expectedSignature = crypto
        .createHmac("sha256", SECRET_KEY)
        .update(payloadString)
        .digest("hex");

      if (expectedSignature !== incomingData.signature) {
        logger.error(
          "[SECURITY] Save file manipulation detected! Signature mismatch.",
        );
        throw new Error(
          "Invalid save file signature. The file may have been tampered with.",
        );
      }
      logger.info("[SECURITY] Save file signature verified.");
      savedDataWrapper = incomingData.data;
    } else {
      // Fallback für alte Spielstände (ohne Signatur) - Optional: Warnung loggen
      logger.warn("[SECURITY] Loading legacy save file without signature.");
    }

    // ✨ FIX: Support für neues Wrapper-Format (mit savedBySessionId) und altes Format
    const savedData = savedDataWrapper.state || savedDataWrapper;
    const savedBy = savedDataWrapper.savedBySessionId;

    // ✨ NEU: Chat wiederherstellen
    if (savedDataWrapper.chatHistory) {
      this.chatHistory = savedDataWrapper.chatHistory;
    }

    // 1. Globale Werte
    this.state.currentPhase = savedData.currentPhase;
    // activePlayer und actionTakerId müssen später auf die neuen SessionIDs gemappt werden,
    // das machen wir, wenn die Spieler beitreten.

    // 2. Karten wiederherstellen (Battlefield, Revealed)
    // Hilfsfunktion zum Rekonstruieren von Karten
    const restoreCard = (cardData) => {
      const card = new Card();
      Object.assign(card, cardData);
      this.cardLookup.set(card.id, card);
      return card;
    };

    if (savedData.battlefield) {
      savedData.battlefield.forEach((c) =>
        this.state.battlefield.push(restoreCard(c)),
      );
    }
    if (savedData.revealedCards) {
      savedData.revealedCards.forEach((c) =>
        this.state.revealedCards.push(restoreCard(c)),
      );
    }

    // 3. Spieler-Daten zwischenspeichern (werden in onJoin zugewiesen)
    // Wir gehen davon aus, dass savedData.players ein Objekt/Map ist.
    for (const key in savedData.players) {
      const pData = savedData.players[key];
      // ✨ FIX: Speichere die alte SessionID temporär, um sie für die Sortierung zu nutzen
      pData._oldSessionId = key;
      this.savedPlayers.push(pData);
    }

    // ✨ FIX: Sortiere die Spieler so, dass derjenige, der gespeichert hat, zuerst kommt.
    // Das stellt sicher, dass der Spieler, der das Spiel lädt (und als erster joint),
    // seinen alten Spielstand zurückbekommt.
    if (savedBy) {
      this.savedPlayers.sort((a, b) => {
        return a._oldSessionId === savedBy ? -1 : 1;
      });
    }

    logger.info(
      `[GameRoom] State restored. Waiting for ${this.savedPlayers.length} players to reclaim slots.`,
    );
  }

  // ✨ NEU: Korrigiert die `originalOwnerId` aller Karten nach dem Laden eines Spiels.
  // Wird aufgerufen, nachdem alle Spieler dem Raum wieder beigetreten sind.
  _fixCardOwnershipAfterLoad() {
    logger.info(
      `[FIX_OWNERSHIP] All players reclaimed slots. Fixing originalOwnerId on all cards...`,
    );
    for (const card of this.cardLookup.values()) {
      const oldOwnerId = card.originalOwnerId;
      const newOwnerId = this.oldToNewSessionIdMap.get(oldOwnerId);
      if (newOwnerId) {
        if (card.originalOwnerId !== newOwnerId) {
          card.originalOwnerId = newOwnerId;
        }
      } else {
        logger.warn(
          `[FIX_OWNERSHIP] Could not find new session ID for old owner '${oldOwnerId}' on card '${card.id}'.`,
        );
      }
    }
    logger.info(`[FIX_OWNERSHIP] Finished fixing card ownership.`);
  }

  // ✨ NEU: Weist einem neuen Client einen gespeicherten Spieler-Slot zu
  _reclaimSavedPlayer(client, options) {
    // Wir nehmen einfach den nächsten verfügbaren Slot (FIFO)
    // Player 1 (Ersteller) bekommt den ersten Slot, Player 2 den zweiten.
    const savedData = this.savedPlayers.shift();

    // ✨ FIX: UserData initialisieren, damit Chat und Logging funktionieren
    // ✨ FIX: Alte Session-ID der neuen zuordnen, um Kartenbesitz korrekt wiederherzustellen.
    this.oldToNewSessionIdMap.set(savedData._oldSessionId, client.sessionId);

    client.userData = {
      deck: [], // Deck ist bereits im State wiederhergestellt
      playerName:
        options.playerName ||
        savedData.name ||
        `Player ${client.sessionId.substr(0, 4)}`,
      deckName: savedData.deckName || "Loaded Deck",
    };

    const p = new PlayerState();
    p.sessionId = client.sessionId; // Neue Session ID!
    p.name = options.playerName || savedData.name; // Name aktualisieren oder behalten
    p.deckName = savedData.deckName;
    p.redeemedSouls = savedData.redeemedSouls;
    p.turn = savedData.turn;
    p.connected = true;
    p.ready = false; // ✨ FIX: Muss erst laden

    // Zonen wiederherstellen
    const restoreZone = (zoneName) => {
      if (savedData[zoneName]) {
        savedData[zoneName].forEach((cData) => {
          const card = new Card();
          Object.assign(card, cData); // Kopiert alle gespeicherten Eigenschaften, inkl. der alten originalOwnerId
          // Der Controller ist immer der Spieler, der die Zone gerade wiederherstellt.
          card.controllerId = client.sessionId;

          p[zoneName].push(card);
          this.cardLookup.set(card.id, card);
        });
      }
    };

    const zones = [
      ZONES.DECK,
      ZONES.HAND,
      ZONES.DISCARD,
      ZONES.RESERVE,
      ZONES.LAND_OF_REDEMPTION,
      ZONES.BANISH,
      ZONES.TERRITORY,
      ZONES.LAND_OF_BONDAGE,
    ];
    zones.forEach((zone) => restoreZone(zone));

    this.state.players.set(client.sessionId, p);

    // Wenn das der aktive Spieler war (wir raten anhand der Zugreihenfolge oder speichern es),
    // setzen wir activePlayer. Einfache Heuristik: Wenn savedPlayers leer ist, sind alle da.
    // Besser: Wir setzen activePlayer einfach auf den ersten, der joint, wenn es sein Zug war.
    // Da das komplex ist, setzen wir activePlayer einfach neu, wenn alle da sind.

    logger.info(
      `[GameRoom] Player ${client.sessionId} reclaimed a saved slot.`,
    );

    // Wenn alle Slots belegt sind, Spiel fortsetzen
    if (this.savedPlayers.length === 0) {
      // ✨ FIX: Jetzt, wo alle Spieler da sind und die ID-Map vollständig ist,
      // korrigieren wir die `originalOwnerId` aller Karten im Spiel.
      this._fixCardOwnershipAfterLoad();
      this.state.activePlayer = Array.from(this.state.players.keys())[0]; // Vereinfachung: Erster Spieler ist dran
      // Oder wir speichern den Index des aktiven Spielers im Savegame.
    }
  }

  _createPlayer(client) {
    try {
    // ✨ FINALE, ENTSCHEIDENDE KORREKTUR:
    // Das PlayerState-Objekt muss seine eigene sessionId kennen.
    // Das Fehlen dieser Zeile war die Ursache für die 'undefined' ownerIds.
    const p = new PlayerState();
    const requestedDeck = client.userData?.deck;

    // ✨ NEU: Deck-Erstellung
    // Wenn der Client ein Deck gesendet hat, versuchen wir dieses zu nutzen.
    // Andernfalls (oder wenn das Deck leer ist) nutzen wir den Zufalls-Modus.
    let deckCards = [];
    let reserveCards = [];

    // ✨ FIX: Prüfe auf das neue strukturierte Deck-Objekt
    if (requestedDeck && requestedDeck.main && requestedDeck.main.length > 0) {
      logger.info(
        `[CREATE_PLAYER] Building deck from ${requestedDeck.main.length} main and ${requestedDeck.reserve?.length || 0} reserve cards for ${client.sessionId}`,
      );

      // Main Deck
      requestedDeck.main.forEach((cardIdentifier) => {
        // ✨ FIX: Suche nach Name ODER ID.
        // cardIdentifier kann ein String (Name/ID) oder eine Zahl (ID aus JSON) sein.
        // Wir vergleichen locker (==), um String/Number Unterschiede bei IDs abzufangen.
        const cardDef = cardDatabase.find(
          (c) => c.Name === cardIdentifier || c.id == cardIdentifier,
        );
        if (cardDef) {
          deckCards.push(cardDef);
        } else {
          logger.warn(
            `[CREATE_PLAYER] Requested card '${cardIdentifier}' not found in DB.`,
          );
        }
      });

      // Reserve Deck
      if (requestedDeck.reserve) {
        requestedDeck.reserve.forEach((cardIdentifier) => {
          const cardDef = cardDatabase.find(
            (c) => c.Name === cardIdentifier || c.id == cardIdentifier,
          );
          if (cardDef) {
            reserveCards.push(cardDef);
          } else {
            logger.warn(
              `[CREATE_PLAYER] Requested reserve card '${cardIdentifier}' not found in DB.`,
            );
          }
        });
      }
    }

    // Fallback: Zufallsdeck, wenn kein gültiges Deck übergeben wurde
    if (deckCards.length === 0) {
      logger.info(
        `[CREATE_PLAYER] No valid deck provided. Generating random deck for ${client.sessionId}`,
      );
      const shuffledDatabase = [...cardDatabase];
      shuffle(shuffledDatabase);
      deckCards = shuffledDatabase.slice(0, 50);
    }

    // Karten instanziieren
    const createCardInstance = (cardData, idx, zone) => {
      const c = new Card();
      c.id = `${client.sessionId}-card${idx}`;
      // logger.info(`[CREATE_CARD] Creating card with id: ${c.id}`);
      c.originalOwnerId = client.sessionId;
      c.controllerId = client.sessionId;
      Object.entries(cardData).forEach(([key, value]) => {
        // ✨ FIX: Do not overwrite the unique instance ID (string) with the numeric DB ID.
        if (key !== "id") {
          c[key] = value;
        }
      });
      c.zone = zone;
      p[zone].push(c);
      this.cardLookup.set(c.id, c);
    };

    deckCards.forEach((cardData, idx) =>
      createCardInstance(cardData, `main${idx}`, ZONES.DECK),
    );
    reserveCards.forEach((cardData, idx) =>
      createCardInstance(cardData, `reserve${idx}`, ZONES.RESERVE),
    );

    shuffle(p[ZONES.DECK]);
    shuffle(p[ZONES.RESERVE]); // ✨ NEU: Auch Reserve mischen
    p.connected = true; // ✨ FIX: Explizit als verbunden markieren
    p.sessionId = client.sessionId;

    // ✨ NEU: Namen setzen
    p.name = client.userData.playerName;
    p.deckName = client.userData.deckName;

    // ✨ DEIN VORSCHLAG: Logge den neu erstellten Spielerstatus, um zu überprüfen, ob alle Zonen vorhanden sind.
    logger.info(`PlayerState created for ${client.sessionId}:`, p.toJSON());

    this.state.players.set(client.sessionId, p);

    logger.info(
      `PlayerState added for ${client.sessionId}. Total players: ${this.state.players.size}`,
    );
    } catch (err) {
        logger.error(`[CREATE_PLAYER] Error creating player for ${client.sessionId}:`, err);
    }
  }

  _initializeGame() {
    logger.info(`[DIAGNOSTIC_STEP_3] _initializeGame started.`);
    logger.info(
      `[GameRoom] Initializing game for room ${this.roomId}. Locking room.`,
    );
    this.lock(); // Raum für weitere Spieler sperren
    const firstPlayerIndex = Math.floor(Math.random() * this.clients.length);
    this.state.activePlayer = this.clients[firstPlayerIndex].sessionId;
    logger.info(
      `[DIAGNOSTIC_STEP_4] Active player set to ${this.state.activePlayer}. Starting to draw hands.`,
    );

    // Starthand für jeden Spieler ziehen
    this.state.players.forEach((player, sessionId) => {
      try {
        logger.info(`[GameRoom] Drawing starting hand for player ${sessionId}`);
        // ✨ KORREKTUR: Stelle sicher, dass das 'player'-Objekt (der Wert der Map) und nicht die 'sessionId' (der Schlüssel)
        // an moveCard übergeben wird. Dies behebt den 'player.sessionId=undefined'-Fehler.
        // ✨ FINALE KORREKTUR: Fange den Rückgabewert von moveCard ab. Das Fehlen dieser Deklaration hat den Server zum Absturz gebracht.
        const drawnCards = moveCard(
            player,
            this.state,
            this.cardLookup,
            ZONES.DECK,
            ZONES.HAND,
            0,
            STARTING_HAND_SIZE,
            null,
        );

        // ✨ FINALE KORREKTUR: Sende die 'cardsDrawn'-Nachricht für die Starthand.
        // Dies war der Grund, warum die Animationen für die Starthand bisher nie ausgelöst wurden.
        if (drawnCards && drawnCards.length > 0) {
            const cardIds = drawnCards.map((c) => c.id);
            const client = this.clients.find((c) => c.sessionId === sessionId);
            if (client) {
            logger.info(
                `[INITIAL_DRAW] Sending 'cardsDrawn' event to client ${sessionId} for starting hand: [${cardIds.join(
                ", ",
                )}]`,
            );
            client.send("cardsDrawn", { cardIds });
            }

            // ✨ NEU: Log für Starthand
            this.broadcastGameLog(`${player.name} draws starting hand.`); // ✨ FIX
        }
      } catch (err) {
          logger.error(`[DIAGNOSTIC_ERROR] Error drawing hand for player ${sessionId}:`, err);
      }
      logger.info(`[DIAGNOSTIC_STEP_6] Finished drawing hand for player ${sessionId}.`);
    });

    // Startphase und ersten Zugzähler setzen
    const firstPlayer = this.state.players.get(this.state.activePlayer);
    firstPlayer.turn = 1;
    // ✨ Der erste Spieler startet jetzt korrekt in der DRAW-Phase.
    this.state.currentPhase = PHASES.DRAW;
    logger.info(`Game starting. Active player is ${this.state.activePlayer}`);
    logger.info(`[DIAGNOSTIC_STEP_8] _initializeGame finished.`);
  }

  // ✨ NEU: Beendet das Spiel und setzt den Gewinner
  _endGame(winnerId, loserId, reason) {
    // Verhindern, dass das Spiel doppelt beendet wird
    if (this.state.winnerId) {
      logger.info(
        `[GAME OVER] Attempted to end game that is already over. Winner: ${this.state.winnerId}`,
      );
      return;
    }

    this.state.winnerId = winnerId;
    this.state.gameOverReason = reason;

    const winner = this.state.players.get(winnerId);

    if (winner) {
      this.broadcastGameLog(`${winner.name} has won the game!`);
    }

    logger.info(
      `[GAME OVER] Winner: ${winnerId}, Loser: ${loserId}, Reason: ${reason}`,
    );

    // Raum sperren
    this.lock();

    // ✨ FINALE LÖSUNG: Zerstöre den Raum nach 5 Sekunden zwangsweise.
    // Das verhindert "Zombie-Räume" und ist nicht mehr vom Client-Verhalten abhängig.
    this.clock.setTimeout(() => {
      this.disconnect().catch((e) =>
        logger.error("[GAME OVER] Error during scheduled disconnect:", e),
      );
    }, 5000);
  }
}

module.exports = { GameRoom };
