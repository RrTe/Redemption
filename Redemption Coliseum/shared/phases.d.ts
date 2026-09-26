import { PHASES as PhasesJs, DRAW_STEPS as DrawStepsJs } from "./phases.js";

export const PHASES: typeof PhasesJs;

export type PHASES_TYPE = typeof PhasesJs;

export type Phase = PHASES_TYPE[keyof PHASES_TYPE];

export const DRAW_STEPS: typeof DrawStepsJs;

export type DRAW_STEPS_TYPE = typeof DrawStepsJs;

export type DrawStep = DRAW_STEPS_TYPE[keyof DRAW_STEPS_TYPE];

