import Phaser from "phaser";

export interface ToggleItemConfig {
  id: string;
  texture: string;
  frame?: string | number;
  altTexture?: string;
  altFrame?: string | number;
  attribute?: string;
  values?: string[] | null;
  alignments?: string[] | null;
}

export interface IconToggleGroupConfig {
  id?: string;
  scale?: number;
  spacingX?: number;
  spacingY?: number;
  columns?: number;
  multiSelect?: boolean;
  sfxHover?: string;
  sfxChecked?: string;
  sfxUnchecked?: string;
  initialSelectedIds?: string[];
  selectedOverlayTexture?: string;
}

export class IconToggleGroup extends Phaser.GameObjects.Container {
  private items: ToggleItemConfig[];
  private groupConfig: Required<IconToggleGroupConfig>;
  private sprites: Map<string, Phaser.GameObjects.Sprite> = new Map();
  private overlays: Map<string, Phaser.GameObjects.Image> = new Map();
  private disabledOverlays: Map<string, Phaser.GameObjects.Image> = new Map();
  private selectedIds: Set<string> = new Set();
  private disabledIds: Set<string> = new Set();
  private hoverFrame: Phaser.GameObjects.Graphics;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    items: ToggleItemConfig[],
    config: IconToggleGroupConfig = {},
  ) {
    super(scene, x, y);

    this.items = items;
    this.groupConfig = {
      id: config.id ?? "toggle-group",
      scale: config.scale ?? 1,
      spacingX: config.spacingX ?? 45,
      spacingY: config.spacingY ?? 36,
      columns: config.columns ?? items.length,
      multiSelect: config.multiSelect ?? true,
      sfxHover: config.sfxHover ?? "checkButtonHover",
      sfxChecked: config.sfxChecked ?? "checkButtonSelect",
      sfxUnchecked: config.sfxUnchecked ?? "checkButtonDeselect",
      initialSelectedIds: config.initialSelectedIds ?? [],
      selectedOverlayTexture: config.selectedOverlayTexture ?? "filterSelected",
    };

    this.groupConfig.initialSelectedIds.forEach((id) => this.selectedIds.add(id));

    this.hoverFrame = scene.add.graphics();
    this.hoverFrame.setDepth(100);
    this.hoverFrame.setVisible(false);
    this.add(this.hoverFrame);

    this.createGroupItems();
    scene.add.existing(this);
  }

  private createGroupItems() {
    this.items.forEach((item, index) => {
      const col = index % this.groupConfig.columns;
      const row = Math.floor(index / this.groupConfig.columns);

      const posX = col * this.groupConfig.spacingX;
      const posY = row * this.groupConfig.spacingY;

      const hasAlt = !!item.altTexture;
      const sprite = this.scene.add.sprite(posX, posY, item.texture, item.frame);
      sprite.setScale(this.groupConfig.scale);

      this.add(sprite);
      this.sprites.set(item.id, sprite);

      if (!hasAlt) {
        const overlay = this.scene.add.image(posX, posY, this.groupConfig.selectedOverlayTexture);
        overlay.setScale(this.groupConfig.scale);
        this.add(overlay);
        this.overlays.set(item.id, overlay);
      }

      const halfW = sprite.displayWidth > 0 ? (sprite.displayWidth / 2) : (16 * this.groupConfig.scale);
      const halfH = sprite.displayHeight > 0 ? (sprite.displayHeight / 2) : (16 * this.groupConfig.scale);

      const disabledOverlay = this.scene.add.image(0, 0, "silver_cross_circle_small");
      disabledOverlay.setScale(this.groupConfig.scale);
      disabledOverlay.setVisible(false);
      const badgeHalf = 7 * this.groupConfig.scale;
      disabledOverlay.setPosition(posX + halfW - badgeHalf, posY + halfH - badgeHalf);
      this.add(disabledOverlay);
      this.disabledOverlays.set(item.id, disabledOverlay);

      sprite.on("pointerover", () => {
        if (this.disabledIds.has(item.id)) return;
        sprite.setScale(this.groupConfig.scale * 1.15);
        const overlay = this.overlays.get(item.id);
        if (overlay) overlay.setScale(this.groupConfig.scale * 1.15);
        
        if (!this.selectedIds.has(item.id)) {
          sprite.setAlpha(1.0);
        }

        this.showHoverEffect(sprite);
        if (this.groupConfig.sfxHover) {
          this.scene.game.events.emit("playSound", this.groupConfig.sfxHover);
        }
      });

      sprite.on("pointerout", () => {
        if (this.disabledIds.has(item.id)) return;
        sprite.setScale(this.groupConfig.scale);
        const overlay = this.overlays.get(item.id);
        if (overlay) overlay.setScale(this.groupConfig.scale);
        this.hoverFrame.setVisible(false);

        if (!this.selectedIds.has(item.id)) {
          sprite.setAlpha(0.70);
        }
      });

      sprite.on("pointerdown", () => {
        if (this.disabledIds.has(item.id)) return;
        this.toggleItem(item);
      });

      this.updateItemVisual(item.id);
    });
  }

  private updateItemVisual(id: string) {
    const sprite = this.sprites.get(id);
    if (!sprite) return;
    const item = this.items.find((i) => i.id === id);
    if (!item) return;

    const isSelected = this.selectedIds.has(id);
    const isDisabled = this.disabledIds.has(id);
    const hasAlt = !!item.altTexture;
    const disabledOverlay = this.disabledOverlays.get(id);

    sprite.clearTint();
    if (sprite.postFX) {
      sprite.postFX.clear();
    }

    if (isDisabled) {
      if (disabledOverlay) disabledOverlay.setVisible(true);
      sprite.disableInteractive();
      sprite.setAlpha(0.50);
      if (hasAlt) {
        sprite.setTexture(item.texture, item.frame);
      } else {
        const overlay = this.overlays.get(id);
        if (overlay) overlay.setVisible(false);
      }
    } else {
      if (disabledOverlay) disabledOverlay.setVisible(false);
      sprite.setInteractive({ useHandCursor: true });
      if (isSelected) {
        sprite.setAlpha(1.0);
        if (hasAlt) {
          sprite.setTexture(item.altTexture!, item.altFrame);
        } else {
          const overlay = this.overlays.get(id);
          if (overlay) {
            overlay.setVisible(true);
            overlay.setAlpha(1.0);
          }
        }
      } else {
        sprite.setAlpha(0.70);
        if (hasAlt) {
          sprite.setTexture(item.texture, item.frame);
        } else {
          const overlay = this.overlays.get(id);
          if (overlay) overlay.setVisible(false);
        }
      }
    }
  }

  private toggleItem(item: ToggleItemConfig) {
    if (this.disabledIds.has(item.id)) return;
    const isCurrentlySelected = this.selectedIds.has(item.id);
    let newState = !isCurrentlySelected;

    if (!this.groupConfig.multiSelect) {
      const prevIds = Array.from(this.selectedIds);
      this.selectedIds.clear();
      prevIds.forEach((id) => this.updateItemVisual(id));
    }

    if (newState) {
      this.selectedIds.add(item.id);
      if (this.groupConfig.sfxChecked) {
        this.scene.game.events.emit("playSound", this.groupConfig.sfxChecked);
      }
    } else {
      this.selectedIds.delete(item.id);
      if (this.groupConfig.sfxUnchecked) {
        this.scene.game.events.emit("playSound", this.groupConfig.sfxUnchecked);
      }
    }
    this.updateItemVisual(item.id);

    this.scene.events.emit("ui:toggle-changed", {
      groupId: this.groupConfig.id,
      selectedIds: Array.from(this.selectedIds),
      changedId: item.id,
      selected: newState,
    });
  }

  private showHoverEffect(target: Phaser.GameObjects.Sprite) {
    const bounds = target.getBounds();
    const padding = 3;
    const radius = 5;

    const localX = target.x - bounds.width / 2 - padding;
    const localY = target.y - bounds.height / 2 - padding;
    const width = bounds.width + padding * 2;
    const height = bounds.height + padding * 2;

    this.hoverFrame.clear();
    this.hoverFrame.lineStyle(2, 0xe9cd45, 0.95);
    this.hoverFrame.strokeRoundedRect(localX, localY, width, height, radius);
    this.hoverFrame.setVisible(true);
  }

  public setDisabledIds(disabledIds: string[]) {
    this.disabledIds = new Set(disabledIds);
    this.items.forEach((item) => this.updateItemVisual(item.id));
  }

  public getSelectedIds(): string[] {
    return Array.from(this.selectedIds);
  }

  public clearSelection() {
    this.selectedIds.clear();
    this.items.forEach((item) => this.updateItemVisual(item.id));
  }

  public selectId(id: string) {
    const item = this.items.find((i) => i.id === id);
    if (item && !this.selectedIds.has(id)) {
      this.toggleItem(item);
    }
  }

  public deselectId(id: string) {
    const item = this.items.find((i) => i.id === id);
    if (item && this.selectedIds.has(id)) {
      this.toggleItem(item);
    }
  }
}
