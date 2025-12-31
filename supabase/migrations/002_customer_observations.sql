-- Create customer_observations table for storing facts about customers
CREATE TABLE IF NOT EXISTS customer_observations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_phone TEXT NOT NULL,
  content TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('voice', 'sms', 'whatsapp')),
  occurred_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  FOREIGN KEY (customer_phone) REFERENCES customer_profiles(phone) ON DELETE CASCADE
);

-- Create index for fast lookups by customer
CREATE INDEX idx_observations_customer_phone ON customer_observations(customer_phone);
CREATE INDEX idx_observations_occurred_at ON customer_observations(occurred_at DESC);

-- Full text search index for observation content
CREATE INDEX idx_observations_content_search ON customer_observations USING gin(to_tsvector('english', content));
