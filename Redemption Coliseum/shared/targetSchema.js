const { Schema, type, ArraySchema } = require("../server/node_modules/@colyseus/schema");

class TargetRequirement extends Schema {
  constructor() {
    super();
    this.validZones = new ArraySchema();
    this.validTypes = new ArraySchema();
    this.validBrigades = new ArraySchema();
    this.validClasses = new ArraySchema();
  }
}
type("number")(TargetRequirement.prototype, "minTargets");
type("number")(TargetRequirement.prototype, "maxTargets");
type(["string"])(TargetRequirement.prototype, "validZones");
type(["string"])(TargetRequirement.prototype, "validTypes");
type(["string"])(TargetRequirement.prototype, "validBrigades");
type(["string"])(TargetRequirement.prototype, "validClasses");

module.exports = { TargetRequirement };
