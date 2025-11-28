-- URGENT: Restore get_available_pending_payments function (without cost field first)
-- This will restore the original functionality immediately

DROP FUNCTION IF EXISTS get_available_pending_payments();

CREATE FUNCTION get_available_pending_payments()
RETURNS TABLE (
  id text,
  quotation_id text,
  category text,
  kol_id text,
  service text,
  quantity integer,
  price numeric,
  remark text,
  created_at timestamptz,
  quotations jsonb,
  kols jsonb
) 
LANGUAGE plpgsql
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

COMMENT ON FUNCTION get_available_pending_payments() IS '取得可用於請款的報價項目（已簽約且未請款的項目）';
