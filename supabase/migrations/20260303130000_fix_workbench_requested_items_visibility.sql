-- ============================================================
-- Migration: 修復已送出（待審核）項目在工作台消失的 Bug
--
-- 問題：前一個 hotfix 只修了 rejected_at 的情況，漏了 requested_at。
--       當項目已送出待審核、但報價單狀態被改回草稿/待簽約，
--       待審核項目也會從工作台消失。
--
-- 修復：WHERE 條件再加 OR qi.requested_at IS NOT NULL
-- ============================================================

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
    qi.cost_amount,
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
      -- 正常路徑：已簽約/已歸檔報價單的未核准項目
      q.status IN ('已簽約', '已歸檔')
      -- 修復路徑：已進入請款流程的項目（不論報價單當前狀態）
      OR qi.requested_at IS NOT NULL
      OR (qi.rejected_at IS NOT NULL AND qi.rejection_reason IS NOT NULL)
    )
  ORDER BY qi.remittance_name NULLS LAST, q.project_name, qi.created_at;
END;
$$;

COMMENT ON FUNCTION public.get_workbench_items()
IS '請款工作台：取得所有需處理的項目（已送出/被駁回的項目不受報價單狀態限制）';
