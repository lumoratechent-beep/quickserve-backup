-- Add dining_type column to orders table to record selected dining option per order
ALTER TABLE orders ADD COLUMN IF NOT EXISTS dining_type TEXT;

-- Add documentation comment
COMMENT ON COLUMN orders.dining_type IS 'Dining option for the order (e.g., Dine-in, Takeaway, Delivery)';
