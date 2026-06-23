export class Filter {
  private _id: string;
  private _attribute: string;
  private _values: string[] | null;
  private _alignments: string[] | null;
  private _active: boolean;

  /**
   * Constructs a new Filter instance.
   * @param id Unique identifier for the filter.
   * @param attribute The attribute name on the card to filter on.
   * @param values The matching values for this filter.
   * @param alignments The matching alignments for this filter.
   * @param active Whether this filter is active by default.
   */
  constructor(
    id: string,
    attribute: string,
    values: string[] | null,
    alignments: string[] | null,
    active: boolean = false
  ) {
    this._id = id;
    this._attribute = attribute;
    this._values = values;
    this._alignments = alignments;
    this._active = active;
  }

  public get id(): string {
    return this._id;
  }

  public get attribute(): string {
    return this._attribute;
  }

  public get values(): string[] | null {
    return this._values;
  }

  public get alignments(): string[] | null {
    return this._alignments;
  }

  public get active(): boolean {
    return this._active;
  }

  public set active(value: boolean) {
    this._active = value;
  }
}
