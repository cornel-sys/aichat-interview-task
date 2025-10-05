const Redis = require("ioredis");
const redis = new Redis({
  host: process.env.REDIS_HOST,
  port: process.env.REDIS_PORT,
});

const WINDOW = parseInt(process.env.RATE_LIMIT_WINDOW || "60", 10);
const LIMIT = parseInt(process.env.RATE_LIMIT_MAX || "10", 10);

async function checkRateLimit(ip) {
  const key = `rate:POST:/leads:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) {
    await redis.expire(key, WINDOW);
  }
  if (count > LIMIT) {
    return false;
  }
  return true;
}

module.exports = { checkRateLimit };
