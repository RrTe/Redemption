export type DialogSeverity = "info" | "warning" | "error";

export interface DialogOptions {
  duration?: number;
  onDismiss?: () => void;
}

/**
 * Base class representing a reusable HTML overlay modal dialog.
 * Handles the common backdrop, modal container styling, dismiss logic,
 * keyboard listeners, and auto-dismiss timers.
 */
export class BaseDialog {
  protected backdrop: HTMLDivElement | null = null;
  protected panel: HTMLDivElement | null = null;
  protected severity: DialogSeverity;
  protected options: DialogOptions;
  private timeoutId: number | null = null;

  /**
   * Initializes the BaseDialog instance.
   *
   * Args:
   *   severity: The visual priority tier ('info', 'warning', 'error').
   *   options: Config options including optional auto-dismiss duration and callback.
   *
   * Returns:
   *   None.
   */
  constructor(severity: DialogSeverity, options: DialogOptions = {}) {
    this.severity = severity;
    this.options = options;
  }

  /**
   * Spawns the dialog overlay and adds it to the document body.
   * Also sets up input listeners and timers.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   None.
   */
  public show(): void {
    // Dismiss any existing backdrop of the same type if open
    this.destroy();

    this.backdrop = document.createElement("div");
    this.backdrop.className = "dialog-backdrop";

    // Setup input block and click backdrop to close
    this.backdrop.onclick = (e: MouseEvent) => {
      if (e.target === this.backdrop) {
        this.dismiss();
      }
    };

    // Prevent pointer events from bubbling down to Phaser canvas
    const stopPropagation = (e: Event) => e.stopPropagation();
    this.backdrop.onmousedown = stopPropagation;
    this.backdrop.onmouseup = stopPropagation;
    this.backdrop.onpointerdown = stopPropagation;
    this.backdrop.onpointerup = stopPropagation;
    this.backdrop.addEventListener("wheel", stopPropagation, { passive: false });

    // Setup modal panel container
    this.panel = document.createElement("div");
    this.panel.className = `dialog-panel dialog-panel-${this.severity}`;
    this.panel.onclick = stopPropagation;

    this.backdrop.appendChild(this.panel);

    // Setup top-right cross icon close button
    const closeCross = document.createElement("input");
    closeCross.type = "image";
    closeCross.className = "dialog-close-cross";
    closeCross.src = "/assets/deck-editor/symbols/cross_circle_small_compressed.png";
    closeCross.onclick = (e: MouseEvent) => {
      e.stopPropagation();
      this.dismiss();
    };
    this.panel.appendChild(closeCross);

    // Render custom content via concrete subclasses
    this.renderContent();

    document.body.appendChild(this.backdrop);

    // Setup ESC key listener
    window.addEventListener("keydown", this.handleKeyDown);

    // Setup auto-dismiss timeout if duration is provided
    if (this.options.duration && this.options.duration > 0) {
      this.timeoutId = window.setTimeout(() => {
        this.dismiss();
      }, this.options.duration);
    }
  }

  /**
   * Initiates a smooth fade-out and removes the dialog components from the DOM.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   None.
   */
  public dismiss(): void {
    if (!this.backdrop) return;

    // Trigger smooth CSS fade-out transition
    this.backdrop.classList.add("dialog-dismissed");

    let isDestroyed = false;
    const cleanup = () => {
      if (isDestroyed) return;
      isDestroyed = true;
      this.destroy();
    };

    // Wait for the transition to finish before absolute removal from DOM
    this.backdrop.addEventListener("transitionend", cleanup, { once: true });
    
    // Safety fallback: if no stylesheet exists, destroy immediately after a short delay
    window.setTimeout(cleanup, 250);
  }


  /**
   * Abstract/virtual hook for child classes to populate custom HTML elements.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   None.
   */
  protected renderContent(): void {
    // To be implemented by subclasses
  }

  /**
   * Listener callback to intercept ESC key events and close the dialog.
   * Bound to the instance scope.
   *
   * Args:
   *   e: The KeyboardEvent object.
   *
   * Returns:
   *   None.
   */
  private handleKeyDown = (e: KeyboardEvent): void => {
    if (e.key === "Escape") {
      this.dismiss();
    }
  };

  /**
   * Cleans up DOM elements, event listeners, and timers.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   None.
   */
  public destroy(): void {
    if (this.timeoutId) {
      window.clearTimeout(this.timeoutId);
      this.timeoutId = null;
    }

    window.removeEventListener("keydown", this.handleKeyDown);

    if (this.backdrop && this.backdrop.parentNode) {
      this.backdrop.parentNode.removeChild(this.backdrop);
    }

    this.backdrop = null;
    this.panel = null;

    if (this.options.onDismiss) {
      this.options.onDismiss();
      // Nullify callback to prevent double invocations
      this.options.onDismiss = undefined;
    }
  }
}
