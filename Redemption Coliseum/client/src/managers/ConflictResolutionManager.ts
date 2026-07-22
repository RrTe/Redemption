export type ConflictAction = 
  | "skip" 
  | "update_keep_stats" 
  | "update_reset_stats"
  | "skip_all"
  | "update_keep_stats_all"
  | "update_reset_stats_all";

export class ConflictResolutionManager {
  /**
   * Prompts the user via an HTML overlay to resolve a conflict when a newer deck file is found.
   * 
   * @param filename The name of the deck file
   * @returns A promise that resolves to the chosen ConflictAction
   */
  public static async promptUser(filename: string): Promise<ConflictAction> {
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
      dialog.style.maxWidth = "400px";

      // Title
      const title = document.createElement("h3");
      title.innerText = "Deck Update Detected";
      title.style.marginTop = "0";
      title.style.color = "#ffd700";

      // Message
      const message = document.createElement("p");
      message.innerText = `The deck '${filename}' has been modified externally. Do you want to update it in the Coliseum?`;

      // Checkbox: Reset Stats
      const statsLabel = document.createElement("label");
      statsLabel.style.display = "block";
      statsLabel.style.marginTop = "15px";
      statsLabel.style.cursor = "pointer";
      
      const statsCheckbox = document.createElement("input");
      statsCheckbox.type = "checkbox";
      statsCheckbox.style.marginRight = "10px";
      
      statsLabel.appendChild(statsCheckbox);
      statsLabel.appendChild(document.createTextNode("Reset stats (Wins/Losses)?"));

      // Checkbox: Bulk Action
      const bulkLabel = document.createElement("label");
      bulkLabel.style.display = "block";
      bulkLabel.style.marginTop = "10px";
      bulkLabel.style.marginBottom = "20px";
      bulkLabel.style.cursor = "pointer";
      
      const bulkCheckbox = document.createElement("input");
      bulkCheckbox.type = "checkbox";
      bulkCheckbox.style.marginRight = "10px";
      
      bulkLabel.appendChild(bulkCheckbox);
      bulkLabel.appendChild(document.createTextNode("Apply to all future conflicts (Bulk action)"));

      // Buttons container
      const btnContainer = document.createElement("div");
      btnContainer.style.display = "flex";
      btnContainer.style.justifyContent = "space-between";

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
        const resetStats = statsCheckbox.checked;
        const bulk = bulkCheckbox.checked;
        
        let action: ConflictAction;
        if (bulk) {
          action = resetStats ? "update_reset_stats_all" : "update_keep_stats_all";
        } else {
          action = resetStats ? "update_reset_stats" : "update_keep_stats";
        }
        
        document.body.removeChild(overlay);
        resolve(action);
      };

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
        const bulk = bulkCheckbox.checked;
        document.body.removeChild(overlay);
        resolve(bulk ? "skip_all" : "skip");
      };

      btnContainer.appendChild(skipBtn);
      btnContainer.appendChild(updateBtn);

      dialog.appendChild(title);
      dialog.appendChild(message);
      dialog.appendChild(statsLabel);
      dialog.appendChild(bulkLabel);
      dialog.appendChild(btnContainer);

      overlay.appendChild(dialog);
      document.body.appendChild(overlay);
    });
  }
}
