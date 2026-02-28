-- 效能索引補強：加速 React Query 頻繁查詢的路徑
-- 這些索引補強現有索引未涵蓋的常用查詢模式

-- 會計薪資表：salary_month 搜尋（薪資頁面、我的薪資頁面常用）
CREATE INDEX IF NOT EXISTS idx_accounting_payroll_salary_month
  ON accounting_payroll(salary_month);

-- 保險費率表：篩選目前有效的費率（expiry_date IS NULL）
CREATE INDEX IF NOT EXISTS idx_insurance_rates_active
  ON insurance_rate_tables(grade)
  WHERE expiry_date IS NULL;

-- 報價項目表：service 文字搜尋（報表頁面常用）
CREATE INDEX IF NOT EXISTS idx_quotation_items_service
  ON quotation_items(service);

-- 請款申請表：status + request_date 複合查詢（待請款、請款審核頁面常用）
CREATE INDEX IF NOT EXISTS idx_payment_requests_status_date
  ON payment_requests(verification_status, request_date);

-- 會計銷項表：year 單欄索引（總覽、報表頁面 .eq('year', year) 常用）
CREATE INDEX IF NOT EXISTS idx_accounting_sales_year
  ON accounting_sales(year);

-- 會計進項表：year 單欄索引
CREATE INDEX IF NOT EXISTS idx_accounting_expenses_year
  ON accounting_expenses(year);

-- 會計薪資表：year 單欄索引
CREATE INDEX IF NOT EXISTS idx_accounting_payroll_year
  ON accounting_payroll(year);
