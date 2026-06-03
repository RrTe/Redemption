import Phaser from "phaser";
import { type Zone } from "../../../../shared/zones";
import { SoundManager } from "../../managers/SoundManager";
import { SelectionDialogScene } from "../../scenes/SelectionDialogScene";
import { SelectionDialogPaginationManager } from "./SelectionDialogPaginationManager";
import { CardUI } from "../CardUI";
import type { CardState } from "../../../../shared/types";
import type { SelectionAction } from "../../scenes/SelectionDialogScene";

/**
 * Manages the creation and interaction of static UI elements within the SelectionDialogScene.
 */
export class SelectionDialogUIManager {
  private scene: Phaser.Scene;
  private soundManager: SoundManager;
  public pageText!: Phaser.GameObjects.Text;
  public prevButton!: Phaser.GameObjects.Image;
  public nextButton!: Phaser.GameObjects.Image;
  public selectedCardsContainer!: Phaser.GameObjects.Container;
  public actionButtons: Phaser.GameObjects.Container[] = [];
  public cardUIs: CardUI[] = [];
  public toggleContainers: Phaser.GameObjects.Container[] = [];

  constructor(scene: Phaser.Scene, soundManager: SoundManager) {
    this.scene = scene;
    this.soundManager = soundManager;
  }

  public createCloseButton(onClose: () => void) {
    const closeBtn = this.scene.add
      .text(this.scene.scale.width - 40, 40, "X", {
        fontSize: "32px",
        color: "#ff0000",
        backgroundColor: "#330000",
        padding: { x: 10, y: 5 },
      })
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true });
    closeBtn.on("pointerdown", () => {
      this.soundManager.playSound("UI_TOGGLE");
      onClose();
    });
  }

  public createPaginationControls(
    paginationManager: SelectionDialogPaginationManager,
    changePageCallback: (delta: number) => void,
  ) {
    const cardHeight = (this.scene.scale.width / 8) * 1.4;
    const buttonY = this.scene.scale.height / 2 + cardHeight / 2 + 150;
    const buttonXOffset = this.scene.scale.width * 0.4;

    this.prevButton = this.scene.add
      .image(this.scene.scale.width / 2 - buttonXOffset, buttonY, "arrow_left")
      .setInteractive({ useHandCursor: true })
      .setTint(0x888888);
    this.nextButton = this.scene.add
      .image(this.scene.scale.width / 2 + buttonXOffset, buttonY, "arrow_right")
      .setInteractive({ useHandCursor: true })
      .setTint(0x888888);

    this.pageText = this.scene.add
      .text(this.scene.scale.width / 2, this.scene.scale.height - 130, "", {
        fontSize: "18px",
        color: "#cccccc",
      })
      .setOrigin(0.5);

    this.prevButton.on("pointerdown", () => {
      this.soundManager.playSound("PAGE_FLIP");
      changePageCallback(-1);
    });
    this.nextButton.on("pointerdown", () => {
      this.soundManager.playSound("PAGE_FLIP");
      changePageCallback(1);
    });

    [this.prevButton, this.nextButton].forEach((btn) => {
      btn.on("pointerover", () => {
        btn.setTint(0xffd700);
        this.scene.tweens.add({
          targets: btn,
          scale: 1.2,
          duration: 100,
          ease: "Back.easeOut",
        });
      });
      btn.on("pointerout", () => {
        btn.setTint(0x888888);
        this.scene.tweens.add({ targets: btn, scale: 1.0, duration: 100 });
      });
    });
  }

  public createZoneButtons(
    possibleActions: SelectionAction[] | undefined,
    isInteractive: boolean,
    isMyAction: boolean,
    onButtonClick: (
      zone: Zone,
      target: "me" | "opponent",
      isOpponent: boolean,
    ) => void, // Callback for button clicks
  ) {
    if (!isInteractive) return;

    const zones = [
      { label: "Hand", zone: "hand" as Zone },
      { label: "Territory", zone: "territory" as Zone },
      { label: "Deck", zone: "deck" as Zone },
      { label: "Reserve", zone: "reserve" as Zone },
      { label: "Discard", zone: "discard" as Zone },
      { label: "Banish", zone: "banish" as Zone },
    ];

    ["me", "opponent"].forEach((targetPlayer) => {
      const isOpponent = targetPlayer === "opponent";
      const yPos = isOpponent ? 90 : this.scene.scale.height - 80;
      this.scene.add
        .bitmapText(
          this.scene.scale.width / 2,
          isOpponent ? 40 : this.scene.scale.height - 30,
          "fairydust",
          isOpponent ? "Opponent" : "You",
          40,
        )
        .setOrigin(0.5)
        .setTint(0xffd700);

      const bWidth = 140;
      let startX =
        (this.scene.scale.width - zones.length * (bWidth + 10)) / 2 +
        bWidth / 2;

      zones.forEach((z) => {
        const btn = this.scene.add.container(startX, yPos);
        const bg = this.scene.add
          .image(0, 0, "button_parchment")
          .setDisplaySize(bWidth, 50);
        const txt = this.scene.add
          .bitmapText(0, -6, "fairydust", z.label, 24)
          .setOrigin(0.5)
          .setTint(0xf4f6e1)
          .setDropShadow(2, 2, 0x000000, 0.7);
        btn
          .add([bg, txt])
          .setSize(bWidth, 50)
          .setInteractive({ useHandCursor: true })
          .setData("zone", z.zone)
          .setData("target", targetPlayer);
        btn.on("pointerdown", () => {
          if (btn.alpha < 1) return;
          onButtonClick(z.zone, targetPlayer as "me" | "opponent", isOpponent); // Call the provided callback
        });
        this.actionButtons.push(btn);
        startX += bWidth + 10;
      });
    });
  }

  public updatePaginationControls(
    paginationManager: SelectionDialogPaginationManager,
  ) {
    const idx = paginationManager.currentPageIndex;
    const total = paginationManager.totalPages;
    this.prevButton.setVisible(idx > 0);
    this.nextButton.setVisible(idx < total - 1);
    this.pageText.setText(`Page ${idx + 1} / ${total}`).setVisible(total > 1);
  }

  public updateConfirmButtonState(
    selectedCardsCount: number,
    selectionRules: { min: number; max: number } | undefined,
    possibleActions: SelectionAction[] | undefined,
  ) {
    const rules = selectionRules || { min: 0, max: 1 };
    const valid = selectedCardsCount >= rules.min;
    this.actionButtons.forEach((btn) => {
      const allowed =
        !possibleActions ||
        possibleActions.some(
          (a) =>
            a.toZone === btn.getData("zone") &&
            (a.target === btn.getData("target") ||
              (!a.target && btn.getData("target") === "me")),
        );
      btn.setAlpha(valid && allowed ? 1 : 0.5);
      btn.input!.enabled = valid && allowed;
    });
  }

  public clearPageObjects() {
    this.cardUIs.forEach((c) => c.destroy());
    this.toggleContainers.forEach((t) => t.destroy());
    this.cardUIs = [];
    this.toggleContainers = [];
  }

  public createCardsForPage(
    cards: CardState[],
    isInteractive: boolean,
    isMyAction: boolean,
    fromZone: string | undefined,
    actionType: string | undefined,
    initialPosition: "top" | "bottom",
    cardPositions: Map<string, "top" | "bottom">,
    previewManager: any,
    transitionHandler: any,
    onCardClicked: (card: CardUI) => void,
    selectedCards: Set<string>
  ): { xCoords: number[]; targets: (Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[])[] } {
    const cardWidth = this.scene.scale.width / 8;
    const cardHeight = cardWidth * 1.4;
    const startX = this.scene.scale.width / 2 - (cards.length * (cardWidth + 20)) / 2 + cardWidth / 2;
    
    const xCoords: number[] = [];
    const targets: (Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[])[] = [];

    cards.forEach((data, i) => {
      const tx = startX + i * (cardWidth + 20);
      const card = new CardUI(this.scene, tx, this.scene.scale.height / 2, data, cardWidth, cardHeight);
      
      // ✨ FIX: Disable standard drag-and-drop for cards inside the Selection Dialog
      // This
      this.setupCardInteractivity(card, isInteractive, previewManager, (this.scene as any).room.sessionId, transitionHandler, () => onCardClicked(card));
      this.cardUIs.push(card);

      const showToggles = isMyAction && fromZone === "deck" && (actionType === "look" || actionType === "reveal");
      const toggle = this.createPositionToggle(tx, this.scene.scale.height / 2 + cardHeight / 2 + 35, data.id, initialPosition, cardPositions);
      
      toggle.setVisible(showToggles);
      card.setData("positionToggle", toggle);
      this.toggleContainers.push(toggle);

      xCoords.push(tx);
      targets.push([card, toggle]);
      this.setToggleInteractivity(data.id, !selectedCards.has(data.id), this.cardUIs);
    });

    return { xCoords, targets };
  }

  public createPositionToggle(
    x: number,
    y: number,
    cardId: string,
    initialPosition: "top" | "bottom",
    cardPositions: Map<string, "top" | "bottom">,
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    if (!cardPositions.has(cardId)) cardPositions.set(cardId, initialPosition);

    const createBtn = (type: "top" | "bottom", offset: number) => {
      const btn = this.scene.add.container(offset, 0);
      const bg = this.scene.add
        .rectangle(0, 0, 45, 30, 0x333333)
        .setStrokeStyle(2, 0x666666);
      const icon = this.scene.add
        .image(0, 0, type === "top" ? "icon_topdeck" : "icon_underdeck")
        .setDisplaySize(20, 20);
      btn
        .add([bg, icon])
        .setSize(45, 30)
        .setInteractive({ useHandCursor: true })
        .setData("bg", bg);
      btn.on("pointerdown", () => {
        cardPositions.set(cardId, type);
        this.updatePositionToggles(container, cardId, cardPositions);
      });
      return btn;
    };

    container.add([createBtn("top", -25), createBtn("bottom", 25)]);
    container
      .setData("topBtn", container.list[0])
      .setData("botBtn", container.list[1]);
    this.updatePositionToggles(container, cardId, cardPositions);
    return container;
  }

  public updatePositionToggles(
    container: Phaser.GameObjects.Container,
    cardId: string,
    cardPositions: Map<string, "top" | "bottom">,
  ) {
    const current = cardPositions.get(cardId);
    const top = container.getData("topBtn");
    const bot = container.getData("botBtn");
    [top, bot].forEach((btn) => {
      const active =
        (btn === top && current === "top") ||
        (btn === bot && current === "bottom");
      (btn.list[0] as Phaser.GameObjects.Rectangle).setStrokeStyle(
        2,
        active ? 0x00ff00 : 0x666666,
      );
      btn.setAlpha(active ? 1 : 0.6);
    });
  }

  public updateSelectedCardsDisplay(
    cards: CardState[],
    sessionId: string,
    previewManager: any,
  ) {
    this.selectedCardsContainer.removeAll(true);
    if (cards.length === 0) return;

    const bW = this.scene.scale.width / 10;
    const totalW = cards.length * (bW + 10);
    const scale =
      totalW > this.scene.scale.width * 0.8
        ? (this.scene.scale.width * 0.8) / totalW
        : 1;
    let sx = -((totalW * scale) / 2) + (bW * scale) / 2;

    cards.forEach((data) => {
      const c = new CardUI(this.scene, sx, 0, data, bW, bW * 1.4)
        .setScale(scale)
        .setInteractive({ useHandCursor: true });
      c.on("pointerover", () => previewManager.show(c, sessionId));
      c.on("pointerout", () => previewManager.hide());
      this.selectedCardsContainer.add(c);
      sx += (bW + 10) * scale;
    });
  }

  public setupCardInteractivity(
    card: CardUI,
    isInteractive: boolean,
    previewManager: any,
    sessionId: string,
    transitionHandler: any,
    onClicked: () => void,
  ) {
    card.setInteractive({ useHandCursor: isInteractive });
    card.on("pointerover", () => {
      if (transitionHandler.isTransitioning) return;
      this.scene.children.bringToTop(card);
      card.startGlow(true);
      this.soundManager.playSound("CARD_HOVER_FIELD");
      this.scene.tweens.add({
        targets: card,
        scale: 1.15,
        y: card.y - 30,
        duration: 150,
      });
      previewManager.show(card, sessionId);
    });

    card.on("pointerout", () => {
      if (transitionHandler.isTransitioning) return;
      card.stopGlow();
      this.scene.tweens.add({
        targets: card,
        scale: 1.0,
        y: this.scene.scale.height / 2,
        duration: 150,
      });
      previewManager.hide();
    });

    if (isInteractive) {
      card.on("pointerdown", onClicked);
    }
  }

  public setToggleInteractivity(
    cardId: string,
    enabled: boolean,
    cardUIs: CardUI[],
  ) {
    const card = cardUIs.find((c) => c.cardData.id === cardId);
    const toggle = card?.getData(
      "positionToggle",
    ) as Phaser.GameObjects.Container;
    if (toggle) {
      toggle.setAlpha(enabled ? 1 : 0.3);
      toggle.list.forEach((btn) => (btn.input!.enabled = enabled));
    }
  }
}
