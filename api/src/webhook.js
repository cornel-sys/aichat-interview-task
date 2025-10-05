const express = require("express");
const crypto = require("crypto");
const pool = require("./db");

const router = express.Router();

function verifySignature(secret, payload, signature) {
  const hmac = crypto.createHmac("sha256", secret);
  hmac.update(JSON.stringify(payload));
  const digest = `sha256=${hmac.digest("hex")}`;
  return crypto.timingSafeEqual(Buffer.from(digest), Buffer.from(signature));
}

router.post("/fakecrm", async (req, res) => {
  const signature = req.headers["x-signature"];
  if (!signature) return res.status(401).json({ error: "Missing signature" });

  const isValid = verifySignature(
    process.env.WEBHOOK_SECRET,
    req.body,
    signature
  );
  if (!isValid) return res.status(403).json({ error: "Invalid signature" });

  const { lead_id, status } = req.body;
  if (!lead_id || !status)
    return res.status(400).json({ error: "Missing lead_id or status" });

  try {
    await pool.query(
      "UPDATE leads SET status=$1, updated_at=NOW() WHERE id=$2",
      [status, lead_id]
    );

    await pool.query(
      "INSERT INTO lead_events (lead_id, event_type, payload, created_at, event) VALUES ($1, $2, $3, NOW(), $4)",
      [
        lead_id,
        "webhook_update",
        JSON.stringify({ status }),
        `Webhook updated status to ${status}`,
      ]
    );

    console.log(`📬 Webhook processed update for lead ${lead_id} (${status})`);

    res.json({ success: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database error" });
  }
});

module.exports = router;
