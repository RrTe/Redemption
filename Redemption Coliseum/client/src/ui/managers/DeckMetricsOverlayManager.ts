import Phaser from "phaser";
import { log, error } from "../../utils/logger";

export class DeckMetricsOverlayManager {
  /**
   * Displays the Deck Metrics HTML overlay populated with statistics for the given cards.
   */
  public static async showMetrics(
    scene: Phaser.Scene,
    cards: any[],
    onClose?: () => void
  ): Promise<void> {
    const viewW = window.innerWidth;
    const viewH = window.innerHeight;

    let domElement = scene.children.getByName(
      "deckMetricsDOM"
    ) as Phaser.GameObjects.DOMElement;

    if (!domElement) {
      if (scene.cache.html.exists("deckMetrics")) {
        domElement = scene.add
          .dom(viewW / 2, viewH / 2)
          .createFromCache("deckMetrics");
      } else {
        try {
          const resp = await fetch(`templates/deckMetrics.html?v=${Date.now()}`);
          const html = await resp.text();
          const wrapper = document.createElement("div");
          wrapper.innerHTML = html;
          const containerNode = wrapper.firstElementChild as HTMLElement || wrapper;
          domElement = scene.add.dom(viewW / 2, viewH / 2, containerNode);
        } catch (err) {
          error("DeckMetricsOverlayManager", "Failed to fetch deckMetrics HTML template", err);
          return;
        }
      }
      domElement.setName("deckMetricsDOM");
    }

    domElement.setVisible(true);

    const overlay = document.getElementById("deckMetrics");
    if (!overlay) {
      error("DeckMetricsOverlayManager", "Could not find #deckMetrics element");
      return;
    }

    const node = domElement.node as HTMLElement | null;
    if (node) {
      node.style.zIndex = "3000";
      if (node.parentElement) {
        node.parentElement.style.zIndex = "3000";
      }
    }

    overlay.style.visibility = "visible";
    overlay.style.zIndex = "3000";
    scene.scene.pause();

    requestAnimationFrame(() => {
      if (!overlay || !domElement) return;
      const currentW = window.innerWidth;
      const currentH = window.innerHeight;

      const baseW = 660;
      const baseH = 970;

      overlay.style.width = `${baseW}px`;
      overlay.style.height = `${baseH}px`;
      overlay.style.position = "absolute";
      overlay.style.top = "0px";
      overlay.style.left = "0px";
      overlay.style.margin = "0px";
      overlay.style.transformOrigin = "center center";

      const scaleX = currentW / baseW;
      const scaleY = (currentH - 20) / baseH;
      const scaleFactor = Math.min(1.0, scaleX, scaleY);

      overlay.style.transform = `translate(-50%, -50%) scale(${scaleFactor})`;
      domElement.setPosition(currentW / 2, currentH / 2);
      domElement.setOrigin(0, 0);
      domElement.setScale(1);
    });

    const closeBtn = document.getElementById("closeCardMetricsDiv");
    if (closeBtn) {
      const freshBtn = closeBtn.cloneNode(true) as HTMLElement;
      closeBtn.parentNode?.replaceChild(freshBtn, closeBtn);
      freshBtn.addEventListener(
        "click",
        (e) => {
          e.stopPropagation();
          domElement.setVisible(false);
          scene.scene.resume();
          if (onClose) onClose();
        },
        { once: true }
      );
    }

    this.populateData(cards);
  }

  private static populateData(cards: any[]): void {
    const updateBarChart = (id: string, count: number, total: number) => {
      const pct = total > 0 ? (count / total) * 100 : 0;
      const barEl = document.getElementById(id);
      if (barEl) barEl.style.height = `${pct * 2.5}px`;

      const txtEl = document.getElementById(`${id}_txt`);
      if (txtEl) txtEl.textContent = String(count);

      const pctEl = document.getElementById(`${id}_percentage`);
      if (pctEl) pctEl.textContent = `${pct.toFixed(0)}%`;
    };

    const updateRatio = (id: string, val: string) => {
      const el = document.getElementById(id);
      if (el) el.textContent = val;
    };

    const cardsByType = (type: string) => {
      return cards.filter((c) => {
        const types = Array.isArray(c.Type) ? c.Type : [c.Type];
        return types.includes(type);
      });
    };

    const cardsByBrigadeType = (type: string, color: string) => {
      return cards.filter((c) => {
        const types = Array.isArray(c.Type) ? c.Type : [c.Type];
        const typeMatch = types.includes(type);
        const cardBrigade = c.Brigade;
        const brigadeMatch = Array.isArray(cardBrigade)
          ? cardBrigade.includes(color)
          : cardBrigade === color;
        return typeMatch && brigadeMatch;
      });
    };

    const updateBrigade = (color: string, alignment: "Good" | "Evil") => {
      const charType = alignment === "Good" ? "Hero" : "Evil Character";
      const charAlt = "DAC";
      const enhType = alignment === "Good" ? "GE" : "EE";
      const enhAlt = alignment === "Good" ? "Covenant" : "Curse";

      const chars = cardsByBrigadeType(charType, color).concat(
        cardsByBrigadeType(charAlt, color)
      );
      const enhs = cardsByBrigadeType(enhType, color).concat(
        cardsByBrigadeType(enhAlt, color)
      );

      const charTC = chars.filter((c) => {
        const cls = Array.isArray(c.Class) ? c.Class : [c.Class];
        return cls.some((v: string) => v && v.includes("Territory"));
      }).length;

      const enhTC = enhs.filter((c) => {
        const cls = Array.isArray(c.Class) ? c.Class : [c.Class];
        return cls.some((v: string) => v && v.includes("Territory"));
      }).length;

      const colorLower = color.toLowerCase();
      const charEl = document.getElementById(`${colorLower}_${charType}_no`);
      const enhEl = document.getElementById(`${colorLower}_${enhType}_no`);
      const charTCEl = document.getElementById(`${colorLower}_${charType}_TC_no`);
      const enhTCEl = document.getElementById(`${colorLower}_${enhType}_TC_no`);

      if (charEl) charEl.textContent = String(chars.length);
      if (enhEl) enhEl.textContent = String(enhs.length);
      if (charTCEl) charTCEl.textContent = String(charTC);
      if (enhTCEl) enhTCEl.textContent = String(enhTC);
    };

    const total = cards.length;
    const numHeroes = cardsByType("Hero").length + cardsByType("DAC").length;
    const numGEs =
      cardsByType("GE").length +
      cardsByType("DAE").length +
      cardsByType("Covenant").length;
    const numECs =
      cardsByType("Evil Character").length + cardsByType("DAC").length;
    const numEEs =
      cardsByType("EE").length +
      cardsByType("DAE").length +
      cardsByType("Curse").length;
    const numDoms = cardsByType("Dominant").length;
    const numArts =
      cardsByType("Artifact").length +
      cardsByType("Covenant").length +
      cardsByType("Curse").length;
    const numForts =
      cardsByType("Fortress").length + cardsByType("City").length;
    const numSites = cardsByType("Site").length + cardsByType("City").length;
    const numSouls =
      cardsByType("Lost Soul").length + cardsByType("City").length;

    updateBarChart("bar_Heroes", numHeroes, total);
    updateBarChart("bar_GEs", numGEs, total);
    updateBarChart("bar_ECs", numECs, total);
    updateBarChart("bar_EEs", numEEs, total);
    updateBarChart("bar_Doms", numDoms, total);
    updateBarChart("bar_Arts", numArts, total);
    updateBarChart("bar_Forts", numForts, total);
    updateBarChart("bar_Sites", numSites, total);
    updateBarChart("bar_Souls", numSouls, total);

    updateRatio("characterRatio", numECs > 0 ? (numHeroes / numECs).toFixed(1) : String(numHeroes));
    updateRatio("heroGERatio", numGEs > 0 ? (numHeroes / numGEs).toFixed(1) : String(numHeroes));
    updateRatio("ecEERatio", numEEs > 0 ? (numECs / numEEs).toFixed(1) : String(numECs));

    const battleSupport = numDoms + numArts + numForts + numSites + numSouls;
    updateRatio(
      "battleSupportRatio",
      battleSupport > 0
        ? ((numHeroes + numECs + numGEs + numEEs) / battleSupport).toFixed(1)
        : "0"
    );

    const goodBrigades = ["Blue", "Clay", "Gold", "Green", "Purple", "Red", "Silver", "Teal", "White", "Multi"];
    const evilBrigades = ["Black", "Brown", "Crimson", "Gold", "Gray", "Orange", "Pale Green", "Multi"];

    goodBrigades.forEach((b) => updateBrigade(b, "Good"));
    evilBrigades.forEach((b) => updateBrigade(b, "Evil"));
  }
}
