require("dotenv").config();
const express = require("express");
const { handlePostLead, getLeadById } = require("./leads");
const { connectRedis, redis } = require("./redisClient");
const webhookRoute = require("./webhook");

const app = express();
app.use(express.json());
// webhook route
app.use("/webhook", webhookRoute);

// middleware pentru rate limiting simplu
app.use(async (req, res, next) => {
  const ip = req.ip;
  const limit = 10; // max 10 requests/min
  const ttl = 60;

  await connectRedis();

  const key = `rate:${ip}`;
  const count = await redis.incr(key);
  if (count === 1) await redis.expire(key, ttl);

  if (count > limit) {
    return res.status(429).json({ error: "Too many requests, slow down." });
  }
  next();
});

app.get("/health", (res) => res.json({ status: "ok" }));

// endpoint cu caching
app.post("/leads", async (req, res) => {
  try {
    await connectRedis();

    const cacheKey = `lead:${req.body.email}`;
    const cached = await redis.get(cacheKey);

    if (cached) {
      console.log("📦 Returned cached lead:", req.body.email);
      return res.json(JSON.parse(cached));
    }

    const response = await handlePostLead(req, res);

    if (response?.id) {
      await redis.setEx(cacheKey, 60, JSON.stringify(response)); // cache 1 minut
      console.log("💾 Cached new lead:", req.body.email);
    }
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

// endpoint cu caching individual
app.get("/leads/:id", async (req, res) => {
  try {
    await getLeadById(req, res);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Internal server error" });
  }
});

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`API listening on port ${port}`);
});
