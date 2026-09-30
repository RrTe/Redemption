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
  private chronicleCount: number = 0;
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
    const w = 620, h = 48;
    this.bannerContainer = this.scene.add.container(this.scene.scale.width / 2, 35).setDepth(200).setVisible(false);
    this.bannerBg = this.scene.add.graphics().fillStyle(0x0f172a, 0.92).fillRoundedRect(-w / 2, -h / 2, w, h, 12);
    this.bannerBg.lineStyle(2, 0xd4af37, 1).strokeRoundedRect(-w / 2, -h / 2, w, h, 12);
    this.promptText = this.scene.add.text(-w / 2 + 20, 0, "", { fontSize: "14px", fontFamily: "Arial, sans-serif", fontStyle: "bold", color: "#ffffff" }).setOrigin(0, 0.5);
    this.confirmBtn = this.createButton(w / 2 - 130, 0, 110, 32, 0x166534, () => this.onConfirmClicked());
    this.confirmBtnText = this.confirmBtn.getByName("btnText") as Phaser.GameObjects.Text;
    this.passBtn = this.createButton(w / 2 - 50, 0, 60, 32, 0x334155, () => this.onPassClicked(), UI_STRINGS.DRAW_SEQUENCE.BTN_PASS);
    this.bannerContainer.add([this.bannerBg, this.promptText, this.confirmBtn, this.passBtn]);
  }

  private createButton(x: number, y: number, w: number, h: number, color: number, onClick: () => void, label = ""): Phaser.GameObjects.Container {
    const btn = this.scene.add.container(x, y);
    const bg = this.scene.add.graphics().fillStyle(color, 1).fillRoundedRect(-w / 2, -h / 2, w, h, 6);
    bg.lineStyle(1.5, 0xd4af37, 0.8).strokeRoundedRect(-w / 2, -h / 2, w, h, 6);
    const txt = this.scene.add.text(0, 0, label, { fontSize: "13px", fontFamily: "Arial, sans-serif", fontStyle: "bold", color: "#ffffff" }).setOrigin(0.5).setName("btnText");
    return btn.add([bg, txt]).setSize(w, h).setInteractive({ useHandCursor: true }).on("pointerdown", onClick);
  }

  private registerEventHandlers() {
    this.scene.events.on("cardClicked", this.onCardClicked, this);
    this.scene.events.on("cardsRendered", this.onCardsRendered, this);
    this.scene.events.on("settings-changed", this.onSettingsChanged, this);
    this.room.onStateChange((s) => this.handleStateUpdate(s.drawStep, s.priorityPlayerId, s.activeSequenceCardIds, s.effectChronicle?.items?.length ?? 0));
  }

  private onCardsRendered() {
    if (this.currentStep !== DRAW_STEPS.NONE && this.currentStep !== DRAW_STEPS.COMPLETED) this.updateCardHighlights();
  }

  public handleStateUpdate(step: string, priorityPlayerId: string, activeSequenceCardIds?: any, chronicleItemCount = 0) {
    const stepChanged = this.currentStep !== step || this.priorityPlayerId !== priorityPlayerId;
    const countChanged = this.chronicleCount !== chronicleItemCount;

    if (stepChanged) {
      this.currentStep = step || DRAW_STEPS.NONE;
      this.priorityPlayerId = priorityPlayerId || "";
      this.selectedCardIds = [];
      this.clearAllBadges();
    }

    if (stepChanged || countChanged) {
      this.chronicleCount = chronicleItemCount;
      this.updateBannerVisibility();
      this.updateCardHighlights();
    }

    if (activeSequenceCardIds && activeSequenceCardIds.length > 0 && this.chronicleCount === 0) {
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
    const isChronicleActive = this.chronicleCount > 0 && showHelp;

    if (isChronicleActive) {
      this.promptText.setText(UI_STRINGS.DRAW_SEQUENCE.CHRONICLE_ACTIVE(hasPriority));
      this.confirmBtn.setVisible(false);
      this.passBtn.setVisible(false);
      return;
    }

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
    const showHelp = this.settingsManager?.isInGameSupportEnabled() ?? true;
    if (this.chronicleCount > 0 && showHelp) return;
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
      return !!card.cardData.availableActions?.some(a => a.type === ActionType.ACTIVATE_STAR_ABILITY || (a.type === ActionType.ACTIVATE_ABILITY && card.cardData.Class?.includes("Star")));
    }
    const isLoB = card.currentZone === ZONES.LAND_OF_BONDAGE || card.cardData.zone === ZONES.LAND_OF_BONDAGE;
    return isSouls && isLoB && !!card.cardData.availableActions?.some(a => a.type === ActionType.ACTIVATE_ABILITY);
  }

  private updateConfirmButtonLabel() {
    const count = this.selectedCardIds.length;
    this.confirmBtnText.setText(UI_STRINGS.DRAW_SEQUENCE.BTN_CONFIRM(count));
    this.confirmBtn.setAlpha(count > 0 ? 1 : 0.45);
    if (count > 0) this.confirmBtn.setInteractive({ useHandCursor: true });
    else this.confirmBtn.disableInteractive();
  }

  private onConfirmClicked() {
    if (this.selectedCardIds.length === 0) return;
    const showHelp = this.settingsManager?.isInGameSupportEnabled() ?? true;
    this.selectedCardIds.forEach(id => {
      const c = this.cardRenderer.getCardUI(id);
      if (c) {
        const matrix = c.getWorldTransformMatrix();
        const width = (c.displayWidth && c.displayWidth > 0) ? c.displayWidth : (c.width * (c.scaleX || 1));
        const height = (c.displayHeight && c.displayHeight > 0) ? c.displayHeight : (c.height * (c.scaleY || 1));
        const tex = c.cardData.isFaceDown || !c.cardData.ImageFile ? "cardback" : `card-${c.cardData.ImageFile}`;
        this.scene.events.emit("playChronicleFlight", {
          x: matrix.tx, y: matrix.ty, width, height, rotation: c.rotation || 0, texture: tex,
        });
      }
    });
    this.room.send("submitDrawSequence", {
      step: this.currentStep,
      orderedCardIds: [...this.selectedCardIds],
    });
    this.selectedCardIds = [];
    this.clearAllBadges();
    if (showHelp) {
      this.promptText.setText(UI_STRINGS.DRAW_SEQUENCE.CHRONICLE_ACTIVE(true));
      this.confirmBtn.setVisible(false);
      this.passBtn.setVisible(false);
    }
  }

  private onPassClicked() {
    this.selectedCardIds = [];
    this.clearAllBadges();
    this.room.send("submitDrawSequence", {
      step: this.currentStep,
      orderedCardIds: [],
    });
  }

  private updateCardHighlights() {
    const isStars = this.currentStep === DRAW_STEPS.ACTIVE_STARS || this.currentStep === DRAW_STEPS.OPPONENT_STARS;
    const isSouls = this.currentStep === DRAW_STEPS.ACTIVE_SOULS || this.currentStep === DRAW_STEPS.OPPONENT_SOULS;
    const showHelp = this.settingsManager?.isInGameSupportEnabled() ?? true;
    const isChronicleActive = this.chronicleCount > 0 && showHelp;

    this.cardRenderer.getAllCardUIs().forEach(cardUI => {
      const isEligible = !isChronicleActive && cardUI.cardData.controllerId === this.priorityPlayerId && this.isCardEligible(cardUI);
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
