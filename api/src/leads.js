const pool = require("./db");
const redisClient = require("./redisClient");
const { publishLead } = require("./rabbit");
const {
  findKey,
  createKey,
  updateKeySuccess,
  updateKeyFailed,
} = require("./idempotency");
const { checkRateLimit } = require("./rateLimiter");
const validator = require("validator");
const crypto = require("crypto");

async function handlePostLead(req, res) {
  const ip = req.ip;
  const idempotencyKey = req.header("Idempotency-Key");
  const body = req.body;

  // Rate limit
  const allowed = await checkRateLimit(ip);
  if (!allowed) return res.status(429).json({ error: "Rate limit exceeded" });

  // Idempotency logic
  if (!idempotencyKey) {
    return res.status(400).json({ error: "Missing Idempotency-Key header" });
  }

  const existing = await findKey(idempotencyKey);
  if (existing && existing.status === "succeeded") {
    return res.status(200).json(existing.response);
  } else if (existing && existing.status === "processing") {
    return res.status(202).json({ message: "Processing in progress" });
  }

  const requestHash = crypto
    .createHash("sha256")
    .update(JSON.stringify(body))
    .digest("hex");
  const created = await createKey(idempotencyKey, requestHash);
  if (!created) {
    const again = await findKey(idempotencyKey);
    if (again && again.response) {
      return res.status(200).json(again.response);
    }
    return res
      .status(409)
      .json({ error: "Duplicate idempotency key in progress" });
  }

  // Validate fields
  const { email, phone, name, source } = body;
  if (!email || !validator.isEmail(email)) {
    await updateKeyFailed(idempotencyKey, { error: "Invalid email" });
    return res.status(400).json({ error: "Invalid email" });
  }

  try {
    const insert = await pool.query(
      `INSERT INTO leads (email, phone, name, source)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT (email)
       DO UPDATE SET phone=EXCLUDED.phone, name=EXCLUDED.name, source=EXCLUDED.source
       RETURNING id, email, phone, name, source, status`,
      [email, phone, name, source]
    );

    const lead = insert.rows[0];
    await publishLead(lead.id);

    const response = {
      id: lead.id,
      email,
      phone,
      name,
      source,
      status: lead.status,
    };
    await updateKeySuccess(idempotencyKey, lead.id, response);

    return res.status(201).json(response);
  } catch (err) {
    console.error("DB error:", err.message, err.stack);
    await updateKeyFailed(idempotencyKey, { error: "Database error" });
    return res.status(500).json({ error: "Database error" });
  }
}

async function getLeadById(req, res) {
  const id = req.params.id;
  try {
    // conectare Redis (dacă nu e deschis)
    const { redis } = redisClient;

    const cacheKey = `lead:${id}`;
    const cached = await redis.get(cacheKey);
    if (cached) {
      console.log(`⚡ Cache hit for ${cacheKey}`);
      return res.json(JSON.parse(cached));
    }

    console.log(`🐢 Cache miss for ${cacheKey} — querying PostgreSQL...`);
    const { rows } = await pool.query(
      `SELECT id, email, phone, name, source, company, status, created_at, updated_at
       FROM leads WHERE id = $1`,
      [id]
    );
    if (rows.length === 0) {
      return res.status(404).json({ error: "Lead not found" });
    }

    const lead = rows[0];
    // cache 60 sec
    await redis.setEx(cacheKey, 60, JSON.stringify(lead));
    console.log(`💾 Cached lead ${cacheKey} for 60 seconds`);
    return res.json(lead);
  } catch (err) {
    console.error("GET /leads/:id error", err);
    return res.status(500).json({ error: "Internal server error" });
  }
}

module.exports = {
  handlePostLead,
  getLeadById,
};
