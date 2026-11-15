const { ZONES } = require("../../../shared/zones");

class SearchHelper {
  /**
   * ✨ NEU: Generiert eine eineindeutige ID für einen Stapel.
   */
  static generatePileId(ownerId, zone) {
    return `${ownerId}_${zone}`;
  }

  /**
   * Checks if a player or a specific pile is currently busy with a search/reveal.
   * @returns {{busy: boolean, reason: string}}
   */
  static isBusy(player, roomState, zone, targetPlayerId) {
    const targetPileId = this.generatePileId(targetPlayerId, zone);

    // 1. Check if THIS specific pile is locked by anyone else
    const lockOwnerId = roomState.activeActionPiles.get(targetPileId);
    if (lockOwnerId) {
      if (lockOwnerId !== player.sessionId) {
        return {
          busy: true,
          reason: "This pile is currently in use by another player",
        };
      }
    }

    // 2. Check if the player themselves is already performing an action
    if (player.status === "searching") {
      return { busy: true, reason: "You are already performing an action." };
    }

    // No specific conflict
    return { busy: false, reason: "" };
  }

  /**
   * Standardized setup for any card-choosing context (Search, Look, Reveal).
   */
  static setupContext(
    player,
    roomState,
    { zone, cards, isInteractive, originalOwnerId, actionTakerId },
  ) {
    player.status = "searching";
    player.searchContext.zone = zone;
    player.searchContext.originalOwnerId = originalOwnerId;
    player.searchContext.isInteractive = isInteractive;

    player.searchContext.cards.clear();
    Array.from(cards).forEach((card) => {
      // Store detached clones so searchContext.clear()/splice() never alters
      // refCount or parentChain on live zone Card instances.
      const clonedCard = typeof card?.clone === "function" ? card.clone() : card;
      player.searchContext.cards.push(clonedCard);
    });

    const pileId = this.generatePileId(originalOwnerId, zone);
    roomState.activeActionPiles.set(pileId, actionTakerId);
    roomState.actionTakerId = actionTakerId; // Fallback for single reveal logic
  }

  /**
   * Resets the player status and search context.
   */
  static resetContext(player, roomState) {
    const pileId = this.generatePileId(
      player.searchContext.originalOwnerId,
      player.searchContext.zone,
    );
    roomState.activeActionPiles.delete(pileId);

    player.status = "playing";
    player.searchContext.cards.clear();
    player.searchContext.zone = "";
    player.searchContext.originalOwnerId = "";
    player.searchContext.isInteractive = false;

    if (roomState.actionTakerId === player.sessionId) {
      roomState.actionTakerId = "";
    }
  }

  /**
   * Slices the pile based on count and position (top/bottom).
   */
  static slicePile(pile, count, position = "top") {
    if (!pile || !count || count <= 0) return [];
    // Convert ArraySchema to a plain Array before slicing to avoid creating an
    // unattached ArraySchema wrapper that mutates live items' parentChain.
    const plainPile = Array.from(pile);
    return position === "bottom"
      ? plainPile.slice(-count)
      : plainPile.slice(0, count);
  }

  /**
   * Generates possible target zones for the SelectionDialog.
   * In round 1, no target actions are allowed when taking cards out of the reserve.
   */
  static getPossibleActions(fromZone, roomState = null) {
    if (fromZone === ZONES.RESERVE && roomState) {
      const isFirstRound =
        roomState.round !== undefined && roomState.round !== null
          ? roomState.round <= 1
          : Array.from(roomState.players?.values() || []).every((p) => p.turn <= 1);

      if (isFirstRound) {
        return [];
      }
    }

    const targetZones = [
      { label: "To Hand", toZone: ZONES.HAND },
      { label: "To Territory", toZone: ZONES.TERRITORY },
      { label: "To Land of Bondage", toZone: ZONES.LAND_OF_BONDAGE },
      { label: "To Deck", toZone: ZONES.DECK },
      { label: "To Reserve", toZone: ZONES.RESERVE },
      { label: "To Discard", toZone: ZONES.DISCARD },
      { label: "To Banish", toZone: ZONES.BANISH },
      { label: "To Opp. Hand", toZone: ZONES.HAND, target: "opponent" },
      { label: "To Opp. Territory", toZone: ZONES.TERRITORY, target: "opponent" },
      { label: "To Opp. Land of Bondage", toZone: ZONES.LAND_OF_BONDAGE, target: "opponent" },
      { label: "To Opp. Deck", toZone: ZONES.DECK, target: "opponent" },
      { label: "To Opp. Reserve", toZone: ZONES.RESERVE, target: "opponent" },
      { label: "To Opp. Discard", toZone: ZONES.DISCARD, target: "opponent" },
      { label: "To Opp. Banish", toZone: ZONES.BANISH, target: "opponent" },
    ];

    return targetZones.map((a) => ({
      label: a.label,
      actionId: `MOVE_TO_${a.toZone.toUpperCase()}${a.target ? "_OPPONENT" : ""}`,
      toZone: a.toZone,
      target: a.target,
    }));
  }
}

module.exports = SearchHelper;
