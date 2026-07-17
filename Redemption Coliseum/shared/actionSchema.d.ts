import { Schema } from "@colyseus/schema";
import { TargetRequirement } from "./targetSchema";
import { ActionType } from "./actions";

export declare class CardAction extends Schema {
  id: string;
  type: ActionType;
  description: string;
  isMandatory: boolean;
  targetRequirements?: TargetRequirement;
}
