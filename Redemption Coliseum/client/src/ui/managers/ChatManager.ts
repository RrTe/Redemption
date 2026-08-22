import Phaser from "phaser";
import { type TypedRoom } from "../gameUI";
import { type GameNetworkManager } from "../../network/GameNetworkManager"; // ✨ NEU
import { SoundManager } from "../../managers/SoundManager";
import { type GameLayout } from "../layout"; // ✨ NEU
import { type PreviewManager } from "./PreviewManager"; // ✨ NEU
import { TooltipManager } from "./TooltipManager";

export class ChatManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private networkManager: GameNetworkManager; // ✨ NEU
  private soundManager: SoundManager;
  private previewManager: PreviewManager; // ✨ NEU

  private container!: Phaser.GameObjects.Container; // ✨ FIX: Definite Assignment (!)
  private chatDOM!: Phaser.GameObjects.DOMElement; // ✨ FIX: Definite Assignment (!)
  private toggleButton!: Phaser.GameObjects.Image; // ✨ FIX: Definite Assignment (!)
  private chatBackground!: Phaser.GameObjects.Image; // ✨ NEU: Hintergrundbild
  private notificationBubble!: Phaser.GameObjects.Container; // ✨ FIX: Definite Assignment (!)
  private notificationText!: Phaser.GameObjects.Text; // ✨ FIX: Definite Assignment (!)

  private isOpen: boolean = false;
  private unreadCount: number = 0;

  // ✨ NEU: Speichere Layout-Daten für Animationen
  private currentLayout: { visibleX: number; hiddenX: number } = {
    visibleX: 24,
    hiddenX: -12,
  };

  constructor(
    scene: Phaser.Scene,
    room: TypedRoom,
    networkManager: GameNetworkManager,
    previewManager: PreviewManager, // ✨ NEU
  ) {
    this.scene = scene;
    this.room = room;
    this.networkManager = networkManager; // ✨ NEU
    this.previewManager = previewManager; // ✨ NEU
    this.soundManager = scene.registry.get("soundManager");

    this.createUI();
    this.registerHandlers();
  }

  private createUI() {
    const height = this.scene.scale.height;

    // 1. Container für den Drawer (Links außerhalb)
    this.container = this.scene.add.container(-320, 0).setDepth(9000);

    // 2. Hintergrund (Pergament-Bild)
    // Wir positionieren es bei x=150 (Mitte von 300px Breite), damit es im Container von 0 bis 300 reicht.
    this.chatBackground = this.scene.add.image(150, height / 2, "chat_bg"); // ✨ FIX: Eigenes Bild nutzen
    this.chatBackground.setDisplaySize(300, height - 40); // Strecken
    this.chatBackground.setInteractive(); // ✨ FIX: "Schluckt" alle Klicks auf den Hintergrund, damit sie nicht durchfallen
    this.container.add(this.chatBackground);

    // 3. Inhalt (DOM)
    // Wir nutzen ein DOM-Element für den eigentlichen Chat-Inhalt (Scrollbar!)
    // Origin 0.5, 1 anchor to bottom
    this.chatDOM = this.scene.add.dom(150, height - 20).setOrigin(0.5, 1).createFromHTML(`
      <div id="chat-wrapper" style="
        width: 300px; 
        height: ${height - 40}px; 
        /* background entfernt, da wir jetzt das Bild nutzen */
        /* border entfernt, sieht auf Pergament besser ohne aus */
        display: flex; 
        flex-direction: column;
        font-family: 'Georgia', 'Times New Roman', serif; /* ✨ FIX: Serif statt Monospace für Pergament-Look */
        font-size: 16px;
        font-weight: bold;
        padding: 10px;
        box-sizing: border-box;
        pointer-events: auto;
      ">
        <div id="chat-history" style="
          padding: 20px 15px; /* ✨ NEU: Abstand zum Rand des Pergaments */
          flex-grow: 1; 
          overflow-y: auto; 
          margin-bottom: 10px;
          color: #26140c; /* ✨ FIX: Dunkles Tinten-Braun für besseren Kontrast auf Papier */
          text-shadow: none; /* ✨ FIX: Kein Schatten auf Papier */
        ">
          <div style="color: #5c3a21; font-style: italic;">Welcome to Redemption Coliseum!</div>
        </div>
        <input id="chat-input" type="text" placeholder="Type a message..." style="
          width: 100%; 
          padding: 8px; 
          background: rgba(255,255,255,0.3); /* ✨ FIX: Hellerer Hintergrund für Input */
          border: 1px solid #5c3a21; /* ✨ FIX: Brauner Rand */
          color: #26140c; /* ✨ FIX: Dunkle Schrift */
          border-radius: 4px;
          outline: none;
          box-sizing: border-box; /* ✨ FIX: Verhindert Überlauf, Padding wird eingerechnet */
        " />
      </div>
    `);

    // Input-Listener
    const wrapper = this.chatDOM.getChildByID("chat-wrapper") as HTMLElement;
    if (wrapper) {
      // ✨ FIX: Verhindere, dass Klicks durch das DOM-Element an Phaser weitergereicht werden
      wrapper.addEventListener("mousedown", (e) => e.stopPropagation());
      wrapper.addEventListener("pointerdown", (e) => e.stopPropagation());
      wrapper.addEventListener("touchstart", (e) => e.stopPropagation());
      wrapper.addEventListener("click", (e) => e.stopPropagation());
      wrapper.addEventListener("wheel", (e) => e.stopPropagation()); // Auch Scrollen abfangen

      // ✨ NEU: Hover-Effekte für Karten-Links per Event-Delegation
      wrapper.addEventListener("mouseover", (e) => {
        const target = e.target as HTMLElement;
        if (target && target.classList.contains("chat-card-link")) {
          const cardId = target.getAttribute("data-cardid");
          const cardName = target.getAttribute("data-cardname");
          if (cardId) {
            this.showPreviewForCardId(cardId, e.clientY);
          } else if (cardName) {
            this.showPreviewForCardName(cardName, e.clientY);
          }
        }
      });
      wrapper.addEventListener("mouseout", (e) => {
        const target = e.target as HTMLElement;
        if (target && target.classList.contains("chat-card-link")) {
          this.previewManager.hide();
        }
      });
    }

    const input = this.chatDOM.getChildByID("chat-input") as HTMLInputElement;
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && input.value.trim() !== "") {
          this.sendMessage(input.value);
          input.value = "";
        }
        e.stopPropagation(); // Verhindert, dass Phaser Tastendrücke abfängt
      });
      // Sicherstellen, dass auch direkt auf dem Input keine Events durchfallen
      input.addEventListener("mousedown", (e) => e.stopPropagation());
      input.addEventListener("pointerdown", (e) => e.stopPropagation());
      input.addEventListener("touchstart", (e) => e.stopPropagation());
      input.addEventListener("click", (e) => e.stopPropagation());
    }

    this.container.add(this.chatDOM);

    // 3. Toggle Button (Separat vom Container, damit er am Rand bleiben kann)
    // ✨ FIX: Button ist jetzt ein eigenständiges Image in der Szene
    this.toggleButton = this.scene.add
      .image(-12, height - 100, "button_chat") // ✨ NEU: Eigenes Icon
      .setDisplaySize(48, 48)
      .setInteractive({ useHandCursor: true })
      .setTint(0xcccccc)
      .setDepth(9001); // Über dem Container

    this.toggleButton.on("pointerdown", () => {
      TooltipManager.hide();
      this.toggle();
    });

    // ✨ NEU: Hover-Effekt (Slide-In von links) und Tooltip
    this.toggleButton.on("pointerover", () => {
      // ✨ FIX: Nur "Peeken", wenn geschlossen. Wenn offen, bleibt er wo er ist.
      if (!this.isOpen) {
        this.scene.tweens.add({
          targets: this.toggleButton,
          x: this.currentLayout.hiddenX + 36, // Ein Stückchen rausfahren
          duration: 200,
          ease: "Sine.easeOut",
        });
      }
      const bounds = this.toggleButton.getBounds();
      const visibleX = this.isOpen
        ? this.currentLayout.visibleX
        : this.currentLayout.hiddenX + 36;
      TooltipManager.show(visibleX, bounds.top, "button_chat");
    });
    this.toggleButton.on("pointerout", () => {
      // Nur zurückfahren, wenn Chat geschlossen ist
      if (!this.isOpen) {
        this.scene.tweens.add({
          targets: this.toggleButton,
          x: this.currentLayout.hiddenX,
          duration: 200,
          ease: "Sine.easeOut",
        });
      }
      TooltipManager.hide();
    });

    // 4. Notification Bubble (Toast)
    this.notificationBubble = this.scene.add
      .container(380, height / 2)
      .setAlpha(0);
    const bubbleBg = this.scene.add.graphics();
    bubbleBg.fillStyle(0x000000, 0.8);
    bubbleBg.fillRoundedRect(0, -20, 200, 40, 10);
    this.notificationText = this.scene.add.text(10, -10, "", {
      fontSize: "14px",
      color: "#fff",
    });
    this.notificationBubble.add([bubbleBg, this.notificationText]);
    this.notificationBubble.setDepth(9002); // Über allem
  }

  /** ✨ NEU: Passt die Position an das aktuelle Layout an */
  public reposition(layout: GameLayout) {
    this.currentLayout = layout.chatButton;

    // Button positionieren (Y-Achse aktualisieren)
    this.toggleButton.setY(layout.chatButton.y);
    // X-Position nur setzen, wenn nicht offen/gehovert (Reset auf Hidden)
    if (!this.isOpen) {
      this.toggleButton.setX(layout.chatButton.hiddenX);
    } else {
      // ✨ FIX: Wenn offen, muss der Button an der neuen "offenen" Position sein
      this.toggleButton.setX(layout.chatButton.visibleX);
    }

    // Notification Bubble positionieren (neben dem Button)
    this.notificationBubble.setY(layout.chatButton.y);

    // ✨ NEU: Höhe des Chat-Fensters anpassen
    const newHeight = this.scene.scale.height;
    const chatHeight = newHeight - 40;

    this.chatBackground.setY(newHeight / 2);
    this.chatBackground.setDisplaySize(300, chatHeight);

    // DOM-Element-Größe via Style updaten
    if (this.chatDOM && this.chatDOM.node) {
      // ✨ FIX: Sicherheitscheck gegen Absturz bei toten Elementen
      this.chatDOM.setY(newHeight - 20);
      const wrapper = this.chatDOM.node.querySelector(
        "#chat-wrapper",
      ) as HTMLElement;
      if (wrapper) wrapper.style.height = `${chatHeight}px`;
    }
  }

  private registerHandlers() {
    this.room.onMessage(
      "chat",
      (msg: { sender: string; text: string; sessionId: string }) => {
        const isMe = msg.sessionId === this.room.sessionId;
        const color = isMe ? "#88ccff" : "#ffcc88"; // Blau für mich, Orange für Gegner
        this.addEntry(`
            <div style="margin-bottom: 4px;">
                <span style="color: #000000; font-weight: bold; text-decoration: underline;">${msg.sender}:</span> 
                <span style="color: #26140c;">${this.formatMessage(msg.text)}</span>
            </div>
        `);
        if (!this.isOpen) this.showToast(`${msg.sender}: ${msg.text}`);
      },
    );

    // ✨ NEU: Handler für die komplette Historie (beim Joinen/Laden)
    this.room.onMessage("chatHistory", (history: any[]) => {
      history.forEach((msg) => {
        // ✨ FIX: Unterscheidung zwischen Chat und GameLog
        if (msg.type === "gameLog" || !msg.sender) {
          this.addEntry(`
                    <div style="margin-bottom: 4px; color: #5c3a21; font-style: italic; font-size: 0.9em;">
                        ➤ ${this.formatMessage(msg.text)}
                    </div>
                `);
        } else {
          this.addEntry(`
                    <div style="margin-bottom: 4px;">
                        <span style="color: #000000; font-weight: bold; text-decoration: underline;">${msg.sender}:</span> 
                        <span style="color: #26140c;">${this.formatMessage(msg.text)}</span>
                    </div>
                `);
        }
      });
      // Reset unread count, da dies alte Nachrichten sind
      this.unreadCount = 0;
      this.toggleButton.setTint(0xcccccc);
    });

    this.room.onMessage("gameLog", (msg: { text: string }) => {
      this.addEntry(`
            <div style="margin-bottom: 4px; color: #5c3a21; font-style: italic; font-size: 0.9em;">
                ➤ ${this.formatMessage(msg.text)}
            </div>
        `);
      // ✨ FIX: Keine Toast-Nachricht für System-Logs, da diese oft redundant zur visuellen Aktion sind.
    });
  }

  private sendMessage(text: string) {
    this.networkManager.sendChatMessage(text); // ✨ FIX: Nutze NetworkManager
  }

  private addEntry(html: string) {
    const history = this.chatDOM.getChildByID("chat-history");
    if (history) {
      history.innerHTML += html;
      history.scrollTop = history.scrollHeight; // Auto-Scroll
    }

    if (!this.isOpen) {
      this.unreadCount++;
      this.toggleButton.setTint(0xffd700); // Gold leuchten
    }
  }

  private showToast(text: string) {
    // Text kürzen
    const shortText = text.length > 25 ? text.substring(0, 22) + "..." : text;
    this.notificationText.setText(shortText);

    this.scene.tweens.killTweensOf(this.notificationBubble);
    this.notificationBubble.setAlpha(0).setX(60); // ✨ FIX: Startposition links neben Button

    // Slide In & Fade Out
    this.scene.tweens.add({
      targets: this.notificationBubble, // ✨ FIX: Bubble bewegt sich nach rechts
      alpha: 1,
      x: 80,
      duration: 300,
      hold: 3000,
      yoyo: true,
      onComplete: () => {
        this.notificationBubble.setAlpha(0);
      },
    });
  }

  public toggle() {
    this.isOpen = !this.isOpen;
    this.soundManager.playSound("UI_TOGGLE");

    const targetX = this.isOpen ? 0 : -320;
    this.scene.tweens.add({
      targets: this.container,
      x: targetX,
      duration: 300,
      ease: "Power2",
      onComplete: () => {
        // ✨ NEU: Fokus setzen, wenn geöffnet
        if (this.isOpen) {
          const input = this.chatDOM.getChildByID(
            "chat-input",
          ) as HTMLInputElement;
          if (input) input.focus();
        }
      },
    });

    // ✨ FIX: Button synchron mit dem Container animieren
    const targetButtonX = this.isOpen
      ? this.currentLayout.visibleX
      : this.currentLayout.hiddenX;
    this.scene.tweens.add({
      targets: this.toggleButton,
      x: targetButtonX,
      duration: 300,
      ease: "Power2",
    });

    if (this.isOpen) {
      this.unreadCount = 0;
      this.toggleButton.setTint(0xcccccc); // Reset Tint
    } else {
      // ✨ NEU: Blur, wenn geschlossen (falls noch fokussiert)
      const input = this.chatDOM.getChildByID("chat-input") as HTMLInputElement;
      if (input) input.blur();
    }
  }

  private escapeHtml(unsafe: string) {
    return unsafe
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  /** ✨ NEU: Formatiert Nachrichtentexte und wandelt {{ID|Kartenname}} oder [Kartenname] in Links um */
  private formatMessage(text: string): string {
    let formatted = this.escapeHtml(text);
    const placeholders: string[] = [];
    
    // Neues Format vom Server: {{ID|Name}}
    // Da escapeHtml angewendet wurde, bleiben die geschweiften Klammern erhalten.
    formatted = formatted.replace(
      /\{\{([^|]+)\|(.+?)\}\}/g,
      (match, cardId, cardName) => {
        const trimmedName = cardName.trim();
        // Falls der Server-String ein Leerzeichen am Ende hatte, stellen wir es *außerhalb* des Links wieder her.
        const trailingSpace = cardName.length > trimmedName.length ? " " : "";
        const html = `<span class="chat-card-link" data-cardid="${cardId}" style="font-weight: bold; text-decoration: underline; cursor: pointer; padding-right: 2px;">${trimmedName}</span>${trailingSpace}`;
        placeholders.push(html);
        return `__CARD_LINK_${placeholders.length - 1}__`;
      }
    );

    // Fallback/Abwärtskompatibilität für alte Logs: [Name]
    // Oder von Spielern manuell eingetippte [Kartenname]
    formatted = formatted.replace(
      /\[([^\]]+)\]/g,
      (match, cardName) => {
        const trimmedName = cardName.trim();
        const trailingSpace = cardName.length > trimmedName.length ? " " : "";
        return `<span class="chat-card-link" data-cardname="${trimmedName}" style="font-weight: bold; text-decoration: underline; cursor: pointer; padding-right: 2px;">${trimmedName}</span>${trailingSpace}`;
      }
    );

    // Placeholders zurücksetzen
    placeholders.forEach((html, index) => {
      formatted = formatted.replace(`__CARD_LINK_${index}__`, html);
    });

    return formatted;
  }

  /** ✨ NEU: Zeigt die Kartenvorschau für eine Karten-ID an */
  private showPreviewForCardId(cardId: string, eventY: number) {
    const cardDatabase = this.scene.registry.get("cardDatabase");
    if (!cardDatabase || !cardDatabase.cards) return;
    
    // Finde Karte anhand der ID
    const cardData = cardDatabase.cards.find((c: any) => c.id === cardId);
    if (cardData && this.previewManager) {
       this.previewManager.showFromData(cardData, 300, eventY);
    }
  }

  /** ✨ NEU: Zeigt die Kartenvorschau für einen Kartennamen an */
  private showPreviewForCardName(cardName: string, eventY: number) {
    const cardDatabase = this.scene.registry.get("cardDatabase");
    if (!cardDatabase || !cardDatabase.cards) return;
    
    // Finde Karte anhand des Namens
    const cardData = cardDatabase.cards.find((c: any) => c.Name === cardName);
    if (cardData && this.previewManager) {
       // Chatfenster liegt zwischen x=0 und x=300 (wenn offen). Die rechte Kante ist bei x=300.
       this.previewManager.showFromData(cardData, 300, eventY);
    }
  }

  /** ✨ NEU: Räumt alle UI-Elemente sauber auf. */
  public destroy() {
    TooltipManager.hide();
    if (this.container) this.container.destroy();
    if (this.toggleButton) this.toggleButton.destroy();
    if (this.notificationBubble) this.notificationBubble.destroy();
    if (this.chatDOM) this.chatDOM.destroy();
    this.isOpen = false;
  }
}
