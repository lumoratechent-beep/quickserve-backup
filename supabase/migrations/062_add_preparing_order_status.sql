-- Add the explicit preparation stage used by QR, tableside, and Kitchen flows.
ALTER TABLE public.orders
  DROP CONSTRAINT IF EXISTS orders_status_check;

ALTER TABLE public.orders
  ADD CONSTRAINT orders_status_check
  CHECK (status IN ('PENDING', 'ONGOING', 'PREPARING', 'SERVED', 'COMPLETED', 'CANCELLED'));
