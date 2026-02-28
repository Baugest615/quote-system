-- =============================================================================
-- Migration: quotation_items 新增請款管理欄位
-- 目的: 將「待請款管理」和「請款申請」的功能整合到報價單項目中
-- =============================================================================

-- 請款金額（預設等於 cost，可獨立修改）
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS cost_amount numeric(12,2);

-- 文件檢核
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS invoice_number text,
  ADD COLUMN IF NOT EXISTS attachments jsonb DEFAULT '[]'::jsonb;

-- 帳務分類
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS expense_type text DEFAULT '勞務報酬',
  ADD COLUMN IF NOT EXISTS accounting_subject text,
  ADD COLUMN IF NOT EXISTS expected_payment_month text;

-- 請款（Member+ 勾選）
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS requested_at timestamptz,
  ADD COLUMN IF NOT EXISTS requested_by uuid REFERENCES auth.users(id);

-- 審核（Editor+ 勾選）
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);

-- 駁回
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS rejection_reason text,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES auth.users(id);

-- 合併群組（從 payment_requests 遷移的概念）
ALTER TABLE quotation_items
  ADD COLUMN IF NOT EXISTS merge_group_id uuid,
  ADD COLUMN IF NOT EXISTS is_merge_leader boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS merge_color text;

-- 初始化 cost_amount = cost（既有資料）
UPDATE quotation_items
SET cost_amount = cost
WHERE cost IS NOT NULL AND cost_amount IS NULL;

-- 欄位說明
COMMENT ON COLUMN quotation_items.cost_amount IS '請款金額（預設等於 cost，可獨立修改）';
COMMENT ON COLUMN quotation_items.invoice_number IS '發票號碼（格式: XX-12345678）';
COMMENT ON COLUMN quotation_items.attachments IS '附件列表 JSON array';
COMMENT ON COLUMN quotation_items.expense_type IS '支出種類（勞務報酬、外包服務等）';
COMMENT ON COLUMN quotation_items.accounting_subject IS '會計科目';
COMMENT ON COLUMN quotation_items.expected_payment_month IS '預計支付月份（如 2026年3月）';
COMMENT ON COLUMN quotation_items.requested_at IS '請款送出時間（Member+ 勾選）';
COMMENT ON COLUMN quotation_items.approved_at IS '審核通過時間（Editor+ 勾選）';
COMMENT ON COLUMN quotation_items.rejection_reason IS '駁回原因';
COMMENT ON COLUMN quotation_items.merge_group_id IS '合併群組 ID';
COMMENT ON COLUMN quotation_items.is_merge_leader IS '是否為合併群組主項目';

-- 索引
CREATE INDEX IF NOT EXISTS idx_qi_requested_at ON quotation_items(requested_at) WHERE requested_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qi_approved_at ON quotation_items(approved_at) WHERE approved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_qi_merge_group_id ON quotation_items(merge_group_id) WHERE merge_group_id IS NOT NULL;
