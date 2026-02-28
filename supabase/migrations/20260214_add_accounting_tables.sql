-- =====================================================
-- 帳務管理系統 Migration
-- 建立三張核心資料表：銷項、進項、薪資
-- =====================================================

-- 1. 銷項發票記錄表
CREATE TABLE IF NOT EXISTS accounting_sales (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  year integer NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  invoice_month text,                        -- 發票月份（如 "2025年1月"）
  project_name text NOT NULL,               -- 案件名稱
  client_name text,                         -- 開立對象（客戶名稱）
  sales_amount numeric(15,2) DEFAULT 0,     -- 銷售額（未稅）
  tax_amount numeric(15,2) DEFAULT 0,       -- 稅額
  total_amount numeric(15,2) DEFAULT 0,     -- 發票總金額（含稅）
  invoice_number text,                      -- 發票號碼
  invoice_date date,                        -- 發票開立日
  actual_receipt_date date,                 -- 實際入帳日
  note text,                                -- 備註
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

COMMENT ON TABLE accounting_sales IS '銷項發票記錄 - 對應 Excel「年度銷項開立統計」工作表';
COMMENT ON COLUMN accounting_sales.sales_amount IS '銷售額（未稅）';
COMMENT ON COLUMN accounting_sales.tax_amount IS '營業稅額（5%）';
COMMENT ON COLUMN accounting_sales.total_amount IS '發票總金額（含稅）';

-- 2. 進項支出記錄表（統一表，含所有支出類型）
CREATE TABLE IF NOT EXISTS accounting_expenses (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  year integer NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  expense_month text,                        -- 支出月份（如 "2025年1月"）
  expense_type text NOT NULL                 -- 支出種類
    CHECK (expense_type IN ('專案支出', '勞務報酬', '其他支出', '公司相關', '沖帳免付')),
  accounting_subject text,                  -- 會計科目（進貨/薪資支出/租金支出...）
  amount numeric(15,2) DEFAULT 0,           -- 金額（未稅）
  tax_amount numeric(15,2) DEFAULT 0,       -- 稅額
  total_amount numeric(15,2) DEFAULT 0,     -- 總額（含稅）
  vendor_name text,                         -- 公司行號名稱 / 付款對象
  payment_date date,                        -- 匯款日
  invoice_date date,                        -- 發票日期
  invoice_number text,                      -- 發票號碼
  project_name text,                        -- 專案名稱
  note text,                                -- 備註
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

COMMENT ON TABLE accounting_expenses IS '進項支出記錄 - 對應 Excel「年度進項總覽」及各明細工作表';
COMMENT ON COLUMN accounting_expenses.expense_type IS '支出種類：專案支出、勞務報酬、其他支出、公司相關、沖帳免付';
COMMENT ON COLUMN accounting_expenses.accounting_subject IS '會計科目：進貨、薪資支出、租金支出、旅費支出等';

-- 3. 人事薪資記錄表
CREATE TABLE IF NOT EXISTS accounting_payroll (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  year integer NOT NULL DEFAULT EXTRACT(YEAR FROM NOW()),
  payment_date date,                           -- 匯出日
  salary_month text,                           -- 記帳月份（如 "2025年1月"）
  employee_name text NOT NULL,                 -- 員工姓名
  base_salary numeric(12,2) DEFAULT 0,         -- 本薪
  meal_allowance numeric(12,2) DEFAULT 0,      -- 伙食津貼
  bonus numeric(12,2) DEFAULT 0,               -- 各項獎金
  deduction numeric(12,2) DEFAULT 0,           -- 各種代扣
  labor_insurance_personal numeric(12,2) DEFAULT 0,   -- 勞保個人負擔
  health_insurance_personal numeric(12,2) DEFAULT 0,  -- 健保個人負擔
  personal_total numeric(12,2) DEFAULT 0,      -- 個人負擔總額
  net_salary numeric(12,2) DEFAULT 0,          -- 個人薪資總額（實領）
  labor_insurance_company numeric(12,2) DEFAULT 0,    -- 勞保公司負擔
  health_insurance_company numeric(12,2) DEFAULT 0,   -- 健保公司負擔
  severance_fund numeric(12,2) DEFAULT 0,      -- 工資墊償金
  retirement_fund numeric(12,2) DEFAULT 0,     -- 勞工退休金
  company_total numeric(12,2) DEFAULT 0,       -- 公司支出總額（勞健保）
  note text,                                   -- 備註
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

COMMENT ON TABLE accounting_payroll IS '人事薪資記錄 - 對應 Excel「人事薪資與勞健保」工作表';

-- =====================================================
-- 建立索引（提升查詢效能）
-- =====================================================

-- 單欄索引（FK 與基礎查詢）
CREATE INDEX idx_accounting_sales_created_by ON accounting_sales(created_by);
CREATE INDEX idx_accounting_expenses_created_by ON accounting_expenses(created_by);
CREATE INDEX idx_accounting_payroll_created_by ON accounting_payroll(created_by);

-- 複合索引（常見查詢模式：依年度 + 分類篩選）
CREATE INDEX idx_accounting_sales_year_project ON accounting_sales(year, project_name);
CREATE INDEX idx_accounting_expenses_year_type ON accounting_expenses(year, expense_type);
CREATE INDEX idx_accounting_expenses_year_project ON accounting_expenses(year, project_name);
CREATE INDEX idx_accounting_payroll_year_employee ON accounting_payroll(year, employee_name);

-- =====================================================
-- RLS 政策（資料庫層級強制 Admin 權限控制）
-- =====================================================
ALTER TABLE accounting_sales ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE accounting_payroll ENABLE ROW LEVEL SECURITY;

-- 輔助函數：檢查使用者是否為 Admin（使用 select 包裹避免每行重複調用）
CREATE OR REPLACE FUNCTION is_admin()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid())
    AND role = 'Admin'
  );
$$;

-- 銷項表 RLS
CREATE POLICY "authenticated users can read accounting_sales"
  ON accounting_sales FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated users can insert accounting_sales"
  ON accounting_sales FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = created_by);

CREATE POLICY "owner can update accounting_sales"
  ON accounting_sales FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = created_by);

CREATE POLICY "owner can delete accounting_sales"
  ON accounting_sales FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = created_by);

-- 進項支出 RLS
CREATE POLICY "authenticated users can read accounting_expenses"
  ON accounting_expenses FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated users can insert accounting_expenses"
  ON accounting_expenses FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = created_by);

CREATE POLICY "owner can update accounting_expenses"
  ON accounting_expenses FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = created_by);

CREATE POLICY "owner can delete accounting_expenses"
  ON accounting_expenses FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = created_by);

-- 薪資 RLS
CREATE POLICY "authenticated users can read accounting_payroll"
  ON accounting_payroll FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "authenticated users can insert accounting_payroll"
  ON accounting_payroll FOR INSERT
  TO authenticated
  WITH CHECK ((select auth.uid()) = created_by);

CREATE POLICY "owner can update accounting_payroll"
  ON accounting_payroll FOR UPDATE
  TO authenticated
  USING ((select auth.uid()) = created_by);

CREATE POLICY "owner can delete accounting_payroll"
  ON accounting_payroll FOR DELETE
  TO authenticated
  USING ((select auth.uid()) = created_by);

-- =====================================================
-- updated_at 自動更新 trigger
-- =====================================================
CREATE OR REPLACE FUNCTION update_accounting_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER accounting_sales_updated_at
  BEFORE UPDATE ON accounting_sales
  FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();

CREATE TRIGGER accounting_expenses_updated_at
  BEFORE UPDATE ON accounting_expenses
  FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();

CREATE TRIGGER accounting_payroll_updated_at
  BEFORE UPDATE ON accounting_payroll
  FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();

-- =====================================================
-- 年度摘要 View（優化：使用 LEFT JOIN 取代多個子查詢）
-- =====================================================
CREATE OR REPLACE VIEW accounting_annual_summary AS
WITH all_years AS (
  SELECT DISTINCT year FROM accounting_sales
  UNION SELECT DISTINCT year FROM accounting_expenses
  UNION SELECT DISTINCT year FROM accounting_payroll
),
sales_agg AS (
  SELECT year,
    SUM(sales_amount) AS total_sales,
    SUM(tax_amount) AS total_sales_tax,
    SUM(total_amount) AS total_sales_with_tax
  FROM accounting_sales
  GROUP BY year
),
expenses_agg AS (
  SELECT year,
    SUM(amount) AS total_expenses,
    SUM(CASE WHEN expense_type = '專案支出' THEN amount ELSE 0 END) AS total_project_expenses,
    SUM(CASE WHEN expense_type = '勞務報酬' THEN amount ELSE 0 END) AS total_labor_expenses,
    SUM(CASE WHEN expense_type = '其他支出' THEN amount ELSE 0 END) AS total_other_expenses,
    SUM(CASE WHEN expense_type = '公司相關' THEN amount ELSE 0 END) AS total_company_expenses
  FROM accounting_expenses
  GROUP BY year
),
payroll_agg AS (
  SELECT year,
    SUM(net_salary + company_total) AS total_payroll,
    SUM(net_salary) AS total_net_salary
  FROM accounting_payroll
  GROUP BY year
)
SELECT
  y.year,
  COALESCE(s.total_sales, 0) AS total_sales,
  COALESCE(s.total_sales_tax, 0) AS total_sales_tax,
  COALESCE(s.total_sales_with_tax, 0) AS total_sales_with_tax,
  COALESCE(e.total_project_expenses, 0) AS total_project_expenses,
  COALESCE(e.total_labor_expenses, 0) AS total_labor_expenses,
  COALESCE(e.total_other_expenses, 0) AS total_other_expenses,
  COALESCE(e.total_company_expenses, 0) AS total_company_expenses,
  COALESCE(p.total_payroll, 0) AS total_payroll,
  COALESCE(s.total_sales, 0) - COALESCE(e.total_expenses, 0) - COALESCE(p.total_net_salary, 0) AS annual_profit
FROM all_years y
LEFT JOIN sales_agg s ON s.year = y.year
LEFT JOIN expenses_agg e ON e.year = y.year
LEFT JOIN payroll_agg p ON p.year = y.year
ORDER BY y.year DESC;

GRANT SELECT ON accounting_annual_summary TO authenticated;

NOTIFY pgrst, 'reload config';
