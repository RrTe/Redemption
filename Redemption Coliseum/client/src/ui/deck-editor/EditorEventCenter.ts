import Phaser from "phaser";

// Local scene-isolated event bus for all deck editor modules
export const editorEvents = new Phaser.Events.EventEmitter();
export default editorEvents;
