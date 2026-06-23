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
  private selectedIds: Set<string> = new Set();
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

    // Initialize initial selections
    this.groupConfig.initialSelectedIds.forEach((id) =>
      this.selectedIds.add(id),
    );

    // Create a graphics object for hover frames
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

      const isSelected = this.selectedIds.has(item.id);
      
      // If we use altTexture, swap texture, otherwise keep base texture and toggle overlay
      const hasAlt = !!item.altTexture;
      const textureKey = (isSelected && hasAlt) ? item.altTexture! : item.texture;
      const frameKey = (isSelected && hasAlt) ? item.altFrame : item.frame;

      const sprite = this.scene.add.sprite(posX, posY, textureKey, frameKey);
      sprite.setScale(this.groupConfig.scale);
      sprite.setInteractive({ useHandCursor: true });

      this.add(sprite);
      this.sprites.set(item.id, sprite);

      // Create selection overlay if no altTexture is specified
      if (!hasAlt) {
        const overlay = this.scene.add.image(posX, posY, this.groupConfig.selectedOverlayTexture);
        overlay.setScale(this.groupConfig.scale);
        overlay.setVisible(isSelected);
        this.add(overlay);
        this.overlays.set(item.id, overlay);
      }

      // Hover events
      sprite.on("pointerover", () => {
        sprite.setScale(this.groupConfig.scale * 1.15);
        
        const overlay = this.overlays.get(item.id);
        if (overlay) {
          overlay.setScale(this.groupConfig.scale * 1.15);
        }
        
        this.showHoverEffect(sprite);
        if (this.groupConfig.sfxHover) {
          this.scene.game.events.emit("playSound", this.groupConfig.sfxHover);
        }
      });

      sprite.on("pointerout", () => {
        sprite.setScale(this.groupConfig.scale);
        
        const overlay = this.overlays.get(item.id);
        if (overlay) {
          overlay.setScale(this.groupConfig.scale);
        }
        
        this.hoverFrame.setVisible(false);
      });

      sprite.on("pointerup", () => {
        this.toggleItem(item);
      });
    });
  }

  private toggleItem(item: ToggleItemConfig) {
    const isCurrentlySelected = this.selectedIds.has(item.id);
    let newState = !isCurrentlySelected;

    if (!this.groupConfig.multiSelect) {
      // Single-select mode: clear other selections
      this.selectedIds.clear();
      this.sprites.forEach((sprite, id) => {
        const matchingItem = this.items.find((i) => i.id === id);
        if (matchingItem) {
          if (matchingItem.altTexture) {
            sprite.setTexture(matchingItem.texture, matchingItem.frame);
          } else {
            const overlay = this.overlays.get(id);
            if (overlay) overlay.setVisible(false);
          }
        }
      });
    }

    const hasAlt = !!item.altTexture;
    if (newState) {
      this.selectedIds.add(item.id);
      
      if (hasAlt) {
        const sprite = this.sprites.get(item.id);
        if (sprite) {
          sprite.setTexture(item.altTexture!, item.altFrame);
        }
      } else {
        const overlay = this.overlays.get(item.id);
        if (overlay) overlay.setVisible(true);
      }

      if (this.groupConfig.sfxChecked) {
        this.scene.game.events.emit("playSound", this.groupConfig.sfxChecked);
      }
    } else {
      this.selectedIds.delete(item.id);
      
      if (hasAlt) {
        const sprite = this.sprites.get(item.id);
        if (sprite) {
          sprite.setTexture(item.texture, item.frame);
        }
      } else {
        const overlay = this.overlays.get(item.id);
        if (overlay) overlay.setVisible(false);
      }

      if (this.groupConfig.sfxUnchecked) {
        this.scene.game.events.emit("playSound", this.groupConfig.sfxUnchecked);
      }
    }

    // Emit event on the scene
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

    // Convert global bounds to container local coordinates
    const localX = target.x - bounds.width / 2 - padding;
    const localY = target.y - bounds.height / 2 - padding;
    const width = bounds.width + padding * 2;
    const height = bounds.height + padding * 2;

    this.hoverFrame.clear();
    // 0xe9cd45 is the golden hover border color
    this.hoverFrame.lineStyle(2, 0xe9cd45, 0.95);
    this.hoverFrame.strokeRoundedRect(localX, localY, width, height, radius);
    this.hoverFrame.setVisible(true);
  }

  public getSelectedIds(): string[] {
    return Array.from(this.selectedIds);
  }

  public clearSelection() {
    this.selectedIds.clear();
    this.sprites.forEach((sprite, id) => {
      const item = this.items.find((i) => i.id === id);
      if (item) {
        if (item.altTexture) {
          sprite.setTexture(item.texture, item.frame);
        } else {
          const overlay = this.overlays.get(id);
          if (overlay) overlay.setVisible(false);
        }
      }
    });
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
