const { Schema, type } = require("../server/node_modules/@colyseus/schema");
const { TargetRequirement } = require("./targetSchema");

class CardAction extends Schema {
  constructor() {
    super();
    this.id = "";
    this.type = "";
    this.description = "";
    this.isMandatory = false;
    this.targetRequirements = new TargetRequirement();
  }
}
type("string")(CardAction.prototype, "id");
type("string")(CardAction.prototype, "type");
type("string")(CardAction.prototype, "description");
type("boolean")(CardAction.prototype, "isMandatory");
type(TargetRequirement)(CardAction.prototype, "targetRequirements");

module.exports = { CardAction };
