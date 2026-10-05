# Hybrid Semantic Ability Audit Report

Evaluated via offline sentence embeddings (`all-MiniLM-L6-v2`) and factual game-mechanic matrix.

## Summary Metrics
- **Total Cards Audited:** 1735
- **High Fidelity (>= 0.82):** 532 (30.7%)
- **Moderate Fidelity (0.68 - 0.81):** 712 (41.0%)
- **Review Required (< 0.68 or Fact Invariant Failure):** 491 (28.3%)

---
## Review Required Cards (Prioritized for Inspection)

### City of Refuge (PoC) [ID: 551003852] (Score: 0.211)
- **Key:** `551003852_shared`
- **Original:** *"SITE: Protect O.T. humans from discard. FORT: Once per turn, if an opponent's ability harms your O.T. human, you may hold it here instead."*
- **Decompiled:** *"restrict all good Old Testament hero in play. If all your good Old Testament hero in play is in play You may hold all your good Old Testament hero in play. Limit."*

### Burial Shroud [ID: -1557092137] (Score: 0.235)
- **Key:** `-1557092137_top`
- **Original:** *"Holder may not make a rescue attempt or be attacked.  May be used twice."*
- **Decompiled:** *"restrict This Character, restrict This Character. (limit 2)."*

### Enoch [ID: -860753876] (Score: 0.237)
- **Key:** `-860753876_shared`
- **Original:** *"Enoch may be removed from the game, but is prevented from being discarded.  Return Enoch to territory at end of battle."*
- **Decompiled:** *"prevent This Hero. If end of battle place This Hero."*

### Elisabeth [ID: 2120594931] (Score: 0.241)
- **Key:** `2120594931_shared`
- **Original:** *"Elisabeth cannot be taken prisoner."*
- **Decompiled:** *"restrict This Hero."*

### Buckler (Wa) [ID: -389033207] (Score: 0.283)
- **Key:** `-389033207_shared`
- **Original:** *"Worth 6/4 against any Evil Character who fought in an earthly battle."*
- **Decompiled:** *"gain This Hero."*
- **Fact Violations:** Missing numbers in AST: [4, 6]

### Foolish Builder (GoC) [ID: 1609408629] (Score: 0.293)
- **Key:** `1609408629_top`
- **Original:** *"STAR: Give this card to opponent's territory."*
- **Decompiled:** *"give This Character."*

### Child of Great Wisdom [ID: 606515729] (Score: 0.318)
- **Key:** `606515729_shared`
- **Original:** *"All Pharisees and Sadducees are ignored."*
- **Decompiled:** *"ignore all evil evil character in play."*

### Goliath's Spear (Ki) [ID: 1139075416] (Score: 0.32)
- **Key:** `1139075416_shared`
- **Original:** *"Worth 8/10 if used by a giant.  Goliath may retain as a weapon until discarded."*
- **Decompiled:** *"gain 1 your artifact in play +8/+10. You may hold 1 your artifact in play."*

### Bear [ID: 842668674] (Score: 0.323)
- **Key:** `842668674_shared`
- **Original:** *"Bear is immune to red brigade."*
- **Decompiled:** *"immune This Hero."*
- **Fact Violations:** Missing card protection action: 'protect'

### Ishbibenob's Spear (Ki) [ID: -1786602524] (Score: 0.33)
- **Key:** `-1786602524_shared`
- **Original:** *"Worth 8/4 if used by a giant."*
- **Decompiled:** *"gain This card +8/+4."*

### Faithfulness of Ananias [ID: -30653716] (Score: 0.337)
- **Key:** `-30653716_shared`
- **Original:** *"Ananias gains 1/4 until removed from the field of play."*
- **Decompiled:** *"gain This Hero +1/+4."*

### Glittering Spear (Ki) [ID: 1101784356] (Score: 0.337)
- **Key:** `1101784356_shared`
- **Original:** *"Worth 9/3 if used by a warrior class Assyrian"*
- **Decompiled:** *"gain This card +9/+3."*

### Emperor Claudius [ID: -519903135] (Score: 0.344)
- **Key:** `-519903135_shared`
- **Original:** *"Emperor Claudius is immune to N.T. Heroes."*
- **Decompiled:** *"protect This Character."*

### Jael, the Shrewd (Roots) [ID: 866495832] (Score: 0.351)
- **Key:** `866495832_shared`
- **Original:** *"If alone, you may choose an evil O.T. male human to block."*
- **Decompiled:** *"If all your cards in battle is in battle You may taunt 1 opponent's evil OT male human evil character in play."*

### Goliath's Spear (Wa) [ID: -836397942] (Score: 0.354)
- **Key:** `-836397942_shared`
- **Original:** *"Worth 8/10 if used by a giant."*
- **Decompiled:** *"gain This card +8/+10."*

### Hadad Arises [ID: -1394568223] (Score: 0.356)
- **Key:** `-1394568223_shared`
- **Original:** *"Return a good King in play to top of owner's draw pile.  Cannot be negated if holder has an Egypt site in play."*
- **Decompiled:** *"topdeck 1 your good hero in play. Cannot be negated."*

### Abram/Abraham [ID: -1080205892] (Score: 0.362)
- **Key:** `-1080205892_shared`
- **Original:** *"Hero starts as Abram.  After he makes a successful rescue, he becomes Abraham and can interrupt and prevent all special abilities on all Lost Soul cards except the Proverbs 22:14 Lost Souls card."*
- **Decompiled:** *"interrupt all Lost Soul in play until end of phase, prevent all Lost Soul in play until end of phase."*

### Fallen Warrior (Ki) [ID: 677725732] (Score: 0.362)
- **Key:** `677725732_shared`
- **Original:** *"Fallen Warrior gains the cumulative abilities (*/*) of each Hero he successfully blocks."*
- **Decompiled:** *"gain This Hero."*

### Hospitality in Bethany (GoC) [ID: -1336855565] (Score: 0.367)
- **Key:** `-1336855565_top`
- **Original:** *"STAR: If you control a meek Hero, draw 2."*
- **Decompiled:** *"draw 2 your card from deck."*

### False Wisdom [ID: -126073973] (Score: 0.385)
- **Key:** `-126073973_shared`
- **Original:** *"Holder may look at rescuer's hand."*
- **Decompiled:** *"You may look all opponent's cards from hand."*

### Defiant [ID: -146932954] (Score: 0.386)
- **Key:** `-146932954_shared`
- **Original:** *"Place this card on a demon.  While this card remains, Three Nails does not prevent that demon from blocking and this demon cannot be ignored."*
- **Decompiled:** *"You may place 1 evil evil character in play. ignore all evil evil character in play. Cannot be prevented."*

### Banks of the Nile/Pharaoh's Court [ID: -1331490969] (Score: 0.391)
- **Key:** `-1331490969_top`
- **Original:** *"This card enters play as Banks of the Nile. If a Hero rescues a Lost Soul from this Site, it becomes Pharaoh's Court."*
- **Decompiled:** *"gain This card. If rescue convert This card."*

### Babylonian Banquet Hall [ID: -1988870646] (Score: 0.401)
- **Key:** `-1988870646_shared`
- **Original:** *"This Site may hold one Lost Soul for each Babylonian Site in play."*
- **Decompiled:** *"hold 1 your Lost Soul in play."*

### Doomed Canaanites [ID: 2044963277] (Score: 0.401)
- **Key:** `2044963277_shared`
- **Original:** *"STAR: Give this card to opponent's territory. EC: Each upkeep, you must discard another card in territory. If you cannot, discard this card."*
- **Decompiled:** *"give This Evil Character. discard 1 your except this card in play, discard This Evil Character."*

### Assyrian Camp (LoC) [ID: -1270964017] (Score: 0.403)
- **Key:** `-1270964017_top`
- **Original:** *"Prevent multi-brigade Enhancements used by Heroes (except meek Heroes)."*
- **Decompiled:** *"prevent all your enhancement in play."*

### Chamber of Angels [ID: 1724947058] (Score: 0.405)
- **Key:** `1724947058_top`
- **Original:** *"Set this fortress aside.  If holder's angel is being discarded, place it here instead. After two turns, return Hero to the top of your draw pile."*
- **Decompiled:** *"set-aside 1 your site in play. If discard place 1 your good hero from discard pile. Instead. topdeck 1 your hero in play."*

### Formal Training [ID: 250134467] (Score: 0.407)
- **Key:** `250134467_shared`
- **Original:** *"Hero is immune to crimson brigade."*
- **Decompiled:** *"protect This Hero."*

### Axe (TxP) [ID: 2042978395] (Score: 0.412)
- **Key:** `2042978395_shared`
- **Original:** *"If used by a Babylonian, you may discard this card to discard a Fortress. Opponent may discard one of his Sites instead."*
- **Decompiled:** *"discard 1 your artifact from hand, discard 1 site in play or discard 1 your artifact from hand, discard 1 opponent's site in play. Instead."*

### Deceitful Sin [ID: 2049176747] (Score: 0.417)
- **Key:** `2049176747_shared`
- **Original:** *"If you have not used a search ability this turn, end the battle."*
- **Decompiled:** *"If all your cards in play is in play You may end the battle all cards in battle."*

### Captured by Assyria (LoC) [ID: -2090982852] (Score: 0.424)
- **Key:** `-2090982852_shared`
- **Original:** *"Capture a human (or 2 humans if used by an Assyrian)."*
- **Decompiled:** *"capture 2 character in play."*

### Admiral [ID: 24735900] (Score: 0.437)
- **Key:** `24735900_shared`
- **Original:** *"Kingdoms of this World fortresses do not protect Evil Characters this turn.  You may release your demon from any evil fortress in play or set aside area and band it into battle."*
- **Decompiled:** *"release 1 your evil evil character in play, band 1 your evil evil character in play."*

### Christian Suing Another [ID: 2126166458] (Score: 0.438)
- **Key:** `2126166458_shared`
- **Original:** *"Holder interrupts the battle and chooses a Hero in play to fight the rescuing Hero.  The loser is discarded."*
- **Decompiled:** *"You may interrupt all cards in battle, side battle 1 hero in play, discard 1 hero in play."*

### Captain of the Chariots (LoC) [ID: -1327078379] (Score: 0.445)
- **Key:** `-1327078379_shared`
- **Original:** *"If blocking, you may equip an evil weapon from Reserve to draw 2. If you do not, you may choose a good king to attack. Cannot be negated if a Syrian king is in play."*
- **Decompiled:** *"If Captain of the Chariots is in battle equip 1 your evil enhancement from Reserve, draw 2 your card from deck. Cannot be negated or may side battle your good king hero in play. Cannot be negated."*

### Athaliah [ID: 953850989] (Score: 0.446)
- **Key:** `953850989_shared`
- **Original:** *"Character gains 1/1 for each Purple Brigade Hero discarded or captured while she is in play."*
- **Decompiled:** *"If discard If This card is in play gain This Character +1/+1. If capture If This card is in play gain This Character +1/+1."*

### Futile Inquisition (GoC) [ID: -509357722] (Score: 0.449)
- **Key:** `-509357722_bottom`
- **Original:** *"If used by a N.T. character, end the battle in a stalemate."*
- **Decompiled:** *"If all your New Testament character in play is in play end the battle all cards in battle."*

### Army of Simeonites [ID: -1098625920] (Score: 0.45)
- **Key:** `-1098625920_shared`
- **Original:** *"Each time this character is about to be discarded, instead return it to territory with abilities decreased 3/3."*
- **Decompiled:** *"place 1 your hero in play, 1 your hero in play is worth -3/-3. Instead."*

### Gathering Soothsayers (1st Print - K) [ID: -287441146] (Score: 0.45)
- **Key:** `-287441146_shared`
- **Original:** *"Egyptian may band to up to 3 O.T. Egyptians."*
- **Decompiled:** *"You may band 3 Old Testament hero in play."*

### Angel with the Secret Name (Wa) [ID: -129942653] (Score: 0.454)
- **Key:** `-129942653_shared`
- **Original:** *"Hero's abilities (*/*) are equal to the number of Silver Brigade heroes in play."*
- **Decompiled:** *"modify stats This Hero."*

### Compassion of Jeremiah (UL) [ID: 1105788373] (Score: 0.458)
- **Key:** `1105788373_shared`
- **Original:** *"Hero ignores Crimson Brigade."*
- **Decompiled:** *"ignore This Hero."*

### Carried into Exile [ID: 1708698410] (Score: 0.46)
- **Key:** `1708698410_shared`
- **Original:** *"Capture a human (or two humans if used by a Babylonian)."*
- **Decompiled:** *"You may capture 2 character in play."*

### Faith of Enoch (CoW AB) [ID: -313122518] (Score: 0.46)
- **Key:** `-313122518_shared`
- **Original:** *"Place on your cloud Hero: If Hero is discarded by an opponent's evil special ability, you may remove this card from the game instead to rescue the Hero as if it were a Lost Soul."*
- **Decompiled:** *"You may banish 1 your enhancement in play, rescue 1 your hero from discard pile. Instead."*

### Angel at Shur (Roots) [ID: 603346170] (Score: 0.462)
- **Key:** `603346170_shared`
- **Original:** *"May band to an O.T. angel, or you may take an O.T. female from deck."*
- **Decompiled:** *"You may band your Old Testament hero in play or You may take your Old Testament hero from deck."*

### Honor Thy Enemy [ID: -336576341] (Score: 0.462)
- **Key:** `-336576341_bottom`
- **Original:** *"If used by a Persian, end the battle."*
- **Decompiled:** *"If equip end the battle all cards in battle."*

### Ananias of Damascus (Ap) [ID: 748830080] (Score: 0.466)
- **Key:** `748830080_shared`
- **Original:** *"Any Saul/Paul in play, repents and Saul becomes Paul."*
- **Decompiled:** *"If repents convert all your hero in play."*

### Baggage [ID: -457899472] (Score: 0.468)
- **Key:** `-457899472_shared`
- **Original:** *"Take any Evil Character prisoner and place in your Land of Bondage.  Character is treated as a Lost Soul."*
- **Decompiled:** *"You may capture 1 evil character in play, place 1 your card in play, convert 1 your card in play."*

### Fullness of Time [ID: 684661219] (Score: 0.471)
- **Key:** `684661219_top`
- **Original:** *"While occupied, protect decks from opponents' look and reveal abilities. If your green prophet rescues a card, you may release contents and discard this card to take a good Dominant from deck."*
- **Decompiled:** *"If all your cards in battle is in battle protect all your look reveal from deck. discard 1 your card in play, release This card, take 1 your good Dominant site from deck."*

### Chamber of Angels (GoC) [ID: 459315001] (Score: 0.479)
- **Key:** `459315001_top`
- **Original:** *"If your angel is harmed or defeated, you may hold it here instead. While occupied, negate opponents' evil cards in territories."*
- **Decompiled:** *"If all your good hero in play is in play You may hold 1 your good hero in play. Instead. negate all opponent's evil in play."*

### Goliath's Sword (LoC) [ID: 1451961918] (Score: 0.479)
- **Key:** `1451961918_shared`
- **Original:** *"Negate a card of a different alignment. If bearer is discarded during battle, opponent may take this card from your discard pile."*
- **Decompiled:** *"You may negate 1 in play. If discarded You may take 1 your enhancement from discard pile."*

### Idle Gossip [ID: 185508628] (Score: 0.479)
- **Key:** `185508628_shared`
- **Original:** *"Holder chooses a Hero in play to fight the rescuing Hero.  The loser is discarded."*
- **Decompiled:** *"You may discard 1 your hero in play."*

### Greek Philosophers (Roots) [ID: 1385650848] (Score: 0.482)
- **Key:** `1385650848_shared`
- **Original:** *"You may discard a N.T. black Enhancement from hand to protect N.T. Lost Souls from rescue."*
- **Decompiled:** *"discard 1 your evil New Testament enhancement from hand, protect all New Testament Lost Soul in play until end of phase."*

### Ira (Wa) [ID: -521480375] (Score: 0.482)
- **Key:** `-521480375_shared`
- **Original:** *"All special abilities on character cards and enhancement cards except this one are interrupted and prevented.  Battle is determined by the numbers."*
- **Decompiled:** *"interrupt all except this card character in play, prevent all except this card character in play. interrupt all except this card enhancement in play, prevent all except this card enhancement in play."*

### Deceitful Sin (CoW AB) [ID: 1175608725] (Score: 0.484)
- **Key:** `1175608725_shared`
- **Original:** *"If you have not used a search ability this turn, end the battle."*
- **Decompiled:** *"end the battle all cards in battle."*

### Ambush [ID: 2073961628] (Score: 0.485)
- **Key:** `2073961628_shared`
- **Original:** *"Set aside a male Hero (face down) from your hand for one turn.  Hero returns to territory face down.  Hero enters battle face down with access to any site.  When opponent presents an Evil Character in battle, Hero is flipped face up."*
- **Decompiled:** *"You may set-aside 1 your hero from hand. return to hand 1 your hero."*

### Devouring Lion [ID: -1318675852] (Score: 0.487)
- **Key:** `-1318675852_shared`
- **Original:** *"Reserve a human. If it is a Hero, its owner may reveal a * card of matching brigade from hand instead."*
- **Decompiled:** *"You may reserve 1 your character from hand. Instead."*

### Israelite Rebellion [ID: 1692203009] (Score: 0.487)
- **Key:** `1692203009_shared`
- **Original:** *"Capture a hero with toughness of */4 or less."*
- **Decompiled:** *"If all your cards in play is in play You may capture 1 hero in play."*

### Dangerous Road [ID: 737058433] (Score: 0.489)
- **Key:** `737058433_shared`
- **Original:** *"Evil cards on this site are protected from DragonRaid."*
- **Decompiled:** *"immune all evil on this site in play."*
- **Fact Violations:** Missing card protection action: 'protect', Hallucinated action 'immune' (use 'gain' with modifier instead)

### Bronze Cymbals [ID: 773830287] (Score: 0.491)
- **Key:** `773830287_shared`
- **Original:** *"Prevent the special ability of the next evil Enhancement played this battle."*
- **Decompiled:** *"If play You may prevent 1 enhancement in play."*

### Covenant of Eden [ID: -784756194] (Score: 0.491)
- **Key:** `-784756194_shared`
- **Original:** *"Use as an enhancement or an Artifact.  No character may be removed from the game.  Instead discard the character targeted for removal."*
- **Decompiled:** *"play 1 your card from hand. If banish discard 1 character in play. Instead."*
- **Fact Violations:** Missing card protection action: 'protect'

### Conspiring Herodians (GoC) [ID: 765735812] (Score: 0.495)
- **Key:** `765735812_top`
- **Original:** *"STAR: Give this card to opponent's territory."*
- **Decompiled:** *"give 1 your card in play."*

### Edomite Camp (LoC) [ID: -1898184372] (Score: 0.496)
- **Key:** `-1898184372_bottom`
- **Original:** *"If your Edomite blocks and you have 6 or fewer cards in hand, you may draw 2."*
- **Decompiled:** *"If all your evil hero in battle is in battle If all your cards from hand is in hand You may draw 2 your card from hand from deck."*

### Faith as a Mustard Seed [ID: -1154530102] (Score: 0.496)
- **Key:** `-1154530102_shared`
- **Original:** *"If used by a N.T. Hero, interrupt the special ability on an occupied Site, an Evil Enhancement, or a non-human Evil Character Character and remove it from the game."*
- **Decompiled:** *"You may interrupt 1 site in play, banish 1 site in play or You may interrupt 1 evil enhancement in play, banish 1 evil enhancement in play or You may interrupt 1 evil non-human character in play, banish 1 evil non-human character in play."*

### Demonic Deception [ID: 1987653709] (Score: 0.497)
- **Key:** `1987653709_shared`
- **Original:** *"Return a Hero in play to the top of owner's draw pile. If used by a demon, this cannot be prevented by a good card."*
- **Decompiled:** *"topdeck 1 hero in play. Cannot be prevented."*

### Burning Incense [ID: -1101186497] (Score: 0.498)
- **Key:** `-1101186497_shared`
- **Original:** *"All Heroes ignore an evil brigade of holder's choice.  Cannot be negated if Altar of Incense is active."*
- **Decompiled:** *"ignore all hero in play until end of phase. Cannot be negated."*

### Eternal Inheritance (CoW AB) [ID: -1941987598] (Score: 0.5)
- **Key:** `-1941987598_shared`
- **Original:** *"If rescuing, a Covenant is active and your Hero is opposed, remove this from the game to rescue a Lost Soul. Battle continues as a battle challenge. Opponent may play an Enhancement."*
- **Decompiled:** *"banish 1 your card in play, rescue 1 your Lost Soul from hand."*

### Battle Cry [ID: -765162791] (Score: 0.503)
- **Key:** `-765162791_shared`
- **Original:** *"Interrupt the battle and band into battle as many Heroes from holder's territory as holder chooses."*
- **Decompiled:** *"You may interrupt all cards in battle, band your good hero in play."*

### Bad Decision [ID: -115958239] (Score: 0.504)
- **Key:** `-115958239_shared`
- **Original:** *"If opponent has an empty single color site, capture any Hero in play and place there."*
- **Decompiled:** *"If all your cards in play is in play capture 1 hero in play, place 1 your hero in play."*

### Captain of the Host (Wa) [ID: -331049176] (Score: 0.504)
- **Key:** `-331049176_shared`
- **Original:** *"Interrupt and prevent all special abilities except banding.  Fight by the numbers."*
- **Decompiled:** *"interrupt all cards in play, prevent all cards in play. This Hero has first strike."*

### Angelic Rebellion [ID: 1548481979] (Score: 0.506)
- **Key:** `1548481979_shared`
- **Original:** *"One angel (excluding Michael, Captain of the Host, and Gabriel) falls and becomes a Crimson evil character."*
- **Decompiled:** *"convert 1 evil Crimson hero in play."*

### Answered Prayer (Ki) [ID: 282482448] (Score: 0.506)
- **Key:** `282482448_shared`
- **Original:** *"Selected Hero (until discarded) gains 7 ability points to be distributed as holder chooses.  Distribution must be announced when played."*
- **Decompiled:** *"1 your good hero in play is worth +7/0 until end of phase."*

### Golgotha (Di) [ID: 140587900] (Score: 0.506)
- **Key:** `140587900_shared`
- **Original:** *"Anytime during battle, you may place a skull icon card from hand or discard pile on Golgotha: N.T. characters of that brigade cannot be ignored.  Return that card to its previous location at end of turn."*
- **Decompiled:** *"You may place 1 your skull icon enhancement from hand, protect all N.T. character in play this turn, return to hand 1 your enhancement in play."*

### Angry Travelers [ID: -1637877733] (Score: 0.507)
- **Key:** `-1637877733_shared`
- **Original:** *"Place this card on a Lost Soul.  If that Lost Soul is not rescued by the end of the current player's next turn, discard this card to return the Lost Soul to the bottom of owner's draw pile."*
- **Decompiled:** *"place 1 character in play. discard Angry Travelers, draw 1 your cards from deck."*

### Barnabas (D) [ID: 1666819503] (Score: 0.508)
- **Key:** `1666819503_shared`
- **Original:** *"Hero is immune to any card with the word False in card title."*
- **Decompiled:** *"ignore all False in play."*

### Hate (D) [ID: -31379921] (Score: 0.509)
- **Key:** `-31379921_shared`
- **Original:** *"Evil Character repels green brigade."*
- **Decompiled:** *"withdraw all opponent's green character in battle."*

### Hate (L) [ID: 56311591] (Score: 0.509)
- **Key:** `56311591_shared`
- **Original:** *"Evil Character repels Green Brigade."*
- **Decompiled:** *"withdraw all opponent's Green character in battle."*

### Broken Cisterns [ID: -1363263826] (Score: 0.511)
- **Key:** `-1363263826_shared`
- **Original:** *"Place in an opponent's territory. Negate draw abilities used by that player. All Heroes in that territory are decreased by 0/X."*
- **Decompiled:** *"place 1 opponent's site in territory. restrict 1 opponent's cards in play. decrease 1 opponent's hero in territory 0/0."*
- **Fact Violations:** Missing primary action: 'draw'

### Helmet of Salvation (Wa) [ID: -1819609847] (Score: 0.512)
- **Key:** `-1819609847_shared`
- **Original:** *"Hero is immune to Confusion."*
- **Decompiled:** *"protect This Hero."*

### Covenant with David [ID: -2071886612] (Score: 0.513)
- **Key:** `-2071886612_shared`
- **Original:** *"Use as an enhancement or an Artifact.  Household Idols is negated."*
- **Decompiled:** *"You may play This card or You may play This card. negate Household Idols."*

### I am Healing [ID: -253407072] (Score: 0.514)
- **Key:** `-253407072_shared`
- **Original:** *"Holder may heal all of holder's Heroes in play.  May be used twice."*
- **Decompiled:** *"You may heal all your good hero in play. (limit 2)."*

### Abijah, son of Samuel [ID: 1330205561] (Score: 0.515)
- **Key:** `1330205561_shared`
- **Original:** *"Each time opponent plays an Enhancement in battle, you may draw a card."*
- **Decompiled:** *"You may draw 1 your cards from deck."*

### Commander Phicol (LoC) [ID: 1308091240] (Score: 0.515)
- **Key:** `1308091240_shared`
- **Original:** *"If blocking, you may negate a good card, discard a good Enhancement or equip a weapon from Reserve. May band to a Philistine (except a king)."*
- **Decompiled:** *"If all your hero in battle is in battle You may negate 1 good in play or may discard 1 good enhancement in play or may equip 1 your Weapon enhancement from Reserve. You may band 1 Philistine hero in play."*

### Heavenly Trance [ID: 571371145] (Score: 0.517)
- **Key:** `571371145_shared`
- **Original:** *"Player may look at the top card of one draw pile, then place it back on top and continue play."*
- **Decompiled:** *"You may look 1 your cards from deck, topdeck 1 your card from deck."*

### Angel at Shur (Promo) [ID: 391681411] (Score: 0.518)
- **Key:** `391681411_shared`
- **Original:** *"Search draw pile for an O.T. male Hero and put it in hand. This Hero is immune to demons."*
- **Decompiled:** *"draw 1 your good hero from deck. immune This Hero."*
- **Fact Violations:** Missing card protection action: 'protect'

### David (Green) (Wa) [ID: -2039718870] (Score: 0.518)
- **Key:** `-2039718870_shared`
- **Original:** *"David may use any enhancement bearing his name in the card title."*
- **Decompiled:** *"This Hero may use other enhancements."*

### Ambushed Moabites (LoC) [ID: -386684264] (Score: 0.52)
- **Key:** `-386684264_shared`
- **Original:** *"STAR: Give this card to opponent's territory. EC: Negate discard abilities on your evil cards. Each upkeep, you must discard another evil O.T.  human in territory."*
- **Decompiled:** *"give 1 your evil evil character in play. negate all your evil evil character in play until end of phase. discard 1 your evil evil character in territory."*

### Answered Prayer (Wa) [ID: -126624504] (Score: 0.522)
- **Key:** `-126624504_shared`
- **Original:** *"Selected Hero (until discarded) gains 7 ability points to be distributed as holder chooses.  Distribution must be announced when played."*
- **Decompiled:** *"gain 1 your good hero in play +7/0."*

### Clemency of David (A) [ID: 1025590662] (Score: 0.522)
- **Key:** `1025590662_shared`
- **Original:** *"Hero ignores Brown Brigade."*
- **Decompiled:** *"ignore This Hero."*

### False Witnesses [ID: -282366754] (Score: 0.522)
- **Key:** `-282366754_shared`
- **Original:** *"If used by a Sadducee, capture a hero."*
- **Decompiled:** *"You may capture 1 opponent's good hero in play."*

### Altar of Incense (E) [ID: 1142905143] (Score: 0.523)
- **Key:** `1142905143_top`
- **Original:** *"O.T. Heroes are protected from discard special abilities on evil enhancements."*
- **Decompiled:** *"protect all good hero in play."*

### Goshen ( C) [ID: 1459960641] (Score: 0.523)
- **Key:** `1459960641_top`
- **Original:** *"Following draw phase place, remove or exchange up to three Heroes in this site to protect them from harm or effect when they are not in the Field of Battle."*
- **Decompiled:** *"You may place 3 your good in this site hero in play or You may banish 3 your good in this site hero in play or You may exchange 3 your good in this site hero in play."*

### Ahimaaz (Ki) [ID: -761019419] (Score: 0.525)
- **Key:** `-761019419_shared`
- **Original:** *"Holder may look at one opponent's hand or cards face down in a Site.  Hero may then withdraw from battle unharmed or continue the battle.  Ahimaaz cannot be captured."*
- **Decompiled:** *"You may look 1 opponent's card from hand or You may look all cards. You may withdraw This Hero. ignore This Hero."*

### Death of Firstborn [ID: -180027188] (Score: 0.525)
- **Key:** `-180027188_shared`
- **Original:** *"Immunity on all characters is negated.  Blocking Evil Character refuses to block.  Opponent must present a new blocker or rescue attempt is successful."*
- **Decompiled:** *"negate all character in play. withdraw all evil character in battle. present all opponent's character in play or rescue all Lost Soul in play."*

### Babylonian Soldiers [ID: 1722110593] (Score: 0.527)
- **Key:** `1722110593_shared`
- **Original:** *"If blocking, you may remove a captured character from the game to negate and discard an Artifact or draw X (limit 3). Increase this character by X/X."*
- **Decompiled:** *"If This card is in battle remove from the game 1 your character in play, negate 1 artifact in play, discard 1 artifact in play, increase 1 your evil evil character in play +1/+1 this turn or Remove from the game 1 your character in play, draw 3 your card from deck, increase 1 your evil evil character in play +3/+3 this turn. limit."*

### Centurion's Proclamation [ID: -1442557023] (Score: 0.527)
- **Key:** `-1442557023_shared`
- **Original:** *"If used by a male Hero, interrupt the battle and capture a human Evil Character Character. Opponent may convert it to a Hero in any brigade instead."*
- **Decompiled:** *"If Centurion's Proclamation is in play interrupt all cards in battle, capture 1 opponent's evil human evil character in play. Instead. You may convert 1 opponent's evil human evil character in play."*

### David's Harp [ID: -1518413569] (Score: 0.528)
- **Key:** `-1518413569_top`
- **Original:** *"Following a rescue attempt holder may select one Hero that is about to be discarded and place Hero on top of owner's draw pile."*
- **Decompiled:** *"You may topdeck 1 your about to be discarded hero from hand."*

### Abiezer (Ki) [ID: 1271490991] (Score: 0.529)
- **Key:** `1271490991_shared`
- **Original:** *"Hero is immune to Crimson Brigade."*
- **Decompiled:** *"immune This Hero."*
- **Fact Violations:** Missing card protection action: 'protect'

### Abiezer (Wa) [ID: -1510996855] (Score: 0.529)
- **Key:** `-1510996855_shared`
- **Original:** *"Hero is immune to Crimson Brigade."*
- **Decompiled:** *"immune This Hero."*
- **Fact Violations:** Missing card protection action: 'protect'

### Breastplate of Righteousness (Wa) [ID: 41136034] (Score: 0.529)
- **Key:** `41136034_shared`
- **Original:** *"Hero is immune to Crimson Brigade."*
- **Decompiled:** *"immune This Hero."*

### Dust and Ashes [ID: -2090444962] (Score: 0.531)
- **Key:** `-2090444962_top`
- **Original:** *"When you play this card, search discard pile for Job. If your Job is harmed or defeated by an opponent, you may place him here instead. Each upkeep, return contents to hand. Cannot be negated."*
- **Decompiled:** *"search Job. Cannot be negated. If Job is in battle You may place Job. Cannot be negated. Instead. bounce Job. Cannot be negated."*

### Abraham's Servant to Ur [ID: 935171339] (Score: 0.533)
- **Key:** `935171339_shared`
- **Original:** *"All special abilities except banding on characters and enhancements, except this one, are negated.  Battle is determined by the numbers."*
- **Decompiled:** *"negate all character in play, negate all enhancement in play. modify stats This Hero."*

### Elders of Israel [ID: -1941170665] (Score: 0.534)
- **Key:** `-1941170665_shared`
- **Original:** *"Hero is immune to brown and pale green brigade evil characters."*
- **Decompiled:** *"immune This Hero."*
- **Fact Violations:** Missing card protection action: 'protect'

### Hate (UL) [ID: 1893245697] (Score: 0.534)
- **Key:** `1893245697_shared`
- **Original:** *"Evil Character repels Green Brigade."*
- **Decompiled:** *"withdraw This Evil Character."*

### Herod Agrippa II (Ap) [ID: -832897936] (Score: 0.535)
- **Key:** `-832897936_shared`
- **Original:** *"If Herod Agrippa II blocks Paul, Paul's offense decreases by half."*
- **Decompiled:** *"modify stats Paul."*

### Darkness (A) [ID: -607330124] (Score: 0.536)
- **Key:** `-607330124_shared`
- **Original:** *"Evil Character ignors Blue Brigade."*
- **Decompiled:** *"withdraw This Evil Character."*

### Compassion of Jeremiah (L) [ID: -1176075065] (Score: 0.537)
- **Key:** `-1176075065_shared`
- **Original:** *"Hero ignores Red Brigade."*
- **Decompiled:** *"ignore This Hero."*

### Darkness (UL) [ID: 546876925] (Score: 0.538)
- **Key:** `546876925_shared`
- **Original:** *"Evil Character repels Blue Brigade."*
- **Decompiled:** *"withdraw This Evil Character."*

### Job's Wife (Wo) [ID: 1611373965] (Score: 0.54)
- **Key:** `1611373965_shared`
- **Original:** *"All special abilities on Character cards and enhancement cards except this one are negated and prevented.  Battle is determined by the numbers."*
- **Decompiled:** *"negate all except this card character in play, prevent all except this card character in play. negate all except this card enhancement in play, prevent all except this card enhancement in play."*

### Confusion (CoW AB) [ID: -709968123] (Score: 0.541)
- **Key:** `-709968123_shared`
- **Original:** *"Name a card (except a Lost Soul card). Remove Confusion from the game to remove all copies of the named card in a player's deck, discard pile and hand from the game."*
- **Decompiled:** *"banish Confusion, banish 1 except a Lost Soul card from deck, banish 1 except a Lost Soul card from discard pile, banish 1 except a Lost Soul card from hand."*

### Drawn Out [ID: 1795314380] (Score: 0.543)
- **Key:** `1795314380_shared`
- **Original:** *"Take an O.T. male human Hero from deck, discard pile, or hand and put it in territory. Place this card on that Hero. Protect that Hero from evil discard abilities."*
- **Decompiled:** *"You may take 1 your Old Testament male human hero from deck, equip your hero in territory, protect your evil discard abilities hero in territory or You may take 1 your Old Testament male human hero from discard pile, equip your hero in territory, protect your evil discard abilities hero in territory or You may take 1 your Old Testament male human hero from hand, equip your hero in territory, protect your evil discard abilities hero in territory."*

### Abijah, the Conqueror / Abijam, the Half-Hearted (LoC) [ID: -864321273] (Score: 0.544)
- **Key:** `-864321273_bottom`
- **Original:** *"If blocking, you may take an idol or evil female from deck or draw X (limit 3)."*
- **Decompiled:** *"If This card is in battle You may take 1 your evil evil character from deck or may draw 3 your card from deck. Limit."*

### Amos (PoC) [ID: 397050664] (Score: 0.544)
- **Key:** `397050664_shared`
- **Original:** *"STAR: Play a Lost Soul from a deck. HERO: If opponent has board advantage, shuffle up to X of their cards. Cannot be negated if a king of Israel is in play."*
- **Decompiled:** *"play 1 your character from deck. If all your cards in play is in play shuffle opponent's card from hand. Cannot be negated."*

### Battle Axe (Wa) [ID: -1562506344] (Score: 0.545)
- **Key:** `-1562506344_shared`
- **Original:** *"Hero ignores gray brigade."*
- **Decompiled:** *"ignore This Hero."*

### Battle Axe (Ki) [ID: -1962838492] (Score: 0.545)
- **Key:** `-1962838492_shared`
- **Original:** *"Hero ignores gray brigade."*
- **Decompiled:** *"ignore This Hero."*

### Devotion of Ruth (L) [ID: -2069465081] (Score: 0.545)
- **Key:** `-2069465081_shared`
- **Original:** *"Hero ignores Gray Brigade."*
- **Decompiled:** *"ignore This Hero."*

### Devotion of Ruth (B) [ID: -2074861234] (Score: 0.545)
- **Key:** `-2074861234_shared`
- **Original:** *"Hero ignores gray brigade."*
- **Decompiled:** *"ignore This Hero."*

### Devotion of Ruth (UL) [ID: -536924199] (Score: 0.545)
- **Key:** `-536924199_shared`
- **Original:** *"Hero ignores Gray Brigade."*
- **Decompiled:** *"ignore This Hero."*

### Babylonian Siege Army [ID: 2146383899] (Score: 0.546)
- **Key:** `2146383899_shared`
- **Original:** *"Negate a good or neutral card. If it is an Artifact, take it. If it is a human, capture it. If it is an Enhancement, discard it. If it is a Site or Fortress, reserve it."*
- **Decompiled:** *"negate 1 good in play, take 1 artifact in play, capture 1 human in play, discard 1 enhancement in play, reserve 1 site in play."*

### Gifts of the Magi [ID: -1649569821] (Score: 0.547)
- **Key:** `-1649569821_top`
- **Original:** *"Each time an opponent draws a card because of a special ability on a character or enhancement, holder may draw a card."*
- **Decompiled:** *"You may draw 1 your card from deck."*

### Alexandrian Ship [ID: 1864749015] (Score: 0.548)
- **Key:** `1864749015_top`
- **Original:** *"Each upkeep, if you control a Centurion or an Egyptian, you may transfer contents to any Land of Bondage."*
- **Decompiled:** *"If all your Centurion Egyptian in play is in play You may transfer 1 your card in play."*

### Complaint of Moses [ID: 344349034] (Score: 0.549)
- **Key:** `344349034_shared`
- **Original:** *"Return a Hero from a set-aside area to owner's territory.  Hero is returned to face value.  Discard all set-aside cards on that Hero."*
- **Decompiled:** *"place 1 your hero, discard all your on that Hero."*

### Athaliah, Usurper Queen (LoC) [ID: 1676890855] (Score: 0.55)
- **Key:** `1676890855_shared`
- **Original:** *"You may draw X (limit 3). If blocking, you may discard a royal human (except a meek Hero) after battle. Cannot be negated if opponent has used a search ability this turn."*
- **Decompiled:** *"You may draw 3 your card from deck. Cannot be negated. If all your good hero in battle is in battle You may discard 1 your good royal human hero from hand. Cannot be negated."*

### Elymas (Bar-Jesus) the Sorcerer (Ap) [ID: -1881963795] (Score: 0.55)
- **Key:** `-1881963795_shared`
- **Original:** *"Holder must discard a demon from holder's territory and may discard one Hero from each opponent's territory."*
- **Decompiled:** *"discard 1 your evil evil character in play, discard 1 opponent's good hero in play."*

### Jacob's New Name [ID: -823646862] (Score: 0.55)
- **Key:** `-823646862_shared`
- **Original:** *"Set Jacob aside for 1 turn.  Jacob returns increased 3/3 and has first strike ability."*
- **Decompiled:** *"set-aside 1 your good hero in play. gain 1 your good hero in play +3/+3, 1 your good hero in play has first strike."*

### Ashdod [ID: -1944215232] (Score: 0.551)
- **Key:** `-1944215232_shared`
- **Original:** *"While this Site is occupied, your Philistine Evil Characters may use O.T. Enhancements of any evil brigade except orange and pale green."*
- **Decompiled:** *"If Ashdod is in play all your evil Philistine evil character in play may use other enhancements."*

### Children [ID: 320354507] (Score: 0.552)
- **Key:** `320354507_shared`
- **Original:** *"All Gold Brigade Heroes in Holder's territory must join the battle."*
- **Decompiled:** *"band all your good Gold hero in territory."*

### Hebron [ID: 696031614] (Score: 0.552)
- **Key:** `696031614_shared`
- **Original:** *"SITE: If your giant blocks, you may draw X (limit 3). FORT: Protect O.T. red warriors in territory from opponents."*
- **Decompiled:** *"You may draw 3 your card from deck. protect all your good red O.T. cannot_be_targeted character in territory."*

### False Priests [ID: 399055839] (Score: 0.556)
- **Key:** `399055839_shared`
- **Original:** *"You may play one False Peace Enhancement from discard pile.  If you do, remove that card from the game after it takes effect."*
- **Decompiled:** *"You may play False Peace, banish False Peace."*

### Cast into Lion's Den [ID: -1899241932] (Score: 0.557)
- **Key:** `-1899241932_shared`
- **Original:** *"Capture a character in battle. If used by a Daniel Hero or Persian, this ability gains regardless of protection"*
- **Decompiled:** *"You may capture 1 character in battle. Cannot be prevented."*

### Corrupted (Roots) [ID: -376311557] (Score: 0.558)
- **Key:** `-376311557_shared`
- **Original:** *"Place on a human: Convert human to an orange Evil Character."*
- **Decompiled:** *"place 1 human character in play, convert human character in play."*

### Grain Offering [IR] [ID: -264572086] (Score: 0.558)
- **Key:** `-264572086_shared`
- **Original:** *"If used by a Tabernacle priest, interrupt the battle. Bounce up to 3 evil cards (except Dominants)."*
- **Decompiled:** *"If Grain Offering [IR] is in play interrupt This card, bounce 3 evil except Dominants in play."*

### Annas the Elder (GoC) [ID: -2100481405] (Score: 0.559)
- **Key:** `-2100481405_shared`
- **Original:** *"If blocking, you may underdeck a Lost Soul (or 2 meek Lost Souls). May band to a unique Sadducee. If opponent has used a search ability this turn, your Sadducees cannot be negated."*
- **Decompiled:** *"If Annas the Elder is in battle You may underdeck 1 Lost Soul in play or may underdeck 2 Lost Soul in play. You may band 1 evil Sadducee Unique hero in play. give all your evil Sadducee hero in play. Cannot be negated."*

### Delivered [ID: 168335151] (Score: 0.559)
- **Key:** `168335151_shared`
- **Original:** *"STAR: Discard the top card of each opponent's deck. GE/EE: Activate an Artifact from deck (or Reserve if you control an Egyptian)."*
- **Decompiled:** *"discard 1 opponent's cards from deck. You may activate an artifact 1 your artifact from deck."*

### Abandonment (L) [ID: 1459937673] (Score: 0.559)
- **Key:** `1459937673_shared`
- **Original:** *"Evil Character repels Red Brigade."*
- **Decompiled:** *"withdraw This Evil Character."*

### Agur [ID: 388381318] (Score: 0.561)
- **Key:** `388381318_shared`
- **Original:** *"You may place an O.T.  Enhancement from hand (or discard pile if Book of the Law is active) on a human Hero of matching brigade in your territory.  The next time that Hero enters battle, that Enhancement activates and is discarded immediately."*
- **Decompiled:** *"You may place 1 your enhancement from hand. activate an ability all your enhancement in play, discard all your enhancement in play."*

### Heman [ID: 733823712] (Score: 0.562)
- **Key:** `733823712_shared`
- **Original:** *"Heman may use good Enhancements involving music, regardless of brigade color.  May band to Asaph and/or Ethan."*
- **Decompiled:** *"You may 1 your good involve music enhancement from hand may use other enhancements. Regardless. You may band Asaph or Ethan."*

### Arrogance [ID: 82821452] (Score: 0.563)
- **Key:** `82821452_shared`
- **Original:** *"Holder may play as many evil enhancements as desired.  Initiative passes when holder is done playing enhancements."*
- **Decompiled:** *"You may play 1 your evil enhancement from hand."*

### Goshen (Wa) [ID: -390508071] (Score: 0.563)
- **Key:** `-390508071_top`
- **Original:** *"Following draw phase place, remove or exchange up to three Heroes in this site to protect them from harm or effect when they are not in the Field of Battle."*
- **Decompiled:** *"You may protect 3 your good harm effect not in Field of Battle hero in play."*

### Increasing Numbers [ID: -2018537322] (Score: 0.563)
- **Key:** `-2018537322_shared`
- **Original:** *"Search your draw pile for up to two heroes and place them in your territory."*
- **Decompiled:** *"search your good hero from deck, place your good hero from deck."*

### Angel of Deliverance (Ap) [ID: 1533006290] (Score: 0.564)
- **Key:** `1533006290_shared`
- **Original:** *"Hero has access to any site.  Any guards on the site are immediately prevented and discarded.  If Hero wins, Holder may return any Hero held captive at the site to player's territory or count as a redeemed soul."*
- **Decompiled:** *"This Hero has access to any Site. prevent all evil enhancement in play, discard all evil enhancement in play. You may take all good hero in play or You may gain This card."*

### Asahel (TxP) [ID: -1070093237] (Score: 0.564)
- **Key:** `-1070093237_shared`
- **Original:** *"May band to an O.T. warrior class human Hero or may choose opponent's male human Evil Character to block. Protect Asahel from withdraw and return abilities."*
- **Decompiled:** *"You may band 1 your good warrior Old Testament hero in play or You may restrict 1 opponent's evil Male evil character in play. protect 1 your good hero in play."*

### Courage (Ki) [ID: -1778538985] (Score: 0.564)
- **Key:** `-1778538985_shared`
- **Original:** *"Holder may band any Hero from his territory or hand into battle."*
- **Decompiled:** *"You may band your good hero in play or You may band your good hero from hand."*

### Every Tribe (RoJ AB) [ID: -1875239254] (Score: 0.564)
- **Key:** `-1875239254_shared`
- **Original:** *"If you control another Priest, look at the top X cards of deck: Add 1 to hand and topdeck the rest. If you control a good King, Hero may band to a Hero from each opponent. Cannot be interrupted by an evil card."*
- **Decompiled:** *"If all your good hero in play is in play You may look all your cards from deck, take 1 your card from deck, topdeck your card from deck. may band all opponent's hero in play. gain This Hero. Cannot be interrupted."*

### Crooked Ways [ID: -264128981] (Score: 0.568)
- **Key:** `-264128981_shared`
- **Original:** *"Place on your magician: While all of your human Evil Characters are magicians, reveal all cards that your opponents draw"*
- **Decompiled:** *"You may place 1 your hero in play. reveal all opponent's cards from hand."*

### Clemency of David (UL) [ID: -748121087] (Score: 0.57)
- **Key:** `-748121087_shared`
- **Original:** *"Hero ignores Brown Brigade."*
- **Decompiled:** *"ignore all Brown in play."*

### Herod's Temple (Di) [ID: -1895781061] (Score: 0.57)
- **Key:** `-1895781061_top`
- **Original:** *"If your N.T. human is discarded by a special ability used by an opponent, you may discard a card of matching brigade from hand and the top X cards of your deck instead.  Put Lost Souls in play instead."*
- **Decompiled:** *"If discard You may discard 1 your card from hand, discard all your cards from deck. Instead or If discard You may play 1 your Lost Soul from Reserve. Instead."*

### Abram's Army [ID: -514188870] (Score: 0.571)
- **Key:** `-514188870_shared`
- **Original:** *"You may release a captured Hero to negate and discard a single-color Site, Artifact or evil card. Cannot be interrupted by O.T. Evil Characters."*
- **Decompiled:** *"release 1 your hero in play, negate opponent's enhancement in play, discard opponent's enhancement in play. Cannot be interrupted or release 1 your hero in play, negate opponent's artifact in play, discard opponent's artifact in play. Cannot be interrupted or release 1 your hero in play, negate opponent's evil in play, discard opponent's evil in play. Cannot be interrupted."*

### City of Enoch [ID: 112006992] (Score: 0.572)
- **Key:** `112006992_shared`
- **Original:** *"SITE: If you play this Site, you may take an evil antediluvian from deck or Reserve.FORT: While occupied, protect opponent's Heroes from other Heroes."*
- **Decompiled:** *"If City of Enoch is in play You may take 1 your evil antediluvian evil character from deck or may take 1 your evil antediluvian evil character from Reserve. protect all opponent's good hero in play."*

### By My Spirit (LoC) [ID: 1810297174] (Score: 0.573)
- **Key:** `1810297174_shared`
- **Original:** *"Negate an evil or neutral card. If used by a postexilic Hero, discard that card unless it is human. Cannot be negated if used by a meek Hero."*
- **Decompiled:** *"You may negate 1 character in play, discard 1 character in play. Cannot be negated."*

### Christ's Triumph [ID: 38114992] (Score: 0.573)
- **Key:** `38114992_shared`
- **Original:** *"Place on your N.T. human Hero: If your N.T. human Hero fails a rescue attempt, you may discard this card to begin a new rescue attempt with this Hero."*
- **Decompiled:** *"place 1 your good N.T. human hero in play. If all your good N.T. human hero in play is in play discard 1 your enhancement in play, begin a new phase 1 your good N.T. human hero in play."*

### Eldad [ID: 1792308691] (Score: 0.573)
- **Key:** `1792308691_shared`
- **Original:** *"If an opponent harms your wilderness Hero, discard the top card of their deck. While attacking, restrict players from searching all Reserves."*
- **Decompiled:** *"discard 1 opponent's cards from deck. If This card is in battle restrict all search in play."*
- **Fact Violations:** Missing restricted action 'searching' in target identifiers for 'restrict'

### High Priest's Maid [ID: 1301834943] (Score: 0.573)
- **Key:** `1301834943_shared`
- **Original:** *"You may set aside a N.T. human for three turns. If you do, remove this card from the game after battle."*
- **Decompiled:** *"You may set-aside 1 your good N.T. hero from hand this turn, banish This Hero."*

### Banner of Truth (D) [ID: 570414903] (Score: 0.574)
- **Key:** `570414903_shared`
- **Original:** *"All of holder's Heroes gain 2/2 until end of turn."*
- **Decompiled:** *"gain all your good hero in play +2/+2 this turn."*

### Elders of the City (Pi) [ID: 365276396] (Score: 0.574)
- **Key:** `365276396_shared`
- **Original:** *"After a successful rescue attempt, place one Evil Character just defeated into your opponent's Land of Bondage."*
- **Decompiled:** *"place 1 opponent's just_defeated evil character from discard pile."*

### In the Clouds [ID: 885573102] (Score: 0.574)
- **Key:** `885573102_shared`
- **Original:** *"Interrupt the battle and return up to two Heroes in play to owner's hand."*
- **Decompiled:** *"interrupt all cards in battle, bounce 2 good hero in play."*

### Faith of Joseph (CoW AB) [ID: -1894779722] (Score: 0.575)
- **Key:** `-1894779722_shared`
- **Original:** *"You may draw 1. Place in territory: Protect discard pile from opponents. At any time, you may discard this card to release all captured Heroes."*
- **Decompiled:** *"You may draw 1 your card from deck. protect This card. discard Faith of Joseph (CoW AB), release all your good hero."*

### Breastplate of Righteousness [ID: 480523468] (Score: 0.577)
- **Key:** `480523468_shared`
- **Original:** *"Place on your clay, red or white N.T. Hero: Protect Hero from brown and gray. If Hero enters battle, select X evil brigades. Negate Evil Characters of selected brigades."*
- **Decompiled:** *"protect This Hero. If This card is in battle negate all evil character in play."*

### Dangerous Way [ID: -1254444557] (Score: 0.577)
- **Key:** `-1254444557_shared`
- **Original:** *"Evil cards on this site are protected from DragonRaid."*
- **Decompiled:** *"protect all evil on this site in play."*

### Ashkelon [ID: 1119795234] (Score: 0.578)
- **Key:** `1119795234_shared`
- **Original:** *"SITE: If an O.T. Lost Soul is put here, each opponent must discard a card from hand. FORT: Each upkeep, if occupied you may draw X (Limit 3)."*
- **Decompiled:** *"discard 1 opponent's card from hand. You may draw 1 your card from deck. Limit."*

### Evil Angel (Pi) [ID: 1333815357] (Score: 0.578)
- **Key:** `1333815357_shared`
- **Original:** *"Discard any Silver Brigade Hero of */6 or less in play or a set-aside area."*
- **Decompiled:** *"If all your cards in play is in play discard 1 opponent's good Silver hero in play. If all your cards is in set aside discard 1 opponent's good Silver hero."*

### Indentured Servant [ID: -1256555274] (Score: 0.578)
- **Key:** `-1256555274_shared`
- **Original:** *"If your unique Exodus Hero is defeated by an opponent, you may add this Hero to battle."*
- **Decompiled:** *"You may add to battle 1 your hero from hand."*

### Captain of the Host (Ki) [ID: 1915440124] (Score: 0.58)
- **Key:** `1915440124_shared`
- **Original:** *"Negate all non-weapon class special abilities except banding."*
- **Decompiled:** *"negate all character in play, gain all banding character in play."*

### Ezekiel's Stick (UL) [ID: 2061690528] (Score: 0.58)
- **Key:** `2061690528_shared`
- **Original:** *"A second Hero may join the battle this turn."*
- **Decompiled:** *"You may band 1 your good hero in play."*

### Drawn Water [ID: 24896498] (Score: 0.582)
- **Key:** `24896498_shared`
- **Original:** *"Set Hero aside for the number of turns equal to the number of Evil Characters one opponent has in play.  Hero returns with abilities increased by that amount."*
- **Decompiled:** *"You may set-aside 1 your hero in play, gain 1 your hero in play +1/+1."*

### Gathering the Armies [L] [ID: -999112644] (Score: 0.582)
- **Key:** `-999112644_shared`
- **Original:** *"Philistine may band to up to 3 Philistines."*
- **Decompiled:** *"You may band 3 your evil Philistine evil character in play."*

### Gathering the Armies (1st Print - L) [ID: -1369605034] (Score: 0.582)
- **Key:** `-1369605034_shared`
- **Original:** *"Philistine may band to up to 3 Philistines."*
- **Decompiled:** *"You may band 3 your evil Philistine evil character in play."*

### Balaam (FoM) [ID: -1817016546] (Score: 0.583)
- **Key:** `-1817016546_shared`
- **Original:** *"May use gray Enhancements. Take a gray or pale green O.T. Curse from discard pile. Prevent Enhancements. Cannot be prevented."*
- **Decompiled:** *"This Character may use other enhancements. You may take 1 your enhancement from discard pile. You may prevent 1 enhancement in play. Cannot be prevented."*

### False Peace [ID: 226021839] (Score: 0.583)
- **Key:** `226021839_shared`
- **Original:** *"Holder may look through his draw pile and select one card and continue fighting.  Shuffle draw pile after play."*
- **Decompiled:** *"You may look 1 your card from deck. shuffle all your cards from deck."*

### Book of the Wars [ID: 299806379] (Score: 0.584)
- **Key:** `299806379_shared`
- **Original:** *"Hero may use any good enhancement having an illustration depicting a weapon regardless of brigade color until end of turn."*
- **Decompiled:** *"This Hero may use other enhancements this turn."*

### Evil Advice [ID: 2082249767] (Score: 0.584)
- **Key:** `2082249767_shared`
- **Original:** *"Place this card on a Lost Soul.  If it is not rescued by the end of the current player's next turn, discard this card to place the Lost Soul beneath owner's draw pile."*
- **Decompiled:** *"place 1 Lost Soul in play. If end_of_turn discard 1 your enhancement in play, underdeck 1 Lost Soul in play."*

### Hammer of Heaven [ID: -1519585984] (Score: 0.584)
- **Key:** `-1519585984_shared`
- **Original:** *"Holder may return this card to the top of draw pile to negate the special ability on a demon."*
- **Decompiled:** *"topdeck 1 your card in play, negate 1 demon evil character in play."*

### Ahimaaz, the Swift [ID: 858470180] (Score: 0.585)
- **Key:** `858470180_shared`
- **Original:** *"Protect O.T. priests from evil withdraw and reserve abilities. You may play a Lost Soul from a deck or negate a neutral card."*
- **Decompiled:** *"protect all good Old Testament hero in play. You may play Lost Soul or You may negate 1 neutral in play."*

### Abimelech (Pa) [ID: -1963231580] (Score: 0.585)
- **Key:** `-1963231580_shared`
- **Original:** *"Evil Character repels all Heroes with a Judges reference."*
- **Decompiled:** *"withdraw all good Judges hero in battle."*

### Desecration of Graves (Wa) [ID: -897590487] (Score: 0.587)
- **Key:** `-897590487_shared`
- **Original:** *"Select two Heroes in one opponent's Potter's Field and remove them from the game."*
- **Decompiled:** *"banish 2 opponent's Potter's Field hero in play."*

### Jambres (FoM) [ID: -4167402] (Score: 0.587)
- **Key:** `-4167402_shared`
- **Original:** *"Reveal the bottom card of deck: If it is an Exodus card, you may take it. Jambres and copy abilities used by Jambres cannot be negated."*
- **Decompiled:** *"reveal 1 your card from deck, take 1 your Exodus from deck. gain 1 your hero in play. Cannot be negated."*

### Foolish Shepherd [ID: -728374382] (Score: 0.588)
- **Key:** `-728374382_shared`
- **Original:** *"STAR: Discard a good card from a Reserve. EC: Restrict Dominants. May band to an animal."*
- **Decompiled:** *"discard 1 good from Reserve. restrict all opponent's Dominants Dominants from hand until end of phase. You may band 1 animal character in play."*

### Gathering of Angels (GoC) [ID: -439376218] (Score: 0.588)
- **Key:** `-439376218_top`
- **Original:** *"STAR: Resurrect an angel."*
- **Decompiled:** *"You may resurrect 1 your angel Lost Soul from discard pile."*

### Jephthah's Daughter [ID: -1366575202] (Score: 0.588)
- **Key:** `-1366575202_shared`
- **Original:** *"You may banish this Hero to add Jephthah from deck, discard pile or Reserve to battle and choose a human in opponent's territory to block Jephthah."*
- **Decompiled:** *"banish Jephthah's Daughter, add to battle Jephthah, taunt 1 opponent's Human character in territory until end of phase or banish Jephthah's Daughter, add to battle Jephthah, taunt 1 opponent's Human character in territory until end of phase or banish Jephthah's Daughter, add to battle Jephthah, taunt 1 opponent's Human character in territory until end of phase."*

### Conspiring Servants (LoC) [ID: 2138046710] (Score: 0.589)
- **Key:** `2138046710_shared`
- **Original:** *"STAR: Give this card to opponent's territory. EC: Negate your idols and Curses. Each upkeep, you must discard a royal human in territory."*
- **Decompiled:** *"You may give Conspiring Servants (LoC). negate all your idol curse enhancement in play. discard 1 your good royal hero in territory."*

### Elon [ID: -1319298208] (Score: 0.589)
- **Key:** `-1319298208_shared`
- **Original:** *"If opponent has 3 or more evil brigades in territory, return one of opponent's Evil Characters to the bottom of opponent's draw pile."*
- **Decompiled:** *"If all opponent's evil character in territory is in territory underdeck 1 opponent's evil evil character in play."*

### False Prophets (PoC) [ID: 748774156] (Score: 0.589)
- **Key:** `748774156_shared`
- **Original:** *"(Star) Play this character. (EC) If played from hand, you may reserve a card from hand to activate a gray Curse from Reserve on this card."*
- **Decompiled:** *"You may play 1 your character from hand. If False Prophets (PoC) is in play reserve 1 your card from hand, play 1 your gray enhancement from Reserve."*

### Caleb (Promo) [ID: 1875212355] (Score: 0.592)
- **Key:** `1875212355_shared`
- **Original:** *"Caleb may use any empty Lost Soul site from opponent to gain access to a Lost Soul held in a site of the same color.  May band with Joshua.  Caleb ignores Giants."*
- **Decompiled:** *"You may opponent's empty site in play may use other enhancements, opponent's Lost Soul in play has access to any Site. You may band Joshua. ignore This Hero."*

### Good Samaritan [ID: 569487007] (Score: 0.592)
- **Key:** `569487007_shared`
- **Original:** *"Holder may take Kindness from discard pile and place it in player's hand."*
- **Decompiled:** *"You may take Kindness, place your card from hand."*

### Agabus (PC) [ID: -1305841430] (Score: 0.593)
- **Key:** `-1305841430_shared`
- **Original:** *"Negate O.T. Artifacts. You may reveal a hand: if it contains a card with a capture or decrease ability, search discard pile for an Enhancement with one of those abilities."*
- **Decompiled:** *"negate all Old Testament artifact in play. reveal This card, search all your enhancement from discard pile."*

### Breastplate of Righteousness (Ki) [ID: 1336406851] (Score: 0.593)
- **Key:** `1336406851_shared`
- **Original:** *"Hero is immune to crimson brigade.  Holder may play the next enhancement."*
- **Decompiled:** *"immune This Hero. You may play 1 your enhancement from hand."*
- **Fact Violations:** Missing card protection action: 'protect'

### Ezra [ID: -865345080] (Score: 0.593)
- **Key:** `-865345080_shared`
- **Original:** *"Return one captured Hero to owner's territory.  Interrupt that player's Wall of Protection.  Ezra may band with that Hero."*
- **Decompiled:** *"You may release 1 captured hero in play, interrupt 1 opponent's Wall of Protection in play, band 1 returned hero in play."*

### City of Refuge [ID: 1605169800] (Score: 0.594)
- **Key:** `1605169800_top`
- **Original:** *"If your human would be removed from the game by an opponent, instead place it here.  Protect cards here from effect.  If a High Priest is discarded from play, release all characters from here to your territory."*
- **Decompiled:** *"If would_be_removed_from_game_by_opponent place all your human character in play. Instead. protect all your on this site in play. If discarded_from_play release all your on this site character in play."*

### Faith of Moses' Parents [ID: -319412362] (Score: 0.594)
- **Key:** `-319412362_shared`
- **Original:** *"Interrupt the battle. Hero ignores an evil brigade in battle. Cannot be prevented if used by a cloud Hero."*
- **Decompiled:** *"If This card is in play You may interrupt all cards in battle, ignore all evil character in battle until end of phase. Cannot be prevented."*

### Bethlehem Stable (GoC) [ID: -1838539963] (Score: 0.595)
- **Key:** `-1838539963_top`
- **Original:** *"Protect hand, deck and Reserve from opponents. If your nativity Hero is harmed or defeated by an opponent, you may reserve it instead. Each upkeep, you may take a good nativity card from Reserve."*
- **Decompiled:** *"protect This card, protect your card from deck, protect This card. You may reserve This Hero. Instead. You may take 1 your good from Reserve."*

### Helmet of Brass (Wa) [ID: 621899785] (Score: 0.595)
- **Key:** `621899785_shared`
- **Original:** *"Worth 6/8 if played against Crimson Brigade."*
- **Decompiled:** *"If played This card is worth +6/+8."*

### Desolate City [ID: 1909960815] (Score: 0.596)
- **Key:** `1909960815_shared`
- **Original:** *"Evil cards on this site are protected from DragonRaid."*
- **Decompiled:** *"protect all evil on this site evil character in play."*

### Ezekiel's Stick (L) [ID: -30651738] (Score: 0.596)
- **Key:** `-30651738_shared`
- **Original:** *"A second Hero may join the battle this turn."*
- **Decompiled:** *"You may band 1 your hero in play."*

### Frog Demons (Wa) [ID: -1492779832] (Score: 0.596)
- **Key:** `-1492779832_shared`
- **Original:** *"Evil Character is immune to Purple Brigade."*
- **Decompiled:** *"protect This Evil Character."*

### Hezekiah's Signet Ring [ID: -1787161312] (Score: 0.596)
- **Key:** `-1787161312_top`
- **Original:** *"No opponent may search any draw pile or discard pile."*
- **Decompiled:** *"restrict all opponent's search in play."*

### Covering the Sacred Things [ID: 1742678859] (Score: 0.597)
- **Key:** `1742678859_shared`
- **Original:** *"Place on any active Tabernacle Artifact.  That Artifact cannot be negated or discarded while a Priest is in play.  If that Artifact is deactivated, return this card to hand."*
- **Decompiled:** *"place 1 Tabernacle active artifact in play, gain 1 your Tabernacle artifact in play. Cannot be negated. Cannot be prevented. If all your Tabernacle deactivated artifact in play is in play bounce 1 your artifact in play."*

### Ambush! (GoC) [ID: -1027223523] (Score: 0.598)
- **Key:** `-1027223523_shared`
- **Original:** *"Interrupt the battle. You may take a thief from Reserve. Character may band to any number of N.T. crimson humans. Cannot be negated if used by a thief."*
- **Decompiled:** *"You may search 1 your evil evil character from Reserve, band your crimson character in play. Cannot be negated."*

### Disuading Speech [ID: -1840761855] (Score: 0.598)
- **Key:** `-1840761855_shared`
- **Original:** *"Holder may choose the Hero his opponent uses in battle."*
- **Decompiled:** *"You may choose opponent 1 opponent's card in play."*

### Angel of God [2023 - National] [ID: 1174674772] (Score: 0.599)
- **Key:** `1174674772_bottom`
- **Original:** *"H: Negate up to X evil cards."*
- **Decompiled:** *"You may negate evil in play."*

### Chief Captain Lysias [ID: -1188531134] (Score: 0.599)
- **Key:** `-1188531134_shared`
- **Original:** *"If Lysias successfully blocks, he may be placed on a N.T. site.  When rescue is attempted at the site, Lysias joins the blocker in battle."*
- **Decompiled:** *"If Lysias is in battle You may place This Hero. add to battle This Hero."*

### David's Descendant (LoC) [ID: -328585832] (Score: 0.6)
- **Key:** `-328585832_shared`
- **Original:** *"STAR: Reveal hand: If there is no Hero, take one from deck. GE: You may take a good O.T. Fortress from deck or Reserve. If played in battle, discard up to X Evil Characters."*
- **Decompiled:** *"If all your cards from hand is in hand take 1 your good hero from deck. You may take O.T. Fortress or You may take O.T. Fortress. If David's Descendant (LoC) is in battle You may discard all opponent's evil evil character in play."*

### Angel of the Waters [ID: 1958295081] (Score: 0.601)
- **Key:** `1958295081_shared`
- **Original:** *"Silver brigade Heroes cannot be taken prisoner this turn."*
- **Decompiled:** *"protect all good silver hero in play this turn."*

### Corrupted [ID: 557919552] (Score: 0.601)
- **Key:** `557919552_shared`
- **Original:** *"Convert a human Hero to a brown brigade Evil Character.  Cannot be prevented by a good card if an occupied Site is in play."*
- **Decompiled:** *"If all site in play is in play convert 1 good Human hero in play. Cannot be prevented."*

### Banishment [ID: 846722336] (Score: 0.602)
- **Key:** `846722336_shared`
- **Original:** *"Take any demon prisoner and place in your Tartaros site.  If Tartaros is not in play, discard the demon."*
- **Decompiled:** *"take 1 opponent's evil demon in play, place your evil demon in play, discard your evil demon in play."*

### Coat of Mail (Ki) [ID: 1914795075] (Score: 0.602)
- **Key:** `1914795075_shared`
- **Original:** *"Holder may negate and discard one evil weapon class enhancement on an Evil Character.  Any time during battle, holder may discard Coat of Mail to return bearer being discarded to your territory."*
- **Decompiled:** *"You may negate evil weapon class on evil character enhancement in play, discard evil weapon class on evil character enhancement in play. discard This card, place This Hero."*

### Crowd's Choice (GoC) [ID: -1953554392] (Score: 0.602)
- **Key:** `-1953554392_shared`
- **Original:** *"LAMB: You may take a good card from deck or Reserve. REAPER: You may take an evil card from deck or Reserve."*
- **Decompiled:** *"You may take 1 your good from deck or You may take 1 your good from Reserve. You may take 1 your evil from deck or You may take 1 your evil from Reserve."*

### James (half-brother of Jesus [ID: 1434778700] (Score: 0.602)
- **Key:** `1434778700_shared`
- **Original:** *"Hero has access to Jerusalem site."*
- **Decompiled:** *"This Hero has access to any Site."*

### Assyria's Tribute [ID: -1828165989] (Score: 0.603)
- **Key:** `-1828165989_top`
- **Original:** *"While you are blocking with an Assyrian, negate all special abilities on Enhancements and Heroes. Cannot be negated during the battle phase. May be used twice per game."*
- **Decompiled:** *"If block negate all enhancement in play, negate all good hero in play. Cannot be negated. Limit."*

### Benaiah (Wa) [ID: 1954315913] (Score: 0.603)
- **Key:** `1954315913_shared`
- **Original:** *"All special abilities on character cards and enhancement cards except this one are interrupted and prevented.  Battle is determined by the numbers."*
- **Decompiled:** *"interrupt all special ability character in play, prevent all special ability character in play. interrupt all special ability enhancement in play, prevent all special ability enhancement in play."*

### Charred Vine [ID: -1072745363] (Score: 0.603)
- **Key:** `-1072745363_shared`
- **Original:** *"Set Hero aside for five turns.  On turn six Hero returns with abilities increased 7/7."*
- **Decompiled:** *"set-aside 1 your hero in play, play 1 your hero +7/+7."*

### Asaph [ID: -1702895840] (Score: 0.604)
- **Key:** `-1702895840_shared`
- **Original:** *"Good Enhancements involving music cannot be negated by evil cards."*
- **Decompiled:** *"gain all your good involve music enhancement in play. Cannot be negated."*

### Abandonment (UL) [ID: 112834751] (Score: 0.604)
- **Key:** `112834751_shared`
- **Original:** *"Evil Character repels Red Brigade."*
- **Decompiled:** *"If battle withdraw all opponent's Red Brigade character in battle."*

### Abner, the Commander (Roots) [ID: 809979804] (Score: 0.605)
- **Key:** `809979804_shared`
- **Original:** *"Negate a good card. If alone, you may choose an O.T. Hero to attack. Cannot be prevented."*
- **Decompiled:** *"negate 1 good character in play. Cannot be prevented. If Abner, the Commander (Roots) is in battle You may choose opponent 1 good O.T. hero in play. Cannot be prevented."*

### Covenant Keepers [ID: -1106378997] (Score: 0.605)
- **Key:** `-1106378997_shared`
- **Original:** *"You may search draw pile for a Covenant, or an Artifact with 'Covenant' in the title, and add it to hand."*
- **Decompiled:** *"You may search Covenant, take 1 your card from deck or You may search 1 your Covenant artifact from deck, take 1 your card from deck."*

### Golden Calf (FoM) [ID: -567044804] (Score: 0.605)
- **Key:** `-567044804_top`
- **Original:** *"Restrict opponents from playing Enhancements unless a character is in battle. Negate characters in other territories."*
- **Decompiled:** *"If all your cards in battle is in battle restrict all opponent's play in play. negate all opponent's character in play."*
- **Fact Violations:** Missing restricted action 'playing' in target identifiers for 'restrict'

### Holy Grail [ID: 604138061] (Score: 0.605)
- **Key:** `604138061_top`
- **Original:** *"Holder may convert one human evil character per turn into a Hero in the brigade color of holder's choice.  Holder is limited to two such conversions per game."*
- **Decompiled:** *"You may convert 1 evil evil character in play. (limit 1). (limit 2)."*

### Covenant of Abraham [ID: -811903860] (Score: 0.606)
- **Key:** `-811903860_shared`
- **Original:** *"Use as an enhancement or an Artifact.  No Evil Character may be set aside while this card is in play."*
- **Decompiled:** *"ignore This card. If Covenant of Abraham is in play restrict all evil character in play."*

### Flight of Spies [ID: -2002743860] (Score: 0.606)
- **Key:** `-2002743860_shared`
- **Original:** *"Up to two Heroes may retreat from battle unharmed.  One good enhancement may be returned to holder's hand."*
- **Decompiled:** *"You may withdraw 2 your hero in battle. You may bounce 1 good enhancement in play."*

### Abel's Sacrifice [ID: 1728300639] (Score: 0.607)
- **Key:** `1728300639_shared`
- **Original:** *"Abel's Sacrifice and all good enhancements played after it this turn may not be interrupted or prevented."*
- **Decompiled:** *"protect This Hero this turn, protect all your good enhancement in play this turn. Cannot be interrupted. Cannot be prevented."*

### Doomed Conspirators [ID: -43469145] (Score: 0.607)
- **Key:** `-43469145_shared`
- **Original:** *"If blocking, search deck for a Curse. If a missionary is defeated, shuffle any number of Lost Souls. Otherwise, discard this Evil Character after battle. May band to a mob."*
- **Decompiled:** *"If Doomed Conspirators is in battle search 1 your Curse enhancement from deck. If all your good hero from discard pile is in discard pile shuffle all Lost Soul from Reserve. discard 1 your evil hero in play. You may band 1 evil mob hero in play."*

### Captive Princes [ID: 704610103] (Score: 0.608)
- **Key:** `704610103_shared`
- **Original:** *"You may capture this character to opponent's Land of Bondage to look at opponent's hand or Reserve add a human of matching brigade to battle."*
- **Decompiled:** *"capture 1 your good hero in play, look all opponent's cards from hand or capture 1 your good hero in play, add to battle all your good character from Reserve."*

### I Am He (GoC) [ID: -1299410598] (Score: 0.608)
- **Key:** `-1299410598_shared`
- **Original:** *"STAR: Look at a hand or a Reserve. GE: You may reveal a good Dominant from hand to protect Lost Souls from evil cards and disciples from harm this turn."*
- **Decompiled:** *"look all opponent's cards from hand or look all cards from Reserve. reveal 1 your good character from hand, protect all harm evil cards disciples Lost Soul in play this turn."*

### Adino's Spear (Ki) [ID: 180354666] (Score: 0.609)
- **Key:** `180354666_shared`
- **Original:** *"Hero is immune to Gold Brigade."*
- **Decompiled:** *"immune This Hero."*
- **Fact Violations:** Missing card protection action: 'protect'

### Adino's Spear (Wa) [ID: 894516778] (Score: 0.609)
- **Key:** `894516778_shared`
- **Original:** *"Hero is immune to Gold Brigade."*
- **Decompiled:** *"immune This Hero."*
- **Fact Violations:** Missing card protection action: 'protect'

### Ahimelech, Priest at Nob [ID: -699735465] (Score: 0.609)
- **Key:** `-699735465_shared`
- **Original:** *"Search discard pile for a weapon class Enhancement and place on your warrior class Hero that has no weapon and convert weapon to that Hero's brigade."*
- **Decompiled:** *"search 1 your Weapon enhancement from discard pile, place 1 your Weapon enhancement from discard pile, convert 1 your Weapon enhancement in play."*

### Contagious Fear (GoC) [ID: 1137272339] (Score: 0.609)
- **Key:** `1137272339_top`
- **Original:** *"STAR: Reserve the top card of a deck."*
- **Decompiled:** *"You may reserve 1 from deck."*

### Achan (Pa) [ID: -1524106876] (Score: 0.61)
- **Key:** `-1524106876_shared`
- **Original:** *"Joshua's strength (*/) is reduced by 5 while Achan remains in play."*
- **Decompiled:** *"Joshua is worth -5/0."*

### Angel's Sword [ID: 325104149] (Score: 0.61)
- **Key:** `325104149_shared`
- **Original:** *"If blocked by a human Evil Character, Hero may play the first enhancement."*
- **Decompiled:** *"If blocked You may play 1 your enhancement from hand."*

### Brought to Egypt [ID: -160510189] (Score: 0.61)
- **Key:** `-160510189_shared`
- **Original:** *"Interrupt the battle. You may take a son of Jacob from Reserve. Hero may band to up to 3 sons of Jacob."*
- **Decompiled:** *"You may interrupt 1 in battle. You may take 1 your hero from Reserve. You may band 3 hero in play."*

### Foolish Builder (GoC) [ID: 1609408629] (Score: 0.61)
- **Key:** `1609408629_bottom`
- **Original:** *"Each upkeep, you must give a Site or Fortress to owner's territory. If you cannot, discard the bottom card of deck."*
- **Decompiled:** *"give 1 your site from hand, discard 1 your card from deck."*

### Beast from the Earth (Wa) [ID: 1456858680] (Score: 0.611)
- **Key:** `1456858680_shared`
- **Original:** *"Character is immune to all female heroes."*
- **Decompiled:** *"immune This Hero."*
- **Fact Violations:** Missing card protection action: 'protect'

### Conqueror over Death [ID: -945112256] (Score: 0.612)
- **Key:** `-945112256_shared`
- **Original:** *"Return all Heroes in your Potter's Field to the field of play.  This ability cannot be negated."*
- **Decompiled:** *"place all your good hero. Cannot be negated."*

### Evil Armor (D) [ID: -260390194] (Score: 0.612)
- **Key:** `-260390194_shared`
- **Original:** *"All of holder's Evil Characters gain 2/3 until end of battle."*
- **Decompiled:** *"gain all your evil evil character in play +2/+3 until end of phase."*

### Deceit & Vengeance [ID: -1353929142] (Score: 0.613)
- **Key:** `-1353929142_shared`
- **Original:** *"Set aside opponent's males in battle and all evil males in opponent's territory for 3 turns. On return, if this is used by a son of Jacob, discard those males."*
- **Decompiled:** *"set-aside all opponent's male character in battle until end of phase, set-aside all opponent's evil male character in territory until end of phase, discard opponent's male character, discard opponent's male character."*

### Gifts for Esau [ID: 637824990] (Score: 0.613)
- **Key:** `637824990_shared`
- **Original:** *"If blocking Jacob, all good strength (*/), including Jacob's is ignored.  Only good special abilities and toughness (/*) have effect."*
- **Decompiled:** *"If Jacob is in battle ignore all good hero in battle until end of phase."*

### Abigail (1st Print - K) [ID: -1506905177] (Score: 0.614)
- **Key:** `-1506905177_shared`
- **Original:** *"You may choose an Evil Character to block."*
- **Decompiled:** *"You may add to battle 1 evil evil character in play."*

### Cup of Wrath [ID: 2131131542] (Score: 0.614)
- **Key:** `2131131542_shared`
- **Original:** *"Holder may take any two Evil Characters in play and cause them to fight each other.  The loser is discarded."*
- **Decompiled:** *"You may take 2 evil evil character in play, discard 1 evil evil character in play."*

### Darkness (Wa) [ID: -614244789] (Score: 0.615)
- **Key:** `-614244789_shared`
- **Original:** *"All Heroes in battle lose their way and withdraw.  Opponent must present a new Hero or rescue attempt fails."*
- **Decompiled:** *"withdraw all hero in battle. present 1 opponent's hero from hand, end the battle all cards in battle."*

### False Witnesses (Roots) [ID: -1350324470] (Score: 0.615)
- **Key:** `-1350324470_shared`
- **Original:** *"Capture a Hero to a player. Cannot be prevented if used by a Sadducee."*
- **Decompiled:** *"You may capture 1 opponent's hero in play. Cannot be prevented."*

### Claudia [ID: -1618711053] (Score: 0.616)
- **Key:** `-1618711053_shared`
- **Original:** *"Claudia may band with any male Hero from the New Testament each turn."*
- **Decompiled:** *"You may band 1 good male New Testament hero in play. Limit."*

### Eye On It [ID: 1564087528] (Score: 0.616)
- **Key:** `1564087528_shared`
- **Original:** *"Place on your clay Hero: After this Hero makes a successful rescue or covnerts an Evil Character in battle, reveal top X cards of your deck; you may take one to hand and return each otehr card to the top or bottom of deck. Cannot be negated."*
- **Decompiled:** *"After this Hero makes a successful rescue or converts an Evil Character in battle reveal all your cards from deck, take 1 your card from deck, topdeck all your cards from deck. Cannot be negated."*

### Jairus' Daughter (Wo) [ID: -1145240865] (Score: 0.616)
- **Key:** `-1145240865_shared`
- **Original:** *"The first time this hero is about to be discarded, return her to your territory and increase her by 2/2."*
- **Decompiled:** *"If discard place 1 your good hero in play, increase 1 your good hero in play +2/+2. (limit 1)."*

### Ahaz, the Unfaithful (LoC) [ID: 968734370] (Score: 0.617)
- **Key:** `968734370_shared`
- **Original:** *"STAR: Underdeck a meek Lost Soul. EC: Negate protect abilities on other cards. Opponent may discard their human. If they do not, protect meek Lost Souls from rescue. Cannot be prevented."*
- **Decompiled:** *"underdeck Lost Soul. negate all cards in play. You may discard 1 opponent's Human character in play or protect Lost Soul until end of phase. Cannot be prevented."*

### Fruitless Tree [ID: 827552896] (Score: 0.617)
- **Key:** `827552896_shared`
- **Original:** *"Remove a Hero in a territory from the game."*
- **Decompiled:** *"You may banish 1 in a territory hero in play."*

### Haman (Promo) [ID: 494103683] (Score: 0.617)
- **Key:** `494103683_shared`
- **Original:** *"Set aside up to three O.T. male Heroes in opponents' territories for four turns. If a female Hero does not make a successful rescue attempt during those four turns, discard those Heroes."*
- **Decompiled:** *"set-aside 3 opponent's good O.T. male hero in play, discard opponent's good hero."*

### Chastisement of the Lord (L) [ID: 1964372488] (Score: 0.618)
- **Key:** `1964372488_shared`
- **Original:** *"Set Hero aside for three turns.  On turn four Hero returns with abilities increased 6/6."*
- **Decompiled:** *"set-aside This Hero, place your hero +6/+6."*

### Faith as Children (Wa) [ID: 1813792137] (Score: 0.621)
- **Key:** `1813792137_shared`
- **Original:** *"All holder's Heroes gain 4/4 until end of holder's turn."*
- **Decompiled:** *"gain all your hero in play +4/+4 this turn."*

### I am Sustainer [ID: -595114592] (Score: 0.621)
- **Key:** `-595114592_shared`
- **Original:** *"Protect holder's Heroes from having their abilities reduced.  Restore all of holder's Heroes to full abilities."*
- **Decompiled:** *"protect all your good abilities reduced hero in play. heal all your good hero in play."*

### Isaac Deceived [ID: 184059231] (Score: 0.621)
- **Key:** `184059231_shared`
- **Original:** *"Return any Hero in battle to owner's territory."*
- **Decompiled:** *"You may withdraw 1 good hero in battle."*

### Angel at Shur (Wa) [ID: -1187490455] (Score: 0.622)
- **Key:** `-1187490455_shared`
- **Original:** *"Hero is immune to demons and beasts."*
- **Decompiled:** *"immune This Hero."*
- **Fact Violations:** Missing card protection action: 'protect'

### Banks of the Nile/Pharaoh's Court [ID: -1331490969] (Score: 0.622)
- **Key:** `-1331490969_bottom`
- **Original:** *"While this Site is occupied, prevent ignore abilities on opponent's good O.T. cards."*
- **Decompiled:** *"prevent all opponent's good O.T. hero in play."*

### Covenant of Prayer (RoJ AB) [ID: -1750024669] (Score: 0.622)
- **Key:** `-1750024669_shared`
- **Original:** *"You may banish this card to add to hand your card that was banished by an opponent or a card from Reserve."*
- **Decompiled:** *"banish 1 your card in play, bounce 1 your card from discard pile or banish 1 your card in play, bounce 1 your card from Reserve."*

### Amorite Invasion [ID: -2053406169] (Score: 0.623)
- **Key:** `-2053406169_shared`
- **Original:** *"Worth 2/10 against a Hero who fought in an earthly battle."*
- **Decompiled:** *"This Character is worth +2/+10."*

### Gentle Resolution [ID: 2075447589] (Score: 0.624)
- **Key:** `2075447589_shared`
- **Original:** *"Convert a human evil character to a green brigade hero."*
- **Decompiled:** *"You may convert human evil character in play."*

### Ark of the Covenant (Wa) [ID: -558431000] (Score: 0.625)
- **Key:** `-558431000_top`
- **Original:** *"Regardless of battle outcome, any Evil Character an opponent uses to block a rescue attempt is discarded at the end of battle.  Limit Holder to two such discards per game."*
- **Decompiled:** *"discard 1 opponent's evil evil character in play. Limit."*

### Elijah in Glory (GoC) [ID: 192892147] (Score: 0.625)
- **Key:** `192892147_shared`
- **Original:** *"STAR: Look at a hand or a Reserve. HERO: If Transfiguration is in battle, banish this card to protect your good cards from evil cards. Cannot be prevented."*
- **Decompiled:** *"You may look 1 from hand or You may look 1 from Reserve. If Transfiguration is in battle banish Elijah in Glory (GoC), protect all your good in play until end of phase. Cannot be prevented."*

### Eunice [ID: 1956096672] (Score: 0.625)
- **Key:** `1956096672_shared`
- **Original:** *"May band to Timothy and gain 2/2."*
- **Decompiled:** *"You may band Timothy, gain 1 your hero in play +2/+2 until end of phase."*

### Asa's Good Reign [ID: -901535226] (Score: 0.626)
- **Key:** `-901535226_shared`
- **Original:** *"Place this card on your good King for 3 turns. While this remains, your O.T. Heroes are immune to warrior class Evil Characters."*
- **Decompiled:** *"place your good hero in play until end of phase. immune all your good O.T. hero in play."*
- **Fact Violations:** Missing card protection action: 'protect'

### David's Harp [ID: -674230623] (Score: 0.626)
- **Key:** `-674230623_top`
- **Original:** *"Following a rescue attempt holder may select one Hero that is about to be discarded and place Hero on top of owner's draw pile.  Prevent Evil Spirit"*
- **Decompiled:** *"If rescue_attempt You may topdeck 1 about to be discarded hero in play. prevent 1 evil evil character in play."*

### The Frog Demons (RoJ AB) [ID: 1249891324] (Score: 0.626)
- **Key:** `1249891324_shared`
- **Original:** *"You may search deck or Reserve for a human king. Frog Demons may band to a Revelation 12-19 Evil Character. Cannot be negated if blocking an angel."*
- **Decompiled:** *"You may search 1 your good Human King hero from deck. You may search 1 your good Human King hero from Reserve. You may band 1 opponent's evil Revelation 12 19 evil character in battle. Cannot be negated."*
- **Fact Violations:** Missing numbers in AST: [19]

### Bereans [ID: 535352430] (Score: 0.627)
- **Key:** `535352430_shared`
- **Original:** *"You may exchange a good O.T. card in hand with a good N.T. Enhancement in deck or discard pile. May band to a Missionary."*
- **Decompiled:** *"You may exchange 1 your good O.T. character from hand. You may band 1 your good Missionary hero in play."*

### Harvest Time (GoC) [ID: 957979145] (Score: 0.627)
- **Key:** `957979145_top`
- **Original:** *"Select a number. Play that number of Lost Souls from each deck. Regardless of protect abilities."*
- **Decompiled:** *"You may unknown your card from hand, play all Lost Soul from deck. Regardless."*

### Help from Heaven [ID: -1849128064] (Score: 0.627)
- **Key:** `-1849128064_shared`
- **Original:** *"Search your draw pile for any silver brigade enhancement and add it to your hand.  Shuffle draw pile."*
- **Decompiled:** *"search 1 your silver enhancement from deck, shuffle all your cards from deck."*

### House Arrest [ID: -1490529375] (Score: 0.627)
- **Key:** `-1490529375_shared`
- **Original:** *"Remove selected human Evil Character from the game after its next battle."*
- **Decompiled:** *"If battle_end banish 1 your evil human evil character in play."*

### Burst of Light [ID: -2026804768] (Score: 0.628)
- **Key:** `-2026804768_shared`
- **Original:** *"Shuffle one 'The Darkness' fortress and its contents into owner's draw pile."*
- **Decompiled:** *"shuffle The Darkness."*

### Chastisement of the Lord (Promo) [ID: 941312626] (Score: 0.628)
- **Key:** `941312626_shared`
- **Original:** *"Set Hero aside for two turns.  On turn three Hero returns with abilities increased 6/6."*
- **Decompiled:** *"set-aside 1 your good hero in play, play 1 your good hero +6/+6."*

### Falling Away (Promo 2018) [ID: 1165627721] (Score: 0.628)
- **Key:** `1165627721_top`
- **Original:** *"Underdeck an angel, or convert a human Hero to an Evil Character in any brigade until end of turn."*
- **Decompiled:** *"You may underdeck 1 character in play or You may convert 1 good human hero in play this turn."*

### High Priest's Plot [ID: -1340755120] (Score: 0.628)
- **Key:** `-1340755120_shared`
- **Original:** *"If used by a Sadducee, look at one opponent's hand.  Discard one good card in that hand.  Cannot be negated if Judas Iscariot is in play."*
- **Decompiled:** *"If High Priest's Plot is in play You may look 1 opponent's card from hand, discard 1 opponent's good from hand. Cannot be negated."*

### Arrogance (LoC) [ID: -2139719223] (Score: 0.629)
- **Key:** `-2139719223_shared`
- **Original:** *"If used by an O.T. human, you may negate and discard a good multi-brigade Enhancement. Cannot be negated if used by a taunting character."*
- **Decompiled:** *"You may negate good multi-brigade enhancement in play, discard good multi-brigade enhancement in play. gain This card. Cannot be negated."*

### David (Red) (Ki) [ID: -1954962470] (Score: 0.629)
- **Key:** `-1954962470_shared`
- **Original:** *"David may use and hold one weapon class enhancement from any good brigade except silver."*
- **Decompiled:** *"You may 1 your good weapon class except silver enhancement from hand may use other enhancements, hold 1 your good weapon class except silver enhancement in play."*

### Desecration of Graves (Pi) [ID: -1857229880] (Score: 0.629)
- **Key:** `-1857229880_shared`
- **Original:** *"Select up to two Heroes from one opponent's discard pile and/or Fortress and remove them from the game."*
- **Decompiled:** *"You may banish 2 opponent's good hero from discard pile or You may banish 2 good Fortress hero in play."*

### Edomite Camp (LoC) [ID: -1898184372] (Score: 0.629)
- **Key:** `-1898184372_top`
- **Original:** *"While blocking, negate Heroes with toughness X or less."*
- **Decompiled:** *"negate all opponent's good hero in play."*

### Ezekiel (Pi) [ID: 1877430536] (Score: 0.629)
- **Key:** `1877430536_shared`
- **Original:** *"This Hero may use good Enhancements with an Ezekiel reference, regardless of brigade color.  Cannot be negated."*
- **Decompiled:** *"You may play 1 your good Ezekiel reference enhancement from hand. Cannot be negated."*

### Faith of Moses' Parents (CoW AB) [ID: -858246615] (Score: 0.629)
- **Key:** `-858246615_shared`
- **Original:** *"Interrupt the battle. Hero ignores an evil brigade in battle. Cannot be prevented if used by a cloud Hero."*
- **Decompiled:** *"interrupt all cards in battle. withdraw all opponent's evil evil character in battle. Cannot be prevented."*

### Every Tribe (RoJ) [ID: 933881873] (Score: 0.63)
- **Key:** `933881873_shared`
- **Original:** *"If you control another Priest, look at the top X cards of deck: Add 1 to hand and topdeck the rest. If you control a good King, Hero may band to a Hero from each opponent. Cannot be interrupted by an evil card."*
- **Decompiled:** *"If all your good hero in play is in play look all your cards from deck, take 1 your card from deck, topdeck your card from deck. If all your good King hero in play is in play You may band all opponent's hero in play. gain This Hero. Cannot be interrupted."*

### Faith of Enoch [ID: 1962431780] (Score: 0.63)
- **Key:** `1962431780_shared`
- **Original:** *"Place on your cloud Hero: If Hero is discarded by an opponent's evil special ability, you may remove this card from the game instead to rescue the Hero as if it were a Lost Soul."*
- **Decompiled:** *"If discard You may banish Faith of Enoch, rescue 1 your good cloud hero in play. Instead."*

### Jairus' Daughter (H) [ID: -657271070] (Score: 0.63)
- **Key:** `-657271070_shared`
- **Original:** *"The first time this hero is about to be discarded, return her to your territory and increase her by 2/2."*
- **Decompiled:** *"If would_be_discarded place 1 your hero in play, increase 1 your hero in play +2/+2. (limit 1). Instead."*

### Falling Away (CoW) [ID: 1924174347] (Score: 0.631)
- **Key:** `1924174347_top`
- **Original:** *"Underdeck an angel, or convert a human Hero to an Evil Character in any brigade until end of turn."*
- **Decompiled:** *"You may underdeck 1 your good hero from hand or You may convert 1 your good human hero in play this turn."*

### Foolish Edomites [ID: 454293457] (Score: 0.631)
- **Key:** `454293457_shared`
- **Original:** *"STAR: Give this card to opponent's territory. EC: If you use a draw ability, underdeck a card from hand. If this card is discarded, each player may resurrect a Hero."*
- **Decompiled:** *"place 1 your character in play. You may draw 1 your card from deck, underdeck 1 your card from hand. If This card is in discard pile You may resurrect 1 hero from discard pile."*

### Book of Jashar [ID: -1761830176] (Score: 0.632)
- **Key:** `-1761830176_shared`
- **Original:** *"This enhancement duplicates (becomes an exact copy of) the previous good enhancement played by holder this turn."*
- **Decompiled:** *"copy 1 your good enhancement in play."*

### Deafening Spirit (GoC) [ID: -2060527099] (Score: 0.632)
- **Key:** `-2060527099_shared`
- **Original:** *"If put in play (or if played from a territory), negate a good card this turn. If it is an Enhancement, discard it. You may convert this Enhancement to an Evil Character."*
- **Decompiled:** *"negate 1 good in play this turn, discard 1 good enhancement in play. You may convert 1 your good enhancement in play."*

### Drusilla [ID: 1382080290] (Score: 0.632)
- **Key:** `1382080290_shared`
- **Original:** *"If blocking, discard the top card of opponent's deck (put a Lost Soul in play instead). You may withdraw a Hero with a different testament than that card."*
- **Decompiled:** *"If This card is in battle discard 1 opponent's cards from deck. Instead. You may withdraw 1 different testament than that card hero in play."*

### I am Mercy [ID: -902357984] (Score: 0.632)
- **Key:** `-902357984_shared`
- **Original:** *"Protect holder's hand and draw pile from discard abilities on evil cards."*
- **Decompiled:** *"protect all your discard from hand, protect all your discard from deck."*

### Alexander the Great [ID: -213074732] (Score: 0.633)
- **Key:** `-213074732_shared`
- **Original:** *"First strike. Take a City or Artifact, discard a multi-brigade card, or each player must draw 1. If this card is discarded, you may withdraw it instead. May band to a Greek warrior. Cannot be prevented."*
- **Decompiled:** *"This Hero has first strike. Cannot be prevented. You may take City or Artifact. Cannot be prevented or You may discard 1 from hand. Cannot be prevented or You may draw 1 from hand from deck. Cannot be prevented. If Alexander the Great is in discard pile You may withdraw Alexander the Great. Cannot be prevented. You may band 1 greek hero in play. Cannot be prevented."*

### Flight (G) [ID: 665454593] (Score: 0.633)
- **Key:** `665454593_shared`
- **Original:** *"All banding of Heroes is prevented, interrupted and/or negated during this battle."*
- **Decompiled:** *"prevent all good band hero in play."*

### Adino (Ki) [ID: 1633621557] (Score: 0.635)
- **Key:** `1633621557_shared`
- **Original:** *"If Adino is holding a spear he gains 3/3 and prevents all special abilities except banding on non-weapon class enhancements."*
- **Decompiled:** *"If Adino is in play This Hero is worth +3/+3, prevent all enhancement in play."*

### Foolish Advice [ID: 1291710604] (Score: 0.635)
- **Key:** `1291710604_shared`
- **Original:** *"All special abilities on Character cards and enhancement cards except this one are negated and prevented.  Battle is determined by the numbers."*
- **Decompiled:** *"negate all special ability except this one character in play, prevent all special ability except this one character in play. negate all special ability except this one enhancement in play, prevent all special ability except this one enhancement in play."*

### Herod the Great (Ap) [ID: -1055827616] (Score: 0.635)
- **Key:** `-1055827616_shared`
- **Original:** *"No Heroes may band this turn.  Any already banded must return to their territories."*
- **Decompiled:** *"prevent all band hero in play this turn. withdraw all hero in battle."*
- **Fact Violations:** Missing primary action: 'band'

### Confusion (CoW) [ID: -2047775602] (Score: 0.636)
- **Key:** `-2047775602_shared`
- **Original:** *"Name a card (except a Lost Soul card). Remove Confusion from the game to remove all copies of the named card in a player's deck, discard pile and hand from the game."*
- **Decompiled:** *"banish 1 your character in play, banish all named card except a Lost Soul card from deck, banish all named card except a Lost Soul card from discard pile, banish all named card except a Lost Soul card from hand."*

### Facing Angry Mobs [ID: 1376701486] (Score: 0.636)
- **Key:** `1376701486_shared`
- **Original:** *"If a N.T. Hero is in battle, all Evil Characters in battle gain 3/3 until end of turn."*
- **Decompiled:** *"If all your good New Testament hero in battle is in battle gain all character in battle +3/+3 this turn."*

### Generous Giving [ID: 215402171] (Score: 0.636)
- **Key:** `215402171_shared`
- **Original:** *"Worth 8/6 if player immediately discards a good enhancement without using it."*
- **Decompiled:** *"If all your good enhancement from discard pile is in discard pile gain This Hero +8/+6."*

### Hormah [ID: 1615417472] (Score: 0.636)
- **Key:** `1615417472_shared`
- **Original:** *"If your human Evil Character is discarded, you may place this Site and its contents beneath owner's deck."*
- **Decompiled:** *"If all your evil human character from discard pile is in discard pile You may topdeck This card."*

### Boaz' Sandal [ID: -1219999882] (Score: 0.637)
- **Key:** `-1219999882_top`
- **Original:** *"At any time, you may discard this card to search deck or discard pile for a Ruth Hero. If used during battle and an Evil Character is blocking, you may add your Ruth Hero to battle."*
- **Decompiled:** *"discard Boaz Sandal, search Ruth. discard Boaz Sandal, search Ruth. If all your evil evil character in battle is in battle You may add to battle Ruth."*

### Darkness (FoM) [ID: -198493580] (Score: 0.637)
- **Key:** `-198493580_shared`
- **Original:** *"Set aside up to X Heroes in battle for 2 turns. Cannot be negated if X is 4 or greater."*
- **Decompiled:** *"If all your cards in battle is in battle You may set-aside good hero in battle this turn. Cannot be negated."*

### Evil Armor (GoC) [ID: -19329343] (Score: 0.637)
- **Key:** `-19329343_shared`
- **Original:** *"Protect demon from Heroes with strength greater than demon's toughness. Look at the top X (limit 6) cards of deck: Take up to 1 and underdeck the rest."*
- **Decompiled:** *"protect This Character. You may look 6 your cards from deck, take 1 your card from deck, underdeck your card from deck."*

### Evil Released (Roots) [ID: -679664345] (Score: 0.637)
- **Key:** `-679664345_shared`
- **Original:** *"Play a demon from discard pile or Reserve. If it is unique, banish this card."*
- **Decompiled:** *"You may play 1 your evil demon evil character from discard pile, banish 1 your evil evil character in play. You may play 1 your evil demon evil character from Reserve, banish 1 your evil evil character in play."*

### Hard Bondage (FoM) [ID: 1142794271] (Score: 0.637)
- **Key:** `1142794271_shared`
- **Original:** *"Capture a Hero. If used by an Exodus Egyptian, discard the top X cards of opponent's deck (limit 3) and decrease opponent's Heroes X/X."*
- **Decompiled:** *"capture 1 opponent's hero in play. If This card is in play discard 3 opponent's cards from deck, decrease 1 opponent's hero in play -3/-3."*

### Harvest Time [Fundraiser] [ID: 29604455] (Score: 0.637)
- **Key:** `29604455_top`
- **Original:** *"Select a number. Play that number of Lost Souls from each deck. Regardless of protect abilities."*
- **Decompiled:** *"You may play all Lost Soul from deck. Regardless."*

### Amariah the High Priest [ID: 439012927] (Score: 0.638)
- **Key:** `439012927_shared`
- **Original:** *"Enhancements used by this Hero cannot be interrupted."*
- **Decompiled:** *"Cannot be interrupted."*

### Demonic Blockade [ID: -1713061390] (Score: 0.638)
- **Key:** `-1713061390_shared`
- **Original:** *"Negate all special abilities on Heroes and Sites in battle. Opponent's unoccupied Sites have no brigade color."*
- **Decompiled:** *"negate all hero in battle. negate all site in battle. restrict all opponent's unoccupied site in play."*

### Divisions in the Church [ID: 146480717] (Score: 0.638)
- **Key:** `146480717_shared`
- **Original:** *"N.T. Heroes may not enter battle this turn.  Any currently in battle must retreat.  An O.T. Hero must be placed in battle or rescue attempt fails."*
- **Decompiled:** *"prevent all good N.T. hero in play this turn. withdraw all character in battle. place 1 your good O.T. hero from hand or negate all Lost Soul from Reserve."*

### Gabriel (Ki) [ID: -653644041] (Score: 0.638)
- **Key:** `-653644041_shared`
- **Original:** *"Holder may search any draw pile for one evil enhancement and discard it.  Shuffle draw pile."*
- **Decompiled:** *"You may search 1 evil enhancement from deck, discard evil enhancement from deck, shuffle card from deck."*

### Courage (Wa) [ID: 569222665] (Score: 0.639)
- **Key:** `569222665_shared`
- **Original:** *"Holder may add an additional Hero from his territory to the battle."*
- **Decompiled:** *"You may add to battle 1 your good hero in territory."*

### Desolate Gateways [ID: 2066751713] (Score: 0.639)
- **Key:** `2066751713_shared`
- **Original:** *"All opponents' Heroes in play decrease x/x until end of turn, where X is equal to the number of unoccupied Sites in play.  Cannot be prevented."*
- **Decompiled:** *"decrease all opponent's good hero in play this turn. Cannot be prevented."*

### False Prophesy [ID: 483266773] (Score: 0.639)
- **Key:** `483266773_shared`
- **Original:** *"Evil Character repels any non-Prophet."*
- **Decompiled:** *"withdraw all opponent's non-Prophet character in battle."*

### Fountains of Living Water [ID: 125693920] (Score: 0.639)
- **Key:** `125693920_shared`
- **Original:** *"Holder may draw a card."*
- **Decompiled:** *"You may draw 1 your cards from deck."*

### Haman's Plot [ID: -1983885605] (Score: 0.639)
- **Key:** `-1983885605_shared`
- **Original:** *"Holder may discard any three characters in play or in a set-aside area.  But, then, holder must tear this card in half.  Cannot be interrupted, prevented or negated."*
- **Decompiled:** *"discard 3 character in play, banish 1 your card in play. Cannot be interrupted. Cannot be prevented. Cannot be negated or discard 3 character, banish 1 your card in play. Cannot be interrupted. Cannot be prevented. Cannot be negated."*

### Jair (Ki) [ID: -395466173] (Score: 0.639)
- **Key:** `-395466173_shared`
- **Original:** *"Holder may draw a card."*
- **Decompiled:** *"You may draw 1 your cards from deck."*

### Altar of Incense (Pi) [ID: -1634585636] (Score: 0.64)
- **Key:** `-1634585636_top`
- **Original:** *"Protect O.T.  Heroes from discard abilities on evil Enhancements."*
- **Decompiled:** *"protect all O.T. hero in play."*

### Boils ( C) [ID: -599109376] (Score: 0.642)
- **Key:** `-599109376_shared`
- **Original:** *"Selected Hero decreases 0/2 per turn.  If Hero reaches */0 or less, discard Hero."*
- **Decompiled:** *"1 your hero in play is worth 0/-2 this turn. If all your cards in play is in play discard 1 your hero in play."*

### Chastisement of the Lord (UL) [ID: -63081148] (Score: 0.642)
- **Key:** `-63081148_shared`
- **Original:** *"Set Hero aside for three turns.  On turn four Hero returns with abilities increased 6/6."*
- **Decompiled:** *"You may set-aside 1 your hero in play, place 1 your hero +6/+6."*

### Battle Neutralized [ID: 1475323583] (Score: 0.644)
- **Key:** `1475323583_shared`
- **Original:** *"The battle immediately ends in a stalemate.  All characters in battle return to territories.  All enhancements in battle are discarded."*
- **Decompiled:** *"end the battle all cards in battle, take all character in battle, discard all enhancement in battle."*

### Denial of Christ [ID: 673600] (Score: 0.644)
- **Key:** `673600_shared`
- **Original:** *"Take any human N.T. Hero prisoner and place in your land of bondage.  Hero is treated as a lost soul."*
- **Decompiled:** *"capture 1 human N.T. hero in play, place 1 your hero in territory, gain 1 your lost_soul hero in territory."*

### Angel at Jerusalem (Roots) [ID: -812545622] (Score: 0.645)
- **Key:** `-812545622_shared`
- **Original:** *"O.T. Enhancements used by this Hero are regardless of protect abilities. After battle, discard all blocking evil warriors."*
- **Decompiled:** *"ignore all your good enhancement in play. discard all evil evil character in battle."*

### Day of Judgment (GoC) [ID: 1668425951] (Score: 0.645)
- **Key:** `1668425951_shared`
- **Original:** *"STAR: Play a Lost Soul from each deck. GE: If used by a N.T. Hero, banish this card to banish all evil cards in battle."*
- **Decompiled:** *"play 1 your Lost Soul from deck, play 1 opponent's Lost Soul from deck. banish 1 your card in play, banish all evil in battle."*

### Authority of Christ (GoC UR+) [ID: 636588188] (Score: 0.646)
- **Key:** `636588188_shared`
- **Original:** *"STAR: Set aside a Hero from hand for 2 turns. On return, draw 3. GE: Discard all Evil Characters that you do not control. Cannot be negated if used by a meek disciple."*
- **Decompiled:** *"set-aside 1 your good hero from hand +2/0, draw 3 your card from hand from deck. discard all opponent's evil evil character in play. Cannot be negated."*

### Capturing Canaan [ID: 1104445256] (Score: 0.646)
- **Key:** `1104445256_shared`
- **Original:** *"Capture an evil human (or two if used by a Judge)."*
- **Decompiled:** *"You may capture 2 opponent's evil human character in play."*

### Emperor Tiberius (Ap) [ID: 2105835409] (Score: 0.646)
- **Key:** `2105835409_shared`
- **Original:** *"Take Pontius Pilate or Herod Agrippa I prisoner and place in your land of bondage.  Treat as a Lost Soul."*
- **Decompiled:** *"capture Pontius Pilate or Herod Agrippa I, place Pontius Pilate or Herod Agrippa I."*

### Famished [ID: 1866057336] (Score: 0.646)
- **Key:** `1866057336_shared`
- **Original:** *"If used by a pharaoh, interrupt the battle. You may discard the top 3 cards of a deck and play an Enhancement."*
- **Decompiled:** *"If all your cards in play is in play interrupt all cards in battle. You may discard 3 from deck, play 1 your enhancement from hand."*

### Boaz' Offspring (LoC) [ID: -893807779] (Score: 0.647)
- **Key:** `-893807779_shared`
- **Original:** *"STAR: Reveal hand: If there is no Hero, take one from deck. GE: You may take a Ruth Hero from deck (or Reserve if used by a meek Hero). If played in battle, bounce up to X humans."*
- **Decompiled:** *"If all your good hero from hand is in hand reveal This card, take Ruth. You may take Ruth. If Boaz' Offspring is in battle You may bounce good hero in play."*

### Fortify the Wall [ID: -1308987806] (Score: 0.647)
- **Key:** `-1308987806_shared`
- **Original:** *"Search your draw pile or discard pile for Wall of Protection or Jerusalem Tower and put either into your territory.  Fortress takes immediate effect."*
- **Decompiled:** *"search Wall of Protection or Jerusalem Tower, place your site in play or search Wall of Protection or Jerusalem Tower, place your site in play."*

### Damsel with Spirit of Divination (TxP) [ID: 798570091] (Score: 0.648)
- **Key:** `798570091_shared`
- **Original:** *"If blocking, reveal opponent's hand. For each good brigade revealed, draw a card. Cannot be interrupted."*
- **Decompiled:** *"If This card is in battle reveal all opponent's cards from hand, draw 1 your cards from deck. Cannot be interrupted."*

### Elders of the City (J) [ID: -475246806] (Score: 0.648)
- **Key:** `-475246806_shared`
- **Original:** *"You may search your discard pile for a good Ruth card."*
- **Decompiled:** *"You may search Ruth."*

### Book of Nathan [ID: -2024671648] (Score: 0.649)
- **Key:** `-2024671648_shared`
- **Original:** *"Hero may use any good enhancement based on prophecy regardless of brigade color until end of battle."*
- **Decompiled:** *"This Hero may use other enhancements until end of phase."*

### Blue Tassels [ID: -1774043513] (Score: 0.649)
- **Key:** `-1774043513_top`
- **Original:** *"No character may be taken prisoner.  Prevents Unholy Writ."*
- **Decompiled:** *"prevent all capture character in play. prevent Unholy Writ."*

### Faith of Samuel [ID: -1736324756] (Score: 0.649)
- **Key:** `-1736324756_shared`
- **Original:** *"Interrupt the battle. Hero may band to any number of human Heroes. If all of those Heroes are cloud Heroes or share the same book, you may draw 3."*
- **Decompiled:** *"interrupt This card. You may band Human hero in play. You may draw 3 your card from deck."*

### Image of the Beast (RoJ AB) [ID: -1907619577] (Score: 0.649)
- **Key:** `-1907619577_top`
- **Original:** *"Negate a good or neutral card in play or a set-aside area. Cannot be interrupted."*
- **Decompiled:** *"negate 1 in play. Cannot be interrupted. negate 1. Cannot be interrupted."*

### Aquila (EC) [ID: -1901958431] (Score: 0.65)
- **Key:** `-1901958431_shared`
- **Original:** *"If you control another missionary, search deck for a N.T. good Fortress or N.T. Site. May band to Priscilla. Cannot be negated."*
- **Decompiled:** *"If all your character in play is in play search your card from deck. Cannot be negated. You may band Priscilla. Cannot be negated."*

### Chronicles of the Kings (LoC Plus) [ID: 2132888307] (Score: 0.65)
- **Key:** `2132888307_shared`
- **Original:** *"LAMB: Negate and discard all Curses, idols and evil Enhancements. REAPER: Negate and discard all Covenants, Temple Artifacts and good Enhancements."*
- **Decompiled:** *"You may negate all evil Curse Idol enhancement in play, discard all evil Curse Idol enhancement in play or You may negate all good Covenant Temple Artifact enhancement in play, discard all good Covenant Temple Artifact enhancement in play."*

### Eliud, the Revolutionary / Eliud, the Pious (LoC) [ID: -562674708] (Score: 0.65)
- **Key:** `-562674708_top`
- **Original:** *"If a meek postexilic Hero is in play, opponent must discard an evil card from hand or territory. Cannot be prevented."*
- **Decompiled:** *"If all your cards in play is in play discard 1 opponent's evil from hand. Cannot be prevented."*

### Doubt [ID: -243153600] (Score: 0.651)
- **Key:** `-243153600_top`
- **Original:** *"Place in any territory. When played, this card becomes an orange brigade 0/12 Evil Character until end of turn."*
- **Decompiled:** *"place 1 your evil character from hand. 1 your evil orange evil character in play is worth 0/+12 this turn."*

### Consumed by Doubt [ID: 1707740502] (Score: 0.651)
- **Key:** `1707740502_shared`
- **Original:** *"Place this card on a Hero in battle. While there, Hero's special ability is negated. If Hero returns to territory without making a successful rescue, that Hero cannot enter battle until this card is removed."*
- **Decompiled:** *"place 1 hero in battle. prevent all has this card hero in play. prevent This Hero."*

### Herod's Guard (GoC) [ID: 1005813778] (Score: 0.651)
- **Key:** `1005813778_shared`
- **Original:** *"If blocking, prevent the next good card played in battle. You may exchange this card with a Herod from deck or territory. Cannot be prevented by a good card."*
- **Decompiled:** *"If play If Herod's Guard (GoC) is in battle look 1 good in battle, prevent your card in battle. You may exchange Herod. gain This Character. Cannot be prevented."*

### Brother's Reunion [ID: -1364276124] (Score: 0.652)
- **Key:** `-1364276124_shared`
- **Original:** *"Hero is immune to gold brigade.  Search draw pile for Goshen and put in play."*
- **Decompiled:** *"immune This Hero. search Goshen, play your site from deck."*
- **Fact Violations:** Missing card protection action: 'protect'

### Burning up the Chaff [ID: -1210454473] (Score: 0.652)
- **Key:** `-1210454473_shared`
- **Original:** *"Remove all cards except lost soul cards in one opponent's discard pile from the game."*
- **Decompiled:** *"banish all opponent's cards from discard pile."*

### Chloe [ID: -446486238] (Score: 0.652)
- **Key:** `-446486238_shared`
- **Original:** *"Holder may draw a card."*
- **Decompiled:** *"You may draw 1 your card from deck."*

### Fishers of Men (Ap) [ID: -2121305550] (Score: 0.652)
- **Key:** `-2121305550_shared`
- **Original:** *"Convert any human Evil Character to a Hero in the brigade color of your choice."*
- **Decompiled:** *"You may convert 1 human evil character in play."*

### Jacob's Grandsons [ID: 385635840] (Score: 0.652)
- **Key:** `385635840_shared`
- **Original:** *"Holder may draw a card."*
- **Decompiled:** *"You may draw 1 your card from deck."*

### Angry Mob [ID: 839560547] (Score: 0.653)
- **Key:** `839560547_shared`
- **Original:** *"Spin card sideways (two full rotations to count).  Top of card must be facing a player over halfway to count.  If not, spin again.  Targeted player turns all Heroes not in battle upside down and then mixes them up.  Pick one hero to discard."*
- **Decompiled:** *"shuffle all hero in play, discard 1 hero in play."*

### High Priest Annas (Pi) [ID: -579779768] (Score: 0.653)
- **Key:** `-579779768_shared`
- **Original:** *"May band to all Pharisees and Sadducees.  This ability may be used once per game."*
- **Decompiled:** *"You may band 1 evil Pharisee Sadducee character in play. (limit 1)."*

### Image of the Beast (RoJ) [ID: -1652970412] (Score: 0.653)
- **Key:** `-1652970412_top`
- **Original:** *"Negate a good or neutral card in play or a set-aside area. Cannot be interrupted."*
- **Decompiled:** *"You may negate 1 good in play. Cannot be interrupted. You may negate 1 good. Cannot be interrupted. You may negate 1 neutral in play. Cannot be interrupted. You may negate 1 neutral. Cannot be interrupted."*

### Herod's Treachery [ID: -636031839] (Score: 0.654)
- **Key:** `-636031839_shared`
- **Original:** *"Place on a Herod. That Herod may use evil Enhancements regardless of brigade. You may discard this card to force X Heroes to withdraw from battle."*
- **Decompiled:** *"place Herod, hero in play may use other enhancements. Regardless. discard Herod's Treachery, withdraw good hero in battle."*

### Arianna [ID: -1105881200] (Score: 0.655)
- **Key:** `-1105881200_shared`
- **Original:** *"Protect all cards in holder's hand and draw pile from being discarded or removed by an evil special ability."*
- **Decompiled:** *"protect all your cards from hand, protect all your cards from deck, draw 1 your cards from deck."*

### Chariot of Fire (Promo) [ID: -1626166109] (Score: 0.655)
- **Key:** `-1626166109_top`
- **Original:** *"Following your rescue attempt, return all Heroes in your discard pile to your draw pile.  Shuffle draw pile."*
- **Decompiled:** *"topdeck all your hero from discard pile, shuffle all your cards from deck."*

### Chariot of Fire (Wa) [ID: -763498807] (Score: 0.655)
- **Key:** `-763498807_top`
- **Original:** *"Following your rescue attempt, return all Heroes in your discard pile to your draw pile.  Shuffle draw pile."*
- **Decompiled:** *"topdeck all your hero from discard pile, shuffle all your cards from deck."*

### Death & Hades [ID: -1803618932] (Score: 0.655)
- **Key:** `-1803618932_shared`
- **Original:** *"Reduce opponent's hand to 7 cards until this character is discarded (or 9 cards if rescuer has Tables of the Law activated)."*
- **Decompiled:** *"change hand size 7 opponent's cards from hand. If Tables of the Law is in play change hand size 9 opponent's cards from hand."*

### Devouring Birds (RoJ AB) [ID: 158154325] (Score: 0.655)
- **Key:** `158154325_shared`
- **Original:** *"If played from hand, banish a human from a discard pile to increase Devouring Birds X/X. If blocking, you may return this card to hand after battle. Cannot be prevented."*
- **Decompiled:** *"banish 1 character from discard pile, increase 1 your character in play this turn. Cannot be prevented. If all your cards in battle is in battle You may bounce 1 your character in play. Cannot be prevented."*

### Guardian Of Your Souls [ID: -838332033] (Score: 0.655)
- **Key:** `-838332033_top`
- **Original:** *"Place this card in your Land of Redemption.  Once there, redeemed Soul(s) in your Land of Redemption cannot Fall Away."*
- **Decompiled:** *"You may place This Hero. If Guardian Of Your Souls is in land of redemption protect all your Fall Away Lost Soul."*

### I am Creator [ID: 875482976] (Score: 0.655)
- **Key:** `875482976_shared`
- **Original:** *"If you do not have a Hero in your territory, or set-aside area, then search draw pile for a Hero and put it in your territory.  Cannot be interrupted. Limit once during each of your turns."*
- **Decompiled:** *"If all your good hero in territory is in territory If all your good hero is in set aside search 1 your good hero from deck, place 1 your good hero in territory. Cannot be interrupted. (limit 1)."*

### Backward Shadow [ID: 1719368921] (Score: 0.656)
- **Key:** `1719368921_shared`
- **Original:** *"Heal a Hero in play.  Abilities (*/*) of that Hero may not decrease below Hero's face value for remainder of game."*
- **Decompiled:** *"heal 1 your hero in play, protect 1 your hero in play."*

### Burial Shroud (GoC) [ID: -994600113] (Score: 0.656)
- **Key:** `-994600113_top`
- **Original:** *"If your N.T. human Hero is removed from battle by an opponent's special ability, you may discard this card to add a Hero from discard pile or Reserve to battle."*
- **Decompiled:** *"If removed_from_battle_by_opponent_special_ability discard 1 your enhancement in play, add to battle 1 your hero from discard pile or If removed_from_battle_by_opponent_special_ability discard 1 your enhancement in play, add to battle 1 your hero from Reserve."*

### Cubus [ID: 734571580] (Score: 0.656)
- **Key:** `734571580_shared`
- **Original:** *"You may search draw pile for 'Spiritual Realm' and put it in play.  Cubus may band to a female Evil Character."*
- **Decompiled:** *"You may search Spiritual Realm, play 1 your site in play. You may band 1 evil female evil character in play."*

### David's Proclamation (LoC) [ID: 2010174263] (Score: 0.656)
- **Key:** `2010174263_shared`
- **Original:** *"Hero may band to a king or a meek Hero from territory, hand, deck or Reserve. Withdraw all Evil Characters."*
- **Decompiled:** *"You may band king or You may band king or You may band king or You may band king. withdraw all evil character in play."*

### Day of the Lord [ID: 2066407389] (Score: 0.656)
- **Key:** `2066407389_shared`
- **Original:** *"STAR: During your next battle phase, protect cards out of play from players. GE: If used by an O.T. Hero, banish this card to banish all evil cards in battle."*
- **Decompiled:** *"protect all cards from hand until end of phase. If a 1 your hero in play is in play banish 1 your card in play, banish all evil character in battle."*

### Andrew, First Called / Andrew, Fisher of Men (GoC) [ID: -1302640813] (Score: 0.657)
- **Key:** `-1302640813_shared`
- **Original:** *"You may reveal a good Dominant from hand to negate characters (except disciples). You may convert this card to meek to negate Enhancements."*
- **Decompiled:** *"reveal 1 your good character from hand, negate all character in play. convert 1 your hero in play, negate all enhancement in play."*

### Assyrian Laborers [ID: 2122692611] (Score: 0.657)
- **Key:** `2122692611_shared`
- **Original:** *"(Star) Play this character. (EC) If played from hand, you may reserve a card from hand to activate a pale green Curse from Reserve on this card."*
- **Decompiled:** *"You may take pale green Curse, play 1 your enhancement from hand."*

### Evil Spirit (Ki) [ID: -421146070] (Score: 0.657)
- **Key:** `-421146070_shared`
- **Original:** *"Convert any O.T. human Hero to an Evil Character for remainder of battle.  Cannot be negated unless David's Harp is activated."*
- **Decompiled:** *"You may convert all good O.T. human hero in battle until end of phase. Cannot be negated."*

### Great Faith (H) [ID: -112426768] (Score: 0.657)
- **Key:** `-112426768_shared`
- **Original:** *"Exchange this enhancement with another good enhancement in your draw pile (You may place in hand or battle).  Shuffle draw pile after exchange."*
- **Decompiled:** *"You may exchange 1 your good enhancement from deck, place 1 your good enhancement in play, shuffle all your cards from deck or You may exchange 1 your good enhancement from deck, place 1 your good enhancement in play, shuffle all your cards from deck."*

### Bernice [ID: 132893542] (Score: 0.659)
- **Key:** `132893542_shared`
- **Original:** *"If blocking, take a male, human Evil Character to your territory and convert it to evil gold. Its owner may withdraw a Hero instead. May band to Herod Agrippa I."*
- **Decompiled:** *"If This card is in battle take 1 opponent's evil male human evil character in territory, convert your evil male human evil character in territory. You may withdraw 1 opponent's good hero in battle. Instead. You may band Herod Agrippa I."*

### Cain (CoW AB) [ID: 161516557] (Score: 0.659)
- **Key:** `161516557_shared`
- **Original:** *"If Cain is targeted by an opponent's special ability, that player must discard a card from hand or battle."*
- **Decompiled:** *"If targeted_by_special_ability discard 1 opponent's card from hand or If targeted_by_special_ability discard 1 opponent's card in battle."*

### Freedom! [ID: -1593381996] (Score: 0.659)
- **Key:** `-1593381996_shared`
- **Original:** *"Remove one Evil Character from the game."*
- **Decompiled:** *"banish 1 evil character in play."*

### Apollos [ID: 1896034888] (Score: 0.66)
- **Key:** `1896034888_shared`
- **Original:** *"Increase 2/2 when banded to Paul."*
- **Decompiled:** *"If Paul is in play increase This Hero +2/+2."*

### Archippus [ID: 68669474] (Score: 0.66)
- **Key:** `68669474_shared`
- **Original:** *"If a heretic is in play, clay Enhancements with 'Christ' or 'Jesus' in the title or scripture verse used by Colossae Heroes cannot be negated by an evil card."*
- **Decompiled:** *"If Heretic is in play protect Christ or Jesus. Cannot be negated."*

### Deceiving Spirit [ID: -176410527] (Score: 0.66)
- **Key:** `-176410527_shared`
- **Original:** *"Select an evil brigade. This character may use evil Enhancements of that brigade, in addition to orange. Cannot be negated."*
- **Decompiled:** *"This Character may use other enhancements. Cannot be negated."*

### Elijah's Mantle [ID: -1182256625] (Score: 0.66)
- **Key:** `-1182256625_top`
- **Original:** *"All of holder's Hero gain 2/2 while this card is in play."*
- **Decompiled:** *"gain This Hero +2/+2."*

### Authority of Christ (GoC) [ID: -1658306455] (Score: 0.661)
- **Key:** `-1658306455_shared`
- **Original:** *"STAR: Set aside a Hero from hand for 2 turns. On return, draw 3. GE: Discard all Evil Characters that you do not control. Cannot be negated if used by a meek disciple."*
- **Decompiled:** *"set-aside 1 your hero from hand, draw 3 your card from deck. discard all opponent's evil character in play. Cannot be negated."*

### Bera, King of Sodom [ID: 379137011] (Score: 0.661)
- **Key:** `379137011_shared`
- **Original:** *"If an unoccupied Sodom site is in play, capture a red brigade Hero and place in Sodom."*
- **Decompiled:** *"If Sodom is in play capture 1 red hero in play, place 1 your hero in play."*

### Ehud (Pa) [ID: -665727016] (Score: 0.661)
- **Key:** `-665727016_shared`
- **Original:** *"Ehud may choose a male, human Evil Character from opponent's territory to block.  Wall of Protection has no effect.  Hero has first strike ability."*
- **Decompiled:** *"You may taunt 1 opponent's evil male human evil character in territory. negate Wall of Protection. 1 your hero in play has first strike."*

### Faith of Gideon (CoW AB) [ID: -1146810888] (Score: 0.661)
- **Key:** `-1146810888_shared`
- **Original:** *"You may force 2 Evil Characters to fight each other or, if used by a cloud Hero, you may withdraw all Evil Characters."*
- **Decompiled:** *"You may taunt 2 evil character in play or You may withdraw all evil character in play."*

### Go Into Captivity [IR] [ID: -743540627] (Score: 0.661)
- **Key:** `-743540627_top`
- **Original:** *"You may discard this card to capture a Hero and draw 1."*
- **Decompiled:** *"discard 1 your evil enhancement in play, capture 1 opponent's good hero in play, draw 1 your card from deck."*

### Grapes of Wrath [ID: 780421164] (Score: 0.661)
- **Key:** `780421164_top`
- **Original:** *"Discard an evil card in battle to shuffle all remaining characters in battle into owners' decks. If the current rescuer doesn't have the most Redeemed Souls, he may begin a new battle."*
- **Decompiled:** *"discard 1 evil character in battle, shuffle all character in battle. You may unknown This Hero."*

### Heavenly Temple (RoJ) [ID: -755815350] (Score: 0.661)
- **Key:** `-755815350_top`
- **Original:** *"If your Revelation Hero is banished, captured, converted or underdecked by an opponent, you may discard 2 Enhancements of matching brigade from hand or a martyr from territory instead."*
- **Decompiled:** *"You may discard 2 your enhancement from hand, discard 1 your martyr Lost Soul in territory. Instead."*

### Idol Worship [ID: 676976499] (Score: 0.661)
- **Key:** `676976499_shared`
- **Original:** *"You may take an idol or a Curse from Reserve (or deck if used by a Canaanite). If played in battle, capture a human to opponent's Land of Bondage."*
- **Decompiled:** *"You may take 1 your idol artifact from Reserve or You may take 1 your Curse enhancement from Reserve. If This card is in battle capture 1 opponent's human character in battle."*

### Assyrian Survivor [ID: -1278295935] (Score: 0.662)
- **Key:** `-1278295935_shared`
- **Original:** *"Protected from discard abilities on opponent's cards. If defeated, capture to opponent's Land of Bondage. Cannot be interrupted."*
- **Decompiled:** *"protect This Hero. If all your cards from discard pile is in discard pile capture This Hero. Cannot be interrupted."*

### Beast from the Earth (RoJ AB) [ID: 1562163101] (Score: 0.662)
- **Key:** `1562163101_shared`
- **Original:** *"During battle, if opponent plays a good Enhancement with a brigade not already in battle, you may underdeck a good card in a territory. If blocking, search deck or Reserve for a card with "Beast" in the title."*
- **Decompiled:** *"You may underdeck 1 good hero in territory. If Beast from the Earth (RoJ AB) is in battle search 1 your Beast character from deck."*

### Cruelty (L) [ID: -1443124473] (Score: 0.662)
- **Key:** `-1443124473_shared`
- **Original:** *"Evil Character ignores White Brigade."*
- **Decompiled:** *"ignore This Evil Character."*

### Cruelty (UL) [ID: 985401119] (Score: 0.662)
- **Key:** `985401119_shared`
- **Original:** *"Evil Character ignores White Brigade."*
- **Decompiled:** *"ignore This Evil Character."*

### Den of Robbers [ID: 270645078] (Score: 0.663)
- **Key:** `270645078_shared`
- **Original:** *"A second Evil Character from the Gold Brigade may join the Battle."*
- **Decompiled:** *"You may band 1 your evil Gold character from hand."*

### Eliakim, the Expatriate / Eliakim, the Restored (LoC) [ID: 607734591] (Score: 0.663)
- **Key:** `607734591_shared`
- **Original:** *"STAR: If you control a meek Hero, draw 1."*
- **Decompiled:** *"If all your Meek hero in play is in play draw 1 your card from deck."*

### Insincere Inquisitors (GoC) [ID: 2005920135] (Score: 0.663)
- **Key:** `2005920135_shared`
- **Original:** *"If blocking, prevent the next good card played in battle. Active player may reveal up to X cards from hand. If they do not reveal each good brigade in battle, protect meek Lost Souls from rescue."*
- **Decompiled:** *"If This card is in battle prevent 1 good in battle. You may reveal your card from hand. If all your cards in battle is in battle protect all meek rescue Lost Soul in play until end of phase."*

### Achim, the Compiler / Achim, the Talmid (LoC) [ID: 1482900311] (Score: 0.664)
- **Key:** `1482900311_shared`
- **Original:** *"STAR: Topdeck an O.T. card from a Reserve."*
- **Decompiled:** *"You may topdeck 1 your good from Reserve."*

### Angel from the Sun (RoJ) [ID: -1388540463] (Score: 0.664)
- **Key:** `-1388540463_shared`
- **Original:** *"You may exchange this Hero with a martyr from hand, deck, territory or Reserve. If it is a Revelation martyr, you may draw 2."*
- **Decompiled:** *"You may exchange 1 your character from hand. You may draw 2 your card from hand from deck."*

### Covenant of Palestine [ID: 2120349932] (Score: 0.664)
- **Key:** `2120349932_shared`
- **Original:** *"Use as an enhancement or an Artifact.  Return all Heroes in all Lands of Bondage to owner's territories.  Capture of Heroes is prevented."*
- **Decompiled:** *"gain This card. bounce all Lands of Bondage hero in play. prevent all hero in play."*

### Glad Tidings [ID: 2060418047] (Score: 0.664)
- **Key:** `2060418047_shared`
- **Original:** *"No poison/disease cards may be used this turn.  Any already played are negated and discarded."*
- **Decompiled:** *"prevent all evil poison disease enhancement from hand this turn, negate all evil poison disease enhancement in play, discard evil poison disease enhancement in play."*

### Eli [ID: 270530148] (Score: 0.665)
- **Key:** `270530148_shared`
- **Original:** *"Weapon class enhancements used by Eli cannot be negated or discarded by an opponent."*
- **Decompiled:** *"gain all your weapon class used by this card enhancement in play, restrict all opponent's weapon class used by this card enhancement in play. Cannot be negated."*

### Fear of Danger [ID: -1121067520] (Score: 0.665)
- **Key:** `-1121067520_shared`
- **Original:** *"Place this card on a Hero in a territory.  Hero cannot enter battle until this card is removed."*
- **Decompiled:** *"You may place 1 hero in play, prevent enter battle hero in play."*

### Gideon's Call (Pa) [ID: -807264669] (Score: 0.665)
- **Key:** `-807264669_shared`
- **Original:** *"Hero may use good enhancements from any brigade color until end of battle."*
- **Decompiled:** *"This Hero may use other enhancements until end of phase."*

### Drunkenness [ID: -1083213944] (Score: 0.666)
- **Key:** `-1083213944_shared`
- **Original:** *"All number enhancements on opponent's Hero(s) are added up and divided by two."*
- **Decompiled:** *"gain all opponent's number hero in play."*

### Fortify Site (Ki) [ID: 238032322] (Score: 0.666)
- **Key:** `238032322_shared`
- **Original:** *"Take an Evil Character from your hand and place it face down on an occupied Site.  A rescue attempt at that Site allows the character to band into battle."*
- **Decompiled:** *"You may take 1 your evil character from hand, place your evil character from hand. If rescue attempt You may band all your evil character in play."*

### Accursed of God [ID: -1364873795] (Score: 0.667)
- **Key:** `-1364873795_shared`
- **Original:** *"(Star) Exchange this card with a Curse from Reserve. (EE) Discard a Hero. Cannot be prevented if a Curse is in play."*
- **Decompiled:** *"You may exchange 1 your enhancement from Reserve. You may discard 1 good hero in play. Cannot be prevented."*

### Baptism of Jesus [ID: 1049588416] (Score: 0.667)
- **Key:** `1049588416_shared`
- **Original:** *"Negate special abilities on Evil Character Characters and weapons.  If used by a N.T. prophet, discard an Evil Character card.  Cannot be prevented."*
- **Decompiled:** *"negate all evil evil character in play, negate all artifact in play. discard 1 your evil evil character from hand. Cannot be prevented."*

### Bearing Our Sin [ID: 392484879] (Score: 0.667)
- **Key:** `392484879_shared`
- **Original:** *"STAR: Reserve this card to draw 1. GE: Heal your prophet, priest or king to add a Hero of matching brigade to battle."*
- **Decompiled:** *"reserve 1 your card in play, draw 1 your card from deck. heal 1 your prophet priest king hero in play, add to battle 1 your hero from hand."*

### Defrauders [ID: 8771296] (Score: 0.667)
- **Key:** `8771296_shared`
- **Original:** *"If blocking, you may exchange an evil card in hand with an evil Enhancement with a convert ability in discard pile. May band to a demon."*
- **Decompiled:** *"If all your cards in battle is in battle You may discard 1 your evil character from hand, take 1 your evil convert ability enhancement from discard pile, convert your evil convert ability enhancement from hand. You may band 1 demon in play."*

### Demonic Stronghold [ID: -1996255071] (Score: 0.667)
- **Key:** `-1996255071_top`
- **Original:** *"If holder's demon captures a Hero, place that Hero here.  Holder's demons gain 1/1 for each Hero here."*
- **Decompiled:** *"If capture place 1 hero in play. gain 1 your evil demon evil character in play +1/+1."*

### Emperor Vitellius (Roots) [ID: 462033672] (Score: 0.667)
- **Key:** `462033672_shared`
- **Original:** *"If blocking and another evil Roman is in play, you may draw X (limit 3). Cannot be negated by a good card."*
- **Decompiled:** *"If This card is in battle If all your evil in play is in play You may draw 3 your cards from deck. Cannot be negated."*

### Four Horns (Roots) [ID: -1715128104] (Score: 0.667)
- **Key:** `-1715128104_top`
- **Original:** *"While 4 or more evil O.T. humans are in battle, you may banish this card to shuffle all cards in play."*
- **Decompiled:** *"If all your evil Old Testament Humans character in battle is in battle banish 1 your character in play, shuffle -1 in play."*

### Goodness (EC) [ID: 619447851] (Score: 0.667)
- **Key:** `619447851_shared`
- **Original:** *"Place on your clay Hero: If opponent uses an evil end the battle ability, you may make that player draw 1 instead. When this hero enters battle, negate an evil card."*
- **Decompiled:** *"You may draw 1 opponent's cards from deck. Instead. negate 1 evil in play."*

### Beast from the Earth (RoJ) [ID: -28367582] (Score: 0.668)
- **Key:** `-28367582_shared`
- **Original:** *"During battle, If opponent plays a good enhancement with a brigade not already in battle, you may underdeck a good card in a territory. If blocking, search deck or Reserve for a card with "Beast" in the title."*
- **Decompiled:** *"You may underdeck 1 your good in territory. search 1 your Beast from deck."*

### Falling Away [ID: -1474676710] (Score: 0.668)
- **Key:** `-1474676710_top`
- **Original:** *"Select any Redeemed Soul and return card to your Land of Bondage.  Character is treated as a Lost Soul.  Subtract the rescue from appropriate player's current score."*
- **Decompiled:** *"You may place 1 Redeemed Lost Soul in play, gain 1 your Lost Soul in play, decrease 1 opponent's score in play."*

### Babylon (The Harlot) (RoJ AB) [ID: -664220831] (Score: 0.669)
- **Key:** `-664220831_shared`
- **Original:** *"SITE: If you are attacked, you may convert this Site to an Evil Character. EC: The Harlot may band to an Evil Character or discard a martyr."*
- **Decompiled:** *"If attacked You may convert This Evil Character. You may band 1 evil evil character in play or You may discard 1 good martyr hero in play."*

### Bildad, the Shuhite (RoJ) [ID: -1426862267] (Score: 0.669)
- **Key:** `-1426862267_shared`
- **Original:** *"If you control no human Heroes (except Job), you may decrease a Hero 3/3. May band to a Job Evil Character. Cannot be prevented by an O.T. Hero."*
- **Decompiled:** *"If all your good human hero in play is in play You may decrease 1 hero in play until end of phase. You may band Job until end of phase. gain 1 your hero in play. Cannot be prevented."*
- **Fact Violations:** Missing numbers in AST: [3]

### Cut Off [ID: 1237773781] (Score: 0.669)
- **Key:** `1237773781_shared`
- **Original:** *"STAR: Look at the bottom 6 cards of a deck: Topdeck an evil card. EE: Discard a Hero or a good Fortress."*
- **Decompiled:** *"look 6 from deck, topdeck 1 evil from deck. discard 1 good hero in play or discard 1 good site in play."*

### Foretelling Angel [ID: 869032203] (Score: 0.669)
- **Key:** `869032203_shared`
- **Original:** *"If a human prophet is in play or set-aside area, holder may look at the top three cards in any draw pile, then return them without shuffling."*
- **Decompiled:** *"If Human Prophet is in play You may look 3 from deck, topdeck 3 from deck. If Human Prophet is in set aside You may look 3 from deck, topdeck 3 from deck."*

### Goshen [ID: 737482411] (Score: 0.669)
- **Key:** `737482411_top`
- **Original:** *"Protect contents from all effects. If your Genesis or Exodus Hero has toughness */0 or less, you may place it here instead of discarding it."*
- **Decompiled:** *"protect all cards in territory. You may place 1 your good Genesis Exodus hero from hand."*

### Jared, the Beholder / Jared (Shall Come Down) (LoC) [ID: -237281499] (Score: 0.669)
- **Key:** `-237281499_shared`
- **Original:** *"STAR: Resurrect a meek blue Hero."*
- **Decompiled:** *"You may resurrect 1 your blue Meek hero from discard pile."*

### Delilah (UL) [ID: -730370049] (Score: 0.67)
- **Key:** `-730370049_shared`
- **Original:** *"Samson and his strength have no effect on Delilah."*
- **Decompiled:** *"withdraw Samson, negate His Strength."*

### Delilah (L) [ID: -1200816243] (Score: 0.67)
- **Key:** `-1200816243_shared`
- **Original:** *"Samson and his strength have no effect on Delilah."*
- **Decompiled:** *"withdraw Samson, negate His Strength."*

### Flight (Wa) [ID: -1673149371] (Score: 0.67)
- **Key:** `-1673149371_shared`
- **Original:** *"All banding of Heroes is prevented, interrupted and/or negated during this battle."*
- **Decompiled:** *"prevent all good band hero in play until end of phase, interrupt all good band hero in play until end of phase, negate all good band hero in play until end of phase."*

### Foreign Enemy [ID: 1219092920] (Score: 0.67)
- **Key:** `1219092920_shared`
- **Original:** *"A second Evil Character may join the battle."*
- **Decompiled:** *"You may band 1 your evil evil character in play."*

### Invoking Terror [ID: 1773355553] (Score: 0.67)
- **Key:** `1773355553_shared`
- **Original:** *"Place a human Hero beneath owner's deck. If used by a multi-color Magician, you may place this card beneath deck. Cannot be prevented."*
- **Decompiled:** *"topdeck 1 your good Human hero in play. If all your good Magician multi-color in play is in play You may underdeck 1 your enhancement in play. Cannot be prevented."*

### Babel (FoM) [ID: -1142609134] (Score: 0.671)
- **Key:** `-1142609134_shared`
- **Original:** *"SITE: If you play this Site, you may take an evil O.T. human from Reserve.  FORT: Negate opponents' characters with toughness X or less."*
- **Decompiled:** *"You may take 1 your evil O.T. from Reserve. negate all opponent's character in play."*

### Belt of Truth (Wa) [ID: 1250141641] (Score: 0.671)
- **Key:** `1250141641_shared`
- **Original:** *"Hero is immune to Lies."*
- **Decompiled:** *"immune This Hero."*
- **Fact Violations:** Missing card protection action: 'protect'

### Blood Avenger [ID: -1812037992] (Score: 0.671)
- **Key:** `-1812037992_shared`
- **Original:** *"You may draw 2. If this character is discarded, you may discard a character of opposite alignment."*
- **Decompiled:** *"You may draw 2 your card from deck. If This card is in discard pile You may discard 1 good character in play."*

### Climb the Walls [ID: -952756480] (Score: 0.671)
- **Key:** `-952756480_shared`
- **Original:** *"Jerusalem Tower has no effect this turn."*
- **Decompiled:** *"negate Jerusalem Tower this turn."*

### Ears to Hear [ID: -756187520] (Score: 0.671)
- **Key:** `-756187520_shared`
- **Original:** *"Place this card on a Lost Soul (except the 'Lost Souls' card).  Discard all evil cards placed on that Lost Soul.  While this card remains, negate the special ability on the Lost Soul."*
- **Decompiled:** *"place 1 except the 'Lost Souls' card Lost Soul in play, discard evil in play, negate Lost Soul in play."*

### God's Generosity [ID: 1354790397] (Score: 0.671)
- **Key:** `1354790397_shared`
- **Original:** *"Search draw pile or discard pile for Promised Land site and put in play."*
- **Decompiled:** *"search Promised Land, play your site in play. search Promised Land, play your site in play."*

### Abiathar (1st Print - K) [ID: 660351859] (Score: 0.673)
- **Key:** `660351859_shared`
- **Original:** *"You may look at a hand or take a good O.T. card from Reserve."*
- **Decompiled:** *"You may look 1 opponent's card from hand or You may take 1 your good from Reserve."*

### Bearing Bad News [ID: -1032295582] (Score: 0.673)
- **Key:** `-1032295582_shared`
- **Original:** *"If a unique human Evil Character is discarded as a result of this battle, no Lost Soul may be rescued by a Hero this turn."*
- **Decompiled:** *"If discard prevent all Lost Soul in play this turn."*

### All Hope Lost [ID: -2051463540] (Score: 0.673)
- **Key:** `-2051463540_shared`
- **Original:** *"If Hero(s) in battle returns to territory without making a successful rescue, Hero(s) may not enter battle until healed."*
- **Decompiled:** *"If returns to territory restrict all good enter battle hero in play until end of phase."*

### Go Away! (LoC) [ID: 1072642607] (Score: 0.673)
- **Key:** `1072642607_shared`
- **Original:** *"You may bounce any number of Heroes. Cannot be prevented if used by a Philistine."*
- **Decompiled:** *"You may bounce good hero in play. Cannot be prevented."*

### A New Beginning [ID: -590899574] (Score: 0.674)
- **Key:** `-590899574_shared`
- **Original:** *"ALL players shuffle ALL cards in the field of play, set-aside areas and their hands (except this one) back into their draw pile.  Only cards in Land of Redemption and discard piles remain.  ALL players Draw 8 new cards.  Holder may begin a new turn."*
- **Decompiled:** *"shuffle all cards in play, shuffle all cards, shuffle all cards from hand, draw 8 from deck. You may begin a new phase This card."*

### Den of Thieves (GoC) [ID: -828161931] (Score: 0.674)
- **Key:** `-828161931_top`
- **Original:** *"Thieves may use any evil Enhancement. While occupied, if an opponent plays a Dominant, you may take a card from their territory. If a lone thief blocks, you may take a N.T. crimson card from Reserve."*
- **Decompiled:** *"You may 1 your evil enhancement from hand may use other enhancements. If play If all your cards in play is in play You may take 1 opponent's card in territory. If block You may take 1 your N.T. crimson card from Reserve."*

### Betrayal [ID: 1609027840] (Score: 0.675)
- **Key:** `1609027840_shared`
- **Original:** *"All abilities (*/*) on good enhancements are worth half."*
- **Decompiled:** *"increase all good enhancement in play."*

### Damascus (Promo) [ID: 1998591346] (Score: 0.675)
- **Key:** `1998591346_shared`
- **Original:** *"SITE: If you play this Site and have no Evil Character, you may take one from deck. FORT: If an opponent searches a deck, you may draw 1. Increase your hand size by 1."*
- **Decompiled:** *"If play If all your cards in play is in play You may take 1 your card from deck. If search You may draw 1 your card from hand from deck. change hand size 1 your good hero in play."*

### Ehud (RoA) [ID: 1489844964] (Score: 0.675)
- **Key:** `1489844964_shared`
- **Original:** *"Interrupt Wall of Protection and choose a male Evil Character from opponent's territory to block. Ehud has first strike."*
- **Decompiled:** *"You may interrupt Wall of Protection, taunt 1 opponent's evil Male evil character in territory until end of phase. 1 your hero in play has first strike."*

### Forgiveness of Joseph (FooF) [ID: -1935837151] (Score: 0.675)
- **Key:** `-1935837151_shared`
- **Original:** *"Convert all human Evil Characters in battle to blue Heroes. Opponent may return any number of those characters to owner's hand."*
- **Decompiled:** *"convert all evil human evil character in battle, bounce character in battle."*

### Amasa [ID: -1034125914] (Score: 0.676)
- **Key:** `-1034125914_shared`
- **Original:** *"Cannot be taken prisoner.  May band to Absalom's Soldiers."*
- **Decompiled:** *"ignore This Hero. You may band 1 Absalom's Soldiers hero in play."*

### Caiaphas the Conspirator (GoC) [ID: -505112161] (Score: 0.676)
- **Key:** `-505112161_shared`
- **Original:** *"Evil N.T. Enhancements used by this card are regardless of protect abilities. While blocking alone and you control a meek Lost Soul, restrict good Dominants. May band to a Pharisee or Sadducee."*
- **Decompiled:** *"gain all your evil N.T. used by this card enhancement in play. Cannot be prevented. If all your character in battle is in battle If all your meek Lost Soul in play is in play restrict all good Dominant site in play until end of phase. You may band your Pharisee Sadducee hero in play."*
- **Fact Violations:** Missing restricted action 'dominants' in target identifiers for 'restrict'

### Consumed by Wants [ID: 1479473892] (Score: 0.676)
- **Key:** `1479473892_shared`
- **Original:** *"Place this card on a Lost Soul.  While this card remains, holder's black brigade demons gain 4/4."*
- **Decompiled:** *"You may place 1 Lost Soul in play. gain all your evil black evil character in play +4/+4."*

### Covenant with David (PoC) [ID: 2020698611] (Score: 0.676)
- **Key:** `2020698611_shared`
- **Original:** *"HE: You may play a Site or good Fortress from deck (or Reserve if used by David). ART: If you do not control a king, you may take a king from deck."*
- **Decompiled:** *"You may play 1 your site from deck or You may play 1 your good Fortress site from deck. If king is in play You may take king."*

### Demons in Chains [ID: -1838207424] (Score: 0.676)
- **Key:** `-1838207424_shared`
- **Original:** *"Take any demon prisoner and place in holder's Tartaros site.  If Tartaros is not in play, discard demon."*
- **Decompiled:** *"You may capture 1 evil evil character in play, place 1 evil Tartaros evil character. Instead."*
- **Fact Violations:** Missing primary action: 'discard'

### Four Horsemen (RoJ) [ID: 1466398683] (Score: 0.676)
- **Key:** `1466398683_shared`
- **Original:** *"If you control Conquer, War, Famine and Death, banish this card to discard up to one card of each card type in play and/or set aside area (except a Lost Soul). Cannot be interrupted."*
- **Decompiled:** *"If Conquer is in play If War is in play If Famine is in play If Death is in play banish 1 your character in play, discard 1 except a Lost Soul in play, discard 1 except a Lost Soul. Cannot be interrupted."*

### Image of Jealousy (TxP) [ID: -2036248373] (Score: 0.676)
- **Key:** `-2036248373_shared`
- **Original:** *"Place on a Hero or good Fortress. While this card remains, negate the special ability on that card."*
- **Decompiled:** *"place 1 Hero good Fortress in play. negate 1 in play."*

### Battle Prayer (Ki) [ID: -592653306] (Score: 0.677)
- **Key:** `-592653306_shared`
- **Original:** *"Search your draw pile or discard pile for any good gold brigade enhancement and add it to your hand.  Shuffle card pile."*
- **Decompiled:** *"You may search 1 your good gold enhancement from deck, take your good gold enhancement from deck, shuffle your card from deck."*

### Carcasses (PoC) [ID: -1904374322] (Score: 0.677)
- **Key:** `-1904374322_bottom`
- **Original:** *"Discard a human. Cannot be negated if it is a multi-brigade or dual icon card."*
- **Decompiled:** *"discard 1 your good human character from hand. Cannot be negated."*

### Coat of Many Colors [ID: -1489554188] (Score: 0.677)
- **Key:** `-1489554188_shared`
- **Original:** *"Selected Hero may use enhancement cards from any good brigade until end of current battle."*
- **Decompiled:** *"This Hero may use other enhancements until end of phase."*

### Covenant with Moses [ID: -395463156] (Score: 0.677)
- **Key:** `-395463156_shared`
- **Original:** *"Use as an enhancement or an Artifact.  Burial Shroud, Unholy Writ, Thirty Pieces of Silver, and Household Idols are negated for one round.  May be used twice."*
- **Decompiled:** *"play This card. You may negate Burial Shroud or Unholy Writ or Thirty Pieces of Silver or Household Idols this turn. (limit 2)."*

### Destruction of Nehushtan (PoC) [ID: 460780034] (Score: 0.677)
- **Key:** `460780034_shared`
- **Original:** *"LAMB: Negate and discard a Curse or all opponents' active Artifacts (except Tabernacle and Temple Artifacts). REAPER: Negate and discard a Covenant or Artifact."*
- **Decompiled:** *"You may negate 1 enhancement in play, discard enhancement in play or You may negate all opponent's Tabernacle Temple Artifacts artifact in play, discard opponent's Tabernacle Temple Artifacts artifact in play. You may negate Covenant, discard Covenant or You may negate 1 artifact in play, discard artifact in play."*

### Harvest Season (LoC) [ID: -1261039387] (Score: 0.677)
- **Key:** `-1261039387_shared`
- **Original:** *"Place in territory for 3 turns: Each upkeep, if you control an O.T. human Hero, you may play a Lost Soul from a deck. Lost Soul's owner may draw 1."*
- **Decompiled:** *"place 1 your card from hand. If O.T. human Hero is in play You may play 1 your Lost Soul from deck, draw 1 your card from hand from deck."*

### Hope [ID: 1765230277] (Score: 0.677)
- **Key:** `1765230277_top`
- **Original:** *"You may take Joy, Peace or The Holy Spirit from deck, discard pile or Reserve."*
- **Decompiled:** *"You may take Joy or Peace or The Holy Spirit or You may take Joy or Peace or The Holy Spirit or You may take Joy or Peace or The Holy Spirit."*

### Jacob's Dream [ID: -1655869813] (Score: 0.677)
- **Key:** `-1655869813_shared`
- **Original:** *"Take one Lost Soul site from an opponent and add it to your territory.  If site held a Lost Soul, Lost Soul returns to general Land of Bondage.  Discard any other cards in that site."*
- **Decompiled:** *"You may take 1 opponent's site in play, place your site in play, discard all except Lost Soul in play."*

### Amminadab, the Generous / Amminadab, the Gracious (LoC) [ID: -622696180] (Score: 0.678)
- **Key:** `-622696180_top`
- **Original:** *"If a meek Hero is in play, you may play a Lost Soul from a deck or bounce an evil card. Cannot be prevented."*
- **Decompiled:** *"If all your cards in play is in play You may play Lost Soul. Cannot be prevented or may bounce 1 evil in play. Cannot be prevented."*

### Babylon The Harlot (RoJ) [ID: -720136147] (Score: 0.678)
- **Key:** `-720136147_shared`
- **Original:** *"If you are attacked, you may convert this Site to an Evil Character. The Harlot may band to an Evil Character or discard a martyr."*
- **Decompiled:** *"If attacked You may convert This Evil Character. You may band 1 evil evil character in play or You may discard 1 good martyr hero in play."*

### Blindness [ID: 126690624] (Score: 0.678)
- **Key:** `126690624_shared`
- **Original:** *"While an evil card is on a Hero, your demons are immune to that Hero."*
- **Decompiled:** *"immune all your evil evil character in play."*
- **Fact Violations:** Missing card protection action: 'protect'

### Concealed Riches (GoC) [ID: 862714410] (Score: 0.678)
- **Key:** `862714410_top`
- **Original:** *"You may discard this card. If you do, shuffle all cards from Reserve or exchange up to X cards from hand with an equal number of cards from Reserve."*
- **Decompiled:** *"You may discard Concealed Riches (GoC). If discard You may shuffle all your cards from Reserve or If discard You may exchange your card from hand."*

### Babel [ID: 754014860] (Score: 0.679)
- **Key:** `754014860_shared`
- **Original:** *"All Evil Characters that holder chooses may enter battle."*
- **Decompiled:** *"You may add to battle your evil character in play."*

### Cage (Roots) [ID: 161413499] (Score: 0.679)
- **Key:** `161413499_shared`
- **Original:** *"Negate a good card in battle. Bounce a character."*
- **Decompiled:** *"negate 1 good hero in battle, return to hand 1 character in play."*

### David's Triumph [ID: -137949673] (Score: 0.679)
- **Key:** `-137949673_shared`
- **Original:** *"If used by a male Hero, interrupt the battle and discard a male, human Evil Character Character.  Cannot be negated by a Philistine."*
- **Decompiled:** *"You may interrupt all cards in battle, discard 1 opponent's evil male human evil character from hand. Cannot be negated."*

### Faith of Joseph [ID: -643503792] (Score: 0.679)
- **Key:** `-643503792_shared`
- **Original:** *"You may draw 1. Place in territory: Protect discard pile from opponents. At any time, you may discard this card to release all captured Heroes."*
- **Decompiled:** *"You may draw 1 your card from deck. protect all your discard pile from discard pile. discard Faith of Joseph, release all your good hero in play."*

### Fallen Angel (Roots) [ID: 1986375478] (Score: 0.679)
- **Key:** `1986375478_shared`
- **Original:** *"May band to a non-human. Cannot be prevented by a good card."*
- **Decompiled:** *"You may band 1 non-human character in play. Cannot be prevented."*

### James, the Fisherman / James, Son of Thunder (GoC) [ID: 1824055066] (Score: 0.679)
- **Key:** `1824055066_top`
- **Original:** *"STAR: Play Fishing Boat from Reserve."*
- **Decompiled:** *"You may play Fishing Boat."*

### Jehoiachin, the Conquered (LoC) [ID: -1859874884] (Score: 0.679)
- **Key:** `-1859874884_shared`
- **Original:** *"STAR: Capture this card to a player. EC: You may give an Artifact, Fortress or Site to opponent to protect meek Lost Souls from rescue. Cannot be prevented."*
- **Decompiled:** *"If card_played capture 1 your good hero in play. You may give 1 your Artifact Fortress Site from hand, protect all Meek rescue Lost Soul in play. Cannot be prevented."*

### Fortify Site(Wa) [ID: -93556524] (Score: 0.68)
- **Key:** `-93556524_shared`
- **Original:** *"Take an Evil Character from your hand and place it face down on an occupied site.  A rescue attempt at that site allows the character to band into battle."*
- **Decompiled:** *"take 1 your evil character from hand, place 1 your evil character in play. If rescue attempt You may band 1 your evil character in play."*

### Jacob, Disgruntled Subject / Jacob, Relegated Servant (LoC) [ID: -390912493] (Score: 0.68)
- **Key:** `-390912493_shared`
- **Original:** *"STAR: Banish an evil Enhancement."*
- **Decompiled:** *"banish 1 evil enhancement in play."*

### His Name is John [ID: -76991423] (Score: 0.693)
- **Key:** `-76991423_shared`
- **Original:** *"Select a Temple Priest.  Special abilities on that Hero and Enhancements used by that Hero cannot be negated this turn."*
- **Decompiled:** *"You may gain Temple Priest this turn, gain 1 your used by that Hero enhancement in play this turn."*
- **Fact Violations:** Missing modifier: 'cannot be negated'

### Controlling Demon (Ap) [ID: -1702192139] (Score: 0.702)
- **Key:** `-1702192139_shared`
- **Original:** *"No Heroes may band this turn.  Any already banded must return to their territories."*
- **Decompiled:** *"prevent all good band hero in play this turn, withdraw all good banded hero in play."*
- **Fact Violations:** Missing primary action: 'band'

### Habakkuk [ID: -257118293] (Score: 0.714)
- **Key:** `-257118293_shared`
- **Original:** *"If an opponent uses a draw ability, you may look at the top X cards of their deck: Discard an evil card (and that opponent must underdeck a card from hand if a Babylonian is in play)."*
- **Decompiled:** *"If draw look all opponent's cards from deck, discard 1 your evil from hand, underdeck 1 opponent's card from hand."*
- **Fact Violations:** Missing primary action: 'draw'

### Cruelty ( C) [ID: -1169074336] (Score: 0.716)
- **Key:** `-1169074336_shared`
- **Original:** *"Evil Character is immune to White and Silver Brigades."*
- **Decompiled:** *"immune This Evil Character."*
- **Fact Violations:** Missing card protection action: 'protect'

### Cruelty (Wa) [ID: -604508791] (Score: 0.716)
- **Key:** `-604508791_shared`
- **Original:** *"Evil Character is immune to White and Silver Brigades."*
- **Decompiled:** *"immune This Evil Character."*
- **Fact Violations:** Missing card protection action: 'protect'

### High Priest Ananias [ID: -971177952] (Score: 0.723)
- **Key:** `-971177952_shared`
- **Original:** *"You may search draw or discard pile for Sanhedrin and put in hand."*
- **Decompiled:** *"You may search Sanhedrin, return to hand your card from deck or You may search Sanhedrin, return to hand your card from discard pile."*
- **Fact Violations:** Missing primary action: 'draw'

### Bow and Arrow (Gray) (Ki) [ID: -1564998688] (Score: 0.726)
- **Key:** `-1564998688_shared`
- **Original:** *"Evil Character is immune to Silver Brigade."*
- **Decompiled:** *"immune This Evil Character."*
- **Fact Violations:** Missing card protection action: 'protect'

### Doubt (LoC Plus) [ID: 655301292] (Score: 0.73)
- **Key:** `655301292_shared`
- **Original:** *"REAPER: Convert this card to a character for 1 turn. You may add it to battle. EC: Restrict Dominants. Negate Heroes. Toss all multi-brigade Enhancements."*
- **Decompiled:** *"You may convert 1 your enhancement in play this turn, add to battle 1 your evil character in play. restrict all opponent's Dominants play in play, negate all good hero in play, toss all multi-brigade enhancement in play."*
- **Fact Violations:** Missing restricted action 'dominants' in target identifiers for 'restrict'

### Doubt (LoC) [ID: 783902772] (Score: 0.733)
- **Key:** `783902772_shared`
- **Original:** *"REAPER: Convert this card to a character for 1 turn. You may add it to battle. EC: Restrict Dominants. Negate Heroes. Toss all multi-brigade Enhancements."*
- **Decompiled:** *"convert This Character this turn. You may add to battle This Character. restrict all opponent's Dominants play from hand. negate all opponent's good hero in play. If play an enhancement toss all multi-brigade enhancement in play."*
- **Fact Violations:** Missing restricted action 'dominants' in target identifiers for 'restrict'

### Foreign Wives [ID: -1586877809] (Score: 0.745)
- **Key:** `-1586877809_shared`
- **Original:** *"Search discard pile for Household Idols. If opponent has draw 5 or more cards this turn, protect Foreign Wives from cards used by opponent. Cannot be negated."*
- **Decompiled:** *"search Household Idols, draw 1 your card from hand from deck, protect This Hero. Cannot be negated."*
- **Fact Violations:** Missing numbers in AST: [5]

### Herod's Dungeon (TxP) [ID: -810076672] (Score: 0.747)
- **Key:** `-810076672_shared`
- **Original:** *"While blocking with a Herod while this Site is unoccupied, you may capture a male human Hero with strength 7/* or greater and place it here. When you block with Herodias, you may discard a captured Hero."*
- **Decompiled:** *"If Herod is in battle You may capture 1 opponent's male human strength 7/* or greater hero in battle, place your hero in play. If Herodias is in battle You may discard 1 your captured hero in play."*
- **Fact Violations:** Missing numbers in AST: [7]

### Evil Angel (Wa) [ID: 1568064186] (Score: 0.75)
- **Key:** `1568064186_shared`
- **Original:** *"Discard any Silver Brigade Hero of 6/6 or less in play or set-aside area."*
- **Decompiled:** *"You may discard 1 good Silver 6/6 or less hero in play. You may discard 1 good Silver 6/6 or less hero."*
- **Fact Violations:** Missing numbers in AST: [6]

### Covenant with Death (FooF) [ID: -1288512959] (Score: 0.757)
- **Key:** `-1288512959_shared`
- **Original:** *"Negate characters. Restrict players from playing Enhancements unless a character is opposed in battle. Cannot be negated."*
- **Decompiled:** *"You may negate 1 character in play. Cannot be negated. If all your character in battle is in battle restrict all play enhancement from hand. Cannot be negated."*
- **Fact Violations:** Missing restricted action 'playing' in target identifiers for 'restrict'

### Fire Foxes (CoW AB) [ID: -428609774] (Score: 0.758)
- **Key:** `-428609774_shared`
- **Original:** *"Shuffle a Site. If opponent used a special ability to draw, exchange, or search this turn, protect Lost Souls from opponent. If used by Samson, remove a male and a female Evil Character from the game."*
- **Decompiled:** *"shuffle 1 your site in play. If opponent_used_special_ability_to_draw protect 1 from opponent Lost Soul in play until end of phase. If opponent_used_special_ability_to_exchange protect 1 from opponent Lost Soul in play until end of phase. If opponent_used_special_ability_to_search protect 1 from opponent Lost Soul in play until end of phase. If used_by_Samson banish 2 evil male female evil character in play."*
- **Fact Violations:** Missing primary action: 'draw'

### Adam (FoM) [ID: -381378507] (Score: 0.76)
- **Key:** `-381378507_shared`
- **Original:** *"Protect Adam from non-humans. You may topdeck an antediluvian human or a Genesis 1-7 Enhancement from Reserve. May band to Eve. Cannot be interrupted by a human."*
- **Decompiled:** *"protect This Hero. Cannot be interrupted. You may topdeck Antediluvian Human or You may topdeck Genesis 1-7 Enhancement. You may band Eve."*
- **Fact Violations:** Missing numbers in AST: [7]

### Emperor Domitian (RoJ) [ID: 2141225162] (Score: 0.776)
- **Key:** `2141225162_shared`
- **Original:** *"May reveal a N.T. gray card in hand to banish a Hero in battle. Opponent may discard a card matching Hero's brigade from hand instead. Cannot be prevented by a good card."*
- **Decompiled:** *"reveal 1 your N.T. gray from hand, banish 1 hero in battle. Instead. Cannot be prevented."*
- **Fact Violations:** Missing primary action: 'discard'

### Capturing Canaan (FoM) [ID: -1929360855] (Score: 0.786)
- **Key:** `-1929360855_shared`
- **Original:** *"Capture an evil human (or 2 if used by a judge)."*
- **Decompiled:** *"capture 1 opponent's evil human character in play. If Judge is in play capture 1 opponent's evil human character in play."*
- **Fact Violations:** Missing numbers in AST: [2]

### Enoch (CoW) [ID: 871051480] (Score: 0.789)
- **Key:** `871051480_shared`
- **Original:** *"Protect Enoch from discard abilities. Your good Dominants can target Enoch as if he were a Lost Soul in opponent's Land of Bondage. While in battle, negate band abilities."*
- **Decompiled:** *"protect This Hero. give all your good Dominant character in play. If Enoch (CoW) is in battle negate all band abilities in battle."*
- **Fact Violations:** Missing primary action: 'band'

### Fire Foxes [ID: -2033677341] (Score: 0.789)
- **Key:** `-2033677341_shared`
- **Original:** *"Shuffle a Site. If opponent used a special ability to draw, exchange, or search this turn, protect Lost Souls from opponent. If used by Samson, remove a male and a female Evil Character from the game."*
- **Decompiled:** *"shuffle 1 your site from deck. If opponent_used_special_ability_to_draw protect all opponent Lost Soul in play until end of phase. If opponent_used_special_ability_to_exchange protect all opponent Lost Soul in play until end of phase. If opponent_used_special_ability_to_search protect all opponent Lost Soul in play until end of phase. If Samson is in play banish 2 evil male female evil character in play."*
- **Fact Violations:** Missing primary action: 'draw'

### Angelic Visit [ID: 999243565] (Score: 0.791)
- **Key:** `999243565_shared`
- **Original:** *"Cornelius may join the battle this turn."*
- **Decompiled:** *"You may add to battle Cornelius."*
- **Fact Violations:** Missing action 'band' for legacy term 'join the battle'

### Amaziah, the Ungodly Priest [ID: -2068286387] (Score: 0.83)
- **Key:** `-2068286387_shared`
- **Original:** *"Evil kings of Israel are immune to all good special abilities this turn.  May band to King Jeroboam II."*
- **Decompiled:** *"immune all evil hero in play this turn. You may band King Jeroboam II."*
- **Fact Violations:** Missing card protection action: 'protect'

### Haggai (PoC) [ID: -706183812] (Score: 0.83)
- **Key:** `-706183812_shared`
- **Original:** *"You may play a good O.T. Fortress from Reserve (or discard pile if a Persian is in play). May band to an Ezra, Haggai or Zechariah Hero, or you may look at the top X cards of deck: Take 1. Cannot be negated.  a"*
- **Decompiled:** *"You may play 1 your good O.T. Fortress site from Reserve. If all your Persian character in play is in play You may play 1 your good O.T. Fortress site from discard pile. You may band Ezra or Haggai or Zechariah or You may look 1 your cards from deck, take 1 your card from deck."*
- **Fact Violations:** Missing modifier: 'cannot be negated'

### Household Idols (LoC) [ID: 1670877992] (Score: 0.831)
- **Key:** `1670877992_top`
- **Original:** *"Protect Heroes from opponents' band abilities."*
- **Decompiled:** *"protect all your good band hero in play."*
- **Fact Violations:** Missing primary action: 'band'

### Cursed for Us (GoC) [ID: -417021506] (Score: 0.832)
- **Key:** `-417021506_top`
- **Original:** *"Place an orange Gospel Enhancement from discard pile on a Hero for 1 turn: Restrict good Dominants."*
- **Decompiled:** *"place 1 your good orange Gospel enhancement from discard pile this turn, restrict all good Dominant play character in play until end of phase."*
- **Fact Violations:** Missing restricted action 'dominants' in target identifiers for 'restrict'

### Demon behind the Idol [ID: 690719553] (Score: 0.841)
- **Key:** `690719553_shared`
- **Original:** *"Take an orange Enhancement from discard pile and place it beneath draw pile.  If an Artifact depicting an idol is not in play, discard this Evil Character after battle."*
- **Decompiled:** *"take 1 orange enhancement from discard pile, underdeck 1 your orange enhancement from hand. after_battle If all depicting idol artifact in play is in play discard 1 your evil evil character in play."*
- **Fact Violations:** Missing conceptual identifier: 'depicting idol'

### Demetrius the Silversmith [ID: 1448661694] (Score: 0.842)
- **Key:** `1448661694_shared`
- **Original:** *"You may search deck for a card depicting an idol. Protect cards (except characters) depicting an idol from discard. Acts 19 cards cannot be negated."*
- **Decompiled:** *"You may search 1 your depicting an idol from deck. protect all depicting an idol except characters in play, discard all depicting an idol except characters in play. gain all Acts 19 19 in play. Cannot be negated."*
- **Fact Violations:** Missing numbers in AST: [19]

### Absalom (Ki) [ID: 730143821] (Score: 0.844)
- **Key:** `730143821_shared`
- **Original:** *"May band with any Evil Character with a reference from 2 Samuel 14-18.  While Absalom is in play, David cannot enter battle."*
- **Decompiled:** *"You may band 2 14-18 evil character in play. If Absalom is in play restrict David."*
- **Fact Violations:** Missing numbers in AST: [2]

### Gideon's Ephod [ID: 1167085011] (Score: 0.852)
- **Key:** `1167085011_top`
- **Original:** *"If a Judge is in play, decrease abilities and evil O.T. Enhancements are regardless of protect abilities. Decrease human Heroes in battle 0/3."*
- **Decompiled:** *"If Judge is in play decrease all evil O.T. enhancement in play, gain all evil O.T. enhancement in play. Cannot be prevented. decrease all good Human hero in battle."*
- **Fact Violations:** Missing numbers in AST: [3]

### Corrupt People [ID: 1230874469] (Score: 0.863)
- **Key:** `1230874469_shared`
- **Original:** *"Protect evil antediluvians from convert abilities. If you are attacked, you may discard a card from hand or territory to search deck or discard pile for an evil Genesis 6"*
- **Decompiled:** *"protect all evil Antediluvian evil character in play. If attacked discard 1 your card from hand, search all your evil Genesis 6 6 site from deck. convert This Hero."*
- **Fact Violations:** Missing numbers in AST: [6]

### Beast from the Sea (RoJ AB) [ID: -1356503623] (Score: 0.864)
- **Key:** `-1356503623_shared`
- **Original:** *"If an opponent uses a draw or search ability (except on an evil card), you may topdeck a N.T. Lost Soul. Cannot be negated if Red Dragon or The False Prophet is in play."*
- **Decompiled:** *"If opponent_draw_or_search_ability You may topdeck N.T. Lost Soul. Cannot be negated."*
- **Fact Violations:** Missing primary action: 'draw'

### House of Rimmon [ID: -1005681090] (Score: 0.865)
- **Key:** `-1005681090_top`
- **Original:** *"Protect Syrian Evil Characters in your territory from shuffle, capture, and discard unless Elisha is in play."*
- **Decompiled:** *"If Elisha is in play protect all your evil Syrian character in play until end of phase."*
- **Fact Violations:** Missing primary action: 'discard'

### Egyptian Treasures (CoW AB) [ID: -1739768339] (Score: 0.866)
- **Key:** `-1739768339_shared`
- **Original:** *"If an Exodus Hero is not in battle, reveal the top X cards of opponent's deck: Put Lost Souls in play, discard up to 2 good cards and underdeck the rest. Protect X Lost Souls from rescue."*
- **Decompiled:** *"If all your Exodus hero in battle is in battle reveal opponent's card from deck, play your Lost Soul in play, discard opponent's good from deck, underdeck opponent's card from deck, protect your Lost Soul in play."*
- **Fact Violations:** Missing numbers in AST: [2]

### Gideon (CoW AB) [ID: -645963902] (Score: 0.88)
- **Key:** `-645963902_shared`
- **Original:** *"You may search deck for a good card with Gideon's name in the title. May band to Gideon's 300."*
- **Decompiled:** *"You may search 1 your good Gideon's name in the title from deck. You may band 1 your good Gideon's 300 hero in play."*
- **Fact Violations:** Missing numbers in AST: [300]

### Helez (Ki) [ID: -1167837253] (Score: 0.881)
- **Key:** `-1167837253_shared`
- **Original:** *"May band to a warrior class Hero with a reference from 1 Chronicles or 2 Samuel."*
- **Decompiled:** *"You may band 1 warrior class reference from 1 Chronicles reference from 2 Samuel hero in play 0/0."*
- **Fact Violations:** Missing numbers in AST: [2]

### Fire, Smoke, and Sulfur [ID: -520614315] (Score: 0.888)
- **Key:** `-520614315_shared`
- **Original:** *"Discard one human Evil Character (or two if there are at least 6 humans in play)."*
- **Decompiled:** *"discard 1 evil human evil character in play, discard 1 evil human evil character in play."*
- **Fact Violations:** Missing numbers in AST: [6]

### Corrupt People (CoW AB) [ID: 1070141064] (Score: 0.899)
- **Key:** `1070141064_shared`
- **Original:** *"Protect evil antediluvians from convert abilities. If you are attacked, you may discard a card from hand or territory to search deck or discard pile for an evil Genesis 6 Enhancement."*
- **Decompiled:** *"protect all evil Antediluvian convert abilities character in play. discard 1 your card from hand, search your evil Genesis 6 6 enhancement from deck or discard 1 your card from hand, search your evil Genesis 6 6 enhancement from discard pile or discard 1 your card in territory, search your evil Genesis 6 6 enhancement from deck or discard 1 your card in territory, search your evil Genesis 6 6 enhancement from discard pile."*
- **Fact Violations:** Missing numbers in AST: [6]

### Isaac [ID: -8431892] (Score: 0.901)
- **Key:** `-8431892_shared`
- **Original:** *"May use any good enhancement with a reference from Genesis 21 through Genesis 35."*
- **Decompiled:** *"You may 1 your good reference from Genesis 21 through Genesis 35 21 35 enhancement from hand may use other enhancements."*
- **Fact Violations:** Missing numbers in AST: [21, 35]

### Altar of Dagon (FoM) [ID: -1474117167] (Score: 0.919)
- **Key:** `-1474117167_top`
- **Original:** *"Negate Heroes with toughness less than X. While your evil Philistine is in battle, restrict opponent from playing good Dominants."*
- **Decompiled:** *"negate all toughness less than X hero in play. If all your evil Philistine evil character in battle is in battle restrict all opponent's good Dominant play hero from hand."*
- **Fact Violations:** Missing restricted action 'playing' in target identifiers for 'restrict'

### Bow and Arrow (Gray)( Wa) [ID: -23651600] (Score: 0.921)
- **Key:** `-23651600_shared`
- **Original:** *"Evil Character is immune to Silver Brigade."*
- **Decompiled:** *"immune all evil Silver Brigade evil character in play."*
- **Fact Violations:** Missing card protection action: 'protect'

### Gideon (CoW) [ID: -949129590] (Score: 0.928)
- **Key:** `-949129590_shared`
- **Original:** *"You may search deck for a good card with Gideon's name in the title. May band to Gideon's 300."*
- **Decompiled:** *"You may search your good Gideon's name in the title from deck. You may band Gideon's 300."*
- **Fact Violations:** Missing numbers in AST: [300]

---
## High Fidelity Samples (Top Mechanical Alignment)

- **Elhanan (Ki) [ID: 712625997]** (Score: 1.0):
  - *Key:* `712625997_shared`
  - *Orig:* "Discard Goliath's Brother (Lahmi)."
  - *AST:*  "discard Goliath's Brother (Lahmi)."
- **Elhanan (Wa) [ID: 1410140329]** (Score: 1.0):
  - *Key:* `1410140329_shared`
  - *Orig:* "Discard Goliath's Brother."
  - *AST:*  "discard Goliath's Brother."
- **Herod Agrippa I (G) [ID: 402028451]** (Score: 1.0):
  - *Key:* `402028451_shared`
  - *Orig:* "Discard James son of Zebedee. Capture Peter."
  - *AST:*  "discard James son of Zebedee. capture Peter."
- **Abihu (Pi) [ID: 1576969800]** (Score: 0.996):
  - *Key:* `1576969800_shared`
  - *Orig:* "If Nadab is in battle, you may remove all cards in battle from the game."
  - *AST:*  "If Nadab is in battle You may remove from the game all cards in battle."
- **Herod Agrippa I (Ap) [ID: -1618022910]** (Score: 0.995):
  - *Key:* `-1618022910_shared`
  - *Orig:* "Discard James son of Zebedee. Capture Peter."
  - *AST:*  "discard James son of Zebedee, capture Peter."
- **Burning Incense (1st Print - L) [ID: 22299947]** (Score: 0.981):
  - *Key:* `22299947_shared`
  - *Orig:* "Shuffle all Evil Characters in battle."
  - *AST:*  "shuffle all evil character in battle."
- **Burning Incense [L] [ID: 1682743467]** (Score: 0.981):
  - *Key:* `1682743467_shared`
  - *Orig:* "Shuffle all Evil Characters in battle."
  - *AST:*  "shuffle all evil character in battle."
- **David's Music (1st Print - K) [ID: -1915443367]** (Score: 0.981):
  - *Key:* `-1915443367_shared`
  - *Orig:* "Shuffle all Evil Characters in battle."
  - *AST:*  "shuffle all evil character in battle."
- **David's Music [K] [ID: -443048545]** (Score: 0.981):
  - *Key:* `-443048545_shared`
  - *Orig:* "Shuffle all Evil Characters in battle."
  - *AST:*  "shuffle all evil character in battle."
- **David's Victory [K] [ID: 706197820]** (Score: 0.981):
  - *Key:* `706197820_shared`
  - *Orig:* "Underdeck all Evil Characters in battle."
  - *AST:*  "underdeck all evil character in battle."
- **Abeyance (Roots) [ID: -1197352418]** (Score: 0.977):
  - *Key:* `-1197352418_shared`
  - *Orig:* "Reserve all Evil Characters in battle."
  - *AST:*  "reserve all evil character in battle."
- **Egyptian Soothsayers (1st Print - K) [ID: -838637239]** (Score: 0.977):
  - *Key:* `-838637239_shared`
  - *Orig:* "You may underdeck an evil Exodus Enhancement from discard pile."
  - *AST:*  "You may underdeck 1 evil Exodus enhancement from discard pile."
- **Breaking Through [ID: -1585499617]** (Score: 0.971):
  - *Key:* `-1585499617_shared`
  - *Orig:* "If Nebuchadnezzar is in play, discard one Wall of Protection or Jerusalem Tower."
  - *AST:*  "If Nebuchadnezzar is in play discard Wall of Protection or Discard jerusalem tower."
- **Egyptian Soothsayers [K] [ID: -556581729]** (Score: 0.968):
  - *Key:* `-556581729_shared`
  - *Orig:* "You may underdeck an evil Exodus Enhancement from discard pile."
  - *AST:*  "You may underdeck 1 your evil Exodus enhancement from discard pile."
- **David's Victory (1st Print - K) [ID: 1559733072]** (Score: 0.967):
  - *Key:* `1559733072_shared`
  - *Orig:* "Underdeck all Evil Characters in battle."
  - *AST:*  "underdeck all evil evil character in battle."

---
## Moderate Fidelity Samples

- **Eternal Covenant [ID: 208816133]** (Score: 0.82):
  - *Key:* `208816133_shared`
  - *Orig:* "On activation, search discard pile for a human Hero and put it in play."
  - *AST:*  "You may search 1 your human hero from discard pile, play 1 your human hero in play."
- **Great Multitude (RoJ AB) [ID: -1496373749]** (Score: 0.82):
  - *Key:* `-1496373749_shared`
  - *Orig:* "If all your Heroes are Revelation Heroes, ignore multi-brigade Evil Characters. If you play a lamb icon card, you may negate and banish an evil Enhancement."
  - *AST:*  "If all your Revelation hero in play is in play ignore all multi-brigade evil character in play. You may negate evil enhancement in play, banish evil enhancement in play."
- **Hilkiah the High Priest [ID: -571783521]** (Score: 0.82):
  - *Key:* `-571783521_shared`
  - *Orig:* "If Solomon's Temple is in play, you may search draw pile or discard pile for Book of the Law and put it in hand."
  - *AST:*  "If Solomon's Temple is in play You may search Book of the Law, take your card from deck or may search Book of the Law, take your card from discard pile."
- **Abaddon, the Destroyer (RoJ AB) [ID: -333944980]** (Score: 0.819):
  - *Key:* `-333944980_shared`
  - *Orig:* "Negate a good or neutral card. You may search deck or Reserve for an evil Fortress or Revelation demon. May band to Locust from the Pit. Cannot be negated."
  - *AST:*  "negate 1 in play. Cannot be negated. You may search 1 your evil from deck. Cannot be negated or You may search 1 your evil from Reserve. Cannot be negated. You may band Locust from the Pit. Cannot be negated."
- **Abaddon, the Destroyer (RoJ) [ID: -2077306357]** (Score: 0.819):
  - *Key:* `-2077306357_shared`
  - *Orig:* "Negate a good or neutral card. You may search deck or Reserve for an evil Fortress or Revelation demon. May band to Locust from the Pit. Cannot be negated."
  - *AST:*  "negate 1 in play. Cannot be negated. You may search 1 your evil from deck. Cannot be negated or You may search 1 your evil from Reserve. Cannot be negated. You may band Locust from the Pit. Cannot be negated."
- **Adjourn [ID: 246872368]** (Score: 0.819):
  - *Key:* `246872368_shared`
  - *Orig:* "Paralyze X Heroes in opponent's territory for 2 turns. If all Evil Characters in battle are Greek, end the battle."
  - *AST:*  "You may paralyze opponent's hero in territory until end of phase. Limit. If all your evil Greek evil character in battle is in battle end the battle all character in battle."
- **Angel in the Path (Roots) [ID: -290993525]** (Score: 0.819):
  - *Key:* `-290993525_shared`
  - *Orig:* "Paralyze animals and evil prophets in territories this turn. You may take a silver weapon from deck."
  - *AST:*  "paralyze all Animal hero in territory this turn, paralyze all evil Prophet hero in territory this turn. You may take 1 your Silver enhancement from deck."
- **Betrayal (PoC) [ID: 1987652921]** (Score: 0.819):
  - *Key:* `1987652921_shared`
  - *Orig:* "(Star) Topdeck an Artifact from Reserve. (EE) Underdeck an opponent's good card or a good card from an opponent's hand. If played in battle, you may draw 3."
  - *AST:*  "You may topdeck 1 your artifact from Reserve. You may underdeck 1 opponent's good character in play or You may underdeck 1 opponent's good character from hand. If This card is in battle You may draw 3 your card from deck."
- **Death of Family [ID: -1186992571]** (Score: 0.819):
  - *Key:* `-1186992571_top`
  - *Orig:* "Place in territory: If your male Hero is discarded, you may discard this card to add your female Hero to battle."
  - *AST:*  "If This card is in play discard 1 your card in play, add to battle 1 your good Female hero in play."
- **Hating the Light [ID: -200524290]** (Score: 0.819):
  - *Key:* `-200524290_shared`
  - *Orig:* "Place on your human Evil Character Character: This Evil Character Character cannot be ignored and is protected from capture, conversion, and shuffle."
  - *AST:*  "place 1 your evil human character in play, gain your evil human character in play, protect your evil human capture conversion shuffle character in play. Cannot be ignored."