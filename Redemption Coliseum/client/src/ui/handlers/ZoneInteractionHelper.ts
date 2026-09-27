import Phaser from "phaser";
import { type ElementManager } from "../managers/ElementManager.js";
import { CardUI } from "../CardUI.js";
import { PileUI } from "../PileUI.js";
import { StackedPileUI } from "../StackedPileUI.js";
import { ZONES } from "../../../../shared/zones.js";

/**
 * Checks whether any game object in the list is a card or a pile.
 *
 * @param objects Array of game objects to inspect.
 * @returns True if at least one card or pile is present.
 */
export function hasCardOrPile(
  objects: Phaser.GameObjects.GameObject[],
): boolean {
  return objects.some(
    (go) =>
      go instanceof CardUI ||
      go instanceof PileUI ||
      go instanceof StackedPileUI,
  );
}

/**
 * Identifies if an interactive target zone is under the given pointer.
 *
 * @param hitObjects Directly tested interactive objects.
 * @param pointer Active pointer for bounding box fallback.
 * @param elementManager Element manager containing zone elements.
 * @returns Matching zone object or undefined.
 */
export function findTargetZone(
  hitObjects: Phaser.GameObjects.GameObject[],
  pointer: Phaser.Input.Pointer,
  elementManager: ElementManager,
): Phaser.GameObjects.Zone | undefined {
  const isTarget = (go: any): boolean =>
    go instanceof Phaser.GameObjects.Zone &&
    (go.name === ZONES.TERRITORY || go.name === ZONES.LAND_OF_BONDAGE);

  const hitZone = hitObjects.find(isTarget) as
    | Phaser.GameObjects.Zone
    | undefined;
  if (hitZone) return hitZone;

  if (elementManager?.zoneElements) {
    const {
      playerTerritoryZone,
      playerLandOfBondageZone,
      opponentTerritoryZone,
      opponentLandOfBondageZone,
    } = elementManager.zoneElements;

    const candidates = [
      playerTerritoryZone,
      playerLandOfBondageZone,
      opponentTerritoryZone,
      opponentLandOfBondageZone,
    ];

    return candidates.find(
      (cand) =>
        cand &&
        cand.getBounds &&
        cand.getBounds().contains(pointer.x, pointer.y),
    );
  }

  return undefined;
}

/**
 * Resolves the display label for a target zone.
 *
 * @param zone Target zone.
 * @param elementManager Element manager containing zone elements.
 * @param sessionId Current client session ID.
 * @returns Display label for the zone highlight.
 */
export function getZoneLabel(
  zone: Phaser.GameObjects.Zone,
  elementManager: ElementManager,
  sessionId: string,
): string {
  const {
    playerTerritoryZone,
    playerLandOfBondageZone,
    opponentTerritoryZone,
    opponentLandOfBondageZone,
  } = elementManager.zoneElements;

  if (zone === playerTerritoryZone) return "My Territory";
  if (zone === opponentTerritoryZone) return "Opponent Territory";
  if (zone === playerLandOfBondageZone) return "My Land of Bondage";
  if (zone === opponentLandOfBondageZone) return "Opponent Land of Bondage";

  const isMe = zone.getData("ownerId") === sessionId;
  if (zone.name === ZONES.TERRITORY) {
    return isMe ? "My Territory" : "Opponent Territory";
  }
  if (zone.name === ZONES.LAND_OF_BONDAGE) {
    return isMe ? "My Land of Bondage" : "Opponent Land of Bondage";
  }
  return "";
}
