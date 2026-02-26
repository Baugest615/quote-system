-- Migration: add_prev_bank_balance
-- Created: 2026-02-27
-- Description: 銀行核對新增「上月存款餘額」欄位，差異公式改為 本月存款餘額 - (上月存款餘額 + 收入 - 支出)

ALTER TABLE accounting_reconciliation
  ADD COLUMN IF NOT EXISTS prev_bank_balance numeric(15,2) DEFAULT 0;

COMMENT ON COLUMN accounting_reconciliation.prev_bank_balance IS '上月存款餘額（使用者手動輸入）';
COMMENT ON COLUMN accounting_reconciliation.bank_balance IS '本月存款餘額（使用者手動輸入）';
