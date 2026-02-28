-- =====================================================
-- 修正 accounting_sales 年月邏輯
-- 改用報價單建立日期 (quotation.created_at) 的年月
-- 而非簽約當下 NOW() 的年月
-- =====================================================

-- ============================================================
-- 1. 修改 RPC：年月改用 quotation.created_at
-- ============================================================

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
  v_created_at timestamptz;
  v_sales_amount numeric;
  v_tax_amount numeric;
  v_total_amount numeric;
  v_year integer;
  v_invoice_month text;
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

  -- 取得報價單資訊（含客戶名稱 + 建立日期）
  SELECT
    q.project_name,
    c.name,
    q.has_discount,
    q.discounted_price,
    q.subtotal_untaxed,
    q.created_at
  INTO
    v_project_name,
    v_client_name,
    v_has_discount,
    v_discounted_price,
    v_subtotal_untaxed,
    v_created_at
  FROM public.quotations q
  LEFT JOIN public.clients c ON q.client_id = c.id
  WHERE q.id = p_quotation_id;

  IF v_project_name IS NULL THEN
    RAISE EXCEPTION '找不到報價單: %', p_quotation_id;
  END IF;

  -- 使用報價單建立日期的年月
  v_year := EXTRACT(YEAR FROM v_created_at)::integer;
  v_invoice_month := TO_CHAR(v_created_at, 'YYYY') || '年' || EXTRACT(MONTH FROM v_created_at)::integer || '月';

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
      year = v_year,
      invoice_month = v_invoice_month,
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
    invoice_month,
    project_name,
    client_name,
    sales_amount,
    tax_amount,
    total_amount,
    quotation_id,
    note,
    created_by
  ) VALUES (
    v_year,
    v_invoice_month,
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

COMMENT ON FUNCTION create_accounting_sale_from_quotation IS '報價單簽約時自動建立銷項帳務記錄（年月取自報價單建立日期）';

-- ============================================================
-- 2. 回填：用報價單 created_at 更新所有自動建立記錄的 year + invoice_month
-- ============================================================

UPDATE accounting_sales AS s
SET
  year = EXTRACT(YEAR FROM q.created_at)::integer,
  invoice_month = TO_CHAR(q.created_at, 'YYYY') || '年' || EXTRACT(MONTH FROM q.created_at)::integer || '月'
FROM quotations q
WHERE s.quotation_id = q.id
  AND s.quotation_id IS NOT NULL;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
