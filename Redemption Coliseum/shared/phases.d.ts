import { PHASES as PhasesJs } from "./phases.js";

export const PHASES: typeof PhasesJs;

export type PHASES_TYPE = typeof PhasesJs;

export type Phase = PHASES_TYPE[keyof PHASES_TYPE];
