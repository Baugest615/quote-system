-- Migration: expense_claims 新增 quotation_id FK
-- Created: 2026-03-01
-- Purpose: 建立 expense_claims 與 quotations 的正式關聯，以支援報價編號整合

-- ============================================================
-- 1. 新增欄位
-- ============================================================

ALTER TABLE public.expense_claims
  ADD COLUMN IF NOT EXISTS quotation_id UUID REFERENCES public.quotations(id);

COMMENT ON COLUMN public.expense_claims.quotation_id IS '關聯報價單 ID，用於顯示報價編號 (quote_number)';

-- ============================================================
-- 2. 建立索引
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_expense_claims_quotation_id
  ON public.expense_claims(quotation_id);

-- ============================================================
-- 3. 回填既有資料（透過 project_name 匹配，取最新的 quotation）
-- ============================================================

UPDATE public.expense_claims ec
SET quotation_id = (
  SELECT q.id
  FROM public.quotations q
  WHERE q.project_name = ec.project_name
  ORDER BY q.created_at DESC
  LIMIT 1
)
WHERE ec.project_name IS NOT NULL
  AND ec.quotation_id IS NULL;
