# Hybrid Semantic Ability Audit Report

Evaluated via offline sentence embeddings (`all-MiniLM-L6-v2`) and factual game-mechanic matrix.

## Summary Metrics
- **Total Cards Audited:** 45
- **High Fidelity (>= 0.82):** 24 (53.3%)
- **Moderate Fidelity (0.68 - 0.81):** 12 (26.7%)
- **Review Required (< 0.68 or Fact Invariant Failure):** 9 (20.0%)

---
## Review Required Cards (Prioritized for Inspection)

### A Mighty Blow (Score: 0.678)
- **Original:** *"This card is worth 10/0 if a demon is in battle."*
- **Decompiled:** *"If a all your evil in battle is in battle all your character in play is worth +10/0."*

### Abandonment (L) (Score: 0.53)
- **Original:** *"Evil Character repels Red Brigade."*
- **Decompiled:** *"ignore all evil character in play."*

### Abdon (Score: 0.459)
- **Original:** *"This Hero may use good Enhancements with a Judges reference, regardless of color. Cannot be negated."*
- **Decompiled:** *"Cannot be negated."*

### Abducted Subjects (LoC) (Score: 0.464)
- **Original:** *"Capture a human (or 2 humans if used by an Edomite) to a player."*
- **Decompiled:** *"You may capture 1 opponent's character in play. If Abducted Subjects is in play You may capture 2 opponent's character in play."*

### Abel's Sacrifice (Score: 0.373)
- **Original:** *"Abel's Sacrifice and all good enhancements played after it this turn may not be interrupted or prevented."*
- **Decompiled:** *"Cannot be interrupted. Cannot be prevented."*

### Abiathar (1st Print - K) (Score: 0.649)
- **Original:** *"You may look at a hand or take a good O.T. card from Reserve."*
- **Decompiled:** *"You may reveal all opponent's cards from hand. You may search 1 your good from Reserve."*

### Abiathar [K] (Score: 0.644)
- **Original:** *"You may look at a hand or take a good O.T. card from Reserve."*
- **Decompiled:** *"You may reveal all opponent's cards from hand. You may search 1 good from Reserve."*

### Abiezer (Ki) (Score: 0.269)
- **Original:** *"Hero is immune to Crimson Brigade."*
- **Decompiled:** *"protect Abiezer (Ki)."*

### Abiezer (Wa) (Score: 0.214)
- **Original:** *"Hero is immune to Crimson Brigade."*
- **Decompiled:** *"protect Abiezer (Wa)."*

---
## High Fidelity Samples (Top Mechanical Alignment)

- **A Roman Soldier's Faith** (Score: 0.877):
  - *Orig:* "Heal any Hero in play."
  - *AST:*  "heal 1 good hero in play."
- **Aaron (Di)** (Score: 0.884):
  - *Orig:* "Protect your Tabernacle artifacts from opponents' cards.  May band to an Exodus or Leviticus Hero.  Cannot be negated by a good card."
  - *AST:*  "protect all your Tabernacle artifact in play. You may band 1 your good Exodus Leviticus hero in territory."
- **Aaron (Pa)** (Score: 0.882):
  - *Orig:* "May band to Miriam.  Holy of Holies cannot be discarded while Aaron is in play."
  - *AST:*  "You may band Miriam. If Aaron is in play protect Holy of Holies. Instead."
- **Aaron, God's Mediator** (Score: 0.837):
  - *Orig:* "(Star) Look at the bottom 10 cards of deck: Topdeck an Exodus card or a Dominant. (Hero) May band to an Exodus human or a Tabernacle priest. Cannot be negated."
  - *AST:*  "look 10 your cards from deck, topdeck 1 your Exodus Dominant. You may band 1 your Exodus Human Tabernacle priest in territory. Cannot be negated."
- **Aaron's Rod (G)** (Score: 0.863):
  - *Orig:* "All evil enhancement cards now in play must be discarded. Cannot be prevented, interrupted, or negated."
  - *AST:*  "discard all evil enhancement in play. Cannot be prevented. Cannot be interrupted. Cannot be negated."
- **Aaron's Rod (L)** (Score: 0.832):
  - *Orig:* "All evil enhancement cards now in play must be discarded."
  - *AST:*  "discard all evil enhancement in play."
- **A New Beginning (FoM)** (Score: 0.847):
  - *Orig:* "Negate protect abilities. If it is your turn banish this card: Shuffle all cards in play, set-aside, and hands. Each player must draw 8. Begin a new turn."
  - *AST:*  "negate all protect ability in play until end of phase. If is turn of banish A New Beginning, shuffle all card in play, shuffle all card, shuffle all card from hand, draw 8 card from deck, begin a new phase a card."
- **A New Creation** (Score: 0.826):
  - *Orig:* "If all your Heroes are clay, you may remove your discard pile and this card from the game to convert a human Evil Character to a clay hero."
  - *AST:*  "If a all your good clay hero in territory is in territory remove from the game all your cards from discard pile, remove from the game A New Creation, convert 1 opponent's evil human evil character in battle."
- **Aaron and Miriam's Dissent** (Score: 0.859):
  - *Orig:* "Decrease all O.T. heroes in play by 2/2 until the end of the turn."
  - *AST:*  "decrease all good O.T. hero in play -2/-2 this turn."
- **Aaron's Rod (UL)** (Score: 0.832):
  - *Orig:* "All evil enhancement cards now in play must be discarded."
  - *AST:*  "discard all evil enhancement in play."
- **Abaddon, the Destroyer (RoJ AB)** (Score: 0.849):
  - *Orig:* "Negate a good or neutral card. You may search deck or Reserve for an evil Fortress or Revelation demon. May band to Locust from the Pit. Cannot be negated."
  - *AST:*  "negate 1 opponent's card in play, search 1 your evil from deck, band Locust from the Pit. Cannot be negated."
- **Abishai (Ki)** (Score: 0.893):
  - *Orig:* "Discard Ishbibenob.  May band to any red-brigade warrior class Hero."
  - *AST:*  "discard Ishbibenob, band 1 your good red-brigade warrior hero in play until end of phase."
- **Abishai (Wa)** (Score: 0.93):
  - *Orig:* "May band with Joab and/or Asahel."
  - *AST:*  "You may band Joab or Asahel."
- **Abihu (Pi)** (Score: 0.912):
  - *Orig:* "If Nadab is in battle, you may remove all cards in battle from the game."
  - *AST:*  "If Nadab is in battle You may banish all cards in battle."
- **Acts of Uzziah** (Score: 0.826):
  - *Orig:* "Discard Household Idols.  Return all Evil Characters in set aside areas to owner's territory at face value."
  - *AST:*  "discard Household Idols, convert all evil evil character."

---
## Moderate Fidelity Samples

- **A New Beginning** (Score: 0.686):
  - *Orig:* "ALL players shuffle ALL cards in the field of play, set-aside areas and their hands (except this one) back into their draw pile.  Only cards in Land of Redemption and discard piles remain.  ALL players Draw 8 new cards.  Holder may begin a new turn."
  - *AST:*  "shuffle all cards in play, shuffle all cards, shuffle all cards from hand, draw 8 from deck, ignore all your cards in play."
- **A New Commandment** (Score: 0.751):
  - *Orig:* "Convert X human Evil Character Characters to Heroes in the brigade of your choice.  Cannot be prevented by an Evil Character card."
  - *AST:*  "convert evil human character in play. Cannot be prevented."
- **A New Creation** (Score: 0.705):
  - *Orig:* "Convert one human Evil Character to a red brigade Hero."
  - *AST:*  "convert 1 evil human evil character in play."
- **A Soldier's Prayer** (Score: 0.738):
  - *Orig:* "If used by a warrior class Hero, search your deck or discard pile for a red Enhancement. Shuffle this card into that pile."
  - *AST:*  "You may search 1 your red enhancement from deck, shuffle A Soldier's Prayer. You may search 1 your red enhancement from discard pile, shuffle A Soldier's Prayer."
- **Aaron, Moses' Brother (1st Print - L)** (Score: 0.812):
  - *Orig:* "May band to a generic priest, or you may draw 2."
  - *AST:*  "You may band 1 your good priest in play. You may draw 2 your cards from deck."
- **Aaron, Moses' Brother [L]** (Score: 0.747):
  - *Orig:* "May band to a generic priest, or you may draw 2."
  - *AST:*  "You may band 1 priest in play until end of phase. You may draw 2 your cards from deck."
- **Aaron's Staff (CoW AB)** (Score: 0.742):
  - *Orig:* "Once per turn, if your good Tabernacle Priest enters battle, reveal the top X cards of opponent's deck: Put Lost Souls in play and discard an evil card. Good Tabernacle Priests cannot be negated."
  - *AST:*  "If Tabernacle Priest is in battle reveal opponent's cards from deck, discard 1 your evil from hand. Limit. Cannot be negated."
- **Abaddon, the Destroyer (RoJ)** (Score: 0.806):
  - *Orig:* "Negate a good or neutral card. You may search deck or Reserve for an evil Fortress or Revelation demon. May band to Locust from the Pit. Cannot be negated."
  - *AST:*  "negate 1 in play. Cannot be negated. You may search 1 your evil from deck. Cannot be negated. You may search 1 your evil from Reserve. Cannot be negated. You may band Locust. Cannot be negated."
- **Abandonment (UL)** (Score: 0.734):
  - *Orig:* "Evil Character repels Red Brigade."
  - *AST:*  "negate all Red Brigade character in play."
- **Abed-nego (Azariah) (PoC)** (Score: 0.817):
  - *Orig:* "You may underdeck the top card of deck to topdeck a good Daniel card from Reserve. Protect Lost Souls from evil cards. May band to a Daniel human."
  - *AST:*  "discard 1 your card from deck, topdeck Daniel. protect all character in play. You may band Daniel."