export const GameEvents = {
  // Network Events (Server -> Client via Coordinator)
  NET_GAME_ERROR: "net:gameError",
  NET_SEARCH_RESULT: "net:searchResult",
  NET_CARDS_DRAWN: "net:cardsDrawn",
  NET_PILE_SHUFFLED: "net:pileShuffled",
  NET_CHAT: "net:chat",
  NET_CHAT_HISTORY: "net:chatHistory",
  NET_GAME_LOG: "net:gameLog",
  NET_SAVE_GAME_DATA: "net:saveGameData",
  NET_STATE_CHANGED: "net:stateChanged",
  NET_GAME_OVER: "net:gameOver",
  NET_PLAYER_JOINED: "net:playerJoined",
  NET_PLAYER_LEFT: "net:playerLeft",
  NET_PLAYER_STATE_CHANGED: "net:playerStateChanged",
  NET_REVEALED_CARDS_ADDED: "net:revealedCardsAdded",
  NET_REVEALED_CARDS_REMOVED: "net:revealedCardsRemoved",
  NET_OFFLINE: "net:offline",
  NET_ONLINE: "net:online",
  NET_RECONNECTING: "net:reconnecting",
  NET_DISCONNECTED: "net:disconnected",

  // UI & Logic Events
  UI_REQUEST_CARD_ACTION: "request-card-action",
  UI_NEXT_PHASE_CLICKED: "nextPhaseButtonClicked",

  // Global System Events
  SYSTEM_PLAY_SOUND: "playSound",
  SYSTEM_SETTINGS_CHANGED: "settings-changed",
} as const;

export type GameEvents = (typeof GameEvents)[keyof typeof GameEvents];
