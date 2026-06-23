import { type DialogOptions, type BaseDialog } from "./BaseDialog";
import { AlertDialog } from "./AlertDialog";
import { DeckURLDialog } from "./DeckURLDialog";
import { UnsavedChangesDialog } from "./UnsavedChangesDialog";

/**
 * Global manager responsible for coordinating overlay dialog instances.
 * Prevents visual overlapping by dismissing active modals when new ones open.
 */
export class NotificationManager {
  private activeDialog: BaseDialog | null = null;

  /**
   * Displays an error alert overlay dialog (Red border, Red title).
   *
   * Args:
   *   title: Header title of the error modal.
   *   message: Body description explaining the error.
   *   options: Optional configurations like duration and callbacks.
   *
   * Returns:
   *   The spawned AlertDialog instance.
   */
  public showError(title: string, message: string, options?: DialogOptions): AlertDialog {
    const dialog = new AlertDialog(title, message, "error", options);
    this.present(dialog);
    return dialog;
  }

  /**
   * Displays a warning alert overlay dialog (Orange border, Orange title).
   *
   * Args:
   *   title: Header title of the warning modal.
   *   message: Body description explaining the warning.
   *   options: Optional configurations like duration and callbacks.
   *
   * Returns:
   *   The spawned AlertDialog instance.
   */
  public showWarning(title: string, message: string, options?: DialogOptions): AlertDialog {
    const dialog = new AlertDialog(title, message, "warning", options);
    this.present(dialog);
    return dialog;
  }

  /**
   * Displays an information alert overlay dialog (Gold border, Gold title).
   *
   * Args:
   *   title: Header title of the info modal.
   *   message: Body description explaining the message.
   *   options: Optional configurations like duration and callbacks.
   *
   * Returns:
   *   The spawned AlertDialog instance.
   */
  public showInfo(title: string, message: string, options?: DialogOptions): AlertDialog {
    const dialog = new AlertDialog(title, message, "info", options);
    this.present(dialog);
    return dialog;
  }

  /**
   * Displays the custom deck sharing copy dialog overlay.
   *
   * Args:
   *   deckURLString: The URL to copy.
   *   options: Optional configurations.
   *
   * Returns:
   *   The spawned DeckURLDialog instance.
   */
  public showDeckShare(deckURLString: string, options?: DialogOptions): DeckURLDialog {
    const dialog = new DeckURLDialog(deckURLString, options);
    this.present(dialog);
    return dialog;
  }

  /**
   * Displays the unsaved changes warning dialog overlay.
   *
   * Args:
   *   callbacks: Triggers for JSON save, Lackey save, and discard.
   *
   * Returns:
   *   The spawned UnsavedChangesDialog instance.
   */
  public showUnsavedChanges(callbacks: {
    onSaveJSON: () => void;
    onSaveLackey: () => void;
    onDiscard: () => void;
  }): UnsavedChangesDialog {
    const dialog = new UnsavedChangesDialog(callbacks);
    this.present(dialog);
    return dialog;
  }

  /**
   * Orchestrates the active dialog swap, dismissing any prior modals.
   *
   * Args:
   *   dialog: The new BaseDialog to present.
   *
   * Returns:
   *   None.
   */
  private present(dialog: BaseDialog): void {
    if (this.activeDialog) {
      this.activeDialog.destroy();
    }

    this.activeDialog = dialog;

    // Hook to clear tracking when the dialog is dismissed/destroyed
    const originalDismiss = dialog.dismiss.bind(dialog);
    dialog.dismiss = () => {
      if (this.activeDialog === dialog) {
        this.activeDialog = null;
      }
      originalDismiss();
    };

    const originalDestroy = dialog.destroy.bind(dialog);
    dialog.destroy = () => {
      if (this.activeDialog === dialog) {
        this.activeDialog = null;
      }
      originalDestroy();
    };

    dialog.show();
  }

  /**
   * Forces the dismissal of any currently active dialog overlay.
   *
   * Args:
   *   None.
   *
   * Returns:
   *   None.
   */
  public dismissActive(): void {
    if (this.activeDialog) {
      this.activeDialog.dismiss();
    }
  }
}
