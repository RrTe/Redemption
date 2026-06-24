import cardDataRaw from "../../../shared/cards_extended_with_ordir_fuzzy.json";
import { normalizeCard, type CardSide, type NormalizedCard } from "../../../shared/utils";

export { type CardSide, type NormalizedCard, normalizeCard };

export const cardData = {
  cards: cardDataRaw.cards.map((c: any) => normalizeCard(c))
};
