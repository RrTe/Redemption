const {
  CardRepository,
  splitFlipName,
  isDualSided,
  LEGACY_DUALS,
} = require("../../shared/CardRepository.js");

describe("Dual Card Name Parsing & Resolution", () => {
  describe("splitFlipName", () => {
    test("returns null for non-string, empty, or undefined inputs", () => {
      expect(splitFlipName(null)).toBeNull();
      expect(splitFlipName(undefined)).toBeNull();
      expect(splitFlipName("")).toBeNull();
      expect(splitFlipName(12345)).toBeNull();
    });

    test("ignores Lost Souls with scripture citations containing slashes", () => {
      expect(splitFlipName("Lost Soul [James 4:6 / Proverbs 3:34 - RoJ]")).toBeNull();
      expect(splitFlipName("Lost Soul \"Grumbled\" [Exodus 15:24] [1st Print - K]")).toBeNull();
    });

    test("resolves LEGACY_DUALS without space-separated slashes", () => {
      expect(splitFlipName("Abram/Abraham")).toEqual(["Abram", "Abraham"]);
      expect(splitFlipName("Saul/Paul")).toEqual(["Saul", "Paul"]);
      expect(splitFlipName("Saul/Paul (Ap)")).toEqual(["Saul (Ap)", "Paul (Ap)"]);
      expect(splitFlipName("Banks of the Nile/Pharaoh's Court")).toEqual([
        "Banks of the Nile",
        "Pharaoh's Court",
      ]);
      expect(splitFlipName("Magicians' Staves/Magicians' Snakes")).toEqual([
        "Magicians' Staves",
        "Magicians' Snakes",
      ]);
    });

    test("ignores slashes embedded strictly within parentheses or brackets", () => {
      expect(splitFlipName("Outsiders (Black/Gold) (RoJ AB)")).toBeNull();
      expect(splitFlipName("Priests of Dagon [Gold/Brown]")).toBeNull();
    });

    test("correctly parses modern dual cards and distributes suffix to both sides", () => {
      expect(
        splitFlipName("Amminadab, the Generous / Amminadab, the Gracious (LoC)")
      ).toEqual([
        "Amminadab, the Generous (LoC)",
        "Amminadab, the Gracious (LoC)",
      ]);

      expect(
        splitFlipName("Mary, Mother of James / Mary, the Caregiver (GoC)")
      ).toEqual([
        "Mary, Mother of James (GoC)",
        "Mary, the Caregiver (GoC)",
      ]);

      expect(
        splitFlipName("Azor, the Recusant / Azor, the Submissive [LoC]")
      ).toEqual([
        "Azor, the Recusant [LoC]",
        "Azor, the Submissive [LoC]",
      ]);
    });

    test("handles dual card names without suffix", () => {
      expect(splitFlipName("Aaron / Moses")).toEqual(["Aaron", "Moses"]);
    });

    test("returns null for non-dual names or multiple slashes", () => {
      expect(splitFlipName("Egyptian Horsemen")).toBeNull();
      expect(splitFlipName("Alpha / Beta / Gamma")).toBeNull();
    });
  });

  describe("isDualSided", () => {
    test("detects dual-sided card objects and strings", () => {
      expect(isDualSided({ sides: [{ Name: "A" }, { Name: "B" }] })).toBe(true);
      expect(isDualSided({ CardSides: { bottom: { Name: "B" } } })).toBe(true);
      expect(isDualSided("Amminadab, the Generous / Amminadab, the Gracious (LoC)")).toBe(true);
      expect(isDualSided("Saul/Paul")).toBe(true);
    });

    test("returns false for Lost Souls and single-sided cards", () => {
      expect(isDualSided("Lost Soul [James 4:6 / Proverbs 3:34 - RoJ]")).toBe(false);
      expect(isDualSided("Outsiders (Black/Gold) (RoJ AB)")).toBe(false);
      expect(isDualSided("Egyptian Horsemen")).toBe(false);
    });
  });

  describe("CardRepository.get integration", () => {
    beforeAll(() => {
      const mockDatabase = [
        {
          id: "-622696180",
          Name: "Amminadab, the Generous (LoC)",
          sides: [
            { Name: "Amminadab, the Generous (LoC)" },
            { Name: "Amminadab, the Gracious (LoC)" },
          ],
        },
        {
          id: "201",
          Name: "Saul",
          sides: [{ Name: "Saul" }, { Name: "Paul" }],
        },
        {
          id: "301",
          Name: "Outsiders (Black/Gold) (RoJ AB)",
        },
        {
          id: "401",
          Name: "Lost Soul [James 4:6 / Proverbs 3:34 - RoJ]",
        },
      ];
      CardRepository.initialize(mockDatabase);
    });

    test("retrieves card by composite dual name", () => {
      const card = CardRepository.get(
        "Amminadab, the Generous / Amminadab, the Gracious (LoC)"
      );
      expect(card).toBeDefined();
      expect(card.id).toBe("-622696180");
    });

    test("retrieves card by either side name directly", () => {
      const top = CardRepository.get("Amminadab, the Generous (LoC)");
      const bot = CardRepository.get("Amminadab, the Gracious (LoC)");
      expect(top).toBeDefined();
      expect(bot).toBeDefined();
      expect(top.id).toBe("-622696180");
      expect(bot.id).toBe("-622696180");
    });

    test("retrieves legacy dual cards via splitFlipName fallback", () => {
      const card = CardRepository.get("Saul/Paul");
      expect(card).toBeDefined();
      expect(card.id).toBe("201");
    });

    test("retrieves single-sided cards with slash in parens without misinterpreting", () => {
      const card = CardRepository.get("Outsiders (Black/Gold) (RoJ AB)");
      expect(card).toBeDefined();
      expect(card.id).toBe("301");
    });

    test("retrieves Lost Soul citations with slash without misinterpreting", () => {
      const card = CardRepository.get("Lost Soul [James 4:6 / Proverbs 3:34 - RoJ]");
      expect(card).toBeDefined();
      expect(card.id).toBe("401");
    });
  });
});
