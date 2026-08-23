/**
 * Centralized network and reconnection configuration shared across client and server.
 */
export const NETWORK_CONFIG = /** @type {const} */ ({
  RECONNECTION_TIMEOUT_SECONDS: 120,
  HEARTBEAT_INTERVAL_MS: 10000,
  WS_PING_INTERVAL_MS: 10000,
  WS_PING_MAX_RETRIES: 3,
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = { NETWORK_CONFIG };
}
