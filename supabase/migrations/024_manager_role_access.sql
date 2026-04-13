-- Add MANAGER role to the allowed roles in the users table
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
  role IN ('CUSTOMER', 'VENDOR', 'ADMIN', 'CASHIER', 'KITCHEN', 'ORDER_TAKER', 'MANAGER')
);

-- Add access_permissions JSONB column to store per-staff access control settings
ALTER TABLE users ADD COLUMN IF NOT EXISTS access_permissions JSONB DEFAULT '{}';
