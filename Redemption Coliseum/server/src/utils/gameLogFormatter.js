// server/src/utils/gameLogFormatter.js
const { getZoneDisplayName } = require("../services/cardService");

/**
 * Formats a card into the canonical game-log token format: {{templateId|cardName}}
 * Ensures interactive links (underline, hover card preview, text box) on client.
 *
 * @param {object|string} cardOrTemplateId Card instance, plain object, or templateId.
 * @param {string} [fallbackName] Fallback card name if not available on object.
 * @returns {string} Formatted token string (e.g. "{{101|Card Name}}").
 */
function formatCardLink(cardOrTemplateId, fallbackName = "") {
  if (!cardOrTemplateId) return fallbackName || "";
  if (typeof cardOrTemplateId === "object") {
    const card = cardOrTemplateId;
    const name = card.Name || card.name || card.cardName || fallbackName || "Card";
    const templateId = card.templateId || card.ImageFile || card.id || name;
    return `{{${templateId}|${name}}}`;
  }
  const name = fallbackName || String(cardOrTemplateId);
  return `{{${cardOrTemplateId}|${name}}}`;
}

/**
 * Formats a standardized undo movement log entry.
 *
 * @param {string} playerName Acting player's name.
 * @param {object|string} card Card instance or name.
 * @param {string} fromZone Zone the card was in before undo.
 * @param {string} toZone Zone the card is returned to.
 * @param {boolean} [isOpponent=false] Whether the zone belongs to an opponent.
 * @returns {string} Formatted log entry.
 */
function formatCardUndoLog(playerName, card, fromZone, toZone, isOpponent = false) {
  const cardLink = formatCardLink(card);
  const fromDisplay = getZoneDisplayName(fromZone, isOpponent);
  const toDisplay = getZoneDisplayName(toZone, isOpponent);
  return `[UNDO] ${playerName} returned ${cardLink} from ${fromDisplay} to ${toDisplay}.`;
}

/**
 * Formats a consolidated undo log entry for an executed chronicle ability.
 * Combines the ability rewind and all reversed card movements into a single log entry.
 *
 * @param {string} playerName Acting player's name.
 * @param {object|string} sourceCard The card that triggered the ability.
 * @param {Array<{ cardOrName: any, fromZone: string, toZone: string, isOpponent: boolean }>} [movements=[]] Reverted movements.
 * @returns {string} Single combined log entry.
 */
function formatChronicleUndoLog(playerName, sourceCard, movements = []) {
  const sourceLink = formatCardLink(sourceCard);

  if (!movements || movements.length === 0) {
    return `[UNDO] ${playerName} rewound ability of ${sourceLink}.`;
  }

  // Check if all reversed movements share the same fromZone and toZone
  const first = movements[0];
  const sameZones = movements.every(
    (m) => m.fromZone === first.fromZone && m.toZone === first.toZone && m.isOpponent === first.isOpponent
  );

  if (sameZones) {
    const cardLinks = movements.map((m) => formatCardLink(m.cardOrName)).join(", ");
    const fromDisplay = getZoneDisplayName(first.fromZone, first.isOpponent);
    const toDisplay = getZoneDisplayName(first.toZone, first.isOpponent);
    return `[UNDO] ${playerName} rewound ability of ${sourceLink} and returned ${cardLinks} from ${fromDisplay} to ${toDisplay}.`;
  }

  // If movements cross different zones, format each distinctly
  const details = movements.map((m) => {
    const link = formatCardLink(m.cardOrName);
    const fromDisplay = getZoneDisplayName(m.fromZone, m.isOpponent);
    const toDisplay = getZoneDisplayName(m.toZone, m.isOpponent);
    return `returned ${link} from ${fromDisplay} to ${toDisplay}`;
  }).join("; ");

  return `[UNDO] ${playerName} rewound ability of ${sourceLink} (${details}).`;
}

module.exports = {
  formatCardLink,
  formatCardUndoLog,
  formatChronicleUndoLog,
};
