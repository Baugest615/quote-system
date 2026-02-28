-- =====================================================
-- 帳務自動連動：報價單簽約 → 銷項、請款核准 → 進項
-- =====================================================

-- 1. 銷項表新增 quotation_id 外鍵欄位
ALTER TABLE accounting_sales
  ADD COLUMN quotation_id uuid REFERENCES quotations(id) ON DELETE SET NULL;

-- 唯一部分索引：每張報價單最多對應一筆銷項（手動建立的不受影響）
CREATE UNIQUE INDEX idx_accounting_sales_quotation_id
  ON accounting_sales(quotation_id)
  WHERE quotation_id IS NOT NULL;

-- 2. 進項表新增 payment_request_id 外鍵欄位
ALTER TABLE accounting_expenses
  ADD COLUMN payment_request_id uuid REFERENCES payment_requests(id) ON DELETE SET NULL;

-- 唯一部分索引：每筆請款最多對應一筆進項
CREATE UNIQUE INDEX idx_accounting_expenses_payment_request_id
  ON accounting_expenses(payment_request_id)
  WHERE payment_request_id IS NOT NULL;

-- =====================================================
-- 3. RPC：報價單簽約時自動建立銷項記錄
-- =====================================================
CREATE OR REPLACE FUNCTION create_accounting_sale_from_quotation(
  p_quotation_id uuid,
  p_user_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_existing_sale_id uuid;
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
  -- 檢查是否已有連結記錄（避免重複）
  SELECT id INTO v_existing_sale_id
  FROM accounting_sales
  WHERE quotation_id = p_quotation_id
  LIMIT 1;

  IF v_existing_sale_id IS NOT NULL THEN
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
  FROM quotations q
  LEFT JOIN clients c ON q.client_id = c.id
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

  -- 新增銷項記錄
  INSERT INTO accounting_sales (
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

COMMENT ON FUNCTION create_accounting_sale_from_quotation IS '報價單簽約時自動建立銷項帳務記錄';

-- =====================================================
-- 4. RPC：報價單取消簽約時刪除對應銷項記錄
-- =====================================================
CREATE OR REPLACE FUNCTION remove_accounting_sale_for_quotation(
  p_quotation_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  DELETE FROM accounting_sales
  WHERE quotation_id = p_quotation_id;
END;
$$;

COMMENT ON FUNCTION remove_accounting_sale_for_quotation IS '報價單取消簽約時刪除對應銷項帳務記錄';

-- =====================================================
-- 5. 更新 approve_payment_request：核准時自動建立進項記錄
-- =====================================================
CREATE OR REPLACE FUNCTION approve_payment_request(
  request_id uuid,
  verifier_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_confirmation_id uuid;
  v_cost_amount numeric;
  v_confirmation_date date;
  v_kol_name text;
  v_project_name text;
  v_service text;
  v_invoice_number text;
  v_existing_expense_id uuid;
BEGIN
  -- 取得請款相關資訊（含發票號碼）
  SELECT
    pr.cost_amount,
    k.name,
    q.project_name,
    qi.service,
    pr.invoice_number
  INTO
    v_cost_amount,
    v_kol_name,
    v_project_name,
    v_service,
    v_invoice_number
  FROM payment_requests pr
  JOIN quotation_items qi ON pr.quotation_item_id = qi.id
  LEFT JOIN kols k ON qi.kol_id = k.id
  LEFT JOIN quotations q ON qi.quotation_id = q.id
  WHERE pr.id = request_id;

  -- 驗證
  IF v_cost_amount IS NULL THEN
    RAISE EXCEPTION 'Cost amount not found for payment request %', request_id;
  END IF;

  IF v_kol_name IS NULL THEN
     v_kol_name := 'Unknown KOL';
  END IF;

  IF v_project_name IS NULL THEN
     v_project_name := 'Unknown Project';
  END IF;

  IF v_service IS NULL THEN
     v_service := 'Unknown Service';
  END IF;

  v_confirmation_date := CURRENT_DATE;

  -- 檢查今日是否已有確認記錄
  SELECT id INTO v_confirmation_id
  FROM payment_confirmations
  WHERE confirmation_date = v_confirmation_date
  LIMIT 1;

  IF v_confirmation_id IS NULL THEN
    INSERT INTO payment_confirmations (
      confirmation_date,
      total_amount,
      total_items,
      created_by,
      created_at
    ) VALUES (
      v_confirmation_date,
      v_cost_amount,
      1,
      verifier_id,
      NOW()
    )
    RETURNING id INTO v_confirmation_id;
  ELSE
    UPDATE payment_confirmations
    SET
      total_amount = total_amount + v_cost_amount,
      total_items = total_items + 1
    WHERE id = v_confirmation_id;
  END IF;

  -- 建立確認項目（含快照）
  INSERT INTO payment_confirmation_items (
    payment_confirmation_id,
    payment_request_id,
    amount_at_confirmation,
    kol_name_at_confirmation,
    project_name_at_confirmation,
    service_at_confirmation,
    created_at
  ) VALUES (
    v_confirmation_id,
    request_id,
    v_cost_amount,
    v_kol_name,
    v_project_name,
    v_service,
    NOW()
  );

  -- 更新請款狀態
  UPDATE payment_requests
  SET
    verification_status = 'approved',
    approved_by = verifier_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = request_id;

  -- =====================================================
  -- 自動建立進項帳務記錄
  -- =====================================================
  SELECT id INTO v_existing_expense_id
  FROM accounting_expenses
  WHERE payment_request_id = request_id
  LIMIT 1;

  IF v_existing_expense_id IS NULL THEN
    INSERT INTO accounting_expenses (
      year,
      expense_type,
      amount,
      tax_amount,
      total_amount,
      vendor_name,
      project_name,
      invoice_number,
      payment_request_id,
      note,
      created_by
    ) VALUES (
      EXTRACT(YEAR FROM NOW())::integer,
      '勞務報酬',
      v_cost_amount,
      0,
      v_cost_amount,
      v_kol_name,
      v_project_name,
      v_invoice_number,
      request_id,
      '系統自動建立 - 請款核准 (' || v_service || ')',
      verifier_id
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION approve_payment_request IS '核准請款申請並建立確認記錄與帳務記錄（包含完整快照資訊）';

-- =====================================================
-- 6. 回填：為既有「已簽約」報價單建立銷項記錄
-- =====================================================
INSERT INTO accounting_sales (
  year,
  project_name,
  client_name,
  sales_amount,
  tax_amount,
  total_amount,
  quotation_id,
  note
)
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
  '系統自動建立 - 報價單簽約（回填）'
FROM quotations q
LEFT JOIN clients c ON q.client_id = c.id
WHERE q.status = '已簽約'
  AND NOT EXISTS (
    SELECT 1 FROM accounting_sales s WHERE s.quotation_id = q.id
  );

-- =====================================================
-- 7. 回填：為既有「已核准」請款建立進項記錄
-- =====================================================
INSERT INTO accounting_expenses (
  year,
  expense_type,
  amount,
  tax_amount,
  total_amount,
  vendor_name,
  project_name,
  invoice_number,
  payment_request_id,
  note,
  created_by
)
SELECT
  EXTRACT(YEAR FROM pr.approved_at)::integer,
  '勞務報酬',
  pr.cost_amount,
  0,
  pr.cost_amount,
  k.name,
  q.project_name,
  pr.invoice_number,
  pr.id,
  '系統自動建立 - 請款核准（回填） (' || qi.service || ')',
  pr.approved_by
FROM payment_requests pr
JOIN quotation_items qi ON pr.quotation_item_id = qi.id
LEFT JOIN kols k ON qi.kol_id = k.id
LEFT JOIN quotations q ON qi.quotation_id = q.id
WHERE pr.verification_status = 'approved'
  AND pr.cost_amount IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM accounting_expenses e WHERE e.payment_request_id = pr.id
  );

NOTIFY pgrst, 'reload config';
