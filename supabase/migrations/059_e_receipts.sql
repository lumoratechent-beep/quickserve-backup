-- Immutable, public-by-token e-receipts. The public API uses the service role;
-- no direct anon/authenticated table access is granted.

CREATE TABLE IF NOT EXISTS public.e_receipts (
  id uuid PRIMARY KEY,
  order_id text NOT NULL UNIQUE REFERENCES public.orders(id) ON DELETE CASCADE,
  restaurant_id uuid NOT NULL REFERENCES public.restaurants(id) ON DELETE CASCADE,
  snapshot jsonb NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '60 days'),
  revoked_at timestamptz
);

CREATE INDEX IF NOT EXISTS e_receipts_expires_at_idx
  ON public.e_receipts (expires_at);

ALTER TABLE public.e_receipts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS e_receipt_id uuid,
  ADD COLUMN IF NOT EXISTS e_receipt_snapshot jsonb;

CREATE UNIQUE INDEX IF NOT EXISTS orders_e_receipt_id_unique_idx
  ON public.orders (e_receipt_id)
  WHERE e_receipt_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.capture_paid_e_receipt()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  restaurant_record public.restaurants%ROWTYPE;
  receipt_settings jsonb;
  currency_code text;
BEGIN
  IF NEW.status = 'COMPLETED' AND NEW.e_receipt_id IS NOT NULL THEN
    SELECT * INTO restaurant_record
    FROM public.restaurants
    WHERE id = NEW.restaurant_id;

    receipt_settings := COALESCE(restaurant_record.settings->'receipt', '{}'::jsonb);
    currency_code := COALESCE(NULLIF(restaurant_record.settings->>'currency', ''), 'MYR');

    INSERT INTO public.e_receipts (id, order_id, restaurant_id, snapshot, created_at, expires_at)
    VALUES (
      NEW.e_receipt_id,
      NEW.id,
      NEW.restaurant_id,
      jsonb_build_object(
        'version', 1,
        'status', 'PAID',
        'orderId', NEW.id,
        'paidAt', now(),
        'orderTimestamp', NEW.timestamp,
        'restaurantId', NEW.restaurant_id,
        'businessName', COALESCE(NULLIF(receipt_settings->>'businessName', ''), restaurant_record.name, 'QuickServe'),
        'businessAddressLine1', COALESCE(receipt_settings->>'businessAddressLine1', ''),
        'businessAddressLine2', COALESCE(receipt_settings->>'businessAddressLine2', ''),
        'businessCity', COALESCE(receipt_settings->>'businessCity', ''),
        'businessState', COALESCE(receipt_settings->>'businessState', ''),
        'businessCountry', COALESCE(receipt_settings->>'businessCountry', ''),
        'businessPhone', COALESCE(receipt_settings->>'businessPhone', ''),
        'headerText', COALESCE(receipt_settings->>'headerText', ''),
        'footerText', COALESCE(NULLIF(receipt_settings->>'footerText', ''), 'Thank you! Please come again.'),
        'currency', currency_code,
        'items', COALESCE(NEW.items, '[]'::jsonb),
        'total', NEW.total,
        'tableNumber', COALESCE(NEW.table_number, ''),
        'diningType', COALESCE(NEW.dining_type, ''),
        'remark', COALESCE(NEW.remark, ''),
        'paymentMethod', COALESCE(NEW.payment_method, ''),
        'cashierName', COALESCE(NEW.cashier_name, ''),
        'amountReceived', NEW.amount_received,
        'changeAmount', NEW.change_amount,
        'orderSource', COALESCE(NEW.order_source, ''),
        'taxes', COALESCE(restaurant_record.settings->'taxes', '[]'::jsonb)
      ) || COALESCE(NEW.e_receipt_snapshot, '{}'::jsonb),
      now(),
      now() + interval '60 days'
    )
    ON CONFLICT (order_id) DO NOTHING;

    -- The immutable copy belongs in e_receipts only and is purged after 60 days.
    -- Clear the payment-write transport field so orders do not retain a duplicate.
    UPDATE public.orders
    SET e_receipt_snapshot = NULL
    WHERE id = NEW.id AND e_receipt_snapshot IS NOT NULL;
  END IF;

  IF TG_OP = 'UPDATE' AND NEW.status = 'CANCELLED' AND OLD.status = 'COMPLETED' THEN
    UPDATE public.e_receipts
    SET snapshot = jsonb_set(snapshot, '{status}', '"REFUNDED"'::jsonb, true)
    WHERE order_id = NEW.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS orders_capture_paid_e_receipt ON public.orders;
CREATE TRIGGER orders_capture_paid_e_receipt
AFTER INSERT OR UPDATE OF status, e_receipt_id ON public.orders
FOR EACH ROW
EXECUTE FUNCTION public.capture_paid_e_receipt();
