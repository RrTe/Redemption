import { VerticalCardScrollList } from "../components/VerticalCardScrollList";

export class DeckScrollHandler {
  private scrollList: VerticalCardScrollList;

  constructor(scrollList: VerticalCardScrollList) {
    this.scrollList = scrollList;
  }

  /**
   * Forwards a scroll wheel input delta directly to the vertical card scroll list.
   */
  public handleWheel(deltaY: number) {
    this.scrollList.scroll(deltaY);
  }
}
