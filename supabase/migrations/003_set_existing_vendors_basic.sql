-- Set existing vendors (restaurants without a subscription) to 'basic' plan.
-- This ensures all existing restaurants have a subscription record.

INSERT INTO subscriptions (restaurant_id, plan_id, status, trial_start, trial_end)
SELECT r.id, 'basic', 'active', NOW(), NOW() + INTERVAL '30 days'
FROM restaurants r
LEFT JOIN subscriptions s ON s.restaurant_id = r.id
WHERE s.id IS NULL;

-- Update existing restaurants to pos_only (basic plan default)
UPDATE restaurants
SET platform_access = 'pos_only'
WHERE id NOT IN (
  SELECT restaurant_id FROM subscriptions WHERE plan_id IN ('pro', 'pro_plus')
);
