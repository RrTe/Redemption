import type { DeckMetadata, DeckStats, WrappedDeck } from "../types/DeckMetadata";
import type { DeckData } from "../utils/DeckUtils";
import { DECK_VALIDATION_RULES } from "../../../shared/deck-validation-rules.js";

export class LocalDeckMetadataGenerator {
  /**
   * Generates the complete metadata object for a deck.
   *
   * @param deckData The parsed deck contents (main and reserve lists)
   * @param filename The name of the file
   * @param lastModified The timestamp of when the file was last modified
   * @param cardDatabase The global array of card data objects
   * @param existingMeta Existing DeckMetadata if updating
   * @param resetStats Whether to reset statistics
   * @param selectedFormat The format ID chosen during import
   * @returns A complete DeckMetadata object
   */
  public static generateMetadata(
    deckData: DeckData,
    filename: string,
    lastModified: number,
    cardDatabase: any[],
    existingMeta?: DeckMetadata,
    resetStats: boolean = false,
    selectedFormat?: string
  ): DeckMetadata {
    const deckName = filename.replace(/\.[^/.]+$/, ""); // Remove extension
    const cardIds = new Set<string>();
    const brigades = new Set<string>();
    
    let heroCharacterCardId: string | null = null;
    let evilCharacterCardId: string | null = null;

    // Helper to process a card string (which could be an ID or a Name)
    const processCard = (cardIdentifier: string) => {
      // Existing utility approach: check ID first, then Name
      const match = cardDatabase.find(
        (c: any) => c.id === cardIdentifier || c.Name === cardIdentifier
      );

      if (match) {
        cardIds.add(match.id);

        // Extract Brigade
        if (match.Brigade) {
          if (Array.isArray(match.Brigade)) {
            match.Brigade.forEach((b: string) => brigades.add(b));
          } else if (typeof match.Brigade === "string") {
            brigades.add(match.Brigade);
          }
        }

        // Check for Hero / Evil Character
        const types = Array.isArray(match.Type) ? match.Type : [match.Type];
        if (types.includes("Hero") && !heroCharacterCardId) {
          heroCharacterCardId = match.id;
        }
        if (types.includes("Evil Character") && !evilCharacterCardId) {
          evilCharacterCardId = match.id;
        }
      }
    };

    // Process all cards in main and reserve
    deckData.main.forEach(processCard);
    deckData.reserve.forEach(processCard);

    const defaultStats: DeckStats = {
      wins: { full: 0, partial: 0 },
      losses: { full: 0, partial: 0 },
      ties: 0,
    };

    const stats: DeckStats = resetStats
      ? defaultStats
      : (existingMeta?.stats || deckData.rawMeta?.stats || defaultStats);

    const visuals = existingMeta?.visuals || deckData.rawMeta?.visuals || {
      heroCharacterCardId,
      evilCharacterCardId,
      fallbackGraphic: "Copilot_20260517_235633_Catacombs.png",
    };

    const id = existingMeta?.id || deckData.rawMeta?.id || crypto.randomUUID();

    const format = selectedFormat || existingMeta?.format || deckData.rawMeta?.format || DECK_VALIDATION_RULES.defaultFormat || "type_1";

    return {
      id,
      name: deckName,
      lastModified,
      cardCount: {
        main: deckData.main.length,
        reserve: deckData.reserve.length,
      },
      formatVersion: "1.0",
      format,
      isValid: true, // TODO: Run centralized validation logic
      brigades: Array.from(brigades),
      cardIds: Array.from(cardIds),
      visuals,
      stats,
    };
  }

  /**
   * Wraps an existing metadata object with the deck data to create a full WrappedDeck.
   */
  public static wrapDeck(meta: DeckMetadata, deckData: DeckData): WrappedDeck {
    return {
      meta,
      deckData,
    };
  }
}
