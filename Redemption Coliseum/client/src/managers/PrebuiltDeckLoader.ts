import type { DeckMetadata, WrappedDeck } from "../types/DeckMetadata";
import { log, error } from "../utils/logger";

export class PrebuiltDeckLoader {
  private static cachedDecks: DeckMetadata[] | null = null;
  private static cachedWrapped: Map<string, WrappedDeck> = new Map();

  /**
   * Loads all prebuilt decks from client/public/prebuilt-decks/ using eager globbing.
   */
  public static loadAllPrebuiltDecks(): DeckMetadata[] {
    if (this.cachedDecks) {
      return this.cachedDecks;
    }

    const decks: DeckMetadata[] = [];
    this.cachedWrapped.clear();

    try {
      // Eagerly import all json files from /public/prebuilt-decks/
      const modules = import.meta.glob<WrappedDeck | DeckMetadata>("/public/prebuilt-decks/*.json", { eager: true });
      
      for (const path in modules) {
        const content = modules[path] as any;
        const wrapped = this.normalizeDeckData(content, path);
        if (wrapped && wrapped.meta) {
          // Ensure category is set
          if (!wrapped.meta.category) {
            wrapped.meta.category = "Starter";
          }
          decks.push(wrapped.meta);
          this.cachedWrapped.set(wrapped.meta.name, wrapped);
        }
      }
    } catch (err) {
      error("PrebuiltDeckLoader", "Failed to eager load prebuilt decks", err);
    }

    log("PrebuiltDeckLoader", `Loaded ${decks.length} prebuilt decks.`);
    this.cachedDecks = decks;
    return decks;
  }

  /**
   * Retrieves a full WrappedDeck by deck name.
   */
  public static getWrappedDeck(deckName: string): WrappedDeck | undefined {
    if (!this.cachedDecks) {
      this.loadAllPrebuiltDecks();
    }
    return this.cachedWrapped.get(deckName);
  }

  /**
   * Normalizes raw json imports into a standard WrappedDeck format.
   */
  private static normalizeDeckData(raw: any, filepath: string): WrappedDeck | null {
    if (!raw) return null;

    // Handle default export if wrapped in module object
    const data = raw.default || raw;

    if (data.meta && data.deckData) {
      return data as WrappedDeck;
    }

    if (data.name && Array.isArray(data.cardIds)) {
      const meta: DeckMetadata = {
        id: data.id || `prebuilt_${Date.now()}_${Math.random()}`,
        name: data.name,
        lastModified: data.lastModified || Date.now(),
        cardCount: data.cardCount || { main: (data.cardIds || []).length, reserve: 0 },
        formatVersion: data.formatVersion || "1.0",
        format: data.format || "type_1",
        isValid: data.isValid ?? true,
        category: data.category || "Starter",
        brigades: data.brigades || [],
        cardIds: data.cardIds || [],
        visuals: data.visuals || { heroCharacterCardId: null, evilCharacterCardId: null, fallbackGraphic: "assets/cards/cardback.jpg" },
        stats: data.stats || { wins: { full: 0, partial: 0 }, losses: { full: 0, partial: 0 }, ties: 0 },
      };

      return {
        meta,
        deckData: { main: data.cardIds, reserve: [] },
      };
    }

    return null;
  }
}
