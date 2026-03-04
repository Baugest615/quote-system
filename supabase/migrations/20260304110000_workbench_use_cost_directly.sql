-- ============================================================
-- Migration: 工作台請款金額直接使用 cost（成本欄位）
--
-- 問題：cost_amount 可能是過期值（早期 migration 回補後 cost 被修改，
--       但 cost_amount 未同步），導致工作台顯示金額與成本不一致。
--
-- 修復：
--   1. 回補：cost_amount = cost（同步所有未核准項目）
--   2. get_workbench_items RPC 改用 cost 為主要來源
--   3. 新增 trigger：quotation_items 更新 cost 時自動同步 cost_amount
-- ============================================================


-- 1. 回補：所有未核准項目的 cost_amount 同步為 cost
UPDATE public.quotation_items
SET cost_amount = cost
WHERE approved_at IS NULL
  AND cost IS NOT NULL
  AND (cost_amount IS NULL OR cost_amount != cost);


-- 2. get_workbench_items：cost_amount 直接使用 cost
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
    COALESCE(qi.cost, 0::numeric) AS cost_amount,
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
      q.status IN ('待簽約', '已簽約', '已歸檔')
      OR qi.requested_at IS NOT NULL
      OR (qi.rejected_at IS NOT NULL AND qi.rejection_reason IS NOT NULL)
    )
  ORDER BY qi.remittance_name NULLS LAST, q.project_name, qi.created_at;
END;
$$;

COMMENT ON FUNCTION public.get_workbench_items()
IS '請款工作台：cost_amount 直接使用 cost 欄位，不再依賴可能過期的 cost_amount';


-- 3. Trigger：cost 更新時自動同步 cost_amount
CREATE OR REPLACE FUNCTION public.sync_cost_amount()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.cost IS DISTINCT FROM OLD.cost THEN
    NEW.cost_amount := NEW.cost;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_cost_amount ON public.quotation_items;
CREATE TRIGGER trg_sync_cost_amount
  BEFORE UPDATE ON public.quotation_items
  FOR EACH ROW
  WHEN (NEW.approved_at IS NULL)
  EXECUTE FUNCTION public.sync_cost_amount();

COMMENT ON TRIGGER trg_sync_cost_amount ON public.quotation_items
IS '未核准項目：cost 變更時自動同步 cost_amount';
