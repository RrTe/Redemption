const path = require("path");
const fs = require("fs");

const cardDataPath = path.join(__dirname, "../../../shared/carddata.json");
const cardDatabase = JSON.parse(fs.readFileSync(cardDataPath, "utf-8")).cards;

module.exports = { cardDatabase };