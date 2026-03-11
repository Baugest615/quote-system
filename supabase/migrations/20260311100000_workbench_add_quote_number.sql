-- ============================================================
-- 請款工作台 RPC：新增 quote_number 回傳欄位
-- 讓前端搜尋可以透過專案編號找到項目
-- 因回傳欄位變更，需先 DROP 再重建
-- ============================================================

DROP FUNCTION IF EXISTS public.get_workbench_items();

CREATE FUNCTION public.get_workbench_items()
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
  kol_bank_info jsonb,
  quote_number text
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
    k.bank_info AS kol_bank_info,
    q.quote_number
  FROM public.quotation_items qi
  JOIN public.quotations q ON qi.quotation_id = q.id
  LEFT JOIN public.clients c ON q.client_id = c.id
  LEFT JOIN public.kols k ON qi.kol_id = k.id
  WHERE q.status = '已簽約'
    AND qi.approved_at IS NULL
  ORDER BY qi.remittance_name NULLS LAST, q.project_name, qi.created_at;
END;
$$;

ALTER FUNCTION public.get_workbench_items() OWNER TO postgres;
COMMENT ON FUNCTION public.get_workbench_items()
IS '請款工作台：取得所有已簽約報價單中尚未核准的項目（pending / requested / rejected），含 quote_number';
