-- =====================================================
-- 添加勞健保投保狀態欄位到 employees 表
-- 用於控制員工是否需要扣繳勞保與健保
-- =====================================================

-- 為 employees 表添加兩個布林欄位
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS has_labor_insurance boolean DEFAULT true,
  ADD COLUMN IF NOT EXISTS has_health_insurance boolean DEFAULT true;

-- 添加註解說明
COMMENT ON COLUMN employees.has_labor_insurance IS '是否投保勞保（預設：是）- 用於控制薪資計算時是否扣繳勞保';
COMMENT ON COLUMN employees.has_health_insurance IS '是否投保健保（預設：是）- 用於控制薪資計算時是否扣繳健保';

NOTIFY pgrst, 'reload config';
