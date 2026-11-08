import Phaser from "phaser";
import { type GameLayout } from "../layout";
import { ViewportManager } from "../managers/ViewportManager";
import { PHASES } from "../../../../shared/phases";
import { BATTLE_STATE_REASON, BATTLE_HUD_CONFIG } from "../../../../shared/battleConstants";
import { UI_STRINGS } from "../../constants/uiStrings";
import type { RoomState } from "../../../../shared/types";

/**
 * Central Clash-Bar Battle HUD (Solution 1 / Studio Standard).
 * Fixed-slot grid layout centered horizontally and vertically in the Field of Battle.
 * Features Toast-style 14px gold typography, 3D golden initiative chevron, Special Initiative highlight,
 * and an integrated Pass button for normal and Special Initiative.
 */
export class BattleHUD extends Phaser.GameObjects.Container {
  private panelBg: Phaser.GameObjects.Graphics;
  private rescuerContainer: Phaser.GameObjects.Container;
  private rescuerBg: Phaser.GameObjects.Graphics;
  private rescuerLabel: Phaser.GameObjects.Text;
  private rescuerNumbersText: Phaser.GameObjects.Text;

  private blockerContainer: Phaser.GameObjects.Container;
  private blockerBg: Phaser.GameObjects.Graphics;
  private blockerLabel: Phaser.GameObjects.Text;
  private blockerNumbersText: Phaser.GameObjects.Text;

  private initiativeContainer: Phaser.GameObjects.Container;
  private initiativeBg: Phaser.GameObjects.Graphics;
  private initiativeChevron: Phaser.GameObjects.Image;
  private initiativeLabel: Phaser.GameObjects.Text;
  private passBtnContainer: Phaser.GameObjects.Container;
  private passBtnBg: Phaser.GameObjects.Graphics;
  private passBtnLabel: Phaser.GameObjects.Text;
  private initiativeGlowTween: Phaser.Tweens.Tween | null = null;

  private currentLayout: GameLayout;
  private isBattlePhaseActive = false;
  private currentAccentColor = 0x888888;
  private currentPillBgColor: number = BATTLE_HUD_CONFIG.BACKGROUND_COLOR;
  private onPassInitiative?: () => void;

  constructor(scene: Phaser.Scene, layout: GameLayout, onPassInitiative?: () => void) {
    super(scene, 0, 0);
    this.currentLayout = layout;
    this.onPassInitiative = onPassInitiative;
    this.setDepth(60);
    const fontCommon = { fontFamily: 'Arial, "Arial Black", sans-serif', fontStyle: "bold" };

    this.panelBg = scene.add.graphics();
    this.add(this.panelBg);

    // 1. Rescuer Badge (Attacker)
    this.rescuerContainer = scene.add.container(0, 0);
    this.rescuerBg = scene.add.graphics();
    this.rescuerLabel = scene.add.text(0, -8, UI_STRINGS.BATTLE_HUD.ROLE_RESCUER, {
      ...fontCommon, fontSize: "11px", color: BATTLE_HUD_CONFIG.GOLD_HEX, letterSpacing: 1,
    }).setOrigin(0.5).setStroke("#000000", 1.5).setShadow(0, 1, "rgba(0,0,0,0.8)", 2, true, true);
    this.rescuerNumbersText = scene.add.text(0, 7, "0 / 0", {
      ...fontCommon, fontSize: "16px", color: BATTLE_HUD_CONFIG.GOLD_HEX,
    }).setOrigin(0.5).setStroke("#000000", 2).setShadow(0, 1, "rgba(0,0,0,0.8)", 3, true, true);
    this.rescuerContainer.add([this.rescuerBg, this.rescuerLabel, this.rescuerNumbersText]);

    // 2. Dynamic Initiative Pill (Gold Toast typography, 3D golden chevron icon, & Pass button)
    this.initiativeContainer = scene.add.container(0, 0);
    this.initiativeBg = scene.add.graphics();
    this.initiativeChevron = scene.add.image(0, 0, "icon_initiative_chevron").setOrigin(0.5).setVisible(false);
    this.initiativeLabel = scene.add.text(0, 0, UI_STRINGS.BATTLE_HUD.AWAITING_ATTACKER, {
      ...fontCommon, fontSize: "14px", color: BATTLE_HUD_CONFIG.GOLD_HEX, letterSpacing: 1,
    }).setOrigin(0.5).setShadow(0, 1, "rgba(0,0,0,0.85)", 2, false, true);

    this.passBtnContainer = scene.add.container(0, 0).setVisible(false);
    this.passBtnBg = scene.add.graphics();
    this.passBtnLabel = scene.add.text(0, 0, UI_STRINGS.BATTLE_HUD.BTN_PASS, {
      ...fontCommon, fontSize: "11px", color: "#ffffff", letterSpacing: 1,
    }).setOrigin(0.5).setStroke("#000000", 1.5);
    this.passBtnContainer.add([this.passBtnBg, this.passBtnLabel]);
    this.setupPassButtonInteractivity();

    this.initiativeContainer.add([
      this.initiativeBg,
      this.initiativeChevron,
      this.initiativeLabel,
      this.passBtnContainer,
    ]);

    // 3. Blocker Badge (Defender)
    this.blockerContainer = scene.add.container(0, 0);
    this.blockerBg = scene.add.graphics();
    this.blockerLabel = scene.add.text(0, -8, UI_STRINGS.BATTLE_HUD.ROLE_BLOCKER, {
      ...fontCommon, fontSize: "11px", color: "#d8b4fe", letterSpacing: 1,
    }).setOrigin(0.5).setStroke("#000000", 1.5).setShadow(0, 1, "rgba(0,0,0,0.8)", 2, true, true);
    this.blockerNumbersText = scene.add.text(0, 7, "0 / 0", {
      ...fontCommon, fontSize: "16px", color: BATTLE_HUD_CONFIG.GOLD_HEX,
    }).setOrigin(0.5).setStroke("#000000", 2).setShadow(0, 1, "rgba(0,0,0,0.8)", 3, true, true);
    this.blockerContainer.add([this.blockerBg, this.blockerLabel, this.blockerNumbersText]);

    this.add([this.rescuerContainer, this.initiativeContainer, this.blockerContainer]);
    scene.add.existing(this);
    this.setVisible(false);
    this.setAlpha(0);
    this.reposition(layout);
  }

  private setupPassButtonInteractivity(): void {
    const passW = BATTLE_HUD_CONFIG.PASS_BTN_WIDTH || 56;
    const passH = BATTLE_HUD_CONFIG.PASS_BTN_HEIGHT || 22;
    const hitArea = new Phaser.Geom.Rectangle(-passW / 2, -passH / 2, passW, passH);
    this.passBtnContainer
      .setInteractive(hitArea, Phaser.Geom.Rectangle.Contains)
      .on("pointerdown", () => {
        this.scene.game.events.emit("playSound", "UI_CLICK");
        this.scene.tweens.add({
          targets: this.passBtnContainer,
          scale: 0.92,
          duration: 60,
          yoyo: true,
        });
        this.onPassInitiative?.();
      })
      .on("pointerover", () => {
        this.scene.tweens.add({
          targets: this.passBtnContainer,
          scale: 1.07,
          duration: 100,
        });
        this.passBtnLabel.setColor(BATTLE_HUD_CONFIG.GOLD_HEX);
      })
      .on("pointerout", () => {
        this.scene.tweens.add({
          targets: this.passBtnContainer,
          scale: 1.0,
          duration: 100,
        });
        this.passBtnLabel.setColor("#ffffff");
      });
    if (this.passBtnContainer.input) {
      this.passBtnContainer.input.cursor = "pointer";
    }
  }

  /**
   * Repositions the Clash-Bar centered both horizontally and vertically in the Field of Battle.
   * Uses studio-standard fixed-width slots to eliminate visual jitter and startup overlaps.
   *
   * @param {GameLayout} layout Current calculated layout.
   */
  public reposition(layout: GameLayout): void {
    this.currentLayout = layout;
    const isMobile = ViewportManager.isLowHeightProfile();
    const scale = isMobile ? 0.85 : 1.0;

    const badgeW = Math.round(BATTLE_HUD_CONFIG.BADGE_WIDTH * scale);
    const badgeH = Math.round(BATTLE_HUD_CONFIG.BADGE_HEIGHT * scale);
    const initW = Math.round(BATTLE_HUD_CONFIG.INITIATIVE_WIDTH * scale);
    const initH = Math.round(BATTLE_HUD_CONFIG.INITIATIVE_HEIGHT * scale);
    const gap = Math.round(BATTLE_HUD_CONFIG.SLOT_GAP * scale);

    const chevronW = Math.round(15 * scale);
    const chevronH = Math.round(23 * scale);
    this.initiativeChevron.setDisplaySize(chevronW, chevronH);
    this.alignInitiativeContent(scale);

    this.setPosition(layout.GAME_WIDTH / 2, layout.GAME_HEIGHT / 2);

    // Outer backing bar - fixed width based on stable slots
    const totalW = (badgeW * 2) + initW + (gap * 2) + Math.round(12 * scale);
    const totalH = Math.max(badgeH, initH) + Math.round(6 * scale);
    this.panelBg.clear();
    this.panelBg.fillStyle(0x0a0e17, 0.82);
    this.panelBg.fillRoundedRect(-totalW / 2, -totalH / 2, totalW, totalH, 8 * scale);
    this.panelBg.lineStyle(1.2, BATTLE_HUD_CONFIG.RESCUER_COLOR, 0.4);
    this.panelBg.strokeRoundedRect(-totalW / 2, -totalH / 2, totalW, totalH, 8 * scale);

    this.drawBadgeBackground(this.rescuerBg, badgeW, badgeH, BATTLE_HUD_CONFIG.RESCUER_COLOR);
    this.drawBadgeBackground(this.blockerBg, badgeW, badgeH, BATTLE_HUD_CONFIG.BLOCKER_COLOR);

    const rescuerX = -Math.round(initW / 2 + gap + badgeW / 2);
    const blockerX = Math.round(initW / 2 + gap + badgeW / 2);
    this.rescuerContainer.setPosition(rescuerX, 0);
    this.initiativeContainer.setPosition(0, 0);
    this.blockerContainer.setPosition(blockerX, 0);

    const valFontSize = `${Math.round(16 * scale)}px`;
    const labelFontSize = `${Math.round(11 * scale)}px`;
    const initFontSize = `${Math.round(13 * scale)}px`;

    this.rescuerNumbersText.setFontSize(valFontSize);
    this.blockerNumbersText.setFontSize(valFontSize);
    this.rescuerLabel.setFontSize(labelFontSize);
    this.blockerLabel.setFontSize(labelFontSize);
    this.initiativeLabel.setFontSize(initFontSize);
    this.passBtnLabel.setFontSize(`${Math.round(10 * scale)}px`);

    this.drawInitiativePill(initW, initH, this.currentAccentColor, this.currentPillBgColor);
  }

  /**
   * Updates battle numbers and dynamic initiative status on state changes.
   *
   * @param {RoomState} state Current room state.
   * @param {string} mySessionId Local client session ID.
   */
  public updateState(state: RoomState, mySessionId: string): void {
    const isBattle = state.currentPhase === PHASES.BATTLE;
    if (!isBattle) {
      if (this.isBattlePhaseActive) {
        this.isBattlePhaseActive = false;
        this.scene.tweens.killTweensOf(this);
        this.scene.tweens.add({ targets: this, alpha: 0, duration: 200, onComplete: () => this.setVisible(false) });
      }
      return;
    }

    if (!this.isBattlePhaseActive) {
      this.isBattlePhaseActive = true;
      this.setVisible(true);
      this.scene.tweens.killTweensOf(this);
      this.scene.tweens.add({ targets: this, alpha: 1, duration: 300 });
    }

    const battle = state.battle;
    const isPlayerAttacker = state.activePlayer === mySessionId;
    const rescuerStr = battle ? battle.rescuerStrength : 0;
    const rescuerTough = battle ? battle.rescuerToughness : 0;
    const blockerStr = battle ? battle.blockerStrength : 0;
    const blockerTough = battle ? battle.blockerToughness : 0;

    const rescuerSuffix = isPlayerAttacker ? ` ${UI_STRINGS.BATTLE_HUD.YOU_SUFFIX}` : "";
    const blockerSuffix = !isPlayerAttacker ? ` ${UI_STRINGS.BATTLE_HUD.YOU_SUFFIX}` : "";

    this.rescuerLabel.setText(`${UI_STRINGS.BATTLE_HUD.ROLE_RESCUER}${rescuerSuffix}`);
    this.rescuerNumbersText.setText(`${rescuerStr} / ${rescuerTough}`);
    this.blockerLabel.setText(`${UI_STRINGS.BATTLE_HUD.ROLE_BLOCKER}${blockerSuffix}`);
    this.blockerNumbersText.setText(`${blockerStr} / ${blockerTough}`);

    const reason = battle?.stateReason || BATTLE_STATE_REASON.NO_BATTLE;
    const initPlayerId = battle?.initiativePlayerId || "";
    const specialInitPlayerId = battle?.specialInitiativePlayerId || "";
    const isChronicleBusy = !specialInitPlayerId && Boolean(state.effectChronicle?.items?.length);
    this.updateInitiativeDisplay(reason, initPlayerId, specialInitPlayerId, mySessionId, isChronicleBusy);
  }

  private updateInitiativeDisplay(
    reason: string,
    initPlayerId: string,
    specialInitPlayerId: string,
    mySessionId: string,
    isChronicleBusy: boolean,
  ): void {
    const isSpecialInit = Boolean(specialInitPlayerId);
    const isMySpecialInit = isSpecialInit && specialInitPlayerId === mySessionId;
    const hasInitiative = !isSpecialInit && initPlayerId === mySessionId;
    const oppHasInitiative = !isSpecialInit && Boolean(initPlayerId && initPlayerId !== mySessionId);

    const { text, accentColor, bgColor } = isSpecialInit
      ? {
          text: UI_STRINGS.BATTLE_HUD.SPECIAL_INITIATIVE(isMySpecialInit),
          accentColor: BATTLE_HUD_CONFIG.SPECIAL_INITIATIVE_COLOR || 0xd946ef,
          bgColor: BATTLE_HUD_CONFIG.SPECIAL_INITIATIVE_BG_COLOR || 0x3b0764,
        }
      : {
          ...this.getInitiativeText(reason, hasInitiative),
          bgColor: BATTLE_HUD_CONFIG.BACKGROUND_COLOR,
        };

    const canPass = isMySpecialInit || (hasInitiative && !isChronicleBusy);
    this.passBtnContainer.setVisible(canPass);

    this.currentAccentColor = accentColor;
    this.currentPillBgColor = bgColor;
    this.initiativeLabel.setText(text);

    if (isMySpecialInit || hasInitiative) {
      this.initiativeChevron.setVisible(true).setAngle(0);
    } else if ((isSpecialInit && !isMySpecialInit) || oppHasInitiative) {
      this.initiativeChevron.setVisible(true).setAngle(180);
    } else {
      this.initiativeChevron.setVisible(false);
    }

    const isMobile = ViewportManager.isLowHeightProfile();
    const scale = isMobile ? 0.85 : 1.0;
    const chevronW = Math.round(15 * scale);
    const chevronH = Math.round(23 * scale);
    this.initiativeChevron.setDisplaySize(chevronW, chevronH);
    this.alignInitiativeContent(scale);

    const initW = Math.round(BATTLE_HUD_CONFIG.INITIATIVE_WIDTH * scale);
    const initH = Math.round(BATTLE_HUD_CONFIG.INITIATIVE_HEIGHT * scale);

    this.drawInitiativePill(initW, initH, accentColor, bgColor);
    this.updateInitiativePulse(isSpecialInit || hasInitiative || oppHasInitiative);
  }

  private alignInitiativeContent(scale: number): void {
    const initW = Math.round(BATTLE_HUD_CONFIG.INITIATIVE_WIDTH * scale);
    const passVisible = this.passBtnContainer.visible;
    const passW = Math.round((BATTLE_HUD_CONFIG.PASS_BTN_WIDTH || 56) * scale);
    const passH = Math.round((BATTLE_HUD_CONFIG.PASS_BTN_HEIGHT || 22) * scale);

    if (passVisible) {
      this.passBtnContainer.setPosition(Math.round(initW / 2 - passW / 2 - 7 * scale), 0);
      this.drawPassButton(passW, passH, this.currentAccentColor);
      if (this.passBtnContainer.input?.hitArea instanceof Phaser.Geom.Rectangle) {
        this.passBtnContainer.input.hitArea.setTo(-passW / 2, -passH / 2, passW, passH);
      }
    }

    const centerOffset = passVisible ? -Math.round((passW + 8 * scale) / 2) : 0;
    const chevronVisible = this.initiativeChevron.visible;
    const chevronW = Math.round(15 * scale);
    const spacing = chevronVisible ? Math.round(6 * scale) : 0;
    const labelW = this.initiativeLabel.width;
    const contentW = (chevronVisible ? chevronW + spacing : 0) + labelW;

    if (chevronVisible) {
      this.initiativeChevron.setPosition(centerOffset - contentW / 2 + chevronW / 2, 0);
      this.initiativeLabel.setPosition(centerOffset - contentW / 2 + chevronW + spacing + labelW / 2, 0);
    } else {
      this.initiativeLabel.setPosition(centerOffset, 0);
    }
  }

  private drawPassButton(w: number, h: number, accentColor: number): void {
    this.passBtnBg.clear();
    this.passBtnBg.fillStyle(0x1e293b, 0.95);
    this.passBtnBg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    this.passBtnBg.lineStyle(1.5, accentColor, 1);
    this.passBtnBg.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  }

  private getInitiativeText(reason: string, hasInitiative: boolean): { text: string; accentColor: number } {
    switch (reason) {
      case BATTLE_STATE_REASON.NO_BATTLE:
        return { text: UI_STRINGS.BATTLE_HUD.AWAITING_ATTACKER, accentColor: 0x666666 };
      case BATTLE_STATE_REASON.UNBLOCKED:
        return { text: UI_STRINGS.BATTLE_HUD.AWAITING_BLOCKER, accentColor: BATTLE_HUD_CONFIG.RESCUER_COLOR };
      case BATTLE_STATE_REASON.RESCUER_UNOPPOSED:
        return { text: UI_STRINGS.BATTLE_HUD.BLOCKER_REMOVED, accentColor: BATTLE_HUD_CONFIG.RESCUER_COLOR };
      case BATTLE_STATE_REASON.BLOCKER_UNOPPOSED:
        return { text: UI_STRINGS.BATTLE_HUD.HERO_REMOVED, accentColor: BATTLE_HUD_CONFIG.MUTUAL_COLOR };
      case BATTLE_STATE_REASON.LOSING_NUMBERS:
        return { text: UI_STRINGS.BATTLE_HUD.INITIATIVE_NUMBERS(hasInitiative), accentColor: hasInitiative ? 0x2ecc71 : 0xe74c3c };
      case BATTLE_STATE_REASON.STALEMATE:
        return { text: UI_STRINGS.BATTLE_HUD.INITIATIVE_STALEMATE(hasInitiative), accentColor: BATTLE_HUD_CONFIG.STALEMATE_COLOR };
      case BATTLE_STATE_REASON.MUTUAL_DESTRUCTION:
        return { text: UI_STRINGS.BATTLE_HUD.INITIATIVE_MUTUAL(hasInitiative), accentColor: BATTLE_HUD_CONFIG.MUTUAL_COLOR };
      default:
        return { text: UI_STRINGS.BATTLE_HUD.AWAITING_ATTACKER, accentColor: 0x666666 };
    }
  }

  private drawBadgeBackground(g: Phaser.GameObjects.Graphics, w: number, h: number, strokeColor: number): void {
    g.clear();
    g.fillStyle(0x000000, 0.45);
    g.fillRoundedRect(-w / 2 + 1, -h / 2 + 2, w, h, BATTLE_HUD_CONFIG.BORDER_RADIUS);
    g.fillStyle(BATTLE_HUD_CONFIG.BACKGROUND_COLOR, BATTLE_HUD_CONFIG.BACKGROUND_ALPHA);
    g.fillRoundedRect(-w / 2, -h / 2, w, h, BATTLE_HUD_CONFIG.BORDER_RADIUS);
    g.lineStyle(BATTLE_HUD_CONFIG.STROKE_WIDTH, strokeColor, 0.9);
    g.strokeRoundedRect(-w / 2, -h / 2, w, h, BATTLE_HUD_CONFIG.BORDER_RADIUS);
  }

  private drawInitiativePill(
    w: number,
    h: number,
    accentColor: number,
    bgColor: number = BATTLE_HUD_CONFIG.BACKGROUND_COLOR,
  ): void {
    this.initiativeBg.clear();
    this.initiativeBg.fillStyle(bgColor, 0.94);
    this.initiativeBg.fillRoundedRect(-w / 2, -h / 2, w, h, h / 2);
    this.initiativeBg.lineStyle(4, accentColor, 0.25);
    this.initiativeBg.strokeRoundedRect(-w / 2 - 1, -h / 2 - 1, w + 2, h + 2, (h + 2) / 2);
    this.initiativeBg.lineStyle(1.6, accentColor, 0.95);
    this.initiativeBg.strokeRoundedRect(-w / 2, -h / 2, w, h, h / 2);
  }

  private updateInitiativePulse(isPulsing: boolean): void {
    if (isPulsing && !this.initiativeGlowTween) {
      this.initiativeGlowTween = this.scene.tweens.add({
        targets: this.initiativeContainer,
        scale: 1.03,
        duration: 800,
        yoyo: true,
        repeat: -1,
        ease: "Sine.easeInOut",
      });
    } else if (!isPulsing && this.initiativeGlowTween) {
      this.initiativeGlowTween.stop();
      this.initiativeGlowTween = null;
      this.initiativeContainer.setScale(1.0);
    }
  }

  public destroy(fromScene?: boolean): void {
    if (this.initiativeGlowTween) {
      this.initiativeGlowTween.stop();
      this.initiativeGlowTween = null;
    }
    super.destroy(fromScene);
  }
}
