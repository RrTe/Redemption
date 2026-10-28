// server/src/state/BattleState.js
const { Schema, type } = require("@colyseus/schema");
const { BATTLE_STATE_REASON } = require("../../../shared/battleConstants");

/**
 * Colyseus schema holding authoritative live battle numbers and initiative tracker status.
 */
class BattleState extends Schema {
  constructor() {
    super();
    this.rescuerStrength = 0;
    this.rescuerToughness = 0;
    this.blockerStrength = 0;
    this.blockerToughness = 0;
    this.initiativePlayerId = "";
    this.stateReason = BATTLE_STATE_REASON.NO_BATTLE;
    this.lastCardPlayedPlayerId = "";
    this.specialInitiativePlayerId = "";
    this.blockOccurred = false;
  }
}

type("number")(BattleState.prototype, "rescuerStrength");
type("number")(BattleState.prototype, "rescuerToughness");
type("number")(BattleState.prototype, "blockerStrength");
type("number")(BattleState.prototype, "blockerToughness");
type("string")(BattleState.prototype, "initiativePlayerId");
type("string")(BattleState.prototype, "stateReason");
type("string")(BattleState.prototype, "lastCardPlayedPlayerId");
type("string")(BattleState.prototype, "specialInitiativePlayerId");
type("boolean")(BattleState.prototype, "blockOccurred");

module.exports = { BattleState };
