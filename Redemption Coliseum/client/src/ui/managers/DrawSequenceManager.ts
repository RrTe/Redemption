import Phaser from "phaser";
import { type TypedRoom } from "../gameUI";
import { type CardRenderer } from "../renderers/CardRenderer";
import { type CardUI } from "../CardUI";
import { UI_STRINGS } from "../../constants/uiStrings";
import { DRAW_STEPS } from "../../../../shared/phases";
import { ZONES } from "../../../../shared/zones";
import { ActionType } from "../../../../shared/actions";
import { type SettingsManager } from "../../managers/SettingsManager";
import { EFFECT_CHRONICLE_CONFIG } from "../config/visualConfig";
import { DrawSequenceBanner } from "../components/DrawSequenceBanner";

export class DrawSequenceManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private cardRenderer: CardRenderer;
  private settingsManager?: SettingsManager;
  private banner: DrawSequenceBanner;

  private currentStep: string = DRAW_STEPS.NONE;
  private priorityPlayerId: string = "";
  private chronicleCount: number = 0;
  public selectedCardIds: string[] = [];

  constructor(scene: Phaser.Scene, room: TypedRoom, cardRenderer: CardRenderer) {
    this.scene = scene;
    this.room = room;
    this.cardRenderer = cardRenderer;
    this.settingsManager = scene.registry.get("settingsManager");

    this.banner = new DrawSequenceBanner(
      scene,
      () => this.onConfirmClicked(),
      () => this.onPassClicked()
    );
    this.registerEventHandlers();
  }

  private registerEventHandlers() {
    this.scene.events.on("cardClicked", this.onCardClicked, this);
    this.scene.events.on("cardsRendered", this.onCardsRendered, this);
    this.scene.events.on("settings-changed", this.onSettingsChanged, this);
    this.room.onStateChange((s) => this.handleStateUpdate(
      s.drawStep, s.priorityPlayerId, s.activeSequenceCardIds, s.effectChronicle?.items?.length ?? 0
    ));
  }

  private onCardsRendered() {
    if (this.currentStep !== DRAW_STEPS.NONE && this.currentStep !== DRAW_STEPS.COMPLETED) {
      this.updateCardHighlights();
    }
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
      this.banner.setVisible(false);
      this.clearAllBadges();
      return;
    }

    this.banner.setVisible(true);
    const hasPriority = this.priorityPlayerId === this.room.sessionId;
    const isStars = this.currentStep === DRAW_STEPS.ACTIVE_STARS || this.currentStep === DRAW_STEPS.OPPONENT_STARS;
    const showHelp = this.settingsManager?.isInGameSupportEnabled() ?? true;
    const isChronicleActive = this.chronicleCount > 0;

    if (isChronicleActive) {
      this.banner.setPrompt(
        hasPriority
          ? "Resolving Chronicle effects... (Click Pass to advance)"
          : "Chronicle: Waiting for opponent..."
      );
      this.banner.setConfirmButton("", false, false, 0);
      this.banner.setPassButton(UI_STRINGS.DRAW_SEQUENCE.BTN_PASS, hasPriority, true, hasPriority ? 1 : 0.45);
      return;
    }

    this.banner.setPrompt(UI_STRINGS.DRAW_SEQUENCE.PROMPT(isStars, hasPriority, showHelp));
    const count = this.selectedCardIds.length;
    this.banner.setConfirmButton(UI_STRINGS.DRAW_SEQUENCE.BTN_CONFIRM(count), hasPriority, count > 0, count > 0 ? 1 : 0.45);
    this.banner.setPassButton(UI_STRINGS.DRAW_SEQUENCE.BTN_PASS, hasPriority, true, 1);
  }

  private onSettingsChanged() {
    this.updateBannerVisibility();
    this.updateCardHighlights();
  }

  public onCardClicked(card: CardUI) {
    if (this.currentStep === DRAW_STEPS.NONE || this.priorityPlayerId !== this.room.sessionId) return;
    if (this.chronicleCount > 0) return;
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

    this.updateBannerVisibility();
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

  private onConfirmClicked() {
    if (this.chronicleCount > 0) {
      const activeId = this.room.state?.effectChronicle?.items?.[0]?.id;
      this.room.send("resolveChronicleItem", { action: "execute", itemId: activeId });
      return;
    }
    if (this.selectedCardIds.length === 0) return;
    this.selectedCardIds.forEach((id, index) => this.playFlight(id, index));
    this.room.send("submitDrawSequence", {
      step: this.currentStep,
      orderedCardIds: [...this.selectedCardIds],
    });
    this.selectedCardIds = [];
    this.clearAllBadges();
  }

  private onPassClicked() {
    if (this.chronicleCount > 0) {
      this.room.send("resolveChronicleItem", { action: "pass_all" });
      return;
    }
    this.selectedCardIds = [];
    this.clearAllBadges();
    this.room.send("submitDrawSequence", {
      step: this.currentStep,
      orderedCardIds: [],
    });
  }

  private playFlight(id: string, index: number) {
    const c = this.cardRenderer.getCardUI(id);
    if (!c) return;
    const m = c.getWorldTransformMatrix();
    const w = (c.displayWidth && c.displayWidth > 0) ? c.displayWidth : (c.width * (c.scaleX || 1));
    const h = (c.displayHeight && c.displayHeight > 0) ? c.displayHeight : (c.height * (c.scaleY || 1));
    const tex = c.cardData.isFaceDown || !c.cardData.ImageFile ? "cardback" : `card-${c.cardData.ImageFile}`;
    const delay = index * EFFECT_CHRONICLE_CONFIG.CARD_FLIGHT_STAGGER_MS;
    const emit = () => this.scene.events.emit("playChronicleFlight", { x: m.tx, y: m.ty, width: w, height: h, rotation: c.rotation || 0, texture: tex });
    if (delay > 0) this.scene.time.delayedCall(delay, emit);
    else emit();
  }

  private updateCardHighlights() {
    const isStars = this.currentStep === DRAW_STEPS.ACTIVE_STARS || this.currentStep === DRAW_STEPS.OPPONENT_STARS;
    const isSouls = this.currentStep === DRAW_STEPS.ACTIVE_SOULS || this.currentStep === DRAW_STEPS.OPPONENT_SOULS;
    const showHelp = this.settingsManager?.isInGameSupportEnabled() ?? true;
    const isChronicleActive = this.chronicleCount > 0;

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
    this.banner.destroy();
  }
}
