-- 039: Add employer contribution details and custom labels for payroll payslips.

ALTER TABLE payroll_payslips
  ADD COLUMN IF NOT EXISTS socso_employer NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS eis_employer NUMERIC(12, 2) NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS other_deduction_name TEXT,
  ADD COLUMN IF NOT EXISTS other_contribution_name TEXT,
  ADD COLUMN IF NOT EXISTS other_contribution_amount NUMERIC(12, 2) NOT NULL DEFAULT 0;
