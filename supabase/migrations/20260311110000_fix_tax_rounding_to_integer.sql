-- ============================================================
-- 營業稅計算統一四捨五入到整數
-- 台灣發票金額以「元」為單位，小數點以下四捨五入
-- ============================================================

CREATE OR REPLACE FUNCTION "public"."create_accounting_sale_from_quotation"("p_quotation_id" "uuid", "p_user_id" "uuid") RETURNS "uuid"
    LANGUAGE "plpgsql" SECURITY DEFINER
    AS $$
DECLARE
  v_quotation RECORD;
  v_existing_sale_id UUID;
  v_sales_amount NUMERIC(15,2);
  v_tax_amount NUMERIC(15,2);
  v_total_amount NUMERIC(15,2);
  v_year INTEGER;
  v_invoice_month TEXT;
  v_sale_id UUID;
  v_created_at TIMESTAMPTZ;
  v_subtotal_untaxed NUMERIC;
  v_has_discount BOOLEAN;
  v_discounted_price NUMERIC;
BEGIN
  -- 取得報價單基本資訊
  SELECT q.*, c.name as client_name
  INTO v_quotation
  FROM quotations q
  LEFT JOIN clients c ON q.client_id = c.id
  WHERE q.id = p_quotation_id;

  IF v_quotation IS NULL THEN
    RAISE EXCEPTION '找不到報價單: %', p_quotation_id;
  END IF;

  -- 取得已有的 sale 記錄
  SELECT id INTO v_existing_sale_id
  FROM accounting_sales
  WHERE quotation_id = p_quotation_id
  LIMIT 1;

  -- 計算未稅金額（考慮折扣）
  SELECT
    SUM(qi.price * qi.quantity),
    bool_or(qi.discounted_price IS NOT NULL),
    SUM(qi.discounted_price)
  INTO v_subtotal_untaxed, v_has_discount, v_discounted_price
  FROM quotation_items qi
  WHERE qi.quotation_id = p_quotation_id;

  -- 使用報價單建立日期
  v_created_at := v_quotation.created_at;

  -- 如果報價單沒有建立日期，用當前時間
  IF v_created_at IS NULL THEN
    v_created_at := NOW();
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

  v_tax_amount := ROUND(v_sales_amount * 0.05);
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
      project_name = v_quotation.project_name,
      client_name = v_quotation.client_name
    WHERE id = v_existing_sale_id;
    RETURN v_existing_sale_id;
  END IF;

  -- 新增
  INSERT INTO public.accounting_sales (
    year,
    invoice_month,
    project_name,
    client_name,
    sales_amount,
    tax_amount,
    total_amount,
    quotation_id,
    created_by
  ) VALUES (
    v_year,
    v_invoice_month,
    v_quotation.project_name,
    v_quotation.client_name,
    v_sales_amount,
    v_tax_amount,
    v_total_amount,
    p_quotation_id,
    p_user_id
  )
  RETURNING id INTO v_sale_id;

  RETURN v_sale_id;
END;
$$;

COMMENT ON FUNCTION "public"."create_accounting_sale_from_quotation"("p_quotation_id" "uuid", "p_user_id" "uuid") IS '報價單簽約時自動建立銷項帳務記錄（年月取自報價單建立日期，稅額四捨五入到整數）';
