import Phaser from "phaser";
import { type TypedRoom } from "../gameUI";
import { type ElementManager } from "./ElementManager";
import { type GameLayout } from "../layout";
import { PHASES } from "../../../../shared/phases";
import { type RoomState, type PlayerState } from "../../../../shared/types";
import { log, DEBUG } from "../../utils/logger";

// ✨ NEU: Zentrale Konfiguration für den Phasen-Indikator (Glow)
// (Verschoben aus GameUI.ts)
const PHASE_INDICATOR_STYLE = {
  ACTIVE_COLOR: 0xffd700, // Gold für aktiven Spieler
  INACTIVE_COLOR: 0xaaaaaa, // Silber/Grau für inaktiven Spieler
  GLOW_STEPS: 6, // Anzahl der Schichten für den weichen Verlauf
  BASE_ALPHA_ACTIVE: 0.3, // Start-Transparenz (aktiv)
  BASE_ALPHA_INACTIVE: 0.15, // Start-Transparenz (inaktiv)
  CORNER_RADIUS: 10, // Eckenrundung des Glows
  PADDING: 6, // Abstand zum Icon
};

/**
 * Manages the Heads-Up Display (HUD), including phase indicators,
 * pile counts, and player information text.
 */
export class HUDManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private elementManager: ElementManager;
  private layout: GameLayout;

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    elementManager: ElementManager,
    layout: GameLayout,
  ) {
    this.scene = scene;
    this.room = room;
    this.elementManager = elementManager;
    this.layout = layout;
  }

  public updateLayout(layout: GameLayout) {
    this.layout = layout;
  }

  /** Aktualisiert statische UI-Elemente wie Texte und Buttons. */
  public updateGameStateUI(
    state: RoomState,
    mySessionId: string,
    opponent: PlayerState | undefined,
  ) {
    if (DEBUG) {
      log(
        "UI",
        `[UI UPDATE] Updating GameState UI. Current Phase: ${state.currentPhase}`,
      );
    }

    const isActive = state.activePlayer === mySessionId;

    // Phasen-Icons aktualisieren
    const phasesToShow = [
      PHASES.DRAW,
      PHASES.UPKEEP,
      PHASES.PREP,
      PHASES.BATTLE,
      PHASES.DISCARD,
    ];
    const currentPhase = state.currentPhase;

    // Verstecke den Indikator standardmäßig
    this.elementManager.staticElements.phaseIndicator.setVisible(false);

    phasesToShow.forEach((phase) => {
      const icon = this.elementManager.staticElements.phaseIcons[phase];
      if (!icon) return;

      const isCurrentPhase = phase === currentPhase;

      const layoutData = this.layout.phaseIcons[phase];
      const baseSize = layoutData ? layoutData.size : 32;

      const scaleFactor = isCurrentPhase ? 1.2 : 0.9;
      icon.setData("scaleFactor", scaleFactor);

      const targetSize = baseSize * scaleFactor;
      icon.setDisplaySize(targetSize, targetSize);

      // Indikator zeichnen
      if (isCurrentPhase) {
        const indicator = this.elementManager.staticElements.phaseIndicator;
        indicator.clear();

        const color = isActive
          ? PHASE_INDICATOR_STYLE.ACTIVE_COLOR
          : PHASE_INDICATOR_STYLE.INACTIVE_COLOR;

        const steps = PHASE_INDICATOR_STYLE.GLOW_STEPS;
        const baseAlpha = isActive
          ? PHASE_INDICATOR_STYLE.BASE_ALPHA_ACTIVE
          : PHASE_INDICATOR_STYLE.BASE_ALPHA_INACTIVE;
        const basePadding = PHASE_INDICATOR_STYLE.PADDING;
        const cornerRadius = PHASE_INDICATOR_STYLE.CORNER_RADIUS;

        for (let i = 0; i < steps; i++) {
          const alpha = baseAlpha / (i + 1);
          const expansion = i * 2;
          const w = targetSize + basePadding + expansion * 2;
          const h = targetSize + basePadding + expansion * 2;

          indicator.fillStyle(color, alpha);
          indicator.fillRoundedRect(-w / 2, -h / 2, w, h, cornerRadius + i);
        }

        indicator.setPosition(icon.x, icon.y);
        indicator.setVisible(true);
      }

      const targetAlpha = isActive && isCurrentPhase ? 1.0 : 0.5;
      icon.setAlpha(targetAlpha);
    });

    // Spieler-Infos aktualisieren
    if (state.players.has(mySessionId)) {
      const me = state.players.get(mySessionId);
      this.elementManager.staticElements.playerInfoText.setText(
        `Player: ${me?.name || "Unknown"}`,
      );
    }

    if (opponent) {
      this.elementManager.staticElements.opponentInfoText.setText(
        `Player: ${opponent.name}`,
      );
    } else {
      this.elementManager.staticElements.opponentInfoText.setText(
        "Waiting for opponent...",
      );
    }
  }

  /** Aktualisiert die Zähler auf den Kartenstapeln. */
  public updatePileCounts(
    player: PlayerState | null,
    opponent: PlayerState | undefined,
  ) {
    const update = (element: any, count: number) => {
      if (element && typeof element.updateCount === "function") {
        element.updateCount(count);
      }
    };

    update(
      this.elementManager.zoneElements.playerDeckPile,
      player?.deck.length ?? 0,
    );
    update(
      this.elementManager.zoneElements.playerDiscardPile,
      player?.discard.length ?? 0,
    );
    update(
      this.elementManager.zoneElements.opponentDeckPile,
      opponent?.deck.length ?? 0,
    );
    update(
      this.elementManager.zoneElements.opponentDiscardPile,
      opponent?.discard.length ?? 0,
    );
    update(
      this.elementManager.zoneElements.playerReservePile,
      player?.reserve.length ?? 0,
    );
    update(
      this.elementManager.zoneElements.opponentReservePile,
      opponent?.reserve.length ?? 0,
    );
    update(
      this.elementManager.zoneElements.playerLandOfRedemptionPile,
      player?.land_of_redemption.length ?? 0,
    );
    update(
      this.elementManager.zoneElements.opponentLandOfRedemptionPile,
      opponent?.land_of_redemption.length ?? 0,
    );
    update(
      this.elementManager.zoneElements.playerBanishPile,
      player?.banish.length ?? 0,
    );
    update(
      this.elementManager.zoneElements.opponentBanishPile,
      opponent?.banish.length ?? 0,
    );
  }
}
