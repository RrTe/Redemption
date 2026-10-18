// client/src/ui/components/LobbyModeToggle.ts
import Phaser from "phaser";
import { TooltipManager } from "../managers/TooltipManager";
import { type SoundManager } from "../../managers/SoundManager";

/**
 * Interactive mode toggle displayed next to 'Create New Game' in Lobby.
 * Allows instant switching between Standard Mode and Arena Mode.
 */
export class LobbyModeToggle {
  private scene: Phaser.Scene;
  private container: Phaser.GameObjects.Container;
  private standardIcon: Phaser.GameObjects.Image;
  private arenaIcon: Phaser.GameObjects.Image;
  private standardBg: Phaser.GameObjects.Graphics;
  private arenaBg: Phaser.GameObjects.Graphics;
  private soundManager?: SoundManager;
  private isArena: boolean = false;
  private onChange?: (isArena: boolean) => void;

  constructor(
    scene: Phaser.Scene,
    soundManager?: SoundManager,
    onChange?: (isArena: boolean) => void
  ) {
    this.scene = scene;
    this.soundManager = soundManager;
    this.onChange = onChange;

    this.container = scene.add.container(0, 0).setDepth(20);

    // Frame backgrounds
    this.standardBg = scene.add.graphics();
    this.arenaBg = scene.add.graphics();

    // Icons
    this.standardIcon = scene.add
      .image(-22, 0, "icon_standard")
      .setDisplaySize(26, 26);

    this.arenaIcon = scene.add
      .image(22, 0, "icon_arena")
      .setDisplaySize(22, 22);

    // Full 38x38 click zones covering the entire button frame and icon
    const standardHitZone = scene.add
      .zone(-22, 0, 38, 38)
      .setInteractive({ useHandCursor: true });

    const arenaHitZone = scene.add
      .zone(22, 0, 38, 38)
      .setInteractive({ useHandCursor: true });

    this.container.add([
      this.standardBg,
      this.arenaBg,
      this.standardIcon,
      this.arenaIcon,
      standardHitZone,
      arenaHitZone,
    ]);

    this.setupInteractions(standardHitZone, arenaHitZone);
    this.updateVisuals();
  }

  private setupInteractions(
    standardHitZone: Phaser.GameObjects.Zone,
    arenaHitZone: Phaser.GameObjects.Zone
  ): void {
    // Standard Mode button events
    standardHitZone.on("pointerdown", () => {
      console.log("[LobbyModeToggle] Standard mode button clicked");
      if (this.isArena) {
        this.setMode(false);
      }
    });
    standardHitZone.on("pointerover", () => {
      const bounds = this.standardIcon.getBounds();
      TooltipManager.show(bounds.centerX, bounds.top, "mode_standard");
    });
    standardHitZone.on("pointerout", () => {
      TooltipManager.hide();
    });

    // Arena Mode button events
    arenaHitZone.on("pointerdown", () => {
      console.log("[LobbyModeToggle] Arena mode button clicked");
      if (!this.isArena) {
        this.setMode(true);
      }
    });
    arenaHitZone.on("pointerover", () => {
      const bounds = this.arenaIcon.getBounds();
      TooltipManager.show(bounds.centerX, bounds.top, "mode_arena");
    });
    arenaHitZone.on("pointerout", () => {
      TooltipManager.hide();
    });
  }

  public setMode(isArena: boolean, notify = true): void {
    console.log(`[LobbyModeToggle] Mode changed: isArena=${isArena} (${isArena ? "Arena" : "Standard"})`);
    this.isArena = isArena;
    this.soundManager?.playSound("UI_TOGGLE");
    this.updateVisuals();
    if (notify && this.onChange) {
      this.onChange(this.isArena);
    }
  }

  public getMode(): boolean {
    return this.isArena;
  }

  public setPosition(x: number, y: number, scale = 1): void {
    this.container.setPosition(x, y);
    this.container.setScale(scale);
  }

  public setVisible(visible: boolean): void {
    this.container.setVisible(visible);
  }

  private updateVisuals(): void {
    const bgSize = 34;
    const r = 6;
    const activeIconSize = 26;
    const inactiveIconSize = 22;

    // Draw background for Standard
    this.standardBg.clear();
    if (!this.isArena) {
      // Active: Golden glow outline & highlight
      this.standardBg.fillStyle(0xebce4c, 0.25);
      this.standardBg.fillRoundedRect(-22 - bgSize / 2, -bgSize / 2, bgSize, bgSize, r);
      this.standardBg.lineStyle(2, 0xffe44d, 1);
      this.standardBg.strokeRoundedRect(-22 - bgSize / 2, -bgSize / 2, bgSize, bgSize, r);
      this.standardIcon.setAlpha(1.0).setDisplaySize(activeIconSize, activeIconSize);
    } else {
      // Inactive: Dimmed
      this.standardBg.fillStyle(0x000000, 0.45);
      this.standardBg.fillRoundedRect(-22 - bgSize / 2, -bgSize / 2, bgSize, bgSize, r);
      this.standardBg.lineStyle(1, 0x555555, 0.6);
      this.standardBg.strokeRoundedRect(-22 - bgSize / 2, -bgSize / 2, bgSize, bgSize, r);
      this.standardIcon.setAlpha(0.45).setDisplaySize(inactiveIconSize, inactiveIconSize);
    }

    // Draw background for Arena
    this.arenaBg.clear();
    if (this.isArena) {
      // Active: Golden glow outline & highlight
      this.arenaBg.fillStyle(0xebce4c, 0.25);
      this.arenaBg.fillRoundedRect(22 - bgSize / 2, -bgSize / 2, bgSize, bgSize, r);
      this.arenaBg.lineStyle(2, 0xffe44d, 1);
      this.arenaBg.strokeRoundedRect(22 - bgSize / 2, -bgSize / 2, bgSize, bgSize, r);
      this.arenaIcon.setAlpha(1.0).setDisplaySize(activeIconSize, activeIconSize);
    } else {
      // Inactive: Dimmed
      this.arenaBg.fillStyle(0x000000, 0.45);
      this.arenaBg.fillRoundedRect(22 - bgSize / 2, -bgSize / 2, bgSize, bgSize, r);
      this.arenaBg.lineStyle(1, 0x555555, 0.6);
      this.arenaBg.strokeRoundedRect(22 - bgSize / 2, -bgSize / 2, bgSize, bgSize, r);
      this.arenaIcon.setAlpha(0.45).setDisplaySize(inactiveIconSize, inactiveIconSize);
    }
  }

  public destroy(): void {
    this.container.destroy();
  }
}
