-- =====================================================
-- 完整人事薪資系統 Migration
-- 請在 Supabase Dashboard > SQL Editor 中執行此檔案
-- =====================================================

-- =====================================================
-- 1. 員工主檔表 (Employees Master)
-- =====================================================

CREATE TABLE IF NOT EXISTS employees (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 基本資料
  name text NOT NULL,
  id_number text UNIQUE,
  birth_date date,
  gender text CHECK (gender IN ('男', '女', '其他')),
  phone text,
  email text,
  address text,
  emergency_contact text,
  emergency_phone text,

  -- 僱用資料
  employee_number text UNIQUE,
  hire_date date NOT NULL,
  resignation_date date,
  position text,
  department text,
  employment_type text DEFAULT '全職' CHECK (employment_type IN ('全職', '兼職', '約聘', '實習')),
  status text DEFAULT '在職' CHECK (status IN ('在職', '留停', '離職')),

  -- 薪資資料
  base_salary numeric(12,2) DEFAULT 0,
  meal_allowance numeric(12,2) DEFAULT 0,
  insurance_grade integer,

  -- 銀行資料
  bank_name text,
  bank_branch text,
  bank_account text,

  -- 備註
  note text,

  -- 系統欄位
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_employees_status ON employees(status);
CREATE INDEX IF NOT EXISTS idx_employees_name ON employees(name);
CREATE INDEX IF NOT EXISTS idx_employees_employee_number ON employees(employee_number);
CREATE INDEX IF NOT EXISTS idx_employees_created_by ON employees(created_by);

-- RLS 政策
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated users can read active employees" ON employees;
CREATE POLICY "authenticated users can read active employees"
  ON employees FOR SELECT
  TO authenticated
  USING (status = '在職');

DROP POLICY IF EXISTS "admin can read all employees" ON employees;
CREATE POLICY "admin can read all employees"
  ON employees FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
      AND role = 'Admin'
    )
  );

DROP POLICY IF EXISTS "admin can insert employees" ON employees;
CREATE POLICY "admin can insert employees"
  ON employees FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
      AND role = 'Admin'
    )
  );

DROP POLICY IF EXISTS "admin can update employees" ON employees;
CREATE POLICY "admin can update employees"
  ON employees FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
      AND role = 'Admin'
    )
  );

DROP POLICY IF EXISTS "admin can delete employees" ON employees;
CREATE POLICY "admin can delete employees"
  ON employees FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
      AND role = 'Admin'
    )
  );

-- Trigger（確保 update_accounting_updated_at 函數存在）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'employees_updated_at'
  ) THEN
    CREATE TRIGGER employees_updated_at
      BEFORE UPDATE ON employees
      FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();
  END IF;
END $$;

-- =====================================================
-- 2. 勞健保費率表 (Insurance Rate Tables)
-- =====================================================

CREATE TABLE IF NOT EXISTS insurance_rate_tables (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- 投保級距
  grade integer NOT NULL,
  monthly_salary integer NOT NULL,

  -- 勞保費率（總費率 12%）
  labor_rate_total numeric(6,4) DEFAULT 0.1200,
  labor_rate_employee numeric(6,4) DEFAULT 0.0240,
  labor_rate_company numeric(6,4) DEFAULT 0.0840,
  labor_rate_government numeric(6,4) DEFAULT 0.0120,

  -- 健保費率（總費率 5.17%）
  health_rate_total numeric(6,4) DEFAULT 0.0517,
  health_rate_employee numeric(6,4) DEFAULT 0.0155,
  health_rate_company numeric(6,4) DEFAULT 0.0310,
  health_rate_government numeric(6,4) DEFAULT 0.0052,

  -- 補充保費
  supplementary_rate numeric(6,4) DEFAULT 0.0217,

  -- 勞工退休金
  pension_rate_company numeric(6,4) DEFAULT 0.0600,
  pension_rate_employee numeric(6,4) DEFAULT 0.0000,

  -- 其他費用
  occupational_injury_rate numeric(6,4) DEFAULT 0.0021,
  employment_stabilization_rate numeric(6,4) DEFAULT 0.0010,

  -- 生效期間
  effective_date date NOT NULL,
  expiry_date date,

  -- 備註
  note text,

  -- 系統欄位
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_insurance_grade ON insurance_rate_tables(grade);
CREATE INDEX IF NOT EXISTS idx_insurance_effective_date ON insurance_rate_tables(effective_date);
CREATE INDEX IF NOT EXISTS idx_insurance_grade_date ON insurance_rate_tables(grade, effective_date);

-- RLS 政策
ALTER TABLE insurance_rate_tables ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated users can read insurance_rate_tables" ON insurance_rate_tables;
CREATE POLICY "authenticated users can read insurance_rate_tables"
  ON insurance_rate_tables FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "admin can insert insurance_rate_tables" ON insurance_rate_tables;
CREATE POLICY "admin can insert insurance_rate_tables"
  ON insurance_rate_tables FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
      AND role = 'Admin'
    )
  );

DROP POLICY IF EXISTS "admin can update insurance_rate_tables" ON insurance_rate_tables;
CREATE POLICY "admin can update insurance_rate_tables"
  ON insurance_rate_tables FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
      AND role = 'Admin'
    )
  );

DROP POLICY IF EXISTS "admin can delete insurance_rate_tables" ON insurance_rate_tables;
CREATE POLICY "admin can delete insurance_rate_tables"
  ON insurance_rate_tables FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = (SELECT auth.uid())
      AND role = 'Admin'
    )
  );

-- Trigger
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger
    WHERE tgname = 'insurance_rate_tables_updated_at'
  ) THEN
    CREATE TRIGGER insurance_rate_tables_updated_at
      BEFORE UPDATE ON insurance_rate_tables
      FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();
  END IF;
END $$;

-- =====================================================
-- 3. 修改 accounting_payroll 表
-- =====================================================

ALTER TABLE accounting_payroll
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS insurance_grade integer,
  ADD COLUMN IF NOT EXISTS insurance_salary integer,
  ADD COLUMN IF NOT EXISTS labor_rate numeric(6,4),
  ADD COLUMN IF NOT EXISTS health_rate numeric(6,4),
  ADD COLUMN IF NOT EXISTS pension_rate numeric(6,4);

-- 索引
CREATE INDEX IF NOT EXISTS idx_accounting_payroll_employee_id
  ON accounting_payroll(employee_id);

CREATE INDEX IF NOT EXISTS idx_accounting_payroll_employee_year
  ON accounting_payroll(employee_id, year);

-- =====================================================
-- 4. 插入 2026 年台灣勞健保費率資料
-- =====================================================

-- 先清理可能重複的資料
DELETE FROM insurance_rate_tables
WHERE effective_date = '2026-01-01'
AND grade IN (1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20);

-- 插入費率資料
INSERT INTO insurance_rate_tables (grade, monthly_salary, effective_date, note) VALUES
(1,  27470, '2026-01-01', '基本工資級距'),
(2,  27600, '2026-01-01', NULL),
(3,  28800, '2026-01-01', NULL),
(4,  30300, '2026-01-01', NULL),
(5,  31800, '2026-01-01', NULL),
(6,  33300, '2026-01-01', NULL),
(7,  34800, '2026-01-01', NULL),
(8,  36300, '2026-01-01', NULL),
(9,  38200, '2026-01-01', NULL),
(10, 40100, '2026-01-01', NULL),
(11, 42000, '2026-01-01', NULL),
(12, 43900, '2026-01-01', NULL),
(13, 45800, '2026-01-01', '投保薪資上限'),
(14, 48200, '2026-01-01', NULL),
(15, 50600, '2026-01-01', NULL),
(16, 53000, '2026-01-01', NULL),
(17, 55400, '2026-01-01', NULL),
(18, 57800, '2026-01-01', NULL),
(19, 60800, '2026-01-01', NULL),
(20, 63800, '2026-01-01', NULL);

-- =====================================================
-- 完成
-- =====================================================

SELECT 'Migration 執行完成！' AS status,
       (SELECT COUNT(*) FROM employees) AS employees_count,
       (SELECT COUNT(*) FROM insurance_rate_tables) AS insurance_rates_count;
