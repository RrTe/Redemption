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
    CHRONICLE_ACTIVE: (hasPriority: boolean) =>
      hasPriority
        ? "Effect Chronicle active: Resolve abilities via the Chronicle icon."
        : "Effect Chronicle active: Waiting for opponent to resolve abilities...",
  },
  ROOM_MODE: {
    STANDARD_TITLE: "Standard Mode",
    STANDARD_TOOLTIP: "Standard Mode: Full rules and chronicle enforcement",
    ARENA_TITLE: "Arena Mode",
    ARENA_TOOLTIP: "Arena Mode: Free tabletop play (core rules only)",
    TOGGLE_LABEL: "Mode:",
  },
  TOASTS: {
    DECK_EMPTY: "Deck is empty!",
    HAND_LIMIT: (current: number, max: number) => `Hand limit reached (${current}/${max})!`,
    ZONE_SHUFFLED: (zoneName: string) => `${zoneName} shuffled.`,
    NO_UNDO_ACTIONS: "No actions to undo in the current phase.",
    PARALYZED_BATTLE_RESTRICTED: "Paralyzed cards cannot enter the Field of Battle!",
    SET_ASIDE_BATTLE_RESTRICTED: "Cards in Set Aside cannot enter the Field of Battle!",
  },
  DIALOGS: {
    CONFIRM_DEFAULT_ACCEPT: "Accept",
    CONFIRM_DEFAULT_DECLINE: "Decline",
    ROOM_NO_OPEN_GAMES: "No open games.",
  },
  BATTLE_HUD: {
    ROLE_RESCUER: "RESCUER",
    ROLE_BLOCKER: "BLOCKER",
    YOU_SUFFIX: "(YOU)",
    AWAITING_ATTACKER: "Battle Phase: Awaiting Attacker",
    AWAITING_BLOCKER: "Rescue Attempt (Awaiting Blocker)",
    HERO_REMOVED: "Hero Removed (Rescue Failed)",
    INITIATIVE_NUMBERS: (isMine: boolean) =>
      isMine
        ? "You Have Initiative (Losing by Numbers)"
        : "Opponent Initiative (Losing by Numbers)",
    INITIATIVE_STALEMATE: (isMine: boolean) =>
      isMine
        ? "You Have Initiative (Stalemate)"
        : "Opponent Initiative (Stalemate)",
    INITIATIVE_MUTUAL: (isMine: boolean) =>
      isMine
        ? "You Have Initiative (Mutual Destruction)"
        : "Opponent Initiative (Mutual Destruction)",
  },
});

