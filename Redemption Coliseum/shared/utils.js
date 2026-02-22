/**
 * Generiert einen eindeutigen Hash-Code für einen String (z.B. Kartennamen).
 * Dieser Algorithmus muss im DeckEditor und im Spiel identisch sein.
 */
export function hash(str) {
  return str
    .normalize("NFC")
    .split("")
    .reduce((prev, curr) => (Math.imul(31, prev) + curr.charCodeAt(0)) | 0, 0);
}
