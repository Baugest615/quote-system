-- Add remittance_name column to quotation_items
ALTER TABLE quotation_items ADD COLUMN IF NOT EXISTS remittance_name text;

-- Drop existing function to update return type
DROP FUNCTION IF EXISTS get_available_pending_payments();

-- Update function to include cost and remittance_name
CREATE FUNCTION get_available_pending_payments()
RETURNS TABLE (
  id text,
  quotation_id text,
  category text,
  kol_id text,
  service text,
  quantity integer,
  price numeric,
  cost numeric,
  remittance_name text,
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
    qi.cost,
    qi.remittance_name,
    qi.remark,
    qi.created_at,
    -- Combine quotation data with client data
    (to_jsonb(q.*) || jsonb_build_object('clients', to_jsonb(c.*))) as quotations,
    to_jsonb(k.*) as kols
  FROM quotation_items qi
  LEFT JOIN quotations q ON qi.quotation_id = q.id
  LEFT JOIN clients c ON q.client_id = c.id
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

COMMENT ON FUNCTION get_available_pending_payments() IS '取得可用於請款的報價項目（已簽約且未請款的項目），包含客戶資訊、成本與匯款戶名';
