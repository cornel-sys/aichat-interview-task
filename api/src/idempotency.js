const pool = require("./db");

async function findKey(id) {
  const { rows } = await pool.query(
    "SELECT * FROM idempotency_keys WHERE id = $1",
    [id]
  );
  return rows[0];
}

async function createKey(id, requestHash) {
  try {
    await pool.query(
      "INSERT INTO idempotency_keys (id, request_hash, status) VALUES ($1, $2, $3)",
      [id, requestHash, "processing"]
    );
    return true;
  } catch {
    return false;
  }
}

async function updateKeySuccess(id, leadId, response) {
  await pool.query(
    "UPDATE idempotency_keys SET status=$2, lead_id=$3, response=$4 WHERE id=$1",
    [id, "succeeded", leadId, response]
  );
}

async function updateKeyFailed(id, response) {
  await pool.query(
    "UPDATE idempotency_keys SET status=$2, response=$3 WHERE id=$1",
    [id, "failed", response]
  );
}

module.exports = { findKey, createKey, updateKeySuccess, updateKeyFailed };
