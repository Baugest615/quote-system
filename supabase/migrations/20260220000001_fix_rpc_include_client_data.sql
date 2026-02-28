-- =====================================================
-- 修復 get_available_pending_payments 函數
-- 重新加入 clients 表 JOIN，解決「未知客戶」問題
-- 原因：20260219000001 修復 updated_at 時不慎移除了 client JOIN
-- =====================================================

DROP FUNCTION IF EXISTS get_available_pending_payments();

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
    -- 合併 quotation 與 client 資料
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

COMMENT ON FUNCTION get_available_pending_payments IS '取得可請款的報價項目（已簽約但尚未請款），包含客戶資訊';

NOTIFY pgrst, 'reload config';
