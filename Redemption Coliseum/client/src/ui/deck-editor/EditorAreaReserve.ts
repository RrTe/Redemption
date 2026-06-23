import Phaser from "phaser";
import { EditorArea } from "./EditorArea";

export class EditorAreaReserve extends EditorArea {
  private deckListView: any = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    depth: number
  ) {
    super(scene, x, y, width, height, radius, depth);

    // Make the graphics interactive for dropzone highlights and scroll wheel callbacks
    this.graphics.setInteractive(
      new Phaser.Geom.Rectangle(x, y, width, height),
      Phaser.Geom.Rectangle.Contains
    );
  }

  public setDeckListView(view: any) {
    this.deckListView = view;
  }

  /**
   * Sets up mouse wheel handling for scrolling the reserve deck list inside this area.
   */
  public setupWheelHandling() {
    this.graphics.on("wheel", (
      pointer: Phaser.Input.Pointer,
      deltaX: number,
      deltaY: number
    ) => {
      if (this.deckListView) {
        this.deckListView.scroll(pointer, deltaX, deltaY, 0, "Reserve");
      }
    });
  }
}
