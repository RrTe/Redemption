import Phaser from "phaser";
import { EditorArea } from "./EditorArea";
import { VerticalCardScrollList } from "../components/VerticalCardScrollList";

export class EditorAreaSearch extends EditorArea {
  private scrollList: VerticalCardScrollList | null = null;
  private searchArrowUp: Phaser.GameObjects.Image | null = null;
  private searchArrowDown: Phaser.GameObjects.Image | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    radius: number,
    depth: number,
    searchArrowUp: Phaser.GameObjects.Image | null = null,
    searchArrowDown: Phaser.GameObjects.Image | null = null
  ) {
    super(scene, x, y, width, height, radius, depth);

    this.searchArrowUp = searchArrowUp;
    this.searchArrowDown = searchArrowDown;

    // Enable interaction within search bounds
    this.graphics.setInteractive(
      new Phaser.Geom.Rectangle(x, y, width, height),
      Phaser.Geom.Rectangle.Contains
    );
  }

  public setScrollList(list: VerticalCardScrollList) {
    this.scrollList = list;
  }

  /**
   * Translates wheel scroll delta to scroll steps in the list.
   */
  public setupWheelHandling() {
    this.graphics.on("wheel", (
      pointer: Phaser.Input.Pointer,
      deltaX: number,
      deltaY: number
    ) => {
      if (this.scrollList) {
        this.scrollList.scroll(deltaY);
        this.scrollList.updateScrollIndicators(
          this.searchArrowUp ?? undefined,
          this.searchArrowDown ?? undefined
        );
      }
    });
  }
}
