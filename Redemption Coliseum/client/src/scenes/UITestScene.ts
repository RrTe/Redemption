// src/scenes/UITestScene.ts
//import { ActionIcon } from "../ui/components/ActionIcon";
import type { ActionIconConfig } from "../ui/types";
import { RadialMenu } from "../ui/components/RadialMenu";

export class UITestScene extends Phaser.Scene {
  constructor() {
    super("UITestScene");
  }

  preload() {
    this.load.image("icon_discard", "/assets/ui/icons/icon_discard.png");
    this.load.image("icon_look", "/assets/ui/icons/icon_look.png");
    this.load.image("icon_reveal", "/assets/ui/icons/icon_reveal.png");
    this.load.image("icon_search", "/assets/ui/icons/icon_search.png");
    this.load.image("icon_shuffle", "/assets/ui/icons/icon_shuffle.png");
    this.load.audio("menu_open", "assets/sounds/effects/menu/open.mp3");
    this.load.audio("menu_hover", "assets/sounds/effects/menu/hover.mp3");
    this.load.audio("menu_select", "assets/sounds/effects/menu/select.mp3");
  }

  create() {
    /*const icon = new ActionIcon(this, 400, 300, {
      iconKey: "icon_draw",
      actionKey: "draw",
      callback: () => console.log("Draw clicked"),
    });*/
    //const baseScale = Math.min(this.scale.width, this.scale.height) / 1000;

    const configs: ActionIconConfig[] = [
      {
        iconKey: "icon_discard",
        actionKey: "discard",
        callback: () => console.log("Discard"),
      },
      {
        iconKey: "icon_look",
        actionKey: "look",
        callback: () => console.log("Look"),
      },
      {
        iconKey: "icon_reveal",
        actionKey: "reveal",
        callback: () => console.log("Reveal"),
      },
      {
        iconKey: "icon_search",
        actionKey: "search",
        callback: () => console.log("Search"),
      },
      {
        iconKey: "icon_shuffle",
        actionKey: "shuffle",
        callback: () => console.log("Shuffle"),
      },
    ];

    const menu = new RadialMenu(this, 400, 300, 100, configs);
  }
}
