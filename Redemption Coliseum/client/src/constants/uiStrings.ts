// client/src/constants/uiStrings.ts

/**
 * Centralized user-facing UI strings across Redemption Coliseum.
 * Prepares the codebase for multi-language localization (i18n).
 */
export const UI_STRINGS = Object.freeze({
  DRAW_SEQUENCE: {
    ACTIVE_STARS_PROMPT: "Select Star Cards to play (Click to order 1, 2...)",
    OPPONENT_STARS_WAITING: "Waiting for opponent's Star card actions...",
    ACTIVE_SOULS_PROMPT: "Select Lost Souls to activate (Click to order 1, 2...)",
    OPPONENT_SOULS_WAITING: "Waiting for opponent's Lost Soul actions...",
    BTN_CONFIRM: (count: number) => `Confirm (${count})`,
    BTN_PASS: "Pass",
  },
});
