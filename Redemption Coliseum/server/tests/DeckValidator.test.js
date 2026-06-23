const { DeckValidator } = require("../../shared/DeckValidator.js");

describe("DeckValidator", () => {
  const mockDominant = { Name: "Son of God", Type: "Dominant" };
  const mockLostSoul = { Name: "Lost Soul 1", Type: "Lost Soul" };
  const mockHero = { Name: "Warrior", Type: "Hero" };

  test("sollte ein korrektes Deck (Format Type 1) als valide erkennen", () => {
    // 50 Karten insgesamt: 8 Lost Souls, 8 Dominants, 34 Heros
    const deck = [
      { card: mockLostSoul, quantity: 8 },
      { card: mockDominant, quantity: 8 },
      { card: mockHero, quantity: 34 }
    ];
    const reserve = [];

    const result = DeckValidator.validate(deck, reserve, "type_1");
    expect(result.isValid).toBe(true);
    expect(result.deckSize.isValid).toBe(true);
    expect(result.reserveSize.isValid).toBe(true);
    expect(result.dominants.isValid).toBe(true);
    expect(result.lostSouls.isValid).toBe(true);
  });

  test("sollte ein zu kleines Deck als invalide erkennen", () => {
    // 40 Karten insgesamt
    const deck = [
      { card: mockLostSoul, quantity: 8 },
      { card: mockDominant, quantity: 8 },
      { card: mockHero, quantity: 24 }
    ];
    const reserve = [];

    const result = DeckValidator.validate(deck, reserve, "type_1");
    expect(result.isValid).toBe(false);
    expect(result.deckSize.isValid).toBe(false);
  });

  test("sollte ein Deck mit zu vielen Dominants als invalide erkennen", () => {
    // 50 Karten: 8 Lost Souls, 9 Dominants (Ungültig, da > 8)
    const deck = [
      { card: mockLostSoul, quantity: 8 },
      { card: mockDominant, quantity: 9 },
      { card: mockHero, quantity: 33 }
    ];
    const reserve = [];

    const result = DeckValidator.validate(deck, reserve, "type_1");
    expect(result.isValid).toBe(false);
    expect(result.dominants.isValid).toBe(false);
  });

  test("sollte ein Deck mit zu wenigen Lost Souls als invalide erkennen", () => {
    // 50 Karten: 6 Lost Souls (benötigt werden 7)
    const deck = [
      { card: mockLostSoul, quantity: 6 },
      { card: mockDominant, quantity: 6 },
      { card: mockHero, quantity: 38 }
    ];
    const reserve = [];

    const result = DeckValidator.validate(deck, reserve, "type_1");
    expect(result.isValid).toBe(false);
    expect(result.lostSouls.isValid).toBe(false);
  });

  test("sollte ein Deck mit Dominants in der Reserve als invalide erkennen", () => {
    const deck = [
      { card: mockLostSoul, quantity: 8 },
      { card: mockDominant, quantity: 8 },
      { card: mockHero, quantity: 34 }
    ];
    const reserve = [
      { card: mockDominant, quantity: 1 }
    ];

    const result = DeckValidator.validate(deck, reserve, "type_1");
    expect(result.isValid).toBe(false);
    expect(result.reserveSize.isValid).toBe(false);
    expect(result.reserveSize.hasDisallowedTypes).toBe(true);
  });

  test("sollte ein Deck mit Lost Souls in der Reserve als invalide erkennen", () => {
    const deck = [
      { card: mockLostSoul, quantity: 8 },
      { card: mockDominant, quantity: 8 },
      { card: mockHero, quantity: 34 }
    ];
    const reserve = [
      { card: mockLostSoul, quantity: 1 }
    ];

    const result = DeckValidator.validate(deck, reserve, "type_1");
    expect(result.isValid).toBe(false);
    expect(result.reserveSize.isValid).toBe(false);
    expect(result.reserveSize.hasDisallowedTypes).toBe(true);
  });
});
