import { Schema, ArraySchema } from "@colyseus/schema";

export declare class TargetRequirement extends Schema {
  minTargets: number;
  maxTargets: number;
  validZones?: ArraySchema<string>;
  validTypes?: ArraySchema<string>;
  validBrigades?: ArraySchema<string>;
  validClasses?: ArraySchema<string>;
}
