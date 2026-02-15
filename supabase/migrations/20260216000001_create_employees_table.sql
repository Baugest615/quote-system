-- =====================================================
-- 員工主檔表 (Employees Master)
-- 管理員工基本資料、薪資結構、勞健保級距
-- =====================================================

CREATE TABLE IF NOT EXISTS employees (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- ===== 基本資料 =====
  name text NOT NULL,
  id_number text UNIQUE,                   -- 身分證字號（敏感資料，需加密）
  birth_date date,                         -- 生日
  gender text CHECK (gender IN ('男', '女', '其他')),
  phone text,                              -- 電話
  email text,                              -- Email
  address text,                            -- 地址
  emergency_contact text,                  -- 緊急聯絡人
  emergency_phone text,                    -- 緊急聯絡電話

  -- ===== 僱用資料 =====
  employee_number text UNIQUE,             -- 員工編號（如 EMP001）
  hire_date date NOT NULL,                 -- 到職日
  resignation_date date,                   -- 離職日
  position text,                           -- 職位
  department text,                         -- 部門
  employment_type text DEFAULT '全職'      -- 僱用類型
    CHECK (employment_type IN ('全職', '兼職', '約聘', '實習')),
  status text DEFAULT '在職'               -- 狀態
    CHECK (status IN ('在職', '留停', '離職')),

  -- ===== 薪資資料 =====
  base_salary numeric(12,2) DEFAULT 0,     -- 月薪（本薪）
  meal_allowance numeric(12,2) DEFAULT 0,  -- 伙食津貼
  insurance_grade integer,                 -- 勞健保投保級距（1-60）

  -- ===== 銀行資料 =====
  bank_name text,                          -- 銀行名稱
  bank_branch text,                        -- 分行
  bank_account text,                       -- 帳號

  -- ===== 備註 =====
  note text,

  -- ===== 系統欄位 =====
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- =====================================================
-- 索引（提升查詢效能）
-- =====================================================
CREATE INDEX idx_employees_status ON employees(status);
CREATE INDEX idx_employees_name ON employees(name);
CREATE INDEX idx_employees_employee_number ON employees(employee_number);
CREATE INDEX idx_employees_created_by ON employees(created_by);

-- =====================================================
-- RLS 政策（權限控制）
-- =====================================================
ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

-- 所有認證使用者可讀取在職員工（用於薪資頁面選擇器）
CREATE POLICY "authenticated users can read active employees"
  ON employees FOR SELECT
  TO authenticated
  USING (status = '在職');

-- Admin 可讀取所有員工（包含離職）
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

-- Admin 可新增員工
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

-- Admin 可更新員工
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

-- Admin 可刪除員工
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

-- =====================================================
-- updated_at 自動更新 trigger
-- =====================================================
CREATE TRIGGER employees_updated_at
  BEFORE UPDATE ON employees
  FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();

-- =====================================================
-- 註解說明
-- =====================================================
COMMENT ON TABLE employees IS '員工主檔 - 管理員工基本資料、薪資結構、勞健保級距';
COMMENT ON COLUMN employees.name IS '員工姓名';
COMMENT ON COLUMN employees.id_number IS '身分證字號（敏感資料）';
COMMENT ON COLUMN employees.employee_number IS '員工編號（如 EMP001）';
COMMENT ON COLUMN employees.status IS '狀態：在職、留停、離職';
COMMENT ON COLUMN employees.base_salary IS '月薪本薪';
COMMENT ON COLUMN employees.meal_allowance IS '每月伙食津貼';
COMMENT ON COLUMN employees.insurance_grade IS '勞健保投保級距（1-60）';

NOTIFY pgrst, 'reload config';
