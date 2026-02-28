-- =============================================================================
-- Migration: accounting_expenses 和 payment_confirmation_items 新增 quotation_item_id FK
-- 目的: 建立報價項目到進項記錄和確認記錄的直接關聯
-- =============================================================================

-- accounting_expenses 新增 quotation_item_id
ALTER TABLE accounting_expenses
  ADD COLUMN IF NOT EXISTS quotation_item_id uuid REFERENCES quotation_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_ae_quotation_item_id
  ON accounting_expenses(quotation_item_id) WHERE quotation_item_id IS NOT NULL;

COMMENT ON COLUMN accounting_expenses.quotation_item_id IS '關聯的報價項目 ID（新流程直接連結）';

-- payment_confirmation_items 新增 quotation_item_id
ALTER TABLE payment_confirmation_items
  ADD COLUMN IF NOT EXISTS quotation_item_id uuid REFERENCES quotation_items(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_pci_quotation_item_id
  ON payment_confirmation_items(quotation_item_id) WHERE quotation_item_id IS NOT NULL;

COMMENT ON COLUMN payment_confirmation_items.quotation_item_id IS '關聯的報價項目 ID（新流程直接連結）';

-- source_type 新增 'quotation' 值
-- 先移除舊的 CHECK 約束（如果存在）
ALTER TABLE payment_confirmation_items
  DROP CONSTRAINT IF EXISTS payment_confirmation_items_source_type_check;

-- 建立新的 CHECK 約束（支援三種來源）
ALTER TABLE payment_confirmation_items
  ADD CONSTRAINT payment_confirmation_items_source_type_check
  CHECK (source_type IN ('project', 'personal', 'quotation'));
