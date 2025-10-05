CREATE TABLE IF NOT EXISTS idempotency_keys (
  id TEXT PRIMARY KEY,
  request_hash TEXT,
  lead_id UUID,
  response JSONB,
  status TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);
