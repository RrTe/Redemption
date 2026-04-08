const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
});

/**
 * Loggt ein Spielereignis.
 * type: "started" oder "finished"
 * data: optionales Objekt, z.B. { startedAt, finishedAt, duration }
 */
async function logGameEvent(type, data = {}) {
  try {
    const date = new Date().toISOString().split("T")[0];

    // 1) Counter wie bisher
    await redis.incr(`games:${type}:${date}`);

    // 2) Falls zusätzliche Daten vorhanden sind → als JSON speichern
    if (Object.keys(data).length > 0) {
      await redis.lpush(
        `games:details:${date}`,
        JSON.stringify({
          type,
          ...data,
        }),
      );
    }
  } catch (err) {
    console.error("Redis logging failed:", err);
  }
}

module.exports = { logGameEvent };
