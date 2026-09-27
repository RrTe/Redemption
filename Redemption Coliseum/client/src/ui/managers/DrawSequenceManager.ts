// client/src/ui/managers/DrawSequenceManager.ts
import Phaser from "phaser";
import { type TypedRoom } from "../gameUI";
import { type CardRenderer } from "../renderers/CardRenderer";
import { type CardUI } from "../CardUI";
import { UI_STRINGS } from "../../constants/uiStrings";
import { DRAW_STEPS } from "../../../../shared/phases";
import { ZONES } from "../../../../shared/zones";
import { ActionType } from "../../../../shared/actions";
import { type SettingsManager } from "../../managers/SettingsManager";

export class DrawSequenceManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private cardRenderer: CardRenderer;
  private settingsManager?: SettingsManager;

  private bannerContainer!: Phaser.GameObjects.Container;
  private bannerBg!: Phaser.GameObjects.Graphics;
  private promptText!: Phaser.GameObjects.Text;
  private confirmBtn!: Phaser.GameObjects.Container;
  private confirmBtnText!: Phaser.GameObjects.Text;
  private passBtn!: Phaser.GameObjects.Container;

  private currentStep: string = DRAW_STEPS.NONE;
  private priorityPlayerId: string = "";
  public selectedCardIds: string[] = [];

  constructor(scene: Phaser.Scene, room: TypedRoom, cardRenderer: CardRenderer) {
    this.scene = scene;
    this.room = room;
    this.cardRenderer = cardRenderer;
    this.settingsManager = scene.registry.get("settingsManager");

    this.createBannerUI();
    this.registerEventHandlers();
  }

  private createBannerUI() {
    const width = 620;
    const height = 48;
    const x = this.scene.scale.width / 2;
    const y = 35;

    this.bannerContainer = this.scene.add.container(x, y).setDepth(200).setVisible(false);

    this.bannerBg = this.scene.add.graphics();
    this.bannerBg.fillStyle(0x0f172a, 0.92);
    this.bannerBg.fillRoundedRect(-width / 2, -height / 2, width, height, 12);
    this.bannerBg.lineStyle(2, 0xd4af37, 1);
    this.bannerBg.strokeRoundedRect(-width / 2, -height / 2, width, height, 12);

    this.promptText = this.scene.add.text(-width / 2 + 20, 0, "", {
      fontSize: "14px",
      fontFamily: "Arial, sans-serif",
      fontStyle: "bold",
      color: "#ffffff",
    }).setOrigin(0, 0.5);

    // Confirm button
    this.confirmBtn = this.createButton(width / 2 - 130, 0, 110, 32, 0x166534, () => this.onConfirmClicked());
    this.confirmBtnText = this.confirmBtn.getByName("btnText") as Phaser.GameObjects.Text;

    // Pass button
    this.passBtn = this.createButton(width / 2 - 50, 0, 60, 32, 0x334155, () => this.onPassClicked(), UI_STRINGS.DRAW_SEQUENCE.BTN_PASS);

    this.bannerContainer.add([this.bannerBg, this.promptText, this.confirmBtn, this.passBtn]);
  }

  private createButton(x: number, y: number, w: number, h: number, color: number, onClick: () => void, labelText = ""): Phaser.GameObjects.Container {
    const btn = this.scene.add.container(x, y);
    const bg = this.scene.add.graphics();
    bg.fillStyle(color, 1);
    bg.fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.lineStyle(1.5, 0xd4af37, 0.8);
    bg.strokeRoundedRect(-w / 2, -h / 2, w, h, 6);

    const txt = this.scene.add.text(0, 0, labelText, {
      fontSize: "13px",
      fontFamily: "Arial, sans-serif",
      fontStyle: "bold",
      color: "#ffffff",
    }).setOrigin(0.5).setName("btnText");

    btn.add([bg, txt]);
    btn.setSize(w, h).setInteractive({ useHandCursor: true }).on("pointerdown", onClick);
    return btn;
  }

  private registerEventHandlers() {
    this.scene.events.on("cardClicked", this.onCardClicked, this);
    this.scene.events.on("cardsRendered", this.onCardsRendered, this);
    this.scene.events.on("settings-changed", this.onSettingsChanged, this);

    this.room.onStateChange((state) => {
      this.handleStateUpdate(state.drawStep, state.priorityPlayerId, state.activeSequenceCardIds);
    });
  }

  private onCardsRendered() {
    if (this.currentStep !== DRAW_STEPS.NONE && this.currentStep !== DRAW_STEPS.COMPLETED) {
      this.updateCardHighlights();
    }
  }

  public handleStateUpdate(step: string, priorityPlayerId: string, activeSequenceCardIds?: any) {
    if (this.currentStep !== step || this.priorityPlayerId !== priorityPlayerId) {
      this.currentStep = step || DRAW_STEPS.NONE;
      this.priorityPlayerId = priorityPlayerId || "";
      this.selectedCardIds = [];
      this.clearAllBadges();
      this.updateBannerVisibility();
      this.updateCardHighlights();
    }

    if (activeSequenceCardIds && activeSequenceCardIds.length > 0) {
      this.syncSequenceBadges(activeSequenceCardIds);
    }
  }

  private updateBannerVisibility() {
    const isStepActive = this.currentStep !== DRAW_STEPS.NONE && this.currentStep !== DRAW_STEPS.COMPLETED;
    if (!isStepActive) {
      this.bannerContainer.setVisible(false);
      this.clearAllBadges();
      return;
    }

    this.bannerContainer.setVisible(true);
    const hasPriority = this.priorityPlayerId === this.room.sessionId;
    const isStars = this.currentStep === DRAW_STEPS.ACTIVE_STARS || this.currentStep === DRAW_STEPS.OPPONENT_STARS;
    const showHelp = this.settingsManager?.isInGameSupportEnabled() ?? true;

    this.promptText.setText(UI_STRINGS.DRAW_SEQUENCE.PROMPT(isStars, hasPriority, showHelp));
    this.confirmBtn.setVisible(hasPriority);
    this.passBtn.setVisible(hasPriority);
    if (hasPriority) this.updateConfirmButtonLabel();
  }

  private onSettingsChanged() {
    this.updateBannerVisibility();
    this.updateCardHighlights();
  }

  public onCardClicked(card: CardUI) {
    if (this.currentStep === DRAW_STEPS.NONE || this.priorityPlayerId !== this.room.sessionId) return;
    if (!this.isCardEligible(card)) return;

    const cardId = card.cardData.id;
    const existingIndex = this.selectedCardIds.indexOf(cardId);

    if (existingIndex !== -1) {
      this.selectedCardIds.splice(existingIndex, 1);
      card.badge.hide();
      this.selectedCardIds.forEach((id, idx) => {
        const c = this.cardRenderer.getCardUI(id);
        if (c) c.badge.setText(String(idx + 1));
      });
    } else {
      this.selectedCardIds.push(cardId);
      const isHand = card.currentZone === ZONES.HAND;
      card.badge.show(String(this.selectedCardIds.length), isHand ? "top-left" : "center", card.visuals.getStarIcon());
    }

    this.updateConfirmButtonLabel();
  }

  private isCardEligible(card: CardUI): boolean {
    if (!card.cardData) return false;
    const isStars = this.currentStep === DRAW_STEPS.ACTIVE_STARS || this.currentStep === DRAW_STEPS.OPPONENT_STARS;
    const isSouls = this.currentStep === DRAW_STEPS.ACTIVE_SOULS || this.currentStep === DRAW_STEPS.OPPONENT_SOULS;

    if (isStars && card.currentZone === ZONES.HAND) {
      return !!(card.cardData.Class?.includes("Star") || card.cardData.availableActions?.some(
        a => a.type === ActionType.ACTIVATE_STAR_ABILITY || (a.type === ActionType.ACTIVATE_ABILITY && card.cardData.Class?.includes("Star"))
      ));
    }
    const isLoB = card.currentZone === ZONES.LAND_OF_BONDAGE || card.cardData.zone === ZONES.LAND_OF_BONDAGE;
    if (isSouls && isLoB) {
      return !!(card.cardData.Type?.includes("Lost Soul") || card.cardData.availableActions?.some(a => a.type === ActionType.ACTIVATE_ABILITY));
    }
    return false;
  }

  private updateConfirmButtonLabel() {
    this.confirmBtnText.setText(UI_STRINGS.DRAW_SEQUENCE.BTN_CONFIRM(this.selectedCardIds.length));
  }

  private onConfirmClicked() {
    this.room.send("submitDrawSequence", {
      step: this.currentStep,
      orderedCardIds: this.selectedCardIds,
    });
  }

  private onPassClicked() {
    this.room.send("submitDrawSequence", {
      step: this.currentStep,
      orderedCardIds: [],
    });
  }

  private updateCardHighlights() {
    const isStars = this.currentStep === DRAW_STEPS.ACTIVE_STARS || this.currentStep === DRAW_STEPS.OPPONENT_STARS;
    const isSouls = this.currentStep === DRAW_STEPS.ACTIVE_SOULS || this.currentStep === DRAW_STEPS.OPPONENT_SOULS;
    const showHelp = this.settingsManager?.isInGameSupportEnabled() ?? true;

    this.cardRenderer.getAllCardUIs().forEach(cardUI => {
      const isEligible = cardUI.cardData.controllerId === this.priorityPlayerId && this.isCardEligible(cardUI);
      cardUI.visuals.updateStarHighlight(isStars && isEligible && showHelp);
      cardUI.visuals.updateLostSoulHighlight(isSouls && isEligible && showHelp);
    });
  }

  private syncSequenceBadges(sequenceCardIds: string[]) {
    const isStars = this.currentStep === DRAW_STEPS.ACTIVE_STARS || this.currentStep === DRAW_STEPS.OPPONENT_STARS;
    const isSouls = this.currentStep === DRAW_STEPS.ACTIVE_SOULS || this.currentStep === DRAW_STEPS.OPPONENT_SOULS;

    sequenceCardIds.forEach((id, index) => {
      const card = this.cardRenderer.getCardUI(id);
      if (!card) return;
      const isHand = card.currentZone === ZONES.HAND;
      const isLoB = card.currentZone === ZONES.LAND_OF_BONDAGE || card.cardData.zone === ZONES.LAND_OF_BONDAGE;
      if ((isStars && isHand) || (isSouls && isLoB)) {
        card.badge.show(String(index + 1), isHand ? "top-left" : "center", isStars ? card.visuals.getStarIcon() : null);
      }
    });
  }

  private clearAllBadges() {
    this.cardRenderer.getAllCardUIs().forEach(card => card.badge.hide());
  }

  public destroy() {
    this.scene.events.off("cardClicked", this.onCardClicked, this);
    this.scene.events.off("cardsRendered", this.onCardsRendered, this);
    this.scene.events.off("settings-changed", this.onSettingsChanged, this);
    this.bannerContainer.destroy();
  }
}
