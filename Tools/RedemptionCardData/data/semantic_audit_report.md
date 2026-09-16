# Hybrid Semantic Ability Audit Report

Evaluated via offline sentence embeddings (`all-MiniLM-L6-v2`) and factual game-mechanic matrix.

## Summary Metrics
- **Total Cards Audited:** 149
- **High Fidelity (>= 0.82):** 16 (10.7%)
- **Moderate Fidelity (0.68 - 0.81):** 42 (28.2%)
- **Review Required (< 0.68 or Fact Invariant Failure):** 91 (61.1%)

---
## Review Required Cards (Prioritized for Inspection)

### A Mighty Blow (Score: 0.354)
- **Original:** *"This card is worth 10/0 if a demon is in battle."*
- **Decompiled:** *"If count comparison modify stats A Mighty Blow +10/0."*

### A New Beginning (Score: 0.665)
- **Original:** *"ALL players shuffle ALL cards in the field of play, set-aside areas and their hands (except this one) back into their draw pile.  Only cards in Land of Redemption and discard piles remain.  ALL players Draw 8 new cards.  Holder may begin a new turn."*
- **Decompiled:** *"shuffle all cards in play, shuffle all cards, shuffle all cards from hand, draw 8 card from deck. You may begin a new phase a card."*

### A New Creation (Score: 0.669)
- **Original:** *"Convert one human Evil Character to a red brigade Hero."*
- **Decompiled:** *"convert 1 opponent's evil human evil character in play."*

### A Soldier's Prayer (Score: 0.664)
- **Original:** *"If used by a warrior class Hero, search your deck or discard pile for a red Enhancement. Shuffle this card into that pile."*
- **Decompiled:** *"If zone check search 1 your red enhancement from deck, shuffle A Soldier's Prayer."*

### A New Creation (Score: 0.527)
- **Original:** *"If all your Heroes are clay, you may remove your discard pile and this card from the game to convert a human Evil Character to a clay hero."*
- **Decompiled:** *"If zone check remove from the game all your cards from discard pile, remove from the game A New Creation, convert 1 opponent's evil human evil character in battle."*

### Aaron, Moses' Brother (1st Print - L) (Score: 0.746)
- **Original:** *"May band to a generic priest, or you may draw 2."*
- **Decompiled:** *"You may band 1 your good priest generic hero in territory, draw a card."*
- **Fact Violations:** Missing numbers in AST: [2]

### Aaron's Staff (CoW AB) (Score: 0.567)
- **Original:** *"Once per turn, if your good Tabernacle Priest enters battle, reveal the top X cards of opponent's deck: Put Lost Souls in play and discard an evil card. Good Tabernacle Priests cannot be negated."*
- **Decompiled:** *"reveal all opponent's cards from deck, search Lost Soul, discard 1 your evil character from hand. Limit. Cannot be negated."*

### Aaron's Staff (CoW) (Score: 0.544)
- **Original:** *"Once per turn, if your good Tabernacle Priest enters battle, reveal the top X cards of opponent's deck: Put Lost Souls in play and discard an evil card. Good Tabernacle Priests cannot be negated."*
- **Decompiled:** *"reveal all opponent's cards from deck, search Lost Soul, discard 1 your evil from hand. Limit."*
- **Fact Violations:** Missing modifier: 'cannot be negated'

### Abandonment (L) (Score: 0.507)
- **Original:** *"Evil Character repels Red Brigade."*
- **Decompiled:** *"prevent 1 your evil character in play."*

### Abandonment (UL) (Score: 0.139)
- **Original:** *"Evil Character repels Red Brigade."*
- **Decompiled:** *""*

### Abdon (Score: 0.459)
- **Original:** *"This Hero may use good Enhancements with a Judges reference, regardless of color. Cannot be negated."*
- **Decompiled:** *"Cannot be negated."*

### Abducted Subjects (LoC) (Score: 0.309)
- **Original:** *"Capture a human (or 2 humans if used by an Edomite) to a player."*
- **Decompiled:** *"exchange opponent's good character in play."*
- **Fact Violations:** Missing numbers in AST: [2]

### Abel's Sacrifice (Score: 0.373)
- **Original:** *"Abel's Sacrifice and all good enhancements played after it this turn may not be interrupted or prevented."*
- **Decompiled:** *"Cannot be interrupted. Cannot be prevented."*

### Abed-nego (Azariah) (PoC) (Score: 0.636)
- **Original:** *"You may underdeck the top card of deck to topdeck a good Daniel card from Reserve. Protect Lost Souls from evil cards. May band to a Daniel human."*
- **Decompiled:** *"You may ignore 1 your card from deck, topdeck 1 your good character from Reserve. protect all character in play. You may band 1 your good character in play."*

### Abiathar (1st Print - K) (Score: 0.639)
- **Original:** *"You may look at a hand or take a good O.T. card from Reserve."*
- **Decompiled:** *"You may reveal 1 opponent's card from hand. You may search 1 your good from Reserve."*

### Abiathar [K] (Score: 0.64)
- **Original:** *"You may look at a hand or take a good O.T. card from Reserve."*
- **Decompiled:** *"You may reveal 1 opponent's card from hand. You may search 1 good from Reserve."*

### Abigail (RoA) (Score: 0.762)
- **Original:** *"You may draw X (limit 3). Protect characters in your territory and Lost Souls in opponent's territory from evil cards. May band to David."*
- **Decompiled:** *"You may draw all your cards from deck. Limit. protect all character in play. You may band David."*
- **Fact Violations:** Missing numbers in AST: [3]

### Abigail (Wo) (Score: 0.462)
- **Original:** *"All Heroes gain 0/6 when Abigail is in the Field of Battle including this one."*
- **Decompiled:** *"modify stats all good hero in play 0/+6."*

### Abihu, the Disobedient (Score: 0.663)
- **Original:** *"Protect evil priests from the next good Enhancement played. If 2 or more good brigades are in battle, you may reserve a good card in a territory."*
- **Decompiled:** *"protect 1 your evil priest in play until end of phase. You may exchange 1 your good from hand."*
- **Fact Violations:** Missing numbers in AST: [2]

### Abijah, son of Samuel (Score: 0.538)
- **Original:** *"Each time opponent plays an Enhancement in battle, you may draw a card."*
- **Decompiled:** *"You may draw 1 your card from deck."*

### Abijah, the Conqueror / Abijam, the Half-Hearted (LoC) (Score: 0.469)
- **Original:** *"Take a City. Good weapons cannot be negated while an evil warrior is blocking."*
- **Decompiled:** *"search City. Cannot be negated."*

### Abijah, the Conqueror / Abijam, the Half-Hearted (LoC) (Score: 0.491)
- **Original:** *"If blocking, you may take an idol or evil female from deck or draw X (limit 3)."*
- **Decompiled:** *"You may search 1 your character from deck, draw all your cards from deck. Limit."*
- **Fact Violations:** Missing numbers in AST: [3]

### Abimelech (Pa) (Score: 0.402)
- **Original:** *"Evil Character repels all Heroes with a Judges reference."*
- **Decompiled:** *"prevent all opponent's good hero in play."*

### Abimelech (RoA) (Score: 0.599)
- **Original:** *"If Gideon is in your discard pile, negate and discard an Artifact or single color Site. If you win this battle, you may discard an evil card."*
- **Decompiled:** *"negate 1 your artifact in play, discard 1 your artifact in play. You may discard 1 your evil from hand."*

### Abimelech, King of Gerar (LoC) (Score: 0.617)
- **Original:** *"STAR: Bounce an Artifact or Site. EC: You may play a Genesis Philistine from deck (or Reserve if a patriarch is in play). May band to a Philistine."*
- **Decompiled:** *"exchange 1 artifact in play. You may search Genesis Philistine. You may band Philistine until end of phase."*

### Abiram, the Stubborn (Score: 0.563)
- **Original:** *"You may reserve an O.T. Curse from hand or deck to protect this card from Heroes. May band to an evil wilderness human."*
- **Decompiled:** *"You may protect 1 your good hero in play until end of phase. You may band 1 opponent's evil character in play."*

### Abner (Ki) (Score: 0.481)
- **Original:** *"Character has first strike ability.  Ability cannot be negated unless Joab is in battle."*
- **Decompiled:** *"modify stats 1 your character in play until end of phase. Cannot be negated."*
- **Fact Violations:** Missing ability: 'first strike'

### Abner, the Commander (Roots) (Score: 0.626)
- **Original:** *"Negate a good card. If alone, you may choose an O.T. Hero to attack. Cannot be prevented."*
- **Decompiled:** *"negate 1 good in play. Cannot be prevented. You may modify stats 1 your hero in play this turn."*

### Abner's Spear (Ki) (Score: 0.82)
- **Original:** *"Holder may discard Abner's Spear to discard a male Hero in battle with abilities of */4 or less."*
- **Decompiled:** *"You may discard Abner's Spear, discard 1 opponent's hero in battle."*
- **Fact Violations:** Missing numbers in AST: [4]

### Abraham's Descendant (LoC) (Score: 0.599)
- **Original:** *"STAR: Reveal hand: If there is no Hero, take one from deck. GE: Negate an evil Enhancement or a Curse. Bounce it or take it. Hero may band to any number of Genesis Heroes."*
- **Decompiled:** *"reveal 1 your cards from hand, search 1 your hero from deck. negate 1 evil enhancement in play, banish 1 evil enhancement in play. band 1 your good hero in play."*

### Abraham's Servant to Ur (Score: 0.579)
- **Original:** *"All special abilities except banding on characters and enhancements, except this one, are negated.  Battle is determined by the numbers."*
- **Decompiled:** *"negate all character in play, negate all enhancement in play. "*

### Abraham's Servant to Ur (LoC) (Score: 0.749)
- **Original:** *"Negate abilities (except band abilities) on characters and other Enhancements."*
- **Decompiled:** *"negate all character in play, negate all enhancement in play."*
- **Fact Violations:** Missing primary action: 'band'

### Abram's Army (Score: 0.473)
- **Original:** *"You may release a captured Hero to negate and discard a single-color Site, Artifact or evil card. Cannot be interrupted by O.T. Evil Characters."*
- **Decompiled:** *"You may negate 1 in play, discard 1 in play. Cannot be interrupted."*

### Abomination of Desolation (Score: 0.572)
- **Original:** *"If used by a Greek, place in opponent's territory. Each time opponent draws cards (except during draw phase), you may discard a card in that territory except a Lost Soul."*
- **Decompiled:** *"You may discard 1 opponent's card in territory."*
- **Fact Violations:** Missing primary action: 'draw'

### Abram/Abraham (Score: 0.505)
- **Original:** *"Hero starts as Abram.  After he makes a successful rescue, he becomes Abraham and can interrupt and prevent all special abilities on all Lost Soul cards except the Proverbs 22:14 Lost Souls card."*
- **Decompiled:** *" If Abraham is in in play You may negate 1 evil evil character in play, prevent 1 evil evil character in play."*
- **Fact Violations:** Missing numbers in AST: [22]

---
## High Fidelity Samples (Top Mechanical Alignment)

- **A Roman Soldier's Faith** (Score: 0.877):
  - *Orig:* "Heal any Hero in play."
  - *AST:*  "heal 1 good hero in play."
- **Aaron (Di)** (Score: 0.884):
  - *Orig:* "Protect your Tabernacle artifacts from opponents' cards.  May band to an Exodus or Leviticus Hero.  Cannot be negated by a good card."
  - *AST:*  "protect all your Tabernacle artifact in play. You may band 1 your good Exodus Leviticus hero in territory."
- **Aaron (Pa)** (Score: 0.879):
  - *Orig:* "May band to Miriam.  Holy of Holies cannot be discarded while Aaron is in play."
  - *AST:*  "You may band Miriam. If Aaron is in in play protect Holy of Holies. Instead."
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
- **Ahuzzath (LoC)** (Score: 0.872):
  - *Orig:* "You may topdeck an O.T. black Enhancement from Reserve (or take it if a black king is in play). You may banish up to X good cards from a discard pile."
  - *AST:*  "You may topdeck 1 your Black enhancement from Reserve. You may banish good from discard pile."

---
## Moderate Fidelity Samples

- **A New Commandment** (Score: 0.735):
  - *Orig:* "Convert X human Evil Character Characters to Heroes in the brigade of your choice.  Cannot be prevented by an Evil Character card."
  - *AST:*  "convert X opponent's evil human evil character in play."
- **A Royal Priesthood** (Score: 0.792):
  - *Orig:* "(Star) Topdeck The Tabernacle or a Temple from deck or Reserve. (GE) Place on your male human Hero: He gains "High Priest" and "King of Judah"."
  - *AST:*  "search The Tabernacle or Temple, topdeck your card from deck. place 1 your good male human hero in territory, give your good hero in territory."
- **A Wife for Isaac** (Score: 0.797):
  - *Orig:* "Hero ignores all female Evil Characters"
  - *AST:*  "ignore all opponent's evil Female evil character in battle."
- **Aaron, Moses' Brother [L]** (Score: 0.715):
  - *Orig:* "May band to a generic priest, or you may draw 2."
  - *AST:*  "You may band 1 your priest in play. If zone check You may draw 2 your cards from deck."
- **Abaddon, the Destroyer (RoJ)** (Score: 0.796):
  - *Orig:* "Negate a good or neutral card. You may search deck or Reserve for an evil Fortress or Revelation demon. May band to Locust from the Pit. Cannot be negated."
  - *AST:*  "negate 1 character in play, search 1 your evil from deck, band Locust from the Pit until end of phase. Cannot be negated."
- **Abeyance (Roots)** (Score: 0.767):
  - *Orig:* "Reserve all Evil Characters in battle."
  - *AST:*  "discard all evil character in play."
- **Abiathar, the Survivor** (Score: 0.685):
  - *Orig:* "Protect O.T. priests from evil discard abilities. May band to a Tabernacle priest, or you may take an O.T. clay Enhancement from Reserve."
  - *AST:*  "protect all your good priest in play. You may band 1 your good priest in play. You may search 1 your enhancement from Reserve."
- **Abiezer (Ki)** (Score: 0.807):
  - *Orig:* "Hero is immune to Crimson Brigade."
  - *AST:*  "protect 1 your Crimson Brigade hero in play."
- **Abiezer (Wa)** (Score: 0.807):
  - *Orig:* "Hero is immune to Crimson Brigade."
  - *AST:*  "protect 1 your Crimson Brigade hero in play."
- **Abigail (1st Print - K)** (Score: 0.687):
  - *Orig:* "You may choose an Evil Character to block."
  - *AST:*  "You may protect 1 opponent's evil character in play."