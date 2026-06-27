import type { CardState } from "../../../../shared/types";
import type { SelectedCardInfo } from "../../scenes/SelectionDialogScene";

export class SelectionDialogPaginationManager {
  private allCards: CardState[] = [];
  private filteredCards: CardState[] = [];
  private currentPage = 0;
  private readonly cardsPerPage: number;

  constructor(cards: CardState[], cardsPerPage: number) {
    this.allCards = cards.map(c => {
      const card = { ...c };
      const formatProp = (prop: keyof CardState) => {
        const val = card[prop];
        if (typeof val === "string") {
          (card as any)[prop] = val
            .split(/[\/,]|\s+and\s+/i)
            .map((item: string) => item.trim())
            .filter((item: string) => item !== "");
        }
      };
      formatProp("Type");
      formatProp("Alignment");
      formatProp("Brigade");
      formatProp("Class");
      return card;
    });
    this.filteredCards = [...this.allCards];
    this.cardsPerPage = cardsPerPage;
  }

  public get totalPages(): number {
    return Math.max(1, Math.ceil(this.filteredCards.length / this.cardsPerPage));
  }

  public get currentPageIndex(): number {
    return this.currentPage;
  }

  public getCardsForPage(): CardState[] {
    const startIndex = this.currentPage * this.cardsPerPage;
    return this.filteredCards.slice(startIndex, startIndex + this.cardsPerPage);
  }

  public getAllCards(): CardState[] {
    return this.allCards;
  }

  public getFilteredCards(): CardState[] {
    return this.filteredCards;
  }

  public setFilteredCards(cards: CardState[]) {
    this.filteredCards = cards;
    this.currentPage = 0;
  }

  public getCardsFromIds(ids: Set<string>): CardState[] {
    return this.allCards.filter((c) => ids.has(c.id));
  }

  public getRemainingCardPositions(
    selectedIds: Set<string>,
    positionsMap: Map<string, "top" | "bottom">,
  ): SelectedCardInfo[] {
    return this.allCards
      .filter((c) => !selectedIds.has(c.id))
      .map((c) => ({
        id: c.id,
        position: positionsMap.get(c.id) ?? "top",
      }));
  }

  public setCurrentPage(index: number): boolean {
    if (index >= 0 && index < this.totalPages) {
      this.currentPage = index;
      return true;
    }
    return false;
  }

  public reset() {
    this.currentPage = 0;
  }
}
