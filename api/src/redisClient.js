const Redis = require("redis");

const redis = Redis.createClient({
  url: `redis://${process.env.REDIS_HOST}:${process.env.REDIS_PORT}`,
});

redis.on("error", (err) => console.error("❌ Redis Client Error", err));

async function connectRedis() {
  if (!redis.isOpen) {
    await redis.connect();
    console.log("✅ Connected to Redis");
  }
  return redis;
}

module.exports = { redis, connectRedis };
