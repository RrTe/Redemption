import Phaser from "phaser";
import { type Zone } from "../../../../shared/zones";
import { SoundManager } from "../../managers/SoundManager";
import { SelectionDialogScene } from "../../scenes/SelectionDialogScene";
import { SelectionDialogPaginationManager } from "./SelectionDialogPaginationManager";
import { CardUI } from "../CardUI";
import type { CardState } from "../../../../shared/types";
import type { SelectionAction } from "../../scenes/SelectionDialogScene";
import { ViewportManager } from "./ViewportManager";

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
    isMyAction: boolean = true,
    filterY?: number
  ) {
    const rawScale = this.scene.scale.width / 1920;
    const filterScale = this.scene.scale.height < 600 ? rawScale * 1.4 : rawScale;
    const bgWidth = 880 * filterScale;
    const buttonXOffset = bgWidth / 2 + 40 * filterScale; // 40px spacing from filter area

    // If filterY is provided, center vertically to it, otherwise use fallback
    const fallbackYOffset = isMyAction ? 115 : 60;
    const buttonY = filterY !== undefined ? filterY + 35 * filterScale : this.scene.scale.height - fallbackYOffset; 
    // Note: +35*filterScale approximates vertical center of filter bg

    this.prevButton = this.scene.add
      .image(this.scene.scale.width / 2 - buttonXOffset, buttonY, "arrow_left")
      .setInteractive({ useHandCursor: true })
      .setTint(0x888888);
    this.nextButton = this.scene.add
      .image(this.scene.scale.width / 2 + buttonXOffset, buttonY, "arrow_right")
      .setInteractive({ useHandCursor: true })
      .setTint(0x888888);

    this.pageText = this.scene.add
      .text(this.scene.scale.width / 2, buttonY + 70 * filterScale, "", {
        fontSize: "18px",
        color: "#cccccc",
      })
      .setOrigin(0.5)
      .setDepth(40);

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
    hidePlayerLabels: boolean | undefined,
    confirmButtonLabel: string | undefined,
    onButtonClick: (
      zone: Zone,
      target: "me" | "opponent",
      isOpponent: boolean,
    ) => void, // Callback for button clicks
  ) {
    if (!isInteractive) return;

    if (confirmButtonLabel) {
      const h = this.scene.scale.height;
      const bWidth = 160;
      const bHeight = 48;
      const startX = this.scene.scale.width / 2;
      const yPos = h - 60;

      const btn = this.scene.add.container(startX, yPos).setDepth(100);
      const bg = this.scene.add
        .image(0, 0, "button_parchment")
        .setDisplaySize(bWidth, bHeight);
      const txt = this.scene.add
        .bitmapText(0, -3, "fairydust", confirmButtonLabel, 26)
        .setOrigin(0.5)
        .setTint(0xfff580)
        .setDropShadow(3, 3, 0x000000, 1.0);
      btn
        .add([bg, txt])
        .setSize(bWidth, bHeight)
        .setInteractive({ useHandCursor: true })
        .setData("zone", "hand")
        .setData("target", "me");
      btn.on("pointerdown", () => {
        if (btn.alpha < 1) return;
        onButtonClick("hand" as Zone, "me", false);
      });
      this.actionButtons.push(btn);
      return;
    }

    const zones = [
      { label: "Hand", zone: "hand" as Zone },
      { label: "Territory", zone: "territory" as Zone },
      { label: "Deck", zone: "deck" as Zone },
      { label: "Reserve", zone: "reserve" as Zone },
      { label: "Discard", zone: "discard" as Zone },
      { label: "Banish", zone: "banish" as Zone },
    ];

    // Base scaling on cardWidth to keep proportions identical to desktop
    const isShort = ViewportManager.isLowHeightProfile();
    const cardWidth = this.scene.scale.width / (isShort ? 15.5 : 16);
    const bWidth = Math.min(140, cardWidth * 1.6); // Increased for readability on mobile
    const bHeight = Math.min(50, 50 * (bWidth / 140));
    const textSize = Math.max(16, Math.min(26, 26 * (bWidth / 140))); // Minimum 16px, increased base by 2
    const titleSize = Math.max(20, Math.min(40, 40 * (bWidth / 140))); // Minimum 20px

    ["me", "opponent"].forEach((targetPlayer) => {
      const isOpponent = targetPlayer === "opponent";
      const h = this.scene.scale.height;

      // Proportional placement for dynamic layout mit entkoppelten Abständen (visueller Ausgleich)
      const textY = isOpponent ? (isShort ? h * 0.04 : 40) : (isShort ? h * 0.95 : h - 30);
      const yPos = isOpponent ? (isShort ? h * 0.15 : 90) : (isShort ? h * 0.89 : h - 80);

      if (!hidePlayerLabels) {
        this.scene.add
          .bitmapText(
            this.scene.scale.width / 2,
            textY,
            "fairydust",
            isOpponent ? "Opponent" : "You",
            titleSize,
          )
          .setOrigin(0.5)
          .setTint(0xffd700)
          .setDepth(100);
      }

      let startX =
        (this.scene.scale.width - zones.length * (bWidth + 10)) / 2 +
        bWidth / 2;

      zones.forEach((z) => {
        const btn = this.scene.add.container(startX, yPos).setDepth(100);
        const bg = this.scene.add
          .image(0, 0, "button_parchment")
          .setDisplaySize(bWidth, bHeight);
        const txt = this.scene.add
          .bitmapText(0, -3, "fairydust", z.label, textSize)
          .setOrigin(0.5)
          .setTint(0xfff580) // Brighter gold for better contrast
          .setDropShadow(3, 3, 0x000000, 1.0); // Deeper shadow for readability
        btn
          .add([bg, txt])
          .setSize(bWidth, bHeight)
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
    handLimits?: { myFreeSlots: number; opponentFreeSlots: number },
  ) {
    const rules = selectionRules || { min: 0, max: 1 };
    const valid = selectedCardsCount >= rules.min;
    this.actionButtons.forEach((btn) => {
      const zone = btn.getData("zone");
      const target = btn.getData("target");

      let capacityOk = true;
      if (zone === "hand" && handLimits) {
        const isOpponent = target === "opponent";
        const freeSlots = isOpponent ? handLimits.opponentFreeSlots : handLimits.myFreeSlots;
        capacityOk = selectedCardsCount > 0 ? selectedCardsCount <= freeSlots : freeSlots > 0;
      }

      const allowed =
        !possibleActions ||
        possibleActions.some(
          (a) =>
            a.toZone === zone &&
            (a.target === target ||
              (!a.target && target === "me")),
        );
      const enabled = valid && allowed && capacityOk;
      btn.setAlpha(enabled ? 1 : 0.35);
      btn.input!.enabled = enabled;
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
    const isShort = ViewportManager.isLowHeightProfile();
    const cardWidth = this.scene.scale.width / (isShort ? 15.5 : 16);
    const cardHeight = cardWidth * 1.4;

    // Config for rows
    const cardsPerRow = 9;
    const ySpacing = 50; // Space between rows

    const xCoords: number[] = [];
    const targets: (Phaser.GameObjects.GameObject | Phaser.GameObjects.GameObject[])[] = [];

    const isSingleRow = cards.length <= cardsPerRow;
    const centerY = this.scene.scale.height / 2 - 30; // Shifted up by 30px

    cards.forEach((data, i) => {
      const rowIndex = Math.floor(i / cardsPerRow);
      const colIndex = i % cardsPerRow;

      const cardsInThisRow = Math.min(cardsPerRow, cards.length - rowIndex * cardsPerRow);

      // Die Karten (CardUI) haben ihren Origin in der Mitte (0.5, 0.5)!
      // Die korrekte Zentrierung für den Mittelpunkt der gesamten Reihe lautet daher:
      const startX = this.scene.scale.width / 2 - ((cardsInThisRow - 1) * (cardWidth + 20)) / 2;

      const tx = startX + colIndex * (cardWidth + 20);
      const ty = isSingleRow
        ? centerY
        : centerY + (rowIndex === 0 ? -1 : 1) * (cardHeight / 2 + ySpacing / 2);

      const card = new CardUI(this.scene, tx, ty, data, cardWidth, cardHeight);
      card.setData("baseY", ty);

      // ✨ FIX: Disable standard drag-and-drop for cards inside the Selection Dialog
      const sessionId = (this.scene as any).room?.sessionId || "";
      this.setupCardInteractivity(card, isInteractive, previewManager, sessionId, transitionHandler, () => onCardClicked(card));
      if (selectedCards.has(data.id)) {
        card.setTint(0x00ff00);
      }
      this.cardUIs.push(card);

      const showToggles = isMyAction && fromZone === "deck" && (actionType === "look" || actionType === "reveal");

      const toggleWidth = Math.min(45, cardWidth * 0.45);
      const toggleHeight = toggleWidth * (30 / 45);
      const toggleY = ty + cardHeight / 2 + toggleHeight / 2 + 5;

      const toggle = this.createPositionToggle(tx, toggleY, data.id, initialPosition, cardPositions, cardWidth);

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
    cardWidth: number = 100
  ): Phaser.GameObjects.Container {
    const container = this.scene.add.container(x, y);
    if (!cardPositions.has(cardId)) cardPositions.set(cardId, initialPosition);

    const toggleWidth = Math.min(45, cardWidth * 0.45);
    const toggleHeight = toggleWidth * (30 / 45);
    const iconSize = toggleHeight * 0.6;
    const btnOffset = toggleWidth / 2 + (toggleWidth < 45 ? 2 : 7.5);

    const createBtn = (type: "top" | "bottom", offset: number) => {
      const btn = this.scene.add.container(offset, 0);
      const bg = this.scene.add
        .rectangle(0, 0, toggleWidth, toggleHeight, 0x333333)
        .setStrokeStyle(2, 0x666666);
      const icon = this.scene.add
        .image(0, 0, type === "top" ? "icon_topdeck" : "icon_underdeck")
        .setDisplaySize(iconSize, iconSize);
      btn
        .add([bg, icon])
        .setSize(toggleWidth, toggleHeight)
        .setInteractive({ useHandCursor: true })
        .setData("bg", bg);
      btn.on("pointerdown", () => {
        cardPositions.set(cardId, type);
        this.updatePositionToggles(container, cardId, cardPositions);
      });
      return btn;
    };

    container.add([createBtn("top", -btnOffset), createBtn("bottom", btnOffset)]);
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
        y: card.getData("baseY") - 30,
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
        y: card.getData("baseY"),
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
