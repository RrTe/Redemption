const path = require("path");
const fs = require("fs");
const { normalizeCard } = require("../../../shared/utils");

const cardDataPath = path.join(__dirname, "../../../shared/cards_extended_with_ordir_fuzzy.json");
const rawData = JSON.parse(fs.readFileSync(cardDataPath, "utf-8")).cards;
const cardDatabase = rawData.map(normalizeCard);

module.exports = { cardDatabase };