// client/src/ui/managers/AbilityPromptManager.ts
import Phaser from "phaser";
import { GameEvents } from "../../constants/EventNames";
import type { RequestOptionalAbilityMessage } from "../../../../shared/messages";
import type { GameNetworkManager } from "../../network/GameNetworkManager";
import type { CardRenderer } from "../renderers/CardRenderer";
import type { ConfirmationDialogData } from "../../scenes/ConfirmationDialogScene";
import type { SettingsManager } from "../../managers/SettingsManager";
import { AbilityPromptBanner } from "../components/AbilityPromptBanner";
import type { CardUI } from "../CardUI";
import { CardDetailOverlay } from "../overlays/CardDetailOverlay";
import { TooltipManager } from "./TooltipManager";
import { log } from "../../utils/logger";

/**
 * Orchestrates optional ability confirmation prompts and board visual highlights.
 * Respects In-Game Help setting: modal popup with preview when enabled,
 * non-intrusive top HUD banner when disabled.
 */
export class AbilityPromptManager {
  private scene: Phaser.Scene;
  private networkManager: GameNetworkManager;
  private cardRenderer: CardRenderer;
  private settingsManager: SettingsManager | undefined;
  private banner: AbilityPromptBanner;
  private activeGlowingCard: CardUI | null = null;

  constructor(
    scene: Phaser.Scene,
    networkManager: GameNetworkManager,
    cardRenderer: CardRenderer,
    settingsManager?: SettingsManager,
  ) {
    this.scene = scene;
    this.networkManager = networkManager;
    this.cardRenderer = cardRenderer;
    this.settingsManager = settingsManager || scene.registry.get("settingsManager");
    this.banner = new AbilityPromptBanner(scene);

    this.registerEventListeners();
  }

  public registerEventListeners(): void {
    this.scene.events.on(
      GameEvents.NET_OPTIONAL_ABILITY_REQUESTED,
      (msg: RequestOptionalAbilityMessage) => this.handleOptionalAbilityRequest(msg),
    );
  }

  private handleOptionalAbilityRequest(msg: RequestOptionalAbilityMessage): void {
    log("AbilityPromptManager", "Received optional ability request:", msg);

    CardDetailOverlay.hide();
    TooltipManager.hide();

    // 1. Highlight source card on the board if present
    const cardUI = msg.cardId
      ? this.cardRenderer.getAllCardUIs().get(msg.cardId)
      : undefined;

    if (this.activeGlowingCard) {
      this.activeGlowingCard.stopGlow();
      this.activeGlowingCard = null;
    }

    if (cardUI) {
      this.activeGlowingCard = cardUI;
      cardUI.startGlow(true);
    }

    const onConfirmAction = () => {
      this.cleanupHighlight();
      this.networkManager.sendRespondOptionalAbility({
        itemId: msg.itemId,
        accepted: true,
      });
    };

    const onDeclineAction = () => {
      this.cleanupHighlight();
      this.networkManager.sendRespondOptionalAbility({
        itemId: msg.itemId,
        accepted: false,
      });
    };

    const isHelpEnabled = this.settingsManager?.isInGameSupportEnabled() ?? true;

    // 2. Branch according to In-Game Help setting
    if (isHelpEnabled) {
      const cardData = cardUI?.cardData || {
        cardId: msg.cardId,
        ImageFile: msg.cardImageFile,
        Name: msg.cardTitle,
      };

      const dialogData: ConfirmationDialogData = {
        title: msg.cardTitle || "Optional Ability",
        message: msg.promptText || `Activate the optional ability of ${msg.cardTitle}?`,
        confirmLabel: "Activate",
        declineLabel: "Pass",
        cardImageFile: msg.cardImageFile,
        templateId: msg.templateId,
        cardData,
        onConfirm: onConfirmAction,
        onDecline: onDeclineAction,
      };

      if (this.scene.scene.isActive("ConfirmationDialogScene")) {
        this.scene.scene.stop("ConfirmationDialogScene");
      }
      this.scene.scene.launch("ConfirmationDialogScene", dialogData);
    } else {
      // Pro mode: Non-intrusive floating top HUD banner without full-screen dimming
      this.banner.show({
        cardTitle: msg.cardTitle || "Ability",
        promptText: msg.promptText || "Activate optional ability?",
        confirmLabel: "Activate",
        declineLabel: "Pass",
        onConfirm: onConfirmAction,
        onDecline: onDeclineAction,
      });
    }
  }

  private cleanupHighlight(): void {
    if (this.activeGlowingCard) {
      this.activeGlowingCard.stopGlow();
      this.activeGlowingCard = null;
    }
    this.banner.hide();
  }

  public destroy(): void {
    this.cleanupHighlight();
    this.banner.destroy();
    this.scene.events.off(GameEvents.NET_OPTIONAL_ABILITY_REQUESTED);
  }
}
