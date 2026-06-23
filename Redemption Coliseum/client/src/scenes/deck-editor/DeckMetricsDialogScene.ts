import Phaser from "phaser";
import { type DeckEntry } from "../../ui/deck-editor/DeckListModel";

export class DeckMetricsDialogScene extends Phaser.Scene {
  private container!: Phaser.GameObjects.Container;
  private backgroundOverlay!: Phaser.GameObjects.Rectangle;
  private deck: DeckEntry[] = [];
  private reserve: DeckEntry[] = [];

  constructor() {
    super("DeckMetricsDialogScene");
  }

  init(data: { deck: DeckEntry[]; reserve: DeckEntry[] }) {
    this.deck = data.deck || [];
    this.reserve = data.reserve || [];
  }

  create() {
    const width = this.scale.width;
    const height = this.scale.height;

    // 1. Semi-translucent backdrop overlay to swallow input
    this.backgroundOverlay = this.add
      .rectangle(0, 0, width, height, 0x000000, 0)
      .setOrigin(0)
      .setInteractive();

    this.tweens.add({
      targets: this.backgroundOverlay,
      fillAlpha: 0.65,
      duration: 250,
    });

    // 2. Centered dialog box container
    const dialogW = Math.min(width * 0.85, 800);
    const dialogH = Math.min(height * 0.85, 580);
    this.container = this.add.container(width / 2, height / 2);

    // 3. Draw glassmorphic board background
    const bgGraphics = this.add.graphics();
    bgGraphics.fillStyle(0x1a1a2e, 0.95);
    bgGraphics.fillRoundedRect(-dialogW / 2, -dialogH / 2, dialogW, dialogH, 15);
    bgGraphics.lineStyle(2.5, 0xe9cd45, 0.9); // Gold border
    bgGraphics.strokeRoundedRect(-dialogW / 2, -dialogH / 2, dialogW, dialogH, 15);
    this.container.add(bgGraphics);

    // Title
    const titleText = this.add.text(0, -dialogH / 2 + 25, "DECK METRICS", {
      fontFamily: "'Segoe UI', 'Trebuchet MS', Arial, sans-serif",
      fontSize: "22px",
      fontStyle: "bold",
      color: "#e9cd45",
      stroke: "#000000",
      strokeThickness: 3,
    }).setOrigin(0.5);
    this.container.add(titleText);

    // Compute Metrics Data
    const metrics = this.computeMetrics();

    // Render columns: Left column (Bar charts), Right column (Ratios & Brigade details)
    this.drawBarChart(-dialogW / 2 + 25, -dialogH / 2 + 65, dialogW * 0.5 - 20, dialogH - 120, metrics);
    this.drawRatiosAndBrigades(10, -dialogH / 2 + 65, dialogW * 0.5 - 20, dialogH - 120, metrics);

    // Close Button (top-right X)
    const closeBtn = this.add.text(dialogW / 2 - 35, -dialogH / 2 + 20, "✖", {
      fontSize: "26px",
      color: "#8b0000",
      fontStyle: "bold",
    }).setOrigin(0.5).setInteractive({ useHandCursor: true });

    closeBtn.on("pointerover", () => closeBtn.setTint(0xff0000));
    closeBtn.on("pointerout", () => closeBtn.clearTint());
    closeBtn.on("pointerup", () => {
      this.game.events.emit("playSound", "MENU_SELECT");
      this.close();
    });
    this.container.add(closeBtn);

    // Scale-In Animation
    this.container.setScale(0.85);
    this.container.setAlpha(0.2);
    this.tweens.add({
      targets: this.container,
      scale: 1.0,
      alpha: 1.0,
      duration: 250,
      ease: "Back.Out",
    });

    // Resize listener
    this.scale.on("resize", this.resize, this);
  }

  private close() {
    this.tweens.add({
      targets: this.container,
      scale: 0.85,
      alpha: 0,
      duration: 200,
      ease: "Power2.easeIn",
      onComplete: () => {
        this.scene.resume("DeckEditorScene");
        this.scene.stop();
      },
    });

    this.tweens.add({
      targets: this.backgroundOverlay,
      fillAlpha: 0,
      duration: 200,
    });
  }

  private computeMetrics() {
    const flatDeck = [];
    this.deck.forEach((stack) => {
      for (let i = 0; i < stack.quantity; i++) {
        flatDeck.push(stack.card);
      }
    });

    const totalDeck = flatDeck.length;

    const filterByType = (type: string) => flatDeck.filter((c) => {
      const cardType = Array.isArray(c.Type) ? c.Type : [c.Type];
      return cardType.includes(type);
    }).length;

    const numHeroes = filterByType("Hero") + filterByType("DAC");
    const numGEs = filterByType("GE") + filterByType("DAE") + filterByType("Covenant");
    const numECs = filterByType("Evil Character") + filterByType("DAC");
    const numEEs = filterByType("EE") + filterByType("DAE") + filterByType("Curse");
    const numDoms = filterByType("Dominant");
    const numArts = filterByType("Artifact") + filterByType("Covenant") + filterByType("Curse");
    const numForts = filterByType("Fortress") + filterByType("City");
    const numSites = filterByType("Site") + filterByType("City");
    const numSouls = filterByType("Lost Soul") + filterByType("City");

    return {
      totalDeck,
      numHeroes,
      numGEs,
      numECs,
      numEEs,
      numDoms,
      numArts,
      numForts,
      numSites,
      numSouls,
    };
  }

  private drawBarChart(x: number, y: number, w: number, h: number, m: any) {
    const categories = [
      { key: "Heroes", count: m.numHeroes, label: "HER" },
      { key: "GEs", count: m.numGEs, label: "GE" },
      { key: "ECs", count: m.numECs, label: "EC" },
      { key: "EEs", count: m.numEEs, label: "EE" },
      { key: "Doms", count: m.numDoms, label: "DOM" },
      { key: "Arts", count: m.numArts, label: "ART" },
      { key: "Forts", count: m.numForts, label: "FOR" },
      { key: "Sites", count: m.numSites, label: "SIT" },
      { key: "Souls", count: m.numSouls, label: "LOU" },
    ];

    const chartW = w;
    const chartH = h * 0.7;

    const startX = x + 35;
    const spacingX = (chartW - 40) / (categories.length - 1);
    
    // Draw chart outline box
    const chartBg = this.add.graphics();
    chartBg.lineStyle(1.5, 0x444466, 0.6);
    chartBg.lineBetween(x + 20, y + chartH, x + w, y + chartH); // X Axis
    this.container.add(chartBg);

    categories.forEach((cat, index) => {
      const posX = startX + index * spacingX;
      
      const percentage = m.totalDeck > 0 ? cat.count / m.totalDeck : 0;
      const barHeight = Math.max(4, percentage * (chartH - 25));
      const posY = y + chartH - barHeight;

      // Draw bar shape (color is light blue-gold gradient styled)
      const bar = this.add.graphics();
      bar.fillStyle(0xe9cd45, 0.85); // Gold
      bar.fillRoundedRect(posX - 10, posY, 20, barHeight, { tl: 4, tr: 4, bl: 0, br: 0 });
      this.container.add(bar);

      // Value label text over the bar
      const valTxt = this.add.text(posX, posY - 16, String(cat.count), {
        fontSize: "12px",
        fontFamily: "monospace",
        color: "#ffffff",
      }).setOrigin(0.5);
      this.container.add(valTxt);

      // Category label text under the bar
      const label = this.add.text(posX, y + chartH + 10, cat.label, {
        fontSize: "10px",
        fontFamily: "sans-serif",
        color: "#888888",
        fontStyle: "bold",
      }).setOrigin(0.5);
      this.container.add(label);

      // Percentage label text
      const percentStr = m.totalDeck > 0 ? `${Math.round(percentage * 100)}%` : "0%";
      const pctTxt = this.add.text(posX, y + chartH + 24, percentStr, {
        fontSize: "9px",
        fontFamily: "monospace",
        color: "#e9cd45",
      }).setOrigin(0.5);
      this.container.add(pctTxt);
    });
  }

  private drawRatiosAndBrigades(x: number, y: number, w: number, h: number, m: any) {
    const listContainer = this.add.container(x, y);

    // Category titles
    const rTitle = this.add.text(0, 0, "RATIOS", {
      fontFamily: "sans-serif",
      fontSize: "15px",
      fontStyle: "bold",
      color: "#e9cd45",
    });
    listContainer.add(rTitle);

    const charRatio = m.numECs > 0 ? (m.numHeroes / m.numECs).toFixed(1) : m.numHeroes.toFixed(1);
    const heroGERatio = m.numGEs > 0 ? (m.numHeroes / m.numGEs).toFixed(1) : m.numHeroes.toFixed(1);
    const ecEERatio = m.numEEs > 0 ? (m.numECs / m.numEEs).toFixed(1) : m.numECs.toFixed(1);
    const supportTotal = m.numDoms + m.numArts + m.numForts + m.numSites + m.numSouls;
    const battleSupportRatio = supportTotal > 0 ? ((m.numHeroes + m.numECs + m.numGEs + m.numEEs) / supportTotal).toFixed(1) : "0";

    const ratioTextStr = 
      `Character Ratio (HER/EC):   ${charRatio}\n` +
      `Hero/GE Ratio (HER/GE):     ${heroGERatio}\n` +
      `EC/EE Ratio (EC/EE):        ${ecEERatio}\n` +
      `Battle/Support Ratio:       ${battleSupportRatio}`;

    const ratioText = this.add.text(0, 24, ratioTextStr, {
      fontFamily: "monospace",
      fontSize: "12px",
      color: "#ffffff",
      lineSpacing: 4,
    });
    listContainer.add(ratioText);

    // Brigade summary details
    const bTitle = this.add.text(0, 105, "BRIGADES IN DECK", {
      fontFamily: "sans-serif",
      fontSize: "15px",
      fontStyle: "bold",
      color: "#e9cd45",
    });
    listContainer.add(bTitle);

    const goodBrigades = ["Blue", "Clay", "Gold", "Green", "Purple", "Red", "Silver", "Teal", "White", "Multi"];
    const evilBrigades = ["Black", "Brown", "Crimson", "Gold", "Gray", "Orange", "Pale Green", "Multi"];

    const flatDeck: any[] = [];
    this.deck.forEach((stack) => {
      for (let i = 0; i < stack.quantity; i++) {
        flatDeck.push(stack.card);
      }
    });

    const getBrigadeCounts = (brigade: string, isGood: boolean) => {
      const typeKey = isGood ? "Hero" : "Evil Character";
      const altTypeKey = "DAC";
      const enhancementKey = isGood ? "GE" : "EE";
      const altEnhancementKey = isGood ? "Covenant" : "Curse";

      const matchesBrigade = (card: any) => {
        const brigadeVal = Array.isArray(card.Brigade) ? card.Brigade : [card.Brigade];
        return brigadeVal.includes(brigade);
      };

      const hasType = (card: any, type: string) => {
        const typeVal = Array.isArray(card.Type) ? card.Type : [card.Type];
        return typeVal.includes(type);
      };

      const chars = flatDeck.filter((c) => matchesBrigade(c) && (hasType(c, typeKey) || hasType(c, altTypeKey)));
      const enhs = flatDeck.filter((c) => matchesBrigade(c) && (hasType(c, enhancementKey) || hasType(c, altEnhancementKey)));

      return { chars: chars.length, enhs: enhs.length };
    };

    let brigadeTextStr = "Good Brigades: (Characters / Enhancements)\n";
    goodBrigades.forEach((color) => {
      const counts = getBrigadeCounts(color, true);
      if (counts.chars > 0 || counts.enhs > 0) {
        brigadeTextStr += ` - ${color.padEnd(11)}: ${counts.chars} Chars, ${counts.enhs} Enhs\n`;
      }
    });

    brigadeTextStr += "\nEvil Brigades:\n";
    evilBrigades.forEach((color) => {
      const counts = getBrigadeCounts(color, false);
      if (counts.chars > 0 || counts.enhs > 0) {
        brigadeTextStr += ` - ${color.padEnd(11)}: ${counts.chars} Chars, ${counts.enhs} Enhs\n`;
      }
    });

    const brigadeText = this.add.text(0, 130, brigadeTextStr, {
      fontFamily: "monospace",
      fontSize: "11px",
      color: "#adadad",
      lineSpacing: 2,
    });
    listContainer.add(brigadeText);

    this.container.add(listContainer);
  }

  private resize(gameSize: { width: number; height: number }) {
    this.backgroundOverlay.setDisplaySize(gameSize.width, gameSize.height);
    this.container.setPosition(gameSize.width / 2, gameSize.height / 2);
  }

  destroy() {
    this.scale.off("resize", this.resize, this);
  }
}
