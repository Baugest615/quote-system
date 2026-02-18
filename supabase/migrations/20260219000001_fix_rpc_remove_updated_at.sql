-- =====================================================
-- 修復 get_available_pending_payments 函數
-- quotation_items 表沒有 updated_at 欄位，移除引用
-- =====================================================

CREATE OR REPLACE FUNCTION get_available_pending_payments()
RETURNS TABLE(
  id text,
  quotation_id text,
  category text,
  kol_id text,
  service text,
  quantity integer,
  price numeric,
  cost numeric,
  remark text,
  created_at timestamptz,
  quotations jsonb,
  kols jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT
    qi.id::text,
    qi.quotation_id::text,
    qi.category,
    qi.kol_id::text,
    qi.service,
    qi.quantity,
    qi.price,
    qi.cost,
    qi.remark,
    qi.created_at,
    to_jsonb(q.*) as quotations,
    to_jsonb(k.*) as kols
  FROM quotation_items qi
  LEFT JOIN quotations q ON qi.quotation_id = q.id
  LEFT JOIN kols k ON qi.kol_id = k.id
  WHERE q.status = '已簽約'
    AND NOT EXISTS (
      SELECT 1
      FROM payment_requests pr
      WHERE pr.quotation_item_id = qi.id
        AND pr.verification_status IN ('pending', 'approved', 'confirmed')
    );
END;
$$;

COMMENT ON FUNCTION get_available_pending_payments IS '取得可請款的報價項目（已簽約但尚未請款）';

NOTIFY pgrst, 'reload config';
