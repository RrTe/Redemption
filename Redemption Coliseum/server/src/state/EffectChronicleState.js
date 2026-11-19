// server/src/state/EffectChronicleState.js
const { Schema, type, ArraySchema, defineTypes } = require("@colyseus/schema");
const { CHRONICLE_STATUS } = require("../../../shared/effectChronicleConstants");

/**
 * Individual item inside the Effect Chronicle resolution queue.
 */
class ChronicleItem extends Schema {
  constructor(options = {}) {
    super();
    this.id = options.id || "";
    this.cardId = options.cardId || "";
    this.templateId = options.templateId || "";
    this.controllerId = options.controllerId || "";
    this.actionType = options.actionType || "";
    this.title = options.title || "";
    this.description = options.description || "";
    this.effectLabel = options.effectLabel || "";
    this.resultSummary = options.resultSummary || "";
    this.effectStepIndex = typeof options.effectStepIndex === "number" ? options.effectStepIndex : -1;
    this.status = options.status || CHRONICLE_STATUS.PENDING;
    this.order = typeof options.order === "number" ? options.order : 1;
    this.abilityId = options.abilityId || "";
    this.isOptional = Boolean(options.isOptional || false);
  }
}

defineTypes(ChronicleItem, {
  id: "string",
  cardId: "string",
  templateId: "string",
  controllerId: "string",
  actionType: "string",
  title: "string",
  description: "string",
  effectLabel: "string",
  resultSummary: "string",
  effectStepIndex: "number",
  status: "string",
  order: "number",
  abilityId: "string",
  isOptional: "boolean",
});

/**
 * Global queue state for Effect Chronicle resolution.
 */
class EffectChronicleState extends Schema {
  constructor() {
    super();
    this.items = new ArraySchema();
    this.history = new ArraySchema();
    this.priorityPlayerId = "";
    this.isResolving = false;
  }
}

defineTypes(EffectChronicleState, {
  items: [ChronicleItem],
  history: [ChronicleItem],
  priorityPlayerId: "string",
  isResolving: "boolean",
});

module.exports = {
  ChronicleItem,
  EffectChronicleState,
};
