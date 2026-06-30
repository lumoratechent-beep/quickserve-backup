-- 038: Back office HR, staff profiles, departments and payroll payslips.
-- Login credentials stay in the existing users table. These tables hold the
-- HR/payroll detail linked by users.id so production authentication remains stable.

ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check CHECK (
  role IN ('CUSTOMER', 'VENDOR', 'ADMIN', 'CASHIER', 'KITCHEN', 'ORDER_TAKER', 'MANAGER', 'HR')
);

CREATE TABLE IF NOT EXISTS staff_departments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT NOT NULL,
  name TEXT NOT NULL,
  code TEXT,
  description TEXT,
  manager_user_id TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (restaurant_id, name)
);

CREATE TABLE IF NOT EXISTS staff_profiles (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT NOT NULL,
  user_id TEXT NOT NULL UNIQUE,
  department_id UUID REFERENCES staff_departments(id) ON DELETE SET NULL,
  employee_code TEXT,
  full_name TEXT,
  preferred_name TEXT,
  ic_number TEXT,
  date_of_birth DATE,
  gender TEXT,
  nationality TEXT,
  address TEXT,
  emergency_contact_name TEXT,
  emergency_contact_phone TEXT,
  job_title TEXT,
  employment_type TEXT NOT NULL DEFAULT 'Full-time',
  employment_status TEXT NOT NULL DEFAULT 'Active',
  hire_date DATE,
  confirmation_date DATE,
  termination_date DATE,
  bank_name TEXT,
  bank_account_no TEXT,
  epf_no TEXT,
  socso_no TEXT,
  tax_no TEXT,
  salary_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  pay_frequency TEXT NOT NULL DEFAULT 'Monthly',
  overtime_rate NUMERIC(12, 2) NOT NULL DEFAULT 0,
  default_allowances JSONB NOT NULL DEFAULT '{}',
  default_deductions JSONB NOT NULL DEFAULT '{}',
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS payroll_payslips (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  restaurant_id TEXT NOT NULL,
  staff_user_id TEXT NOT NULL,
  staff_profile_id UUID REFERENCES staff_profiles(id) ON DELETE SET NULL,
  pay_period TEXT NOT NULL,
  pay_date DATE NOT NULL,
  basic_salary NUMERIC(12, 2) NOT NULL DEFAULT 0,
  overtime_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  allowance_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  bonus_amount NUMERIC(12, 2) NOT NULL DEFAULT 0,
  gross_pay NUMERIC(12, 2) NOT NULL DEFAULT 0,
  epf_employee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  epf_employer NUMERIC(12, 2) NOT NULL DEFAULT 0,
  socso_employee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  eis_employee NUMERIC(12, 2) NOT NULL DEFAULT 0,
  tax_pcb NUMERIC(12, 2) NOT NULL DEFAULT 0,
  unpaid_leave_deduction NUMERIC(12, 2) NOT NULL DEFAULT 0,
  other_deductions NUMERIC(12, 2) NOT NULL DEFAULT 0,
  net_pay NUMERIC(12, 2) NOT NULL DEFAULT 0,
  payment_method TEXT NOT NULL DEFAULT 'Bank Transfer',
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'approved', 'paid')),
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_staff_departments_restaurant ON staff_departments(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_restaurant ON staff_profiles(restaurant_id);
CREATE INDEX IF NOT EXISTS idx_staff_profiles_department ON staff_profiles(department_id);
CREATE INDEX IF NOT EXISTS idx_payroll_payslips_restaurant_date ON payroll_payslips(restaurant_id, pay_date DESC);
CREATE INDEX IF NOT EXISTS idx_payroll_payslips_staff ON payroll_payslips(staff_user_id, pay_date DESC);

ALTER TABLE staff_departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE staff_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE payroll_payslips ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "staff_departments_all" ON staff_departments;
CREATE POLICY "staff_departments_all" ON staff_departments FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "staff_profiles_all" ON staff_profiles;
CREATE POLICY "staff_profiles_all" ON staff_profiles FOR ALL USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "payroll_payslips_all" ON payroll_payslips;
CREATE POLICY "payroll_payslips_all" ON payroll_payslips FOR ALL USING (true) WITH CHECK (true);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'staff_departments'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE staff_departments;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'staff_profiles'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE staff_profiles;
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'payroll_payslips'
  ) THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE payroll_payslips;
  END IF;
END $$;
