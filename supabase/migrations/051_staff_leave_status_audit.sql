-- 051: Capture leave approval lifecycle timestamps.
-- Leave balance is derived from approved/completed staff_leaves rows, while these
-- timestamps preserve the status lifecycle for HR audit.

ALTER TABLE staff_leaves
  ADD COLUMN IF NOT EXISTS approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS status_changed_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE staff_leaves
SET
  approved_at = CASE
    WHEN status = 'approved' AND approved_at IS NULL THEN COALESCE(updated_at, now())
    ELSE approved_at
  END,
  completed_at = CASE
    WHEN status = 'completed' AND completed_at IS NULL THEN COALESCE(updated_at, now())
    ELSE completed_at
  END,
  cancelled_at = CASE
    WHEN status = 'cancelled' AND cancelled_at IS NULL THEN COALESCE(updated_at, now())
    ELSE cancelled_at
  END,
  status_changed_at = COALESCE(status_changed_at, updated_at, now());
