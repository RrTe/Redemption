import { type CardData } from "../../../../shared/card";
import { editorEvents } from "./EditorEventCenter";

export interface EditorCardData extends CardData {
  id: string;
  selected?: boolean;
}

export interface DeckEntry {
  card: EditorCardData;
  quantity: number;
}

export class DeckListModel {
  public deck: DeckEntry[] = [];
  public reserve: DeckEntry[] = [];

  constructor() {}

  /**
   * Adds a card to the main deck list, incrementing its quantity if already present.
   */
  public addCardToDeck(card: EditorCardData, silent: boolean = false) {
    const stack = this.deck.find((s) => s.card.id === card.id);
    if (stack) {
      stack.quantity++;
    } else {
      this.deck.push({ card, quantity: 1 });
    }
    if (!silent) editorEvents.emit("deck-updated", this.deck);
  }

  /**
   * Adds a card to the reserve deck list, incrementing its quantity if already present.
   */
  public addCardToReserve(card: EditorCardData, silent: boolean = false) {
    const stack = this.reserve.find((s) => s.card.id === card.id);
    if (stack) {
      stack.quantity++;
    } else {
      this.reserve.push({ card, quantity: 1 });
    }
    if (!silent) editorEvents.emit("reserve-updated", this.reserve);
  }

  /**
   * Removes a card from the main deck list, decrementing its quantity or removing it completely.
   */
  public removeCardFromDeck(card: EditorCardData) {
    const idx = this.deck.findIndex((s) => s.card.id === card.id);
    if (idx !== -1) {
      const stack = this.deck[idx];
      if (stack.quantity > 1) {
        stack.quantity--;
      } else {
        this.deck.splice(idx, 1);
      }
      editorEvents.emit("deck-updated", this.deck);
    }
  }

  /**
   * Removes a card from the reserve list, decrementing its quantity or removing it completely.
   */
  public removeCardFromReserve(card: EditorCardData) {
    const idx = this.reserve.findIndex((s) => s.card.id === card.id);
    if (idx !== -1) {
      const stack = this.reserve[idx];
      if (stack.quantity > 1) {
        stack.quantity--;
      } else {
        this.reserve.splice(idx, 1);
      }
      editorEvents.emit("reserve-updated", this.reserve);
    }
  }

  /**
   * Empties both deck and reserve lists.
   */
  public clear() {
    this.deck = [];
    this.reserve = [];
    editorEvents.emit("deck-updated", this.deck);
    editorEvents.emit("reserve-updated", this.reserve);
  }

  /**
   * Returns a flat array of cards in the deck, repeating entries based on their quantities.
   */
  public getFlatDeck(): EditorCardData[] {
    const flat: EditorCardData[] = [];
    this.deck.forEach((stack) => {
      for (let i = 0; i < stack.quantity; i++) {
        flat.push(stack.card);
      }
    });
    return flat;
  }

  /**
   * Returns a flat array of cards in the reserve, repeating entries based on their quantities.
   */
  public getFlatReserve(): EditorCardData[] {
    const flat: EditorCardData[] = [];
    this.reserve.forEach((stack) => {
      for (let i = 0; i < stack.quantity; i++) {
        flat.push(stack.card);
      }
    });
    return flat;
  }

  /**
   * Retrieves all cards matching a specific card type in the deck.
   */
  public cardsByType(type: string): EditorCardData[] {
    return this.getFlatDeck().filter((card) => {
      const cardType = card.Type;
      if (Array.isArray(cardType)) {
        return cardType.includes(type);
      }
      return typeof cardType === "string" && cardType.includes(type);
    });
  }

  /**
   * Retrieves all cards matching a specific type and brigade color in the deck.
   */
  public cardsByBrigadeType(type: string, color: string): EditorCardData[] {
    const cardsPerType = this.cardsByType(type);
    return cardsPerType.filter((card) => {
      if ((card as any).sides && (card as any).sides.length > 0) {
        return (card as any).sides.some((side: any) => {
          const sideType = side.Type;
          const sideBrigade = side.Brigade;
          const typeMatch = Array.isArray(sideType) ? sideType.includes(type) : sideType === type;
          const brigadeMatch = Array.isArray(sideBrigade) ? sideBrigade.includes(color) : sideBrigade === color;
          return typeMatch && brigadeMatch;
        });
      }
      const cardBrigade = card.Brigade;
      if (Array.isArray(cardBrigade)) {
        return cardBrigade.includes(color);
      }
      return typeof cardBrigade === "string" && cardBrigade.includes(color);
    });
  }

  /**
   * Serializes the deck and reserve cards as IDs into JSON format.
   */
  public deckAsIDs(): string {
    const deckJSON = {
      deck: {
        main: this.getFlatDeck().map((c) => c.id),
        reserve: this.getFlatReserve().map((c) => c.id),
      },
    };
    return JSON.stringify(deckJSON);
  }

  /**
   * Serializes the deck and reserve cards as plain text in LackeyCCG format.
   */
  public deckAsTxt(): string {
    let deckTXT = "";
    this.deck.forEach((stack) => {
      deckTXT += `${stack.quantity}\t${stack.card.Name}\n`;
    });
    deckTXT += "Reserve:\n";
    this.reserve.forEach((stack) => {
      deckTXT += `${stack.quantity}\t${stack.card.Name}\n`;
    });
    return deckTXT;
  }
}
