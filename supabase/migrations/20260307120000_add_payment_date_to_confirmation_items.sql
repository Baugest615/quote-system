-- ============================================================
-- Spec-007: 匯款日期逐筆管理
-- 在 payment_confirmation_items 新增 payment_date 欄位
-- 取代 Spec-006 的 payment_requests.payment_date 方案
-- ============================================================

ALTER TABLE payment_confirmation_items
ADD COLUMN IF NOT EXISTS payment_date date;

COMMENT ON COLUMN payment_confirmation_items.payment_date
  IS '匯款日期，在已確認請款清單中逐筆填入（Spec-007）';
