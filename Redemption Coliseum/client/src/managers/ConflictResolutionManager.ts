import { DECK_VALIDATION_RULES } from "../../../shared/deck-validation-rules.js";

export type ConflictAction = 
  | "skip" 
  | "update_keep_stats" 
  | "update_reset_stats"
  | "skip_all"
  | "update_keep_stats_all"
  | "update_reset_stats_all"
  | "import";

export interface ImportPromptResult {
  action: ConflictAction;
  format: string;
  bulkApply: boolean;
}

export class ConflictResolutionManager {
  /**
   * Prompts the user via an HTML overlay to select a format and resolve conflicts (if any).
   * 
   * @param filename The name of the deck file
   * @param isConflict Whether an overwrite conflict exists for this deck
   * @param defaultFormat Optional default format key
   * @returns A promise that resolves to an ImportPromptResult
   */
  public static async promptUser(
    filename: string,
    isConflict: boolean = true,
    defaultFormat?: string
  ): Promise<ImportPromptResult> {
    return new Promise((resolve) => {
      // Create overlay container
      const overlay = document.createElement("div");
      overlay.style.position = "fixed";
      overlay.style.top = "0";
      overlay.style.left = "0";
      overlay.style.width = "100vw";
      overlay.style.height = "100vh";
      overlay.style.backgroundColor = "rgba(0, 0, 0, 0.8)";
      overlay.style.display = "flex";
      overlay.style.justifyContent = "center";
      overlay.style.alignItems = "center";
      overlay.style.zIndex = "9999";

      // Create dialog box
      const dialog = document.createElement("div");
      dialog.style.backgroundColor = "#1e1e2f";
      dialog.style.border = "2px solid #ffd700";
      dialog.style.borderRadius = "8px";
      dialog.style.padding = "20px";
      dialog.style.color = "white";
      dialog.style.fontFamily = "sans-serif";
      dialog.style.maxWidth = "420px";
      dialog.style.width = "90%";

      // Title
      const title = document.createElement("h3");
      title.innerText = isConflict ? "Deck Update Detected" : "Import Deck Format";
      title.style.marginTop = "0";
      title.style.color = "#ffd700";

      // Message
      const message = document.createElement("p");
      message.innerText = isConflict
        ? `The deck '${filename}' already exists in your library. Choose format and overwrite options:`
        : `Select the format for imported deck '${filename}':`;

      // --- Format & Options Section ---
      const formatFieldset = document.createElement("fieldset");
      formatFieldset.style.border = "1px solid #444";
      formatFieldset.style.borderRadius = "6px";
      formatFieldset.style.padding = "10px 14px";
      formatFieldset.style.marginTop = "10px";
      formatFieldset.style.marginBottom = "10px";

      const formatLegend = document.createElement("legend");
      formatLegend.innerText = isConflict ? "Deck Format and Stats" : "Deck Format";
      formatLegend.style.color = "#ffd700";
      formatLegend.style.fontSize = "0.9em";
      formatFieldset.appendChild(formatLegend);

      const activeDefaultFormat = defaultFormat || DECK_VALIDATION_RULES.defaultFormat || "type_1";
      const availableFormats = Object.entries(DECK_VALIDATION_RULES.formats || {});
      
      let selectedFormat = activeDefaultFormat;

      if (availableFormats.length === 0) {
        // Fallback if rules formats are empty
        const fallbackLabel = document.createElement("label");
        fallbackLabel.innerText = "Type 1";
        formatFieldset.appendChild(fallbackLabel);
      } else {
        availableFormats.forEach(([formatKey, formatRule], index) => {
          const formatLabel = document.createElement("label");
          formatLabel.style.display = "block";
          formatLabel.style.marginBottom = "6px";
          formatLabel.style.cursor = "pointer";

          const radio = document.createElement("input");
          radio.type = "radio";
          radio.name = "deck_format_selection";
          radio.value = formatKey;
          radio.style.marginRight = "8px";
          if (formatKey === activeDefaultFormat || (index === 0 && !selectedFormat)) {
            radio.checked = true;
            selectedFormat = formatKey;
          }

          radio.onchange = () => {
            if (radio.checked) selectedFormat = formatKey;
          };

          const displayName = formatRule.displayName || formatKey;
          formatLabel.appendChild(radio);
          formatLabel.appendChild(document.createTextNode(displayName));
          formatFieldset.appendChild(formatLabel);
        });
      }

      // Reset Stats Option (if conflict)
      let statsCheckbox: HTMLInputElement | null = null;
      if (isConflict) {
        const statsLabel = document.createElement("label");
        statsLabel.style.display = "block";
        statsLabel.style.marginTop = "6px";
        statsLabel.style.marginBottom = "6px";
        statsLabel.style.cursor = "pointer";
        
        statsCheckbox = document.createElement("input");
        statsCheckbox.type = "checkbox";
        statsCheckbox.style.marginRight = "10px";
        
        statsLabel.appendChild(statsCheckbox);
        statsLabel.appendChild(document.createTextNode("Reset stats (Wins/Losses)?"));
        formatFieldset.appendChild(statsLabel);
      }

      // Horizontal Divider
      const divider = document.createElement("hr");
      divider.style.border = "none";
      divider.style.borderTop = "1px solid #444";
      divider.style.margin = "12px 0 10px 0";
      formatFieldset.appendChild(divider);

      // Single Unified Gold Bulk Checkbox
      const bulkLabel = document.createElement("label");
      bulkLabel.style.display = "block";
      bulkLabel.style.marginBottom = "4px";
      bulkLabel.style.cursor = "pointer";
      bulkLabel.style.color = "#ffd700";
      bulkLabel.style.fontWeight = "bold";
      
      const bulkCheckbox = document.createElement("input");
      bulkCheckbox.type = "checkbox";
      bulkCheckbox.style.marginRight = "10px";
      
      bulkLabel.appendChild(bulkCheckbox);
      bulkLabel.appendChild(document.createTextNode("Apply these choices to all remaining decks"));
      formatFieldset.appendChild(bulkLabel);

      // Buttons container
      const btnContainer = document.createElement("div");
      btnContainer.style.display = "flex";
      btnContainer.style.justifyContent = isConflict ? "space-between" : "flex-end";
      btnContainer.style.marginTop = "15px";

      if (isConflict) {
        // Skip Button
        const skipBtn = document.createElement("button");
        skipBtn.innerText = "Skip";
        skipBtn.style.padding = "8px 16px";
        skipBtn.style.backgroundColor = "#444";
        skipBtn.style.color = "white";
        skipBtn.style.border = "none";
        skipBtn.style.borderRadius = "4px";
        skipBtn.style.cursor = "pointer";

        skipBtn.onclick = () => {
          const bulkApply = bulkCheckbox.checked;
          document.body.removeChild(overlay);
          resolve({
            action: bulkApply ? "skip_all" : "skip",
            format: selectedFormat,
            bulkApply
          });
        };

        // Update Button
        const updateBtn = document.createElement("button");
        updateBtn.innerText = "Update";
        updateBtn.style.padding = "8px 16px";
        updateBtn.style.backgroundColor = "#ffd700";
        updateBtn.style.color = "#000";
        updateBtn.style.border = "none";
        updateBtn.style.borderRadius = "4px";
        updateBtn.style.cursor = "pointer";
        updateBtn.style.fontWeight = "bold";

        updateBtn.onclick = () => {
          const resetStats = statsCheckbox ? statsCheckbox.checked : false;
          const bulkApply = bulkCheckbox.checked;

          let action: ConflictAction;
          if (bulkApply) {
            action = resetStats ? "update_reset_stats_all" : "update_keep_stats_all";
          } else {
            action = resetStats ? "update_reset_stats" : "update_keep_stats";
          }

          document.body.removeChild(overlay);
          resolve({
            action,
            format: selectedFormat,
            bulkApply
          });
        };

        btnContainer.appendChild(skipBtn);
        btnContainer.appendChild(updateBtn);
      } else {
        // Single Confirm Button for non-conflict import
        const confirmBtn = document.createElement("button");
        confirmBtn.innerText = "Import";
        confirmBtn.style.padding = "8px 20px";
        confirmBtn.style.backgroundColor = "#ffd700";
        confirmBtn.style.color = "#000";
        confirmBtn.style.border = "none";
        confirmBtn.style.borderRadius = "4px";
        confirmBtn.style.cursor = "pointer";
        confirmBtn.style.fontWeight = "bold";

        confirmBtn.onclick = () => {
          const bulkApply = bulkCheckbox.checked;
          document.body.removeChild(overlay);
          resolve({
            action: "import",
            format: selectedFormat,
            bulkApply
          });
        };

        btnContainer.appendChild(confirmBtn);
      }

      dialog.appendChild(title);
      dialog.appendChild(message);
      dialog.appendChild(formatFieldset);
      dialog.appendChild(btnContainer);

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
    });
  }
}

