import Phaser from "phaser";
import type { CardState } from "../../../shared/types";
import { type TypedRoom } from "../ui/gameUI";
import { type Zone } from "../../../shared/zones";
import { CardUI } from "../ui/CardUI";
import { SoundManager } from "../managers/SoundManager";
import { PreviewManager } from "../ui/PreviewManager";
import { log, DEBUG } from "../utils/logger";


// Konstante für die Anzahl der Karten pro Seite.
const CARDS_PER_PAGE = 7;

export interface SelectionAction {
  label: string;
  actionId: string;
  toZone: Zone;
  target?: "me" | "opponent"; // ✨ NEU: Ziel-Spieler für die Filterung
}

/**
 * Die Daten, die an den SelectionDialog übergeben werden, um ihn zu konfigurieren.
 */
export interface SelectionDialogData {
  title: string;
  cards: CardState[];
  room: TypedRoom;
  showCloseButton: boolean;
  isInteractive: boolean;
  selectionRules?: { min: number; max: number };
  possibleActions?: SelectionAction[];
  onComplete: (result: {
    actionId: string;
    selectedCardIds: string[];
    toZone: Zone;
    target?: "opponent" | "me"; // ✨ NEU: Ziel-Spieler explizit angeben
  }) => void;
  onCancel: () => void;
}

/**
 * Eine generische, modale Szene zur Anzeige und Auswahl von Karten.
 * Sie wird über der Haupt-Spieszene (`CardGameScene`) gestartet.
 */
export class SelectionDialogScene extends Phaser.Scene {
  private cardUIs: CardUI[] = [];
  private selectedCards = new Set<string>();
  private room!: TypedRoom;
  private dialogData!: SelectionDialogData;
  // ✨ KORREKTUR: Wir speichern jetzt ein Array von Buttons.
  private actionButtons: Phaser.GameObjects.Container[] = []; // ✨ NEU: Container für Bild+Text
  private soundManager!: SoundManager;
  private previewManager!: PreviewManager;
  private isTransitioning = false; // ✨ NEU: Blockiert Eingaben während der Animation
  private selectedCardsContainer!: Phaser.GameObjects.Container; // ✨ NEU: Container für die Anzeige der Auswahl
  private activeTransitionTweens: Phaser.Tweens.Tween[] = []; // ✨ NEU: Verfolgt aktive Animationen
  private nextDelta: number | null = null; // ✨ NEU: Merkt sich den nächsten Klick während einer Animation

  // Eigenschaften für die Paginierung
  private allCards: CardState[] = [];
  private currentPage = 0;
  private totalPages = 1;
  private pageText!: Phaser.GameObjects.Text;
  private prevButton!: Phaser.GameObjects.Image;
  private nextButton!: Phaser.GameObjects.Image;

  constructor() {
    super("SelectionDialogScene");
  }

  init(data: SelectionDialogData) {
    // Diese Methode wird bei jedem Start der Szene aufgerufen.
    // Hier setzen wir den Zustand zurück.
    this.dialogData = data;
    this.room = data.room;
    this.allCards = data.cards;

    // ✨ NEU: SettingsManager laden
    this.soundManager = this.registry.get("soundManager");

    // ✨ NEU: PreviewManager für diese Szene instanziieren (Wiederverwendung der Logik!)
    this.previewManager = new PreviewManager(this);

    // ✨ DIE KORREKTUR: Setze die Seitenzahl und die Auswahl bei jeder Initialisierung zurück.
    this.currentPage = 0;
    this.selectedCards.clear();
    this.isTransitioning = false;
    this.nextDelta = null; // ✨ NEU: Zurücksetzen
    this.activeTransitionTweens = []; // ✨ NEU: Zurücksetzen

    // ✨ FIX: Alte Referenzen löschen. Da die Szene gestoppt wurde, hat Phaser die Objekte bereits zerstört.
    this.cardUIs = [];
    this.actionButtons = [];
    if (this.selectedCardsContainer) this.selectedCardsContainer.removeAll(true);

    this.totalPages = Math.ceil(this.allCards.length / CARDS_PER_PAGE);
  }

  create() {
    // 1. Hintergrund-Overlay
    const background = this.add
      .rectangle(0, 0, this.scale.width, this.scale.height, 0x000000, 0.7)
      .setOrigin(0, 0)
      .setInteractive();

    // 2. Titel (entfernt, wie gewünscht)
    // this.titleText = this.add // Die `create`-Methode verwendet jetzt die in `init` vorbereiteten Daten.
    //   .text(this.scale.width / 2, 50, this.dialogData.title, {
    //     fontSize: "32px",
    //     color: "#ffffff",
    //     fontStyle: "bold",
    //   })
    //   .setOrigin(0.5);

    // ✨ NEU: Container für ausgewählte Karten erstellen (Position: Oberes Drittel)
    // Wir platzieren ihn mittig bei ca. 25% der Höhe, also über der Hauptliste.
    this.selectedCardsContainer = this.add.container(this.scale.width / 2, this.scale.height * 0.25);

    // 3. Karten und Paginierung (verwenden die zurückgesetzten Werte)
    this.createPaginationControls();
    // ✨ NEU: Initiales Rendern jetzt auch mit Animation (von rechts einfliegend)
    this.renderPage(true, 1);
    this.updatePaginationControls();

    // 4. Schließen-Button
    if (this.dialogData.showCloseButton) {
      const closeButton = this.add
        .text(this.scale.width - 40, 40, "X", {
          fontSize: "32px",
          color: "#ff0000",
          backgroundColor: "#330000",
          padding: { x: 10, y: 5 },
        })
        .setOrigin(0.5)
        .setInteractive({ useHandCursor: true });

      closeButton.on("pointerdown", () => {
        this.soundManager.playSound("UI_TOGGLE");
        this.dialogData.onCancel();
        this.closeDialog();
      });
    }

    // 5. Aktions-Buttons
    if (this.dialogData.isInteractive) {
      // ✨ NEU: Erstelle die fixen Button-Reihen für Opponent (oben) und You (unten)
      this.createZoneButtons(true); // Opponent
      this.createZoneButtons(false); // You
      this.updateConfirmButtonState();
    }
  }

  private createPaginationControls() {
    // ✨ KORREKTUR: Die Buttons werden jetzt weiter außen und leicht unterhalb der Mitte platziert,
    // um eine Überlappung mit den Karten zu vermeiden.
    // Wir berechnen die Y-Position basierend auf der Kartenhöhe, um sicherzustellen, dass sie immer darunter liegen.
    const cardHeight = (this.scale.width / 8) * 1.4;
    const buttonY = this.scale.height / 2 + cardHeight / 2 + 40;
    const buttonXOffset = this.scale.width * 0.4;

    this.prevButton = this.add
      .image(this.scale.width / 2 - buttonXOffset, buttonY, "arrow_left")
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setTint(0x888888); // ✨ NEU: Initial dunkler (inaktiv/normal)

    this.nextButton = this.add
      .image(this.scale.width / 2 + buttonXOffset, buttonY, "arrow_right")
      .setOrigin(0.5)
      .setInteractive({ useHandCursor: true })
      .setTint(0x888888); // ✨ NEU: Initial dunkler (inaktiv/normal)

    this.pageText = this.add
      .text(
        this.scale.width / 2,
        this.scale.height - 130,
        `Seite ${this.currentPage + 1} / ${this.totalPages}`,
        { fontSize: "18px", color: "#cccccc" },
      )
      .setOrigin(0.5);

    this.prevButton.on("pointerdown", () => {
      this.soundManager.playSound("PAGE_FLIP");
      this.changePage(-1); // ✨ NEU: Time-Scale-Logik nutzen
    });

    this.nextButton.on("pointerdown", () => {
      this.soundManager.playSound("PAGE_FLIP");
      this.changePage(1); // ✨ NEU: Time-Scale-Logik nutzen
    });

    // ✨ NEU: Hover-Effekte für die neuen Bild-Buttons
    // Jetzt mit Skalierung ("Aufblähen") und Aufhellen (Gold-Tint statt Grau)
    const addHoverEffect = (btn: Phaser.GameObjects.Image) => {
      btn.on("pointerover", () => {
        btn.setTint(0xffd700); // Gold/Hell
        this.tweens.add({
          targets: btn,
          scale: 1.2,
          duration: 100,
          ease: "Back.easeOut",
        });
      });
      btn.on("pointerout", () => {
        btn.setTint(0x888888); // ✨ NEU: Zurück zur dunkleren Farbe
        this.tweens.add({ targets: btn, scale: 1.0, duration: 100 });
      });
    };
    addHoverEffect(this.prevButton);
    addHoverEffect(this.nextButton);
  }

  private updatePaginationControls() {
    this.prevButton.setVisible(this.currentPage > 0);
    this.nextButton.setVisible(this.currentPage < this.totalPages - 1);
    this.pageText.setText(`Seite ${this.currentPage + 1} / ${this.totalPages}`);
    this.pageText.setVisible(this.totalPages > 1);
  }

  /** ✨ NEU: Hilfsmethode für den Seitenwechsel mit Animation */
  private changePage(delta: number, startFast: boolean = false) {
    // Wenn eine Animation läuft, beschleunigen und den nächsten Wechsel vormerken
    if (this.isTransitioning) {
      this.nextDelta = delta;
      this.activeTransitionTweens.forEach((tween) => {
        if (tween && tween.isPlaying()) {
          tween.timeScale = 5; // Beschleunigen!
        }
      });
      return;
    }

    // Wenn keine Animation läuft, den Wechsel direkt ausführen
    const targetPage = this.currentPage + delta;
    if (targetPage >= 0 && targetPage < this.totalPages) {
      this.currentPage = targetPage;
      this.updatePaginationControls();
      this.renderPage(true, delta, startFast);
    } else {
      // Ungültiger Klick (z.B. auf erster Seite zurück), aber vielleicht ist ein Klick vorgemerkt
      this.checkAndRunNextPageChange();
    }
  }

  /** ✨ NEU: Ersetzt displayCardsForCurrentPage und unterstützt Animationen */
  private renderPage(animate: boolean = false, direction: number = 0, startFast: boolean = false) {
    const startIndex = this.currentPage * CARDS_PER_PAGE;
    const endIndex = startIndex + CARDS_PER_PAGE;
    const cardsToShow = this.allCards.slice(startIndex, endIndex);

    const cardWidth = this.scale.width / 8;
    const cardHeight = cardWidth * 1.4;
    const totalWidth =
      cardsToShow.length * cardWidth + (cardsToShow.length - 1) * 20;
    const startX = this.scale.width / 2 - totalWidth / 2;
    const centerY = this.scale.height / 2;
    const screenWidth = this.scale.width;

    if (animate) {
      this.isTransitioning = true;
      this.activeTransitionTweens = []; // ✨ NEU: Alte Tweens verwerfen
    }

    // --- Schritt 1: Alte Karten rausfliegen lassen ---
    const oldCards = [...this.cardUIs];
    const staggerTime = 50; // ms Verzögerung pro Karte für den Ziehharmonika-Effekt
    const animDuration = 500; // ✨ NEU: Konstante für die Dauer

    // ✨ FIX: Wir lassen die Animationen normal durchlaufen (kein killTweensOf, kein Filter).
    if (animate) {
      // Wenn wir nach rechts blättern (direction > 0), gehen alte Karten nach links (-screenWidth).
      const offset = direction > 0 ? -screenWidth : screenWidth;

      oldCards.forEach((cardUI, index) => {
        // Ziehharmonika: Bei "Weiter" fliegt die erste (linke) Karte zuerst.
        // Bei "Zurück" fliegt die letzte (rechte) Karte zuerst.
        const delay =
          direction > 0
            ? index * staggerTime
            : (oldCards.length - 1 - index) * staggerTime;

        const tween = this.tweens.add({
          targets: cardUI,
          x: cardUI.x + offset,
          duration: animDuration,
          delay: delay, // ✨ NEU: Individuelle Verzögerung
          ease: "Cubic.easeIn", // ✨ FIX: Beschleunigen beim Rausfliegen
          onComplete: () => {
            cardUI.destroy();
          },
        });
        if (startFast) {
          tween.timeScale = 5; // ✨ NEU: Sofort schnell starten, wenn gewünscht
        }
        if (animate) this.activeTransitionTweens.push(tween);
      });
    } else {
      oldCards.forEach((c) => c.destroy());
    }

    // --- Schritt 2: Neue Karten (ggf. verzögert) einfliegen lassen ---
    this.cardUIs = []; // Liste für die neuen Karten leeren

    // Startverzögerung für die neuen Karten (damit die alten schon KOMPLETT weg sind)
    // ✨ FIX: Dynamische Berechnung für sequentiellen Ablauf (kein Überlappen)
    let baseDelay = 0;
    if (animate && oldCards.length > 0) {
      // Wartezeit = Max Delay der alten Karten + Animationsdauer
      const maxOldDelay = (oldCards.length - 1) * staggerTime;
      baseDelay = maxOldDelay + animDuration;
    } else if (animate) {
      // Wenn keine alten Karten da waren (oder alle unsichtbar waren), starten wir fast sofort.
      baseDelay = 50;
    }

    // ✨ FIX: Falls keine Karten angezeigt werden (z.B. leeres Deck), müssen wir die Transition trotzdem beenden.
    if (cardsToShow.length === 0 && animate) {
      this.time.delayedCall(baseDelay, () => {
        this.onLastTweenComplete();
      });
      return;
    }

    cardsToShow.forEach((cardData, index) => {
      const targetX = startX + index * (cardWidth + 20) + cardWidth / 2;
      let initialX = targetX;

      if (animate) {
        // Wenn wir nach rechts blättern (direction > 0), kommen neue Karten von rechts (+screenWidth).
        // Wenn wir nach links blättern (direction < 0), kommen neue Karten von links (-screenWidth).
        const offset = direction > 0 ? screenWidth : -screenWidth;
        initialX = targetX + offset;
      }

      const cardUI = new CardUI(
        this,
        initialX,
        centerY,
        cardData,
        cardWidth,
        cardHeight,
      );

      this.setupCardInteractivity(cardUI);
      this.cardUIs.push(cardUI);

      if (animate) {
        // Ziehharmonika für neue Karten
        const delay =
          direction > 0
            ? index * staggerTime
            : (cardsToShow.length - 1 - index) * staggerTime;

        const tween = this.tweens.add({
          targets: cardUI,
          x: targetX,
          delay: baseDelay + delay, // ✨ NEU: Basis-Verzögerung + individueller Stagger
          duration: 600, // Etwas langsamer beim Reinkommen für "Smoothness"
          ease: "Cubic.easeOut", // ✨ FIX: Abbremsen beim Ankommen
          onComplete: () => {
            // Transition beenden, wenn die letzte Karte angekommen ist
            const isLast =
              direction > 0 ? index === cardsToShow.length - 1 : index === 0;
            if (isLast) {
              this.onLastTweenComplete();
            }
          },
        });
        if (startFast) {
          tween.timeScale = 5; // ✨ NEU: Sofort schnell starten
        }
        if (animate) this.activeTransitionTweens.push(tween);
      }
    });

    // Buttons immer oben halten
    this.prevButton.setDepth(1);
    this.nextButton.setDepth(1);
  }

  /** ✨ NEU: Wird aufgerufen, wenn die letzte Animation einer Seiten-Transition beendet ist. */
  private onLastTweenComplete() {
    this.isTransitioning = false;
    this.activeTransitionTweens = [];
    this.checkAndRunNextPageChange();
  }

  /** ✨ NEU: Prüft, ob ein Klick während der Animation vorgemerkt wurde und führt ihn aus. */
  private checkAndRunNextPageChange() {
    if (this.nextDelta !== null) {
      const delta = this.nextDelta;
      this.nextDelta = null;
      // Rufe changePage auf, was jetzt den "else"-Block ausführt, da isTransitioning false ist.
      this.changePage(delta, true); // ✨ FIX: Nächste Seite auch schnell abspielen
    }
  }

  /** ✨ NEU: Interaktivität ausgelagert, um renderPage sauber zu halten */
  private setupCardInteractivity(cardUI: CardUI) {
    const isInteractive = this.dialogData.isInteractive;
    cardUI.setInteractive({ useHandCursor: isInteractive });

    cardUI.on("pointerover", () => {
      if (this.isTransitioning) return; // ✨ FIX: Mouseover während Animation ignorieren (verhindert Steckenbleiben)

      this.tweens.killTweensOf(cardUI);
      this.children.bringToTop(cardUI);
      cardUI.startGlow(true);
      this.soundManager.playSound("CARD_HOVER_FIELD");
      this.tweens.add({
        targets: cardUI,
        scale: 1.15,
        y: cardUI.y - 30,
        duration: 150,
        ease: "Sine.easeOut",
      });
      this.previewManager.show(cardUI, this.room.sessionId);
    });

    cardUI.on("pointerout", () => {
      if (this.isTransitioning) return; // ✨ FIX: Mouseout während Animation ignorieren

      this.tweens.killTweensOf(cardUI);
      cardUI.stopGlow();
      this.tweens.add({
        targets: cardUI,
        scale: 1.0,
        y: this.scale.height / 2,
        duration: 150,
        ease: "Sine.easeIn",
      });
      this.previewManager.hide();
    });

    if (isInteractive) {
      cardUI.on("pointerdown", () => this.onCardClicked(cardUI));
      if (this.selectedCards.has(cardUI.cardData.id)) {
        cardUI.setTint(0x00ff00);
      }
    }
  }

  /** ✨ NEU: Erstellt eine Reihe von Zonen-Buttons für einen Spieler. */
  private createZoneButtons(isOpponent: boolean) {
    const zones = [
      { label: "Hand", zone: "hand" },
      { label: "Territory", zone: "territory" },
      { label: "Deck", zone: "deck" },
      { label: "Reserve", zone: "reserve" },
      { label: "Discard", zone: "discard" },
      { label: "Banish", zone: "banish" },
    ];

    // Positionierung
    // ✨ FIX: Opponent-Elemente weiter nach oben schieben, da der Titel weg ist.
    const yPos = isOpponent ? 90 : this.scale.height - 80;
    const labelY = isOpponent ? 40 : this.scale.height - 30;
    const labelText = isOpponent ? "Opponent" : "You";

    // Label zeichnen
    this.add
      .bitmapText(this.scale.width / 2, labelY, "fairydust", labelText, 40)
      .setOrigin(0.5)
      .setTint(0xffd700); // Gold

    const buttonWidth = 140;
    const spacing = 10;
    const totalWidth =
      zones.length * buttonWidth + (zones.length - 1) * spacing;
    let startX = (this.scale.width - totalWidth) / 2 + buttonWidth / 2;

    zones.forEach((z) => {
      const container = this.add.container(startX, yPos);

      // Hintergrundbild
      const bg = this.add.image(0, 0, "button_parchment");
      bg.setDisplaySize(buttonWidth, 50);

      // Text
      // ✨ NEU: Text zentriert, neue Farbe und mit Schlagschatten
      const fontSize = 24;
      // ✨ FIX: Y-Position manuell anpassen, um die visuelle Mitte der BitmapFont zu treffen.
      // Ein Offset von -50% der Schriftgröße (dein Vorschlag) korrigiert die Basislinie.
      const yOffset = fontSize * -0.25; // ✨ FIX: Weniger aggressiver Offset, um es von "zu hoch" nach unten zu korrigieren.
      const text = this.add.bitmapText(
        0,
        yOffset,
        "fairydust",
        z.label,
        fontSize,
      );
      text.setOrigin(0.5);
      text.setTint(0xf4f6e1); // Cremefarben
      text.setDropShadow(2, 2, 0x000000, 0.7);

      container.add([bg, text]);

      // Interaktivität
      container.setSize(buttonWidth, 50);
      container.setInteractive({ useHandCursor: true });
      
      // ✨ NEU: Metadaten für die Filterung speichern
      container.setData("zone", z.zone);
      container.setData("target", isOpponent ? "opponent" : "me");

      container.on("pointerover", () => bg.setTint(0xdddddd));
      container.on("pointerout", () => bg.clearTint());

      container.on("pointerdown", () => {
        if (container.alpha === 1) {
          this.soundManager.playSound("UI_TOGGLE");
          // ✨ NEU: Ermittle die korrekte Action-ID aus den possibleActions (falls vorhanden)
          let actionId = "custom_selection";
          if (this.dialogData.possibleActions) {
             const targetStr = isOpponent ? "opponent" : "me";
             const match = this.dialogData.possibleActions.find(a => 
                 a.toZone === z.zone && 
                 (a.target === targetStr || (!a.target && !isOpponent))
             );
             if (match) actionId = match.actionId;
          }

          this.dialogData.onComplete({
            actionId: actionId, // ✨ FIX: Sende die echte ID (z.B. "my_lob")
            selectedCardIds: Array.from(this.selectedCards),
            toZone: z.zone as any,
            target: isOpponent ? "opponent" : "me",
          });
          this.closeDialog();
        }
      });

      this.actionButtons.push(container);
      startX += buttonWidth + spacing;
    });
  }

  private onCardClicked(cardUI: CardUI) {
    const cardId = cardUI.cardData.id;
    // ✨ KORREKTUR: Setze einen Standardwert für unbegrenzte Auswahl.
    const rules = this.dialogData.selectionRules || { min: 0, max: Infinity };

    if (this.selectedCards.has(cardId)) {
      this.selectedCards.delete(cardId);
      cardUI.clearTint();
    } else if (this.selectedCards.size < rules.max) {
      // ✨ VEREINFACHUNG: Füge einfach hinzu, wenn das Maximum noch nicht erreicht ist.
      this.selectedCards.add(cardId);
      cardUI.setTint(0x00ff00);
    }
    
    // ✨ NEU: Anzeige der ausgewählten Karten aktualisieren
    this.updateSelectedCardsDisplay();
    this.updateConfirmButtonState();
  }

  /** ✨ NEU: Aktualisiert die Anzeige der ausgewählten Karten im oberen Bereich */
  private updateSelectedCardsDisplay() {
    // 1. Container leeren (alte Vorschauen entfernen)
    this.selectedCardsContainer.removeAll(true);

    const selectedIds = Array.from(this.selectedCards);
    if (selectedIds.length === 0) return;

    // 2. Karten-Daten finden
    const cards = selectedIds
      .map((id) => this.allCards.find((c) => c.id === id))
      .filter((c) => c !== undefined) as CardState[];

    // 3. Layout-Parameter
    const maxAreaWidth = this.scale.width * 0.8; // Max 80% der Bildschirmbreite nutzen
    const baseCardWidth = this.scale.width / 14; // Kleiner als die Hauptkarten (1/14 statt 1/8)
    const baseCardHeight = baseCardWidth * 1.4;
    const spacing = 10;

    // 4. Skalierung berechnen (Verkleinern, wenn zu viele Karten)
    let scale = 1;
    const totalWidthNeeded =
      cards.length * baseCardWidth + (cards.length - 1) * spacing;

    if (totalWidthNeeded > maxAreaWidth) {
      scale = maxAreaWidth / totalWidthNeeded;
    }

    // Startposition (zentriert)
    const startX = -(totalWidthNeeded * scale) / 2 + (baseCardWidth * scale) / 2;

    // 5. Karten erstellen
    cards.forEach((cardData, index) => {
      const x = startX + index * (baseCardWidth + spacing) * scale;
      const y = 0;

      const cardUI = new CardUI(this, x, y, cardData, baseCardWidth, baseCardHeight);
      cardUI.setScale(scale);

      // Interaktivität für Preview (Mouseover)
      cardUI.setInteractive({ useHandCursor: true });
      cardUI.on("pointerover", () => {
        this.previewManager.show(cardUI, this.room.sessionId);
      });
      cardUI.on("pointerout", () => {
        this.previewManager.hide();
      });

      this.selectedCardsContainer.add(cardUI);
    });
  }

  private updateConfirmButtonState() {
    // ✨ KORREKTUR: Iteriere über alle Aktions-Buttons.
    if (this.actionButtons.length === 0) return;

    const rules = this.dialogData.selectionRules || { min: 0, max: 1 };
    const isValid = this.selectedCards.size >= rules.min;
    const possibleActions = this.dialogData.possibleActions;

    this.actionButtons.forEach((button) => {
      // ✨ NEU: Prüfe, ob dieser Button erlaubt ist
      let isAllowed = true;
      
      if (possibleActions && possibleActions.length > 0) {
          const zone = button.getData("zone");
          const target = button.getData("target");
          
          // Button ist nur erlaubt, wenn er in der Liste der möglichen Aktionen steht
          // ✨ FIX: Berücksichtige implizites "me", wenn a.target undefined ist.
          isAllowed = possibleActions.some(a => 
            a.toZone === zone && 
            (a.target === target || (!a.target && target === "me"))
          );
      }

      if (isValid && isAllowed) {
        button.setAlpha(1);
        if (button.input) button.input.enabled = true; // Aktivieren
      } else {
        button.setAlpha(0.5);
        if (button.input) button.input.enabled = false; // Deaktivieren (Klick verhindern)
      }
    });
  }

  public closeDialog() {
    // ✨ NEU: Sound abspielen (konsistent mit SettingsDialog)
    this.soundManager.playSound("MENU_SELECT");

    // ✨ KORREKTUR: Setze den Auswahlstatus zurück, damit die Karten bei der nächsten
    // Öffnung des Dialogs nicht fälschlicherweise noch als ausgewählt angezeigt werden.
    this.selectedCards.clear();
    this.scene.resume("CardGame");
    this.scene.stop();
  }
}
