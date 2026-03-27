-- Add order_source column to orders table to track where each order originated
ALTER TABLE orders ADD COLUMN IF NOT EXISTS order_source TEXT;

-- Add a comment for documentation
COMMENT ON COLUMN orders.order_source IS 'Source of the order: counter, qr_order, online';
