const fs = require("fs");
const path = require("path");
const cardHierarchyJson = require("../../shared/cardHierarchy.json");
const astConstantsJson = require("../../shared/ast_constants.json");
const {
  getValidCardGenders,
  isCharacterSideType,
  resolveActiveSideIndex,
} = require("../../shared/cardHierarchy");
const { AST_GENDERS, CARD_GENDERS, AST_ACTIONS } = require("../../shared/astConstants");
const { normalizeCard } = require("../../shared/utils");
const { CardRepository } = require("../../shared/CardRepository");
const { GenderEvaluator } = require("../../shared/rules/GenderEvaluator");
const { ProtectionService } = require("../../shared/rules/ProtectionService");
const { ZONES } = require("../../shared/zones");
const { Card } = require("../src/state/Card");
const { cardDatabase } = require("../src/data/cardDatabase");
const { TargetSelectionService } = require("../src/ast/TargetSelectionService");
const { ConditionEvaluator } = require("../src/ast/ConditionEvaluator");
const { AbilityLookup } = require("../src/ast/AbilityLookup");
const { AbilityResolver } = require("../src/ast/AbilityResolver");

const cardsExtendedPath = path.join(__dirname, "../../shared/cards_extended_with_ordir_fuzzy.json");
const cardsLogicPath = path.join(__dirname, "../../shared/cards_logic.json");
const rawExtendedCards = JSON.parse(fs.readFileSync(cardsExtendedPath, "utf8")).cards;
const rawLogicMap = JSON.parse(fs.readFileSync(cardsLogicPath, "utf8"));

const CHARACTER_SIDE_TYPES_SET = new Set([
  "Hero",
  "Evil Character",
  "Character",
  "Hero Token",
  "Evil Character Token",
  "DAC",
]);

function findRawCardByName(nameFragment) {
  return rawExtendedCards.find((c) => {
    const s = c.CardSides || {};
    return [s.shared?.Name, s.top?.Name, s.bottom?.Name].some(
      (n) => n && n.includes(nameFragment)
    );
  });
}

describe("Typed Gender Attribute Integration (ORDIR 7.0.0 & AST)", () => {
  beforeAll(() => {
    CardRepository.initialize(cardDatabase);
  });

  describe("1. Constants, Taxonomy & Upstream Dataset Contracts", () => {
    test("cardHierarchy.json and ast_constants.json expose expected gender sets", () => {
      expect(cardHierarchyJson.genders).toEqual(["male", "female", "both", "genderless"]);
      expect(getValidCardGenders()).toEqual(["male", "female", "both", "genderless"]);
      expect(Object.values(CARD_GENDERS)).toEqual(["male", "female", "both", "genderless"]);

      expect(astConstantsJson.genders).toEqual(["male", "female"]);
      expect(Object.values(AST_GENDERS)).toEqual(["male", "female"]);
    });

    test("isCharacterSideType covers character types including DAC and excludes non-characters", () => {
      for (const typeName of CHARACTER_SIDE_TYPES_SET) {
        expect(isCharacterSideType(typeName)).toBe(true);
      }
      for (const nonChar of ["GE", "EE", "Fortress", "Site", "Artifact", "Dominant", "Lost Soul", "Lost Soul Token", "Curse", "Covenant"]) {
        expect(isCharacterSideType(nonChar)).toBe(false);
      }
    });

    test("cards_extended_with_ordir_fuzzy.json places Gender exclusively on character sides", () => {
      for (const raw of rawExtendedCards) {
        const sides = raw.CardSides || {};
        for (const [key, sideObj] of Object.entries(sides)) {
          if (!sideObj || !sideObj.Gender) continue;
          expect(cardHierarchyJson.genders).toContain(sideObj.Gender);
          const resolvedType = sideObj.Type || sides.shared?.Type;
          if (key === "shared") {
            const namedSides = Object.entries(sides).filter(([k]) => k !== "shared");
            expect(namedSides.length).toBeGreaterThan(0);
            for (const [, concreteSide] of namedSides) {
              expect(isCharacterSideType(concreteSide?.Type || resolvedType)).toBe(true);
            }
          } else {
            expect(isCharacterSideType(resolvedType)).toBe(true);
          }
        }
      }
    });

    test("cards_logic.json removes isolated male/female identifiers and omits shared.gender on mixed duals", () => {
      const findIsolatedGenderIdentifiers = (sel) => {
        if (!sel || !Array.isArray(sel.identifiers)) return [];
        return sel.identifiers.filter((id) => {
          const norm = String(id).trim().toLowerCase();
          return norm === "male" || norm === "female";
        });
      };

      const badSelectors = [];
      for (const [cardId, entry] of Object.entries(rawLogicMap)) {
        for (const side of Object.values(entry.sides || {})) {
          for (const ab of side.abilities || []) {
            if (ab.trigger_filter && findIsolatedGenderIdentifiers(ab.trigger_filter).length > 0) {
              badSelectors.push({ cardId, where: "trigger_filter" });
            }
            for (const c of ab.conditions || []) {
              if (c.selector && findIsolatedGenderIdentifiers(c.selector).length > 0) {
                badSelectors.push({ cardId, where: "condition" });
              }
            }
            for (const cost of ab.costs || []) {
              if (cost.target && findIsolatedGenderIdentifiers(cost.target).length > 0) {
                badSelectors.push({ cardId, where: "cost" });
              }
            }
            for (const eff of ab.effects || []) {
              if (eff.target && findIsolatedGenderIdentifiers(eff.target).length > 0) {
                badSelectors.push({ cardId, where: "effect" });
              }
              for (const cs of eff.protection_filter?.card_sources || []) {
                if (findIsolatedGenderIdentifiers(cs).length > 0) {
                  badSelectors.push({ cardId, where: "card_sources" });
                }
              }
            }
          }
        }
      }
      expect(badSelectors).toEqual([]);

      // Behemoth (RoJ AB): mixed dual (GE + Evil Character) with only sides.shared in AST
      const behemothAst = rawLogicMap["-1646887871"];
      expect(behemothAst.sides.shared).toBeDefined();
      expect(behemothAst.sides.shared.gender).toBeUndefined();
    });
  });

  describe("2. normalizeCard, Colyseus Clone & Active Side Resolution", () => {
    test("normalizes single-sided, dual-gender 'both', pure dual, and mixed dual cards without leaking Gender to non-character sides", () => {
      // Single-sided male Hero: Amram, Moses' Father (Roots)
      const amramRaw = findRawCardByName("Amram, Moses' Father (Roots)");
      const amram = normalizeCard(amramRaw);
      expect(amram.Gender).toBe(CARD_GENDERS.MALE);
      expect(amram.sides[0].Gender).toBe(CARD_GENDERS.MALE);

      // Single-sided 'both': Moses' Parents
      const mosesParentsRaw = rawExtendedCards.find((c) => c.CardSides?.top?.Name === "Moses' Parents");
      const mosesParents = normalizeCard(mosesParentsRaw);
      expect(mosesParents.Gender).toBe(CARD_GENDERS.BOTH);
      expect(mosesParents.sides[0].Gender).toBe(CARD_GENDERS.BOTH);

      // Pure dual identical-gender Hero: Abihud, the Progeny / Exilarch (LoC)
      const abihudRaw = findRawCardByName("Abihud, the Progeny (LoC)");
      const abihud = normalizeCard(abihudRaw);
      expect(abihud.Gender).toBe(CARD_GENDERS.MALE);
      expect(abihud.sides).toHaveLength(2);
      expect(abihud.sides[0].Gender).toBe(CARD_GENDERS.MALE);
      expect(abihud.sides[1].Gender).toBe(CARD_GENDERS.MALE);

      // Mixed dual: Assyrian Camp (LoC) -> top Evil Character (male), bottom Fortress (empty)
      const assyrianRaw = rawExtendedCards.find((c) => String(c.Id) === "-1270964017");
      const assyrian = normalizeCard(assyrianRaw);
      expect(assyrian.Gender).toBe("");
      expect(assyrian.sides[0].Type).toBe("Evil Character");
      expect(assyrian.sides[0].Gender).toBe(CARD_GENDERS.MALE);
      expect(assyrian.sides[1].Type).toBe("Fortress");
      expect(assyrian.sides[1].Gender).toBe("");

      // Mixed dual: Behemoth (RoJ AB) -> top GE (empty), bottom Evil Character (male)
      const behemothRaw = rawExtendedCards.find((c) => String(c.Id) === "-1646887871");
      const behemoth = normalizeCard(behemothRaw);
      expect(behemoth.Gender).toBe("");
      expect(behemoth.sides[0].Type).toBe("GE");
      expect(behemoth.sides[0].Gender).toBe("");
      expect(behemoth.sides[1].Type).toBe("Evil Character");
      expect(behemoth.sides[1].Gender).toBe(CARD_GENDERS.MALE);

      // Non-character card: Sanctifying Faith (GE)
      const sfRaw = rawExtendedCards.find((c) => String(c.Id) === "454610515");
      const sf = normalizeCard(sfRaw);
      expect(sf.Gender).toBe("");
      expect(sf.sides[0].Gender).toBe("");
    });

    test("resolves Gender accurately after Colyseus Card.clone() via schema and CardRepository fallback", () => {
      const schemaCard = new Card();
      schemaCard.id = "inst_assyrian";
      schemaCard.templateId = "-1270964017"; // Assyrian Camp (LoC)
      schemaCard.zone = ZONES.TERRITORY;
      schemaCard.inGameType = "Fortress";
      schemaCard.inGameAlignment = "Evil";

      const cloned = schemaCard.clone();
      // Non-schema properties like sides are absent after clone(), must resolve via CardRepository + inGameType
      expect(cloned.sides).toBeUndefined();
      expect(GenderEvaluator.resolveCardGender(cloned)).toBeNull();

      cloned.inGameType = "Evil Character";
      expect(GenderEvaluator.resolveCardGender(cloned)).toBe(CARD_GENDERS.MALE);

      // Single-sided schema field also survives clone directly
      const monoCard = new Card();
      monoCard.id = "inst_both";
      monoCard.Name = "Moses' Parents";
      monoCard.Type = "Hero";
      monoCard.Gender = CARD_GENDERS.BOTH;
      const clonedMono = monoCard.clone();
      expect(clonedMono.Gender).toBe(CARD_GENDERS.BOTH);
      expect(GenderEvaluator.resolveCardGender(clonedMono)).toBe(CARD_GENDERS.BOTH);
    });

    test("resolveActiveSideIndex distinguishes same-alignment mixed duals by inGameType", () => {
      const assyrian = CardRepository.getById("-1270964017");
      expect(resolveActiveSideIndex({ inGameType: "Evil Character", inGameAlignment: "Evil" }, assyrian.sides)).toBe(0);
      expect(resolveActiveSideIndex({ inGameType: "Fortress", inGameAlignment: "Evil" }, assyrian.sides)).toBe(1);
    });
  });

  describe("3. ORDIR 7.0.0 Matching Semantics & TargetSelectionService", () => {
    test("matchesGender follows ORDIR 7.0.0 truth table for male, female, both, genderless, and unrestricted selectors", () => {
      const maleHero = { id: "h_m", Type: "Hero", Alignment: "Good", Gender: "male" };
      const femaleHero = { id: "h_f", Type: "Hero", Alignment: "Good", Gender: "female" };
      const bothHero = { id: "h_b", Type: "Hero", Alignment: "Good", Gender: "both" };
      const genderlessHero = { id: "h_g", Type: "Hero", Alignment: "Good", Gender: "genderless" };
      const fort = { id: "fort", Type: "Fortress", Alignment: "Evil" };

      // selector.gender = "male" -> male & both only
      expect(GenderEvaluator.matchesGender(maleHero, AST_GENDERS.MALE)).toBe(true);
      expect(GenderEvaluator.matchesGender(bothHero, AST_GENDERS.MALE)).toBe(true);
      expect(GenderEvaluator.matchesGender(femaleHero, AST_GENDERS.MALE)).toBe(false);
      expect(GenderEvaluator.matchesGender(genderlessHero, AST_GENDERS.MALE)).toBe(false);
      expect(GenderEvaluator.matchesGender(fort, AST_GENDERS.MALE)).toBe(false);

      // selector.gender = "female" -> female & both only
      expect(GenderEvaluator.matchesGender(femaleHero, AST_GENDERS.FEMALE)).toBe(true);
      expect(GenderEvaluator.matchesGender(bothHero, AST_GENDERS.FEMALE)).toBe(true);
      expect(GenderEvaluator.matchesGender(maleHero, AST_GENDERS.FEMALE)).toBe(false);
      expect(GenderEvaluator.matchesGender(genderlessHero, AST_GENDERS.FEMALE)).toBe(false);
      expect(GenderEvaluator.matchesGender(fort, AST_GENDERS.FEMALE)).toBe(false);

      // selector.gender unset -> matches all
      expect(GenderEvaluator.matchesGender(maleHero, undefined)).toBe(true);
      expect(GenderEvaluator.matchesGender(femaleHero, null)).toBe(true);
      expect(GenderEvaluator.matchesGender(bothHero, undefined)).toBe(true);
      expect(GenderEvaluator.matchesGender(genderlessHero, undefined)).toBe(true);
      expect(GenderEvaluator.matchesGender(fort, undefined)).toBe(true);
    });

    test("evaluates mixed dual cards coherently in play and out of play in TargetSelectionService", () => {
      const behemothRepo = CardRepository.getById("-1646887871");
      const assyrianRepo = CardRepository.getById("-1270964017");

      // In play as Fortress (Assyrian Camp): NOT a male character even for generic target_type: "card"
      const assyrianFortInPlay = {
        ...assyrianRepo,
        id: "ac_fort",
        templateId: "-1270964017",
        zone: ZONES.TERRITORY,
        inGameType: "Fortress",
        inGameAlignment: "Evil",
      };
      expect(TargetSelectionService.matchesFilter(assyrianFortInPlay, { target_type: "card", gender: "male" })).toBe(false);

      // In play as Evil Character (Assyrian Camp): IS a male Evil Character
      const assyrianCharInPlay = {
        ...assyrianRepo,
        id: "ac_char",
        templateId: "-1270964017",
        zone: ZONES.BATTLEFIELD,
        inGameType: "Evil Character",
        inGameAlignment: "Evil",
      };
      expect(TargetSelectionService.matchesFilter(assyrianCharInPlay, { target_type: "evil_character", alignment: "evil", gender: "male" })).toBe(true);

      // Out of play in Deck (Behemoth): matches { evil_character, evil, male } on bottom side
      const behemothInDeck = { ...behemothRepo, id: "beh_deck", templateId: "-1646887871", zone: ZONES.DECK };
      expect(TargetSelectionService.matchesFilter(behemothInDeck, {
        scope: ["deck"],
        target_type: "evil_character",
        alignment: "evil",
        gender: "male",
      })).toBe(true);

      // Out of play in Deck (Behemoth): must NOT cross-match Good alignment from top GE with male Gender from bottom EC
      expect(TargetSelectionService.matchesFilter(behemothInDeck, {
        scope: ["deck"],
        target_type: "card",
        alignment: "good",
        gender: "male",
      })).toBe(false);

      // _isPileTargeting returns false for deck/discard search selectors filtering by gender (Angel at Shur, Midwives)
      expect(TargetSelectionService._isPileTargeting(["deck"], "hero", { target_type: "hero", gender: "male" })).toBe(false);
    });

    test("evaluates ConditionEvaluator zone_check with selector.gender (e.g. female female condition)", () => {
      const mosesParentsInPlay = {
        ...CardRepository.get(normalizeCard(rawExtendedCards.find((c) => c.CardSides?.top?.Name === "Moses' Parents")).id),
        id: "mp_1",
        zone: ZONES.TERRITORY,
        controllerId: "p1",
        inGameType: "Hero",
        inGameAlignment: "Good",
      };
      const maleOnly = {
        id: "m_1",
        Name: "David",
        Type: "Hero",
        inGameType: "Hero",
        Alignment: "Good",
        inGameAlignment: "Good",
        Gender: "male",
        zone: ZONES.TERRITORY,
        controllerId: "p1",
      };
      const mockRoom = {
        state: {
          players: new Map([
            ["p1", { sessionId: "p1", territory: [mosesParentsInPlay, maleOnly], hand: [] }],
          ]),
          battlefield: [],
        },
      };

      const conditionFemale = {
        condition_type: "zone_check",
        selector: {
          selection_mode: "automatic_all",
          zone_owner: "controller",
          scope: ["in_play"],
          target_type: "hero",
          alignment: "good",
          gender: "female",
        },
        operator: ">=",
        value: 1,
      };
      // Moses' Parents has Gender "both", so satisfies female >= 1
      expect(ConditionEvaluator.evaluate([conditionFemale], { room: mockRoom, player: mockRoom.state.players.get("p1") }).valid).toBe(true);

      // Removing Moses' Parents leaves only male Hero -> condition fails
      mockRoom.state.players.get("p1").territory = [maleOnly];
      expect(ConditionEvaluator.evaluate([conditionFemale], { room: mockRoom, player: mockRoom.state.players.get("p1") }).valid).toBe(false);
    });

    test("evaluates relational 'opposite gender' identifier (Sanctifying Faith)", () => {
      const sfTargetDef = rawLogicMap["454610515"].sides.top.abilities[0].effects[0].target;
      const maleHeroRef = { id: "ref_m", Name: "Peter", Type: "Hero", inGameType: "Hero", Alignment: "Good", Gender: "male" };
      const femaleEC = { id: "ec_f", Name: "Delilah", Type: "Evil Character", inGameType: "Evil Character", Alignment: "Evil", Gender: "female", zone: ZONES.BATTLEFIELD };
      const maleEC = { id: "ec_m", Name: "Pharaoh", Type: "Evil Character", inGameType: "Evil Character", Alignment: "Evil", Gender: "male", zone: ZONES.BATTLEFIELD };
      const bothEC = { id: "ec_b", Name: "Dual Gender Pair", Type: "Evil Character", inGameType: "Evil Character", Alignment: "Evil", Gender: "both", zone: ZONES.BATTLEFIELD };
      const genderlessHumanMock = { id: "ec_gl", Name: "Robot", Type: "Evil Character", inGameType: "Evil Character", Alignment: "Evil", Gender: "genderless", zone: ZONES.BATTLEFIELD };

      expect(TargetSelectionService.matchesFilter(femaleEC, sfTargetDef, { referenceCard: maleHeroRef })).toBe(true);
      expect(TargetSelectionService.matchesFilter(bothEC, sfTargetDef, { referenceCard: maleHeroRef })).toBe(true);
      expect(TargetSelectionService.matchesFilter(maleEC, sfTargetDef, { referenceCard: maleHeroRef })).toBe(false);
      expect(TargetSelectionService.matchesFilter(genderlessHumanMock, sfTargetDef, { referenceCard: maleHeroRef })).toBe(false);
    });

    test("resolveEligibleTargets evaluates costs[].target gender filters (e.g. release female Hero from Land of Bondage)", () => {
      const costTargetDef = rawLogicMap["608762820"].sides.top.abilities[1].costs[0].target;
      const maleCaptured = { id: "cap_m", Name: "Peter", Type: "Hero", Alignment: "Good", Gender: "male", zone: ZONES.LAND_OF_BONDAGE, controllerId: "p2" };
      const femaleCaptured = { id: "cap_f", Name: "Mary", Type: "Hero", Alignment: "Good", Gender: "female", zone: ZONES.LAND_OF_BONDAGE, controllerId: "p2" };
      const bothCaptured = { id: "cap_b", Name: "Moses' Parents", Type: "Hero", Alignment: "Good", Gender: "both", zone: ZONES.LAND_OF_BONDAGE, controllerId: "p2" };
      const genderlessCaptured = { id: "cap_g", Name: "Golem", Type: "Hero", Alignment: "Good", Gender: "genderless", zone: ZONES.LAND_OF_BONDAGE, controllerId: "p2" };

      const mockRoom = {
        state: {
          players: new Map([
            ["p1", { sessionId: "p1", land_of_bondage: [] }],
            ["p2", { sessionId: "p2", land_of_bondage: [maleCaptured, femaleCaptured, bothCaptured, genderlessCaptured] }],
          ]),
          battlefield: [],
        },
      };

      const res = TargetSelectionService.resolveEligibleTargets(mockRoom, mockRoom.state.players.get("p1"), costTargetDef);
      expect(res.eligibleCardIds).toEqual(["cap_f", "cap_b"]);
    });
  });

  describe("4. ProtectionService (Gender card_sources & Exception Clauses)", () => {
    test("matchesSource blocks matching gender + 'both' and excludes genderless/opposite gender (Beast from the Earth)", () => {
      const beastSourceDef = rawLogicMap["1456858680"].sides.top.abilities[0].effects[0].protection_filter.card_sources[0];
      const protectedEvil = { id: "e1", controllerId: "p1", Alignment: "Evil", isProtected: true, _protection: { card_sources: [beastSourceDef] } };

      const femaleHero = { id: "h_f", controllerId: "p2", Type: "Hero", inGameType: "Hero", Alignment: "Good", Gender: "female" };
      const maleHero = { id: "h_m", controllerId: "p2", Type: "Hero", inGameType: "Hero", Alignment: "Good", Gender: "male" };
      const bothHero = { id: "h_b", controllerId: "p2", Type: "Hero", inGameType: "Hero", Alignment: "Good", Gender: "both" };
      const genderlessHero = { id: "h_g", controllerId: "p2", Type: "Hero", inGameType: "Hero", Alignment: "Good", Gender: "genderless" };

      expect(ProtectionService.isProtected(protectedEvil, femaleHero, AST_ACTIONS.DISCARD)).toBe(true);
      expect(ProtectionService.isProtected(protectedEvil, bothHero, AST_ACTIONS.DISCARD)).toBe(true);
      expect(ProtectionService.isProtected(protectedEvil, maleHero, AST_ACTIONS.DISCARD)).toBe(false);
      expect(ProtectionService.isProtected(protectedEvil, genderlessHero, AST_ACTIONS.DISCARD)).toBe(false);

      // REG v11.1.0 moved Scarlet Line's block-restriction rule from protect to static paralyze targeting male characters
      const scarletLineEffect = rawLogicMap["732467072"].sides.top.abilities[0].effects[0];
      expect(scarletLineEffect.action).toBe(AST_ACTIONS.PARALYZE);
      expect(scarletLineEffect.target.gender).toBe(AST_GENDERS.MALE);
    });

    test("Lost Soul Jeremiah 7:18 (Female Only) blocks male/genderless Heroes while allowing female, both, and Son of God", () => {
      const jeremiahFilter = rawLogicMap["1163275753"].sides.top.abilities[0].effects[0].protection_filter;
      const jeremiahLS = {
        id: "ls_jer",
        Name: "Lost Soul Jeremiah 7:18 (Female Only) (H)",
        Type: "Lost Soul",
        controllerId: "p2",
        isProtected: true,
        _protection: jeremiahFilter,
      };

      const maleHero = { id: "h_m", controllerId: "p1", Type: "Hero", inGameType: "Hero", Alignment: "Good", Gender: "male" };
      const femaleHero = { id: "h_f", controllerId: "p1", Type: "Hero", inGameType: "Hero", Alignment: "Good", Gender: "female" };
      const bothHero = { id: "h_b", controllerId: "p1", Type: "Hero", inGameType: "Hero", Alignment: "Good", Gender: "both" };
      const genderlessHero = { id: "h_g", controllerId: "p1", Type: "Hero", inGameType: "Hero", Alignment: "Good", Gender: "genderless" };
      const sonOfGod = { id: "sog", templateId: "-1070125806", controllerId: "p1", Name: "Son of God", Type: "Dominant", Alignment: "Good" };

      expect(ProtectionService.isProtected(jeremiahLS, maleHero, "rescue")).toBe(true);
      expect(ProtectionService.isProtected(jeremiahLS, genderlessHero, "rescue")).toBe(true);
      expect(ProtectionService.isProtected(jeremiahLS, femaleHero, "rescue")).toBe(false);
      expect(ProtectionService.isProtected(jeremiahLS, bothHero, "rescue")).toBe(false);
      expect(ProtectionService.isProtected(jeremiahLS, sonOfGod, "rescue")).toBe(false);

      // Non-rescue actions remain unaffected by rescue-only protection
      expect(ProtectionService.isProtected(jeremiahLS, maleHero, AST_ACTIONS.DISCARD)).toBe(false);
    });
  });

  describe("5. AbilityLookup Side Resolution & AbilityResolver Formatting", () => {
    test("AbilityLookup resolves active side for same-alignment mixed duals and falls back to CardSides for Behemoth", () => {
      // Assyrian Camp (LoC) has top (Evil Character) and bottom (Fortress)
      const topAbilities = AbilityLookup.resolveAbilities("-1270964017", { inGameType: "Evil Character", inGameAlignment: "Evil" });
      const bottomAbilities = AbilityLookup.resolveAbilities("-1270964017", { inGameType: "Fortress", inGameAlignment: "Evil" });
      expect(topAbilities[0].ability_id).toBe("assyrian_camp_prevent_multi");
      expect(bottomAbilities[0].ability_id).toBe("assyrian_camp_negate_effect");

      expect(AbilityLookup.getSideGender("-1270964017", { inGameType: "Evil Character", inGameAlignment: "Evil" })).toBe("male");
      expect(AbilityLookup.getSideGender("-1270964017", { inGameType: "Fortress", inGameAlignment: "Evil" })).toBeNull();

      // Behemoth (RoJ AB) has only sides.shared without gender in cards_logic.json
      expect(AbilityLookup.getSideGender("-1646887871", { inGameType: "GE", inGameAlignment: "Good" })).toBeNull();
      expect(AbilityLookup.getSideGender("-1646887871", { inGameType: "Evil Character", inGameAlignment: "Evil" })).toBe("male");
    });

    test("AbilityResolver prompt formatters surface target.gender cleanly", () => {
      const resolver = new AbilityResolver({ state: {} });
      expect(
        resolver._formatTargetPhrase({ target_type: "hero", alignment: "good", gender: "female" })
      ).toBe("good female hero");
      expect(
        resolver._formatBandActionText({
          target_type: "hero",
          testament: "OT",
          gender: "female",
          count: { fixed_value: 2 },
        })
      ).toBe("Band to 2 O.T. female heroes");
      expect(
        resolver._formatBandActionText({
          target_type: "character",
          gender: "male",
          identifiers: ["Human"],
          count: { fixed_value: 1 },
        })
      ).toBe("Band to a male Human character");
    });
  });
});
