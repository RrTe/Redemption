import Phaser from "phaser";
import type { CardState } from "../../../shared/types";
import { type TypedRoom } from "../ui/gameUI";
import { PILE_ZONES } from "../../../shared/zones";
import { type Zone } from "../../../shared/zones";
import { CardUI } from "../ui/CardUI";
import { SoundManager } from "../managers/SoundManager";
import { PreviewManager } from "../ui/managers/PreviewManager";
import { SelectionDialogPaginationManager } from "../ui/managers/SelectionDialogPaginationManager";
import { SelectionDialogUIManager } from "../ui/managers/SelectionDialogUIManager";
import { SelectionDialogTransitionHandler } from "../ui/handlers/SelectionDialogTransitionHandler";
import { log } from "../utils/logger";
import { SelectionDialogFilterView } from "../ui/components/filters/SelectionDialogFilterView";
import { filterConfigData } from "../ui/config/filter_config";

// CARDS_PER_PAGE is now calculated dynamically based on screen height
export interface SelectionAction {
  label: string;
  actionId: string;
  toZone: Zone;
  target?: "me" | "opponent";
}

export interface SelectedCardInfo {
  id: string;
  position: "top" | "bottom";
}

export interface SelectionDialogData {
  title: string;
  cards: CardState[];
  room?: TypedRoom;
  showCloseButton: boolean;
  isInteractive: boolean;
  isMyAction: boolean;
  selectionRules?: { min: number; max: number };
  maxSelectableCount?: number;
  hidePlayerLabels?: boolean;
  confirmButtonLabel?: string;
  toZone?: Zone;
  fromZone?: Zone;
  actionType?: "search" | "look" | "reveal";
  initialPosition?: "top" | "bottom";
  possibleActions?: SelectionAction[];
  onComplete: (result: {
    actionId: string;
    selectedCards: SelectedCardInfo[];
    remainingPositions?: SelectedCardInfo[];
    toZone: Zone;
    target?: "opponent" | "me";
  }) => void;
  onCancel: (remainingPositions?: SelectedCardInfo[]) => void;
}

export class SelectionDialogScene extends Phaser.Scene {
  private selectedCards = new Set<string>();
  private cardPositions = new Map<string, "top" | "bottom">();
  private room!: TypedRoom;
  private dialogData!: SelectionDialogData;
  private soundManager!: SoundManager;
  private previewManager!: PreviewManager;
  private transitionHandler!: SelectionDialogTransitionHandler;
  private uiManager!: SelectionDialogUIManager;
  private paginationManager!: SelectionDialogPaginationManager;
  private filterView!: SelectionDialogFilterView;

  constructor() {
    super("SelectionDialogScene");
  }

  init(data: SelectionDialogData) {
    if (!this.cache.json.exists("filterConfig")) {
      this.cache.json.add("filterConfig", filterConfigData);
    }
    this.dialogData = data;
    this.room = data.room;
    const cardsPerPage = this.scale.height < 600 ? 9 : 18;
    this.paginationManager = new SelectionDialogPaginationManager(
      data.cards,
      cardsPerPage,
    );
    this.soundManager = this.registry.get("soundManager");
    this.uiManager = new SelectionDialogUIManager(this, this.soundManager);
    this.previewManager = new PreviewManager(this);
    this.transitionHandler = new SelectionDialogTransitionHandler(this);

    this.selectedCards.clear();
    this.cardPositions.clear();
    this.filterView = new SelectionDialogFilterView(this, () => this.onFilterChanged());
  }

  create() {
    this.scene.bringToTop();

    this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.7)
      .setOrigin(0, 0)
      .setInteractive();

    this.uiManager.selectedCardsContainer = this.add.container(
      this.scale.width / 2,
      this.scale.height * 0.25,
    );

    const isShort = this.scale.height < 600;
    const cardWidth = this.scale.width / (isShort ? 14.5 : 16);
    const cardHeight = cardWidth * 1.4;

    const showToggles =
      this.dialogData.isMyAction &&
      this.dialogData.fromZone === "deck" &&
      (this.dialogData.actionType === "look" ||
        this.dialogData.actionType === "reveal");

    const ySpacing = 50;
    const cardsPerPage = this.scale.height < 600 ? 9 : 18;
    const hasSecondRow = Math.min(this.dialogData.cards.length, cardsPerPage) > 9;
    const filterYOffset = (this.dialogData.isMyAction ? (showToggles ? 72 : 28) : 80) + (hasSecondRow ? (cardHeight / 2 + ySpacing / 2) : 0);

    const centerY = this.scale.height / 2 - 30; // Match the shifted up center from UI manager

    let filterY = centerY + cardHeight / 2 + filterYOffset;
    if (this.scale.height < 600) {
      // Mobile layout: dynamically calculate perfect center between toggles and bottom buttons
      const toggleBottomY = centerY + cardHeight / 2 + 30; // approx bottom of toggle icons
      const bottomButtonsTopY = this.scale.height * 0.85 - 25; // yPos (85%) - half button height
      filterY = (toggleBottomY + bottomButtonsTopY) / 2 - 15; // -20 to center the filter background visual
    }

    this.filterView.createFiltersUI(
      this.scale.width / 2,
      filterY,
      this.scale.width,
      this.dialogData.cards
    );
    this.filterView.updateSelectedText(
      this.paginationManager.getFilteredCards().length,
      this.paginationManager.getAllCards().length
    );

    this.uiManager.createPaginationControls(
      this.paginationManager,
      (d) => this.changePage(d),
      this.dialogData.isMyAction,
      filterY
    );
    this.renderPage(true, 1);
    this.uiManager.updatePaginationControls(this.paginationManager);

    if (this.dialogData.showCloseButton) {
      this.uiManager.createCloseButton(() => this.closeDialog());
    }

    if (this.dialogData.isInteractive) {
      this.uiManager.createZoneButtons(
        this.dialogData.possibleActions,
        this.dialogData.isInteractive,
        this.dialogData.isMyAction,
        this.dialogData.hidePlayerLabels,
        this.dialogData.confirmButtonLabel,
        (zone, target, isOpponent) =>
          this.handleZoneButtonClick(zone, target, isOpponent),
      );
      this.uiManager.updateConfirmButtonState(
        this.selectedCards.size,
        this.dialogData.selectionRules,
        this.dialogData.possibleActions,
      );
    }
  }

  private handleZoneButtonClick(
    zone: Zone,
    target: "me" | "opponent",
    isOpponent: boolean,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  ) {
    this.soundManager.playSound("UI_TOGGLE");
    let actionId =
      this.dialogData.possibleActions?.find(
        (a) =>
          a.toZone === zone &&
          (a.target === target || (!a.target && !isOpponent)),
      )?.actionId ?? "custom_selection";

    log(
      "SelectionDialogScene",
      "handleZoneButtonClick - Sending to server:",
      { selectedCards: Array.from(this.selectedCards), remainingPositions: this.paginationManager.getRemainingCardPositions(this.selectedCards, this.cardPositions), toZone: zone, target: target }
    );

    this.dialogData.onComplete({
      actionId,
      selectedCards: Array.from(this.selectedCards).map((id) => ({
        id,
        position: this.cardPositions.get(id) || "top",
      })),
      remainingPositions: this.paginationManager.getRemainingCardPositions(
        this.selectedCards,
        this.cardPositions,
      ),
      toZone: zone,
      target: target,
    });
    this.closeDialog(true);
  }

  private changePage(delta: number, startFast: boolean = false) {
    if (this.transitionHandler.isTransitioning) {
      this.transitionHandler.nextDelta = delta;
      this.transitionHandler.speedUpActiveTransitions();
      return;
    }
    if (
      this.paginationManager.setCurrentPage(
        this.paginationManager.currentPageIndex + delta,
      )
    ) {
      this.uiManager.updatePaginationControls(this.paginationManager);
      this.renderPage(true, delta, startFast);
    } else {
      this.checkAndRunNextPageChange();
    }
  }

  private renderPage(
    animate: boolean = false,
    direction: number = 0,
    startFast: boolean = false,
  ) {
    const cardsToShow = this.paginationManager.getCardsForPage();

    if (animate) {
      const slideOutTargets = this.uiManager.cardUIs.map((c, i) =>
        this.uiManager.toggleContainers[i]
          ? [c, this.uiManager.toggleContainers[i]]
          : c,
      );
      this.transitionHandler.slideOut(
        slideOutTargets,
        direction,
        500,
        50,
        (t) => {
          if (Array.isArray(t)) t.forEach((obj) => obj.destroy());
          else t.destroy();
        },
      );
    } else {
      this.uiManager.clearPageObjects();
    }

    this.uiManager.cardUIs = [];
    this.uiManager.toggleContainers = [];

    const { xCoords, targets } = this.uiManager.createCardsForPage(
      cardsToShow,
      this.dialogData.isInteractive,
      this.dialogData.isMyAction,
      this.dialogData.fromZone,
      this.dialogData.actionType,
      this.dialogData.initialPosition ?? "top",
      this.cardPositions,
      this.previewManager,
      this.transitionHandler,
      (card) => this.onCardClicked(card),
      this.selectedCards,
    );

    const baseDelay = animate ? 300 : 0;
    if (animate) {
      targets.forEach((t, i) => {
        const offset = direction > 0 ? this.scale.width : -this.scale.width;
        if (Array.isArray(t))
          t.forEach(
            (obj) =>
            ((obj as unknown as Phaser.GameObjects.Components.Transform).x +=
              offset),
          );
        else
          (t as unknown as Phaser.GameObjects.Components.Transform).x += offset;
      });
    }

    if (animate) {
      this.transitionHandler.slideIn(
        targets,
        xCoords,
        direction,
        600,
        50,
        baseDelay,
        () => this.checkAndRunNextPageChange(),
      );
    }
  }

  private checkAndRunNextPageChange() {
    const delta = this.transitionHandler.nextDelta;
    if (delta !== null) {
      this.transitionHandler.nextDelta = null;
      this.changePage(delta, true);
    }
  }

  private onCardClicked(card: CardUI) {
    const id = card.cardData.id;
    const rules = this.dialogData.selectionRules || { min: 0, max: Infinity };
    if (this.selectedCards.has(id)) {
      this.selectedCards.delete(id);
      card.clearTint();
    } else if (this.selectedCards.size < rules.max) {
      this.selectedCards.add(id);
      card.setTint(0x00ff00);
    }
    this.uiManager.setToggleInteractivity(
      id,
      !this.selectedCards.has(id),
      this.uiManager.cardUIs,
    );

    const selectedStates = this.paginationManager.getCardsFromIds(
      this.selectedCards,
    );

    this.uiManager.updateSelectedCardsDisplay(
      selectedStates,
      this.room.sessionId,
      this.previewManager,
    );

    this.uiManager.updateConfirmButtonState(
      this.selectedCards.size,
      this.dialogData.selectionRules,
      this.dialogData.possibleActions,
    );
  }

  private logCardState(card: CardUI, action: string) {
    log(
      "SelectionDialogScene",
      `Card ${action}: ID=${card.cardData.id}, Name=${card.cardData.Name}, Zone=${card.cardData.zone}, isFaceUp=${card.cardData.isFaceUp}`,
    );
  }


  public closeDialog(silent = false) {
    const remaining = this.paginationManager.getRemainingCardPositions(
      this.selectedCards,
      this.cardPositions,
    );
    this.selectedCards.clear();
    this.cardPositions.clear();
    if (this.filterView) {
      this.filterView.destroy();
    }
    this.scene.resume("CardGame");
    this.scene.stop();
    if (!silent) this.dialogData.onCancel(remaining);
  }

  private onFilterChanged() {
    const filtered = this.paginationManager.getAllCards().filter(c => this.filterView.filterManager.evaluateCard(c));
    this.paginationManager.setFilteredCards(filtered);
    this.filterView.updateSelectedText(
      filtered.length,
      this.paginationManager.getAllCards().length
    );
    this.uiManager.updatePaginationControls(this.paginationManager);
    this.renderPage(false, 0);
  }
}
