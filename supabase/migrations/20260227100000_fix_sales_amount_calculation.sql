-- =====================================================
-- 修復 create_accounting_sale_from_quotation RPC
-- 1. 既有記錄金額為 0 時允許重新計算（UPDATE 取代 early return）
-- 2. 加入 SET search_path = '' 安全設定
-- 3. 回填既有 sales_amount = 0 的 accounting_sales 記錄
-- =====================================================

DROP FUNCTION IF EXISTS create_accounting_sale_from_quotation(uuid, uuid);

CREATE OR REPLACE FUNCTION create_accounting_sale_from_quotation(
  p_quotation_id uuid,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_existing_sale_id uuid;
  v_existing_amount numeric;
  v_new_sale_id uuid;
  v_project_name text;
  v_client_name text;
  v_has_discount boolean;
  v_discounted_price numeric;
  v_subtotal_untaxed numeric;
  v_sales_amount numeric;
  v_tax_amount numeric;
  v_total_amount numeric;
BEGIN
  -- 檢查是否已有連結記錄
  SELECT id, sales_amount INTO v_existing_sale_id, v_existing_amount
  FROM public.accounting_sales
  WHERE quotation_id = p_quotation_id
  LIMIT 1;

  -- 如果已有記錄且金額 > 0，直接返回（避免重複）
  IF v_existing_sale_id IS NOT NULL AND v_existing_amount > 0 THEN
    RETURN v_existing_sale_id;
  END IF;

  -- 取得報價單資訊（含客戶名稱）
  SELECT
    q.project_name,
    c.name,
    q.has_discount,
    q.discounted_price,
    q.subtotal_untaxed
  INTO
    v_project_name,
    v_client_name,
    v_has_discount,
    v_discounted_price,
    v_subtotal_untaxed
  FROM public.quotations q
  LEFT JOIN public.clients c ON q.client_id = c.id
  WHERE q.id = p_quotation_id;

  IF v_project_name IS NULL THEN
    RAISE EXCEPTION '找不到報價單: %', p_quotation_id;
  END IF;

  -- 計算金額（優先使用折扣價）
  IF v_has_discount AND v_discounted_price IS NOT NULL THEN
    v_sales_amount := v_discounted_price;
  ELSE
    v_sales_amount := COALESCE(v_subtotal_untaxed, 0);
  END IF;

  v_tax_amount := ROUND(v_sales_amount * 0.05, 2);
  v_total_amount := v_sales_amount + v_tax_amount;

  -- 如果已有記錄但金額為 0，UPDATE 重新計算
  IF v_existing_sale_id IS NOT NULL THEN
    UPDATE public.accounting_sales
    SET
      sales_amount = v_sales_amount,
      tax_amount = v_tax_amount,
      total_amount = v_total_amount,
      project_name = v_project_name,
      client_name = v_client_name,
      note = '系統自動建立 - 報價單簽約（金額已更新）'
    WHERE id = v_existing_sale_id;

    RETURN v_existing_sale_id;
  END IF;

  -- 新增銷項記錄
  INSERT INTO public.accounting_sales (
    year,
    project_name,
    client_name,
    sales_amount,
    tax_amount,
    total_amount,
    quotation_id,
    note,
    created_by
  ) VALUES (
    EXTRACT(YEAR FROM NOW())::integer,
    v_project_name,
    v_client_name,
    v_sales_amount,
    v_tax_amount,
    v_total_amount,
    p_quotation_id,
    '系統自動建立 - 報價單簽約',
    p_user_id
  )
  RETURNING id INTO v_new_sale_id;

  RETURN v_new_sale_id;
END;
$$;

COMMENT ON FUNCTION create_accounting_sale_from_quotation IS '報價單簽約時自動建立銷項帳務記錄（支援金額為 0 時重新計算）';

-- =====================================================
-- 回填：重新計算所有金額為 0 的 accounting_sales 記錄
-- =====================================================

UPDATE accounting_sales AS s
SET
  sales_amount = CASE
    WHEN q.has_discount AND q.discounted_price IS NOT NULL THEN q.discounted_price
    ELSE COALESCE(q.subtotal_untaxed, 0)
  END,
  tax_amount = ROUND(
    CASE
      WHEN q.has_discount AND q.discounted_price IS NOT NULL THEN q.discounted_price
      ELSE COALESCE(q.subtotal_untaxed, 0)
    END * 0.05, 2
  ),
  total_amount = CASE
    WHEN q.has_discount AND q.discounted_price IS NOT NULL THEN q.discounted_price
    ELSE COALESCE(q.subtotal_untaxed, 0)
  END + ROUND(
    CASE
      WHEN q.has_discount AND q.discounted_price IS NOT NULL THEN q.discounted_price
      ELSE COALESCE(q.subtotal_untaxed, 0)
    END * 0.05, 2
  ),
  note = '系統自動建立 - 報價單簽約（金額已回填）'
FROM quotations q
WHERE s.quotation_id = q.id
  AND s.sales_amount = 0
  AND (COALESCE(q.subtotal_untaxed, 0) > 0 OR (q.has_discount AND q.discounted_price IS NOT NULL AND q.discounted_price > 0));

-- =====================================================
-- 補建：為已簽約但缺少 accounting_sales 記錄的報價單建立記錄
-- =====================================================

INSERT INTO accounting_sales (year, project_name, client_name, sales_amount, tax_amount, total_amount, quotation_id, note)
SELECT
  EXTRACT(YEAR FROM q.created_at)::integer,
  q.project_name,
  c.name,
  CASE
    WHEN q.has_discount AND q.discounted_price IS NOT NULL THEN q.discounted_price
    ELSE COALESCE(q.subtotal_untaxed, 0)
  END,
  ROUND(
    CASE
      WHEN q.has_discount AND q.discounted_price IS NOT NULL THEN q.discounted_price
      ELSE COALESCE(q.subtotal_untaxed, 0)
    END * 0.05, 2
  ),
  CASE
    WHEN q.has_discount AND q.discounted_price IS NOT NULL THEN q.discounted_price
    ELSE COALESCE(q.subtotal_untaxed, 0)
  END + ROUND(
    CASE
      WHEN q.has_discount AND q.discounted_price IS NOT NULL THEN q.discounted_price
      ELSE COALESCE(q.subtotal_untaxed, 0)
    END * 0.05, 2
  ),
  q.id,
  '系統自動建立 - 報價單簽約（補建）'
FROM quotations q
LEFT JOIN clients c ON q.client_id = c.id
WHERE q.status = '已簽約'
  AND NOT EXISTS (
    SELECT 1 FROM accounting_sales s WHERE s.quotation_id = q.id
  )
  AND (COALESCE(q.subtotal_untaxed, 0) > 0 OR (q.has_discount AND q.discounted_price IS NOT NULL AND q.discounted_price > 0));

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
