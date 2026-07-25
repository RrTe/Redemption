import { log, error } from "./logger";

export interface DeckData {
  name?: string;
  main: string[];
  reserve: string[];
  rawMeta?: any;
}

export class DeckUtils {
  /**
   * Parst einen Deck-String (TXT oder JSON) und gibt eine Liste von Karten-Identifikatoren zurück.
   * Erkennt das Format automatisch.
   */
  static parseDeck(content: string, fileName: string): DeckData {
    const trimmed = content.trim();
    let deck: DeckData;

    if (fileName.endsWith(".json") || trimmed.startsWith("{")) {
      deck = this.parseJsonDeck(trimmed);
    } else if (fileName.endsWith(".dek") || trimmed.startsWith("<deck")) {
      deck = this.parseXmlDeck(trimmed);
    } else {
      deck = this.parseTxtDeck(trimmed);
    }

    // Verhindert das Laden von ungültigen/leeren Dateien
    if (deck.main.length === 0) {
      throw new Error("The file contains no valid cards or has a wrong format.");
    }

    return deck;
  }

  /**
   * Parst das TXT-Format (Tab-getrennt: "Anzahl \t Name").
   * Ignoriert "Reserve:" Header.
   */
  private static parseTxtDeck(text: string): DeckData {
    const deck: DeckData = { main: [], reserve: [] };
    const lines = text.split("\n");

    let currentSection: "main" | "reserve" | "other" = "main";

    for (const line of lines) {
      const trimmedLine = line.trim();
      if (!trimmedLine) continue;

      const cardMatch = trimmedLine.match(/^(\d+)\s+(.+)$/);

      if (cardMatch) {
        if (currentSection === "other") continue;

        const count = parseInt(cardMatch[1], 10);
        const cardName = cardMatch[2].trim();

        for (let i = 0; i < count; i++) {
          if (currentSection === "reserve") {
            deck.reserve.push(cardName);
          } else {
            deck.main.push(cardName);
          }
        }
      } else {
        const lower = trimmedLine.toLowerCase();

        if (lower.startsWith("reserve")) {
          currentSection = "reserve";
        } else if (lower.startsWith("main")) {
          currentSection = "main";
        } else {
          currentSection = "other";
        }
      }
    }
    
    log(
      "DeckUtils",
      `Parsed TXT deck with ${deck.main.length} main and ${deck.reserve.length} reserve cards.`,
    );
    return deck;
  }

  /**
   * Parst das JSON-Format (IDs oder WrappedDeck format).
   */
  private static parseJsonDeck(jsonString: string): DeckData {
    try {
      const data = JSON.parse(jsonString);
      
      let mainIds: string[] = [];
      let reserveIds: string[] = [];

      // Check for new WrappedDeck format
      if (data.deckData) {
        mainIds = (data.deckData.main || []).map(String);
        reserveIds = (data.deckData.reserve || []).map(String);
      } else {
        // Fallback to old format: { deck: { main: [...], reserve: [...] } }
        mainIds = (data.deck?.main || []).map(String);
        reserveIds = (data.deck?.reserve || []).map(String);
      }

      log(
        "DeckUtils",
        `Parsed JSON deck with ${mainIds.length} main and ${reserveIds.length} reserve cards.`,
      );
      return {
        main: mainIds,
        reserve: reserveIds,
        rawMeta: data.meta || undefined,
      };

    } catch (e) {
      log("DeckUtils", "Failed to parse JSON deck", e);
      throw new Error("Invalid JSON deck format");
    }
  }

  /**
   * Parst das XML-Format (.dek).
   */
  private static parseXmlDeck(xmlString: string): DeckData {
    const deck: DeckData = { main: [], reserve: [] };
    try {
      const parser = new DOMParser();
      const xmlDoc = parser.parseFromString(xmlString, "text/xml");
      
      const superzones = xmlDoc.getElementsByTagName("superzone");
      for (let i = 0; i < superzones.length; i++) {
        const sz = superzones[i];
        const szName = sz.getAttribute("name")?.toLowerCase() || "";
        
        let targetList: string[] | null = null;
        if (szName === "deck" || szName === "main") {
          targetList = deck.main;
        } else if (szName === "reserve") {
          targetList = deck.reserve;
        }

        if (targetList) {
          const cards = sz.getElementsByTagName("card");
          for (let j = 0; j < cards.length; j++) {
            const card = cards[j];
            const nameElement = card.getElementsByTagName("name")[0];
            if (nameElement && nameElement.textContent) {
              targetList.push(nameElement.textContent.trim());
            }
          }
        }
      }
      log(
        "DeckUtils",
        `Parsed XML deck with ${deck.main.length} main and ${deck.reserve.length} reserve cards.`
      );
    } catch (e) {
      log("DeckUtils", "Failed to parse XML deck", e);
      throw new Error("Invalid XML deck format");
    }
    return deck;
  }
}
