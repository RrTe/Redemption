import Phaser from "phaser";

export class LobbyDomManager {
  private scene: Phaser.Scene;
  private helpOverlay: HTMLElement | null = null;
  public playerNameInput!: Phaser.GameObjects.DOMElement;

  constructor(scene: Phaser.Scene) {
    this.scene = scene;
  }

  public createPlayerNameInput(x: number, y: number, initialName: string) {
    this.playerNameInput = this.scene.add.dom(x, y).createFromHTML(`
        <input type="text" name="playerName" value="${initialName}" placeholder="Enter Name" 
               style="font-size: 24px; font-weight: bold; padding: 10px; width: 320px; text-align: center; 
                      border-radius: 8px; border: 2px solid #ffe44d; background-color: rgba(0, 0, 0, 0.5); 
                      color: #ffe44d; font-family: monospace; outline: none; text-shadow: 2px 2px 4px black;">
    `);
  }

  public getPlayerName(): string {
    const input = this.playerNameInput?.getChildByName("playerName") as HTMLInputElement;
    return input?.value || "";
  }

  public setPlayerName(name: string) {
    const input = this.playerNameInput?.getChildByName("playerName") as HTMLInputElement;
    if (input) input.value = name;
  }

  public setInputPosition(x: number, y: number) {
    this.playerNameInput?.setPosition(x, y);
  }

  public openFileSelector(accept: string, callback: (content: string, fileName: string) => void) {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = accept;
    input.style.display = "none";

    input.onchange = (e: any) => {
      const file = e.target.files[0];
      if (!file) return;

      const reader = new FileReader();
      reader.onload = (event) => {
        const content = event.target?.result as string;
        if (content) callback(content, file.name);
      };
      reader.readAsText(file);
    };

    document.body.appendChild(input);
    input.click();
    document.body.removeChild(input);
  }

  public toggleHelp() {
    if (this.helpOverlay) {
      const isVisible = this.helpOverlay.style.display !== "none";
      this.helpOverlay.style.display = isVisible ? "none" : "flex";
      return;
    }

    this.helpOverlay = document.createElement("div");
    this.helpOverlay.id = "lobby-help-overlay";
    Object.assign(this.helpOverlay.style, {
      position: "absolute",
      top: "10%",
      left: "10%",
      width: "80%",
      height: "80%",
      backgroundColor: "rgba(0, 0, 0, 0.9)",
      border: "2px solid #ffd700",
      borderRadius: "10px",
      zIndex: "10000",
      display: "flex",
      flexDirection: "column",
      boxShadow: "0 0 20px rgba(0,0,0,0.8)",
    });

    const header = document.createElement("div");
    header.style.cssText = "display:flex; justify-content:space-between; align-items:center; padding:10px 20px; background-color:#1a1a2e; border-bottom:1px solid #444; color:#ffd700; font-family:serif; font-size:24px;";
    header.innerHTML = "<span>Game Guide</span>";

    const closeBtn = document.createElement("button");
    closeBtn.textContent = "X";
    closeBtn.style.cssText = "background:transparent; border:none; color:#ff6666; font-size:24px; cursor:pointer; font-weight:bold;";
    closeBtn.onclick = () => { if (this.helpOverlay) this.helpOverlay.style.display = "none"; };
    header.appendChild(closeBtn);

    const iframe = document.createElement("iframe");
    iframe.src = "help.html";
    iframe.style.cssText = "flex:1; border:none; background:#fff;";

    this.helpOverlay.appendChild(header);
    this.helpOverlay.appendChild(iframe);
    document.body.appendChild(this.helpOverlay);
  }

  public destroy() {
    if (this.helpOverlay) this.helpOverlay.remove();
    this.playerNameInput?.destroy();
  }
}