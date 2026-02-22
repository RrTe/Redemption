import Phaser from "phaser";

export const DEBUG = localStorage.getItem("debug") === "true";

export const log = (context: string, ...args: any[]) => {
  if (DEBUG) {
    console.log(`[CLIENT DEBUG][${context}]`, ...args);
  }
};

export const warn = (context: string, ...args: any[]) => {
  if (DEBUG) {
    console.warn(`[CLIENT WARN][${context}]`, ...args);
  }
};

export const error = (context: string, ...args: any[]) => {
  if (DEBUG) {
    console.error(`[CLIENT ERROR][${context}]`, ...args);
  }
};
