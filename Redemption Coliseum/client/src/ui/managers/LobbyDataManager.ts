import { DeckUtils, type DeckData } from "../../utils/DeckUtils";
import Phaser from "phaser";

export class LobbyDataManager {
  private _playerName: string;
  private _selectedDeck: DeckData = { main: [], reserve: [] };
  private readonly STORAGE_KEY = "redemption_player_name";

  constructor() {
    // Initialen Namen aus LocalStorage oder Zufall
    const savedName = localStorage.getItem(this.STORAGE_KEY);
    this._playerName = savedName || `Hero ${Phaser.Math.Between(100, 999)}`;
  }

  public get playerName(): string {
    return this._playerName;
  }

  public set playerName(name: string) {
    this._playerName = name;
    localStorage.setItem(this.STORAGE_KEY, name);
  }

  public get selectedDeck(): DeckData {
    return this._selectedDeck;
  }

  public set selectedDeck(deck: DeckData) {
    this._selectedDeck = deck;
  }

  /**
   * Extrahiert den aktuellen Namen aus einem HTML Input Element.
   */
  public updateNameFromInput(input: HTMLInputElement | null) {
    if (input && input.value) {
      this.playerName = input.value;
    }
  }

  public parseAndSetDeck(content: string, fileName: string): DeckData {
    const deck = DeckUtils.parseDeck(content, fileName);
    // Dateiendung entfernen
    deck.name = fileName.replace(/\.[^/.]+$/, "");
    this.selectedDeck = deck;
    return deck;
  }
}
