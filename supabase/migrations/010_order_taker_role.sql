-- Add ORDER_TAKER to the allowed roles in the users table
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (role IN ('CUSTOMER', 'VENDOR', 'ADMIN', 'CASHIER', 'KITCHEN', 'ORDER_TAKER'));
