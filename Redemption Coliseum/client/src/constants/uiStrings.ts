// client/src/constants/uiStrings.ts

/**
 * Centralized user-facing UI strings across Redemption Coliseum.
 * Prepares the codebase for multi-language localization (i18n).
 */
export const UI_STRINGS = Object.freeze({
  DRAW_SEQUENCE: {
    PROMPT: (isStars: boolean, hasPriority: boolean, showHelp: boolean) => {
      if (hasPriority) {
        if (showHelp) {
          return isStars
            ? "Select Star Cards to play (Click to order 1, 2...)"
            : "Select Lost Souls to activate (Click to order 1, 2...)";
        }
        return isStars
          ? "Draw Phase: Stars – Your Priority"
          : "Draw Phase: Lost Souls – Your Priority";
      }
      if (showHelp) {
        return isStars
          ? "Waiting for opponent's Star card actions..."
          : "Waiting for opponent's Lost Soul actions...";
      }
      return isStars
        ? "Draw Phase: Stars – Opponent's Priority..."
        : "Draw Phase: Lost Souls – Opponent's Priority...";
    },
    BTN_CONFIRM: (count: number) => `Confirm (${count})`,
    BTN_PASS: "Pass",
  },
});
