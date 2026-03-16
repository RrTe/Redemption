import Phaser from "phaser";
import { type TypedRoom } from "../gameUI";
import { SoundManager } from "../../managers/SoundManager";
import { type GameLayout } from "../layout"; // ✨ NEU

export class ChatManager {
  private scene: Phaser.Scene;
  private room: TypedRoom;
  private soundManager: SoundManager;

  private container!: Phaser.GameObjects.Container; // ✨ FIX: Definite Assignment (!)
  private chatDOM!: Phaser.GameObjects.DOMElement; // ✨ FIX: Definite Assignment (!)
  private toggleButton!: Phaser.GameObjects.Image; // ✨ FIX: Definite Assignment (!)
  private chatBackground!: Phaser.GameObjects.Image; // ✨ NEU: Hintergrundbild
  private notificationBubble!: Phaser.GameObjects.Container; // ✨ FIX: Definite Assignment (!)
  private notificationText!: Phaser.GameObjects.Text; // ✨ FIX: Definite Assignment (!)

  private isOpen: boolean = false;
  private unreadCount: number = 0;

  // ✨ NEU: Speichere Layout-Daten für Animationen
  private currentLayout: { visibleX: number, hiddenX: number } = { visibleX: 24, hiddenX: -12 };

  constructor(scene: Phaser.Scene, room: TypedRoom) {
    this.scene = scene;
    this.room = room;
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
    this.container.add(this.chatBackground);

    // 3. Inhalt (DOM)
    // Wir nutzen ein DOM-Element für den eigentlichen Chat-Inhalt (Scrollbar!)
    // Auch hier: x=150, damit es zentriert im 300px Container liegt.
    this.chatDOM = this.scene.add.dom(150, height / 2).createFromHTML(`
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
    const input = this.chatDOM.getChildByID("chat-input") as HTMLInputElement;
    if (input) {
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && input.value.trim() !== "") {
          this.sendMessage(input.value);
          input.value = "";
        }
        e.stopPropagation(); // Verhindert, dass Phaser Tastendrücke abfängt
      });
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

    this.toggleButton.on("pointerdown", () => this.toggle());

    // ✨ NEU: Hover-Effekt (Slide-In von links)
    this.toggleButton.on("pointerover", () => {
        // ✨ FIX: Nur "Peeken", wenn geschlossen. Wenn offen, bleibt er wo er ist.
        if (!this.isOpen) {
            this.scene.tweens.add({
                targets: this.toggleButton,
                x: this.currentLayout.hiddenX + 36, // Ein Stückchen rausfahren
                duration: 200,
                ease: "Sine.easeOut"
            });
        }
    });
    this.toggleButton.on("pointerout", () => {
        // Nur zurückfahren, wenn Chat geschlossen ist
        if (!this.isOpen) {
            this.scene.tweens.add({
                targets: this.toggleButton,
                x: this.currentLayout.hiddenX,
                duration: 200,
                ease: "Sine.easeOut"
            });
        }
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
      if (this.chatDOM && this.chatDOM.node) { // ✨ FIX: Sicherheitscheck gegen Absturz bei toten Elementen
          this.chatDOM.setY(newHeight / 2);
          const wrapper = this.chatDOM.node.querySelector('#chat-wrapper') as HTMLElement;
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
                <span style="color: #26140c;">${this.escapeHtml(msg.text)}</span>
            </div>
        `);
        if (!this.isOpen) this.showToast(`${msg.sender}: ${msg.text}`);
      },
    );

    // ✨ NEU: Handler für die komplette Historie (beim Joinen/Laden)
    this.room.onMessage("chatHistory", (history: any[]) => {
        history.forEach(msg => {
            // ✨ FIX: Unterscheidung zwischen Chat und GameLog
            if (msg.type === 'gameLog' || !msg.sender) {
                 this.addEntry(`
                    <div style="margin-bottom: 4px; color: #5c3a21; font-style: italic; font-size: 0.9em;">
                        ➤ ${this.escapeHtml(msg.text)}
                    </div>
                `);
            } else {
                this.addEntry(`
                    <div style="margin-bottom: 4px;">
                        <span style="color: #000000; font-weight: bold; text-decoration: underline;">${msg.sender}:</span> 
                        <span style="color: #26140c;">${this.escapeHtml(msg.text)}</span>
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
                ➤ ${this.escapeHtml(msg.text)}
            </div>
        `);
      // ✨ FIX: Keine Toast-Nachricht für System-Logs, da diese oft redundant zur visuellen Aktion sind.
    });
  }

  private sendMessage(text: string) {
    this.room.send("chat", { text });
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
            const input = this.chatDOM.getChildByID("chat-input") as HTMLInputElement;
            if (input) input.focus();
        }
      }
    });

    // ✨ FIX: Button synchron mit dem Container animieren
    const targetButtonX = this.isOpen ? this.currentLayout.visibleX : this.currentLayout.hiddenX;
    this.scene.tweens.add({
        targets: this.toggleButton,
        x: targetButtonX,
        duration: 300,
        ease: "Power2"
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

  /** ✨ NEU: Räumt alle UI-Elemente sauber auf. */
  public destroy() {
    if (this.container) this.container.destroy();
    if (this.toggleButton) this.toggleButton.destroy();
    if (this.notificationBubble) this.notificationBubble.destroy();
    if (this.chatDOM) this.chatDOM.destroy();
    this.isOpen = false;
  }
}
