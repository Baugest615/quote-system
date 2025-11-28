-- Update get_available_pending_payments function to include cost field
-- First drop the existing function
DROP FUNCTION IF EXISTS get_available_pending_payments();

-- Then create the new version with cost field
CREATE FUNCTION get_available_pending_payments()
RETURNS TABLE (
  id text,
  quotation_id text,
  category text,
  kol_id text,
  service text,
  quantity integer,
  price numeric,
  cost numeric,  -- 🆕 Added cost field
  remark text,
  created_at timestamptz,
  updated_at timestamptz,
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
    qi.cost,  -- 🆕 Include cost in SELECT
    qi.remark,
    qi.created_at,
    qi.updated_at,
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

COMMENT ON FUNCTION get_available_pending_payments() IS '取得可用於請款的報價項目（已簽約且未請款的項目），包含成本欄位';
