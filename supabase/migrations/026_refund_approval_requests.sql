-- Refund approval request queue for cashier refund escalation to managers/vendors
CREATE TABLE IF NOT EXISTS refund_approval_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id UUID NOT NULL,
  order_id TEXT NOT NULL,
  order_total NUMERIC(10,2),
  requested_by_username TEXT NOT NULL,
  requested_by_role TEXT,
  approver_role TEXT NOT NULL CHECK (approver_role IN ('MANAGER', 'VENDOR')),
  status TEXT NOT NULL DEFAULT 'PENDING' CHECK (status IN ('PENDING', 'APPROVED', 'DELETED')),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  resolved_at TIMESTAMPTZ,
  resolved_by_username TEXT
);

CREATE INDEX IF NOT EXISTS idx_refund_approval_requests_restaurant_status
  ON refund_approval_requests (restaurant_id, approver_role, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_refund_approval_requests_restaurant_order
  ON refund_approval_requests (restaurant_id, order_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_refund_approval_requests_pending_unique
  ON refund_approval_requests (restaurant_id, order_id, approver_role)
  WHERE status = 'PENDING';

ALTER TABLE refund_approval_requests ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Anyone can read refund approval requests" ON refund_approval_requests;
DROP POLICY IF EXISTS "Anyone can create refund approval requests" ON refund_approval_requests;
DROP POLICY IF EXISTS "Anyone can update refund approval requests" ON refund_approval_requests;

CREATE POLICY "Anyone can read refund approval requests"
  ON refund_approval_requests FOR SELECT
  USING (true);

CREATE POLICY "Anyone can create refund approval requests"
  ON refund_approval_requests FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Anyone can update refund approval requests"
  ON refund_approval_requests FOR UPDATE
  USING (true)
  WITH CHECK (true);