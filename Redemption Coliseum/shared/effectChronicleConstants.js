// shared/effectChronicleConstants.js

/**
 * Action identifiers for Effect Chronicle resolutions.
 */
export const CHRONICLE_ACTIONS = /** @type {const} */ ({
  EXECUTE: "execute",
  PASS: "pass",
  PASS_ALL: "pass_all",
});

/**
 * Status values for items in the Effect Chronicle.
 */
export const CHRONICLE_STATUS = /** @type {const} */ ({
  PENDING: "pending",
  RESOLVING: "resolving",
  COMPLETED: "completed",
  PASSED: "passed",
});

/**
 * Colyseus message identifiers for Effect Chronicle operations.
 */
export const CHRONICLE_MESSAGES = /** @type {const} */ ({
  RESOLVE_ITEM: "resolveChronicleItem",
});

if (typeof module !== "undefined" && module.exports) {
  module.exports = {
    CHRONICLE_ACTIONS,
    CHRONICLE_STATUS,
    CHRONICLE_MESSAGES,
  };
}

