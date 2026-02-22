const winston = require("winston");

const logger = winston.createLogger({
  level: process.env.LOG_LEVEL || "info",
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.colorize(),
    winston.format.printf((info) => {
      // Alle Felder außer timestamp, level, message als Metadaten ausgeben
      const { timestamp, level, message, ...meta } = info;
      const metaString = Object.keys(meta).length ? JSON.stringify(meta) : "";
      return `${timestamp} [${level}] ${message}${metaString ? " " + metaString : ""}`;
    })
  ),
  transports: [
    new winston.transports.Console(),
    // später könnte man noch File-Logs ergänzen
  ],
});

module.exports = logger;
