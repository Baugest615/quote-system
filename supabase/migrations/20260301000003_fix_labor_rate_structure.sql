-- =============================================================
-- Migration: 修正勞保費率結構 — 將就業保險獨立出來
--
-- 問題：原本 labor_rate_* 混合了「勞保普通事故」與「就業保險」
-- 修正：
--   1. 新增 employment_insurance_rate 欄位（就業保險 1%）
--   2. labor_rate_* 改為純「勞保普通事故」費率（11.5%）
--   3. 更新現有資料
--   4. 職災費率更新為公司實際行業別費率（0.15%）
--
-- 原因：
--   - 雇主不適用就業保險，計算時需要區分
--   - 一般員工 = 勞保 + 就保，雇主 = 只有勞保
-- =============================================================

BEGIN;

-- 1. 新增就業保險費率欄位
ALTER TABLE insurance_rate_tables
  ADD COLUMN IF NOT EXISTS employment_insurance_rate numeric(6,4) DEFAULT 0.0100;

COMMENT ON COLUMN insurance_rate_tables.employment_insurance_rate
  IS '就業保險費率（預設 1%）— 被保險人 20%/投保單位 70%/政府 10%，雇主不適用';

-- 2. 修改 labor_rate 預設值為純勞保普通事故費率 11.5%
ALTER TABLE insurance_rate_tables
  ALTER COLUMN labor_rate_total SET DEFAULT 0.1150,
  ALTER COLUMN labor_rate_employee SET DEFAULT 0.0230,
  ALTER COLUMN labor_rate_company SET DEFAULT 0.0805,
  ALTER COLUMN labor_rate_government SET DEFAULT 0.0115;

-- 3. 更新現有資料（所有級距）
UPDATE insurance_rate_tables SET
  -- 勞保普通事故 11.5%
  labor_rate_total = 0.1150,
  labor_rate_employee = 0.0230,        -- 11.5% × 20%
  labor_rate_company = 0.0805,         -- 11.5% × 70%
  labor_rate_government = 0.0115,      -- 11.5% × 10%
  -- 就業保險 1%
  employment_insurance_rate = 0.0100,
  -- 職災保險（行業別 7310 娛樂業）
  occupational_injury_rate = 0.0015    -- 0.15%（上下班 0.07% + 行業別 0.08%）
WHERE expiry_date IS NULL;             -- 只更新目前有效的費率

-- 4. 薪資表也新增就業保險快照欄位
ALTER TABLE accounting_payroll
  ADD COLUMN IF NOT EXISTS employment_insurance_rate numeric(6,4) DEFAULT NULL;

COMMENT ON COLUMN accounting_payroll.employment_insurance_rate
  IS '就業保險費率（快照）';

NOTIFY pgrst, 'reload config';
COMMIT;
