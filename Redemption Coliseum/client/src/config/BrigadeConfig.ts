/**
 * Configuration mapping for brigade filter IDs to their hexadecimal color values.
 * Used by the DeckEditor to render compact colored circles.
 */
export const BRIGADE_COLORS: Record<string, number> = {
  // Good / Neutral Brigades
  "Blue": 0x0030AD,
  "Clay": 0xDBA4A2,
  "Gold Good": 0xFFD64B,
  "Green": 0x00A436,
  "Purple": 0x9C128E,
  "Red": 0xE8000C,
  "Silver": 0xBDC3C3,
  "Teal": 0xBDC3C3,
  "White": 0xffffff,
  "Multi Good": 0xe5c158,

  // Evil Brigades
  "Black": 0x000000,
  "Brown": 0x7F4601,
  "Crimson": 0xEF008A,
  "Gold Evil": 0xFED458,
  "Gray": 0x969696,
  "Orange": 0xEF8800,
  "Pale Green": 0xCAE59F,
  "Multi Evil": 0xa87e3b,
};

export interface SpecialBrigadeDef {
  textureKey: string;
  colors: string[];
}

export const SPECIAL_BRIGADES: Record<string, SpecialBrigadeDef> = {
  "Multi Good": {
    textureKey: "brigade-multi-good",
    colors: ["#F5A7B8", "#F5C39D", "#F7E1A1", "#CBE5A3", "#B5D6EB"]
  },
  "Multi Evil": {
    textureKey: "brigade-multi-evil",
    colors: ["#7C1E4E", "#A04A26", "#8F8226", "#3A7346", "#2D5A8C"]
  }
};

export const GOOD_BRIGADES = [
  "Blue",
  "Clay",
  "Gold",
  "Green",
  "Purple",
  "Red",
  "Silver",
  "Teal",
  "White",
  "Multi"
];

export const EVIL_BRIGADES = [
  "Black",
  "Brown",
  "Crimson",
  "Gold",
  "Gray",
  "Orange",
  "Pale Green",
  "Multi"
];
export const TROPHY_THRESHOLDS = {
  BRONZE: 15,
  SILVER: 30,
  GOLD: 45,
};

export const TIER_CONFIG = [
  { id: "tier_gold", name: "Gold Tier", minWins: 45, bgImage: "assets/backgrounds/Gold.jpg", colorHex: 0xffd700 },
  { id: "tier_silver", name: "Silver Tier", minWins: 30, bgImage: "assets/backgrounds/Silver.jpg", colorHex: 0xc0c0c0 },
  { id: "tier_bronze", name: "Bronze Tier", minWins: 15, bgImage: "assets/backgrounds/Bronze.jpg", colorHex: 0xcd7f32 },
  { id: "tier_stone", name: "Stone Tier", minWins: 0, bgImage: "assets/backgrounds/stocksnap-grey-2620586_640.jpg", colorHex: 0x808080 },
];
