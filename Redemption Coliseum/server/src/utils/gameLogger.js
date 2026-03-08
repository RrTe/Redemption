const { Redis } = require("@upstash/redis");

const redis = new Redis({
  url: process.env.UPSTASH_URL,
  token: process.env.UPSTASH_TOKEN,
});

async function logGameEvent(type) {
  try {
    const date = new Date().toISOString().split("T")[0];
    await redis.incr(`games:${type}:${date}`);
  } catch (err) {
    console.error("Redis logging failed:", err);
  }
}

module.exports = { logGameEvent };
