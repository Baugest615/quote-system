-- Spec 006: 匯款日期分日架構
-- payment_requests 新增 payment_date 欄位，記錄審核通過時的預計匯款日

ALTER TABLE payment_requests
ADD COLUMN IF NOT EXISTS payment_date date;

COMMENT ON COLUMN payment_requests.payment_date IS '預計匯款日期，審核通過時填入';
