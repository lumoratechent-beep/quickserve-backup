-- Subscriptions table for tracking restaurant plan & billing
CREATE TABLE IF NOT EXISTS subscriptions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  restaurant_id UUID NOT NULL REFERENCES restaurants(id) ON DELETE CASCADE,
  plan_id TEXT NOT NULL CHECK (plan_id IN ('basic', 'pro', 'pro_plus')),
  status TEXT NOT NULL DEFAULT 'pending_payment' CHECK (status IN ('pending_payment', 'trialing', 'active', 'past_due', 'canceled', 'unpaid')),
  stripe_customer_id TEXT,
  stripe_subscription_id TEXT,
  trial_start TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  trial_end TIMESTAMPTZ NOT NULL DEFAULT (NOW() + INTERVAL '30 days'),
  current_period_start TIMESTAMPTZ,
  current_period_end TIMESTAMPTZ,
  cancel_at_period_end BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(restaurant_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_subscriptions_restaurant ON subscriptions(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_customer ON subscriptions(stripe_customer_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_stripe_sub ON subscriptions(stripe_subscription_id);
CREATE INDEX IF NOT EXISTS idx_subscriptions_status ON subscriptions(status);

-- Enable RLS
ALTER TABLE subscriptions ENABLE ROW LEVEL SECURITY;

-- Policy: Allow read for authenticated and anon (needed for registration check)
CREATE POLICY "Allow read subscriptions" ON subscriptions
  FOR SELECT USING (true);

-- Policy: Allow insert for registration
CREATE POLICY "Allow insert subscriptions" ON subscriptions
  FOR INSERT WITH CHECK (true);

-- Policy: Allow update (for webhook status changes)
CREATE POLICY "Allow update subscriptions" ON subscriptions
  FOR UPDATE USING (true);
