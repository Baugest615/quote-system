-- =====================================================
-- 勞健保費率表 (Insurance Rate Tables)
-- 管理台灣勞保、健保、勞退的投保級距與費率
-- 支援歷史費率查詢（透過生效日期與失效日期）
-- =====================================================

CREATE TABLE IF NOT EXISTS insurance_rate_tables (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- ===== 投保級距 =====
  grade integer NOT NULL,                  -- 級距（1-60）
  monthly_salary integer NOT NULL,         -- 月投保金額（元）

  -- ===== 勞保費率（總費率 12%）=====
  labor_rate_total numeric(6,4) DEFAULT 0.1200,          -- 總費率 12%
  labor_rate_employee numeric(6,4) DEFAULT 0.0240,       -- 個人 20% = 2.4%
  labor_rate_company numeric(6,4) DEFAULT 0.0840,        -- 公司 70% = 8.4%
  labor_rate_government numeric(6,4) DEFAULT 0.0120,     -- 政府 10% = 1.2%

  -- ===== 健保費率（總費率 5.17%）=====
  health_rate_total numeric(6,4) DEFAULT 0.0517,         -- 總費率 5.17%
  health_rate_employee numeric(6,4) DEFAULT 0.0155,      -- 個人 30% = 1.551% (四捨五入為 1.55%)
  health_rate_company numeric(6,4) DEFAULT 0.0310,       -- 公司 60% = 3.102% (四捨五入為 3.10%)
  health_rate_government numeric(6,4) DEFAULT 0.0052,    -- 政府 10% = 0.517% (四捨五入為 0.52%)

  -- ===== 補充保費 =====
  supplementary_rate numeric(6,4) DEFAULT 0.0217,        -- 補充保費費率 2.17%

  -- ===== 勞工退休金 =====
  pension_rate_company numeric(6,4) DEFAULT 0.0600,      -- 公司提繳 6%
  pension_rate_employee numeric(6,4) DEFAULT 0.0000,     -- 員工自提（可選，預設 0%）

  -- ===== 其他費用 =====
  occupational_injury_rate numeric(6,4) DEFAULT 0.0021,  -- 職災保險費率（平均值）
  employment_stabilization_rate numeric(6,4) DEFAULT 0.0010, -- 就業安定費（0.1%）

  -- ===== 生效期間 =====
  effective_date date NOT NULL,            -- 生效日期
  expiry_date date,                        -- 失效日期（NULL = 目前有效）

  -- ===== 備註 =====
  note text,

  -- ===== 系統欄位 =====
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- =====================================================
-- 索引（提升查詢效能）
-- =====================================================
CREATE INDEX idx_insurance_grade ON insurance_rate_tables(grade);
CREATE INDEX idx_insurance_effective_date ON insurance_rate_tables(effective_date);
CREATE INDEX idx_insurance_grade_date ON insurance_rate_tables(grade, effective_date);

-- =====================================================
-- RLS 政策（權限控制）
-- =====================================================
ALTER TABLE insurance_rate_tables ENABLE ROW LEVEL SECURITY;

-- 所有認證使用者可讀取費率表（用於薪資計算）
CREATE POLICY "authenticated users can read insurance_rate_tables"
  ON insurance_rate_tables FOR SELECT
  TO authenticated
  USING (true);

-- Admin 可新增費率
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

-- Admin 可更新費率
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

-- Admin 可刪除費率
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

-- =====================================================
-- updated_at 自動更新 trigger
-- =====================================================
CREATE TRIGGER insurance_rate_tables_updated_at
  BEFORE UPDATE ON insurance_rate_tables
  FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();

-- =====================================================
-- 註解說明
-- =====================================================
COMMENT ON TABLE insurance_rate_tables IS '勞健保費率表 - 管理台灣勞保、健保、勞退的投保級距與費率';
COMMENT ON COLUMN insurance_rate_tables.grade IS '投保級距（1-60）';
COMMENT ON COLUMN insurance_rate_tables.monthly_salary IS '月投保金額（元）';
COMMENT ON COLUMN insurance_rate_tables.labor_rate_total IS '勞保總費率（12%）';
COMMENT ON COLUMN insurance_rate_tables.labor_rate_employee IS '勞保個人負擔（2.4% = 20% of 12%）';
COMMENT ON COLUMN insurance_rate_tables.labor_rate_company IS '勞保公司負擔（8.4% = 70% of 12%）';
COMMENT ON COLUMN insurance_rate_tables.health_rate_total IS '健保總費率（5.17%）';
COMMENT ON COLUMN insurance_rate_tables.health_rate_employee IS '健保個人負擔（1.55% = 30% of 5.17%）';
COMMENT ON COLUMN insurance_rate_tables.health_rate_company IS '健保公司負擔（3.10% = 60% of 5.17%）';
COMMENT ON COLUMN insurance_rate_tables.pension_rate_company IS '勞退公司提繳率（6%）';
COMMENT ON COLUMN insurance_rate_tables.effective_date IS '生效日期';
COMMENT ON COLUMN insurance_rate_tables.expiry_date IS '失效日期（NULL = 目前有效）';

NOTIFY pgrst, 'reload config';
