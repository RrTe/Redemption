import { type EditorCardData } from "./DeckListModel";
import { getCardHash } from "./DeckCardView";
import { FilterManager } from "../components/filters/FilterManager";

export class CardListModel {
  public cards: EditorCardData[] = [];
  public cardCount: number = 0;
  public cardsSelectedCount: number = 0;
  public filterManager!: FilterManager;

  constructor() {}

  public getCard(id: string): EditorCardData | undefined {
    return this.cards.find((c) => c.id === id);
  }

  public setFilterManager(manager: FilterManager) {
    this.filterManager = manager;
  }

  public hasSymbolFilter(id: string): boolean {
    if (!this.filterManager) return false;
    return this.filterManager.getFilters().some((f) => f.id === id && (f.category === "symbol" || f.category === "brigade"));
  }

  public setFilterText(text: string) {
    if (this.filterManager) {
      this.filterManager.setFilterText(text);
    }
    this.filterCards();
  }

  public textFiltersActive(): boolean {
    if (!this.filterManager) return false;
    return this.filterManager.hasActiveFiltersCount("text") > 0;
  }

  /**
   * Initializes the list of cards, normalizing properties and hashing IDs.
   */
  public loadCards(cardsArray: any[]) {
    this.cardCount = 0;
    this.cards = [];

    cardsArray.forEach((element) => {
      const card = { ...element } as EditorCardData;
      if (!card.id) {
        card.id = getCardHash(card.ImageFile + card.Set + card.Name);
      }

      // Reformat string lists into clean arrays (splitting by '/', ',', and 'and')
      const formatProp = (prop: keyof EditorCardData) => {
        if (typeof card[prop] === "string") {
          (card as any)[prop] = (card[prop] as any)
            .split(/[\/,]|\s+and\s+/i)
            .map((item: string) => item.trim())
            .filter((item: string) => item !== "");
        }
      };
      formatProp("Type");
      formatProp("Alignment");
      formatProp("Brigade");
      formatProp("Class");

      card.selected = true;
      this.cardCount++;
      this.cards.push(card);
    });

    this.sortCards();
    this.cardsSelectedCount = this.cardCount;
  }

  public updateCardSymbolFilters(filterID: string, filterValue: boolean) {
    if (this.filterManager) {
      this.filterManager.setFilterActive(filterID, filterValue);
    }
  }

  public updateCardTextFilters(filterID: string, filterValue: boolean) {
    if (this.filterManager) {
      this.filterManager.setFilterActive(filterID, filterValue);
    }
  }

  /**
   * Evaluates active filters and queries across all loaded cards.
   */
  public filterCards() {
    this.cardsSelectedCount = 0;

    this.cards.forEach((card) => {
      if (this.filterManager) {
        card.selected = this.filterManager.evaluateCard(card);
      } else {
        card.selected = true;
      }

      if (card.selected) {
        this.cardsSelectedCount++;
      }
    });

    this.sortCards();
  }

  public sortCards() {
    this.cards = [...this.cards].sort((card1, card2) => {
      // Prioritize selected cards over deselected
      if (card1.selected !== card2.selected) {
        return card1.selected ? -1 : 1;
      }
      const name1 = card1.Name || "";
      const name2 = card2.Name || "";
      return name1.localeCompare(name2);
    });
  }
}

