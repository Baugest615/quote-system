-- =====================================================
-- expense_claims 新增 payment_status / paid_at 欄位
-- 用途：代扣代繳報帳不建立 accounting_expense（防重複計帳），
--       但仍需在月結總覽中追蹤員工代墊款的付款狀態
-- =====================================================

-- 1. 新增欄位
ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid')),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

COMMENT ON COLUMN expense_claims.payment_status IS '付款狀態：unpaid=未付, paid=已付（用於月結總覽追蹤代扣代繳代墊款）';
COMMENT ON COLUMN expense_claims.paid_at IS '實際付款時間';

-- 2. 索引
CREATE INDEX IF NOT EXISTS idx_expense_claims_payment_status
  ON expense_claims(payment_status);

CREATE INDEX IF NOT EXISTS idx_expense_claims_month_type_status
  ON expense_claims(claim_month, expense_type, status);
