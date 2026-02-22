import type { CardData } from './card';

export function findCardByName(cards: CardData[], name: string): CardData | undefined {
  return cards.find(card => card.Name === name);
}

// Weitere Filter-/Suchfunktionen...