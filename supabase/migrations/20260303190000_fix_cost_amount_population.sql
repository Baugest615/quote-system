-- ============================================================
-- Migration: 修復 cost_amount 未自動計算的問題
--
-- 問題：quotation_items 的 cost_amount（請款金額）在報價單儲存時
--       被排除，導致工作台顯示 $0。
--
-- 修復：
--   1. 回補：cost_amount = cost * quantity（僅限未手動設定的項目）
--   2. get_workbench_items RPC 加 COALESCE fallback
-- ============================================================

-- 1. 回補 cost_amount
UPDATE public.quotation_items
SET cost_amount = cost * COALESCE(quantity, 1)
WHERE (cost_amount IS NULL OR cost_amount = 0)
  AND cost IS NOT NULL
  AND cost > 0;

-- 2. get_workbench_items：cost_amount 加 COALESCE fallback
CREATE OR REPLACE FUNCTION public.get_workbench_items()
RETURNS TABLE (
  id uuid,
  quotation_id uuid,
  kol_id uuid,
  category text,
  service text,
  quantity integer,
  price numeric,
  cost numeric,
  cost_amount numeric,
  invoice_number text,
  attachments jsonb,
  expense_type text,
  accounting_subject text,
  expected_payment_month text,
  remittance_name text,
  remark text,
  requested_at timestamptz,
  requested_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  rejected_at timestamptz,
  rejected_by uuid,
  rejection_reason text,
  merge_group_id uuid,
  is_merge_leader boolean,
  merge_color text,
  created_at timestamptz,
  -- 關聯資訊
  project_name text,
  client_name text,
  kol_name text,
  kol_bank_info jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    qi.id,
    qi.quotation_id,
    qi.kol_id,
    qi.category,
    qi.service,
    qi.quantity,
    qi.price,
    qi.cost,
    COALESCE(NULLIF(qi.cost_amount, 0), qi.cost * COALESCE(qi.quantity, 1), 0::numeric) AS cost_amount,
    qi.invoice_number,
    qi.attachments,
    qi.expense_type,
    qi.accounting_subject,
    qi.expected_payment_month,
    qi.remittance_name,
    qi.remark,
    qi.requested_at,
    qi.requested_by,
    qi.approved_at,
    qi.approved_by,
    qi.rejected_at,
    qi.rejected_by,
    qi.rejection_reason,
    qi.merge_group_id,
    qi.is_merge_leader,
    qi.merge_color,
    qi.created_at,
    q.project_name,
    c.name  AS client_name,
    k.name  AS kol_name,
    k.bank_info AS kol_bank_info
  FROM public.quotation_items qi
  JOIN public.quotations q ON qi.quotation_id = q.id
  LEFT JOIN public.clients c ON q.client_id = c.id
  LEFT JOIN public.kols k ON qi.kol_id = k.id
  WHERE qi.approved_at IS NULL
    AND (
      -- 正常路徑：待簽約/已簽約/已歸檔報價單的未核准項目
      q.status IN ('待簽約', '已簽約', '已歸檔')
      -- 修復路徑：已進入請款流程的項目（不論報價單當前狀態）
      OR qi.requested_at IS NOT NULL
      OR (qi.rejected_at IS NOT NULL AND qi.rejection_reason IS NOT NULL)
    )
  ORDER BY qi.remittance_name NULLS LAST, q.project_name, qi.created_at;
END;
$$;

COMMENT ON FUNCTION public.get_workbench_items()
IS '請款工作台：取得所有需處理的項目（cost_amount 自動 fallback 為 cost*quantity）';
