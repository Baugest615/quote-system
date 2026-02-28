-- =============================================================
-- Migration: 員工表與薪資表新增雇主相關欄位
-- 目的：支援雇主（負責人）與一般員工的勞健保計算差異
-- =============================================================

BEGIN;

-- 1. employees 表新增雇主旗標與眷屬口數
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS is_employer boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dependents_count numeric(4,2) DEFAULT NULL;

COMMENT ON COLUMN employees.is_employer
  IS '是否為雇主/負責人 — 影響勞健保計算規則（勞保全額自付、健保依眷屬口數、不適用勞退）';
COMMENT ON COLUMN employees.dependents_count
  IS '健保眷屬口數（僅雇主適用）— 用於計算雇主健保 = 投保薪資 × 健保費率 × (1 + 眷屬口數)';

-- 2. accounting_payroll 表新增雇主快照欄位
ALTER TABLE accounting_payroll
  ADD COLUMN IF NOT EXISTS is_employer boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS dependents_count numeric(4,2) DEFAULT NULL;

COMMENT ON COLUMN accounting_payroll.is_employer
  IS '當月是否為雇主身份（快照）';
COMMENT ON COLUMN accounting_payroll.dependents_count
  IS '當月眷屬口數（快照，僅雇主適用）';

NOTIFY pgrst, 'reload config';
COMMIT;
