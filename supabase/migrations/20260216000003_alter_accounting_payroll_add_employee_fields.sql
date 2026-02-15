-- =====================================================
-- 修改 accounting_payroll 表
-- 新增員工關聯、投保級距、費率快照等欄位
-- =====================================================

-- 新增欄位
ALTER TABLE accounting_payroll
  ADD COLUMN IF NOT EXISTS employee_id uuid REFERENCES employees(id),
  ADD COLUMN IF NOT EXISTS insurance_grade integer,          -- 當月投保級距（快照）
  ADD COLUMN IF NOT EXISTS insurance_salary integer,         -- 投保薪資（快照）
  ADD COLUMN IF NOT EXISTS labor_rate numeric(6,4),          -- 勞保費率（快照）
  ADD COLUMN IF NOT EXISTS health_rate numeric(6,4),         -- 健保費率（快照）
  ADD COLUMN IF NOT EXISTS pension_rate numeric(6,4);        -- 勞退費率（快照）

-- 建立索引（提升查詢效能）
CREATE INDEX IF NOT EXISTS idx_accounting_payroll_employee_id
  ON accounting_payroll(employee_id);

-- 建立複合索引（常見查詢：依員工查詢多年資料）
CREATE INDEX IF NOT EXISTS idx_accounting_payroll_employee_year
  ON accounting_payroll(employee_id, year);

-- =====================================================
-- 註解說明
-- =====================================================
COMMENT ON COLUMN accounting_payroll.employee_id IS '員工 ID（關聯到 employees 表）';
COMMENT ON COLUMN accounting_payroll.employee_name IS '員工姓名（快照，避免員工離職後找不到資料）';
COMMENT ON COLUMN accounting_payroll.insurance_grade IS '當月投保級距（快照）';
COMMENT ON COLUMN accounting_payroll.insurance_salary IS '投保薪資（快照）';
COMMENT ON COLUMN accounting_payroll.labor_rate IS '勞保費率（快照，記錄當時的費率）';
COMMENT ON COLUMN accounting_payroll.health_rate IS '健保費率（快照，記錄當時的費率）';
COMMENT ON COLUMN accounting_payroll.pension_rate IS '勞退費率（快照，記錄當時的費率）';

NOTIFY pgrst, 'reload config';
