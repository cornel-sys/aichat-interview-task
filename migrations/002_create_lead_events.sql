-- Add company column to leads table
ALTER TABLE leads ADD COLUMN IF NOT EXISTS company VARCHAR(255);

-- Create lead_events table
CREATE TABLE IF NOT EXISTS lead_events (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID NOT NULL REFERENCES leads(id) ON DELETE CASCADE,
    event_type VARCHAR(50) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW()
);
