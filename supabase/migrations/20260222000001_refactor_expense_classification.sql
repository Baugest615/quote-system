-- =====================================================
-- 支出分類系統重構
-- 支出種類 5→7、新增付款對象欄位、會計科目擴充
-- =====================================================

BEGIN;

-- =====================================================
-- 1. accounting_expenses：移除舊 CHECK、映射資料、加新欄位
-- =====================================================

-- 移除舊的 expense_type CHECK constraint
ALTER TABLE accounting_expenses DROP CONSTRAINT IF EXISTS accounting_expenses_expense_type_check;

-- 映射舊資料到新分類
UPDATE accounting_expenses SET expense_type = '營運費用' WHERE expense_type = '公司相關';
UPDATE accounting_expenses SET expense_type = '專案費用' WHERE expense_type = '專案支出';

-- 新增 payment_target_type 欄位
ALTER TABLE accounting_expenses
  ADD COLUMN IF NOT EXISTS payment_target_type text
    CHECK (payment_target_type IN ('kol', 'vendor', 'employee', 'other'));

-- 回填 payment_target_type（基於現有資料推斷）
UPDATE accounting_expenses SET payment_target_type = 'kol'
  WHERE payment_request_id IS NOT NULL AND payment_target_type IS NULL;
UPDATE accounting_expenses SET payment_target_type = 'employee'
  WHERE expense_claim_id IS NOT NULL AND payment_target_type IS NULL;

-- 加上新 CHECK constraint（7 種支出種類）
ALTER TABLE accounting_expenses
  ADD CONSTRAINT accounting_expenses_expense_type_check
    CHECK (expense_type IN ('勞務報酬', '外包服務', '專案費用', '員工代墊', '營運費用', '其他支出', '沖帳免付'));

-- 索引
CREATE INDEX IF NOT EXISTS idx_accounting_expenses_payment_target
  ON accounting_expenses(payment_target_type);

-- =====================================================
-- 2. expense_claims：同步更新
-- =====================================================

ALTER TABLE expense_claims DROP CONSTRAINT IF EXISTS expense_claims_expense_type_check;

UPDATE expense_claims SET expense_type = '營運費用' WHERE expense_type = '公司相關';
UPDATE expense_claims SET expense_type = '專案費用' WHERE expense_type = '專案支出';

ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS payment_target_type text
    CHECK (payment_target_type IN ('kol', 'vendor', 'employee', 'other'));

ALTER TABLE expense_claims
  ADD CONSTRAINT expense_claims_expense_type_check
    CHECK (expense_type IN ('勞務報酬', '外包服務', '專案費用', '員工代墊', '營運費用', '其他支出', '沖帳免付'));

-- =====================================================
-- 3. payment_requests：新增 expense_type 欄位（申請人選擇）
-- =====================================================

ALTER TABLE payment_requests
  ADD COLUMN IF NOT EXISTS expense_type text DEFAULT '勞務報酬'
    CHECK (expense_type IN ('勞務報酬', '外包服務', '專案費用', '員工代墊', '營運費用', '其他支出', '沖帳免付'));

-- =====================================================
-- 4. 更新 approve_payment_request RPC
--    改為從 payment_requests.expense_type 讀取（不再硬編碼）
-- =====================================================

DROP FUNCTION IF EXISTS approve_payment_request(uuid, uuid);

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
  v_expense_type text;
  v_existing_expense_id uuid;
  v_caller_role text;
BEGIN
  -- ====== 角色驗證 ======
  SELECT role INTO v_caller_role
  FROM public.user_roles
  WHERE user_id = (SELECT auth.uid());

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('Admin', 'Editor') THEN
    RAISE EXCEPTION '權限不足：只有 Admin 或 Editor 可以核准請款申請';
  END IF;

  -- 取得請款相關資訊（含發票號碼 + 支出種類）
  SELECT
    pr.cost_amount,
    k.name,
    q.project_name,
    qi.service,
    pr.invoice_number,
    COALESCE(pr.expense_type, '勞務報酬')
  INTO
    v_cost_amount,
    v_kol_name,
    v_project_name,
    v_service,
    v_invoice_number,
    v_expense_type
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
      payment_target_type,
      note,
      created_by
    ) VALUES (
      EXTRACT(YEAR FROM NOW())::integer,
      v_expense_type,
      v_cost_amount,
      0,
      v_cost_amount,
      v_kol_name,
      v_project_name,
      v_invoice_number,
      request_id,
      'kol',
      '系統自動建立 - 請款核准 (' || v_service || ')',
      verifier_id
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION approve_payment_request IS '核准請款申請並建立確認記錄與帳務記錄（支出種類由申請人選擇，含角色驗證）';

-- =====================================================
-- 5. 更新 approve_expense_claim RPC
--    新增 payment_target_type 推斷邏輯
-- =====================================================

DROP FUNCTION IF EXISTS approve_expense_claim(uuid, uuid);

CREATE OR REPLACE FUNCTION approve_expense_claim(
  claim_id uuid,
  approver_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_claim expense_claims%ROWTYPE;
  v_confirmation_id uuid;
  v_confirmation_date date;
  v_existing_expense_id uuid;
  v_caller_role text;
  v_payment_target text;
BEGIN
  -- ====== 角色驗證 ======
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = (SELECT auth.uid());

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('Admin', 'Editor') THEN
    RAISE EXCEPTION '權限不足：只有 Admin 或 Editor 可以核准個人報帳';
  END IF;

  -- 取得報帳記錄
  SELECT * INTO v_claim
  FROM expense_claims
  WHERE id = claim_id;

  IF v_claim.id IS NULL THEN
    RAISE EXCEPTION '找不到個人報帳記錄: %', claim_id;
  END IF;

  IF v_claim.status != 'submitted' THEN
    RAISE EXCEPTION '只能核准「已送出」的報帳記錄，目前狀態: %', v_claim.status;
  END IF;

  -- 推斷付款對象類型
  IF v_claim.expense_type = '員工代墊' THEN
    v_payment_target := 'employee';
  ELSIF v_claim.payment_target_type IS NOT NULL THEN
    v_payment_target := v_claim.payment_target_type;
  ELSIF v_claim.invoice_number IS NOT NULL AND v_claim.invoice_number != '' THEN
    v_payment_target := 'vendor';
  ELSE
    v_payment_target := 'other';
  END IF;

  -- ====== 更新報帳狀態 ======
  UPDATE expense_claims
  SET
    status = 'approved',
    approved_by = approver_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = claim_id;

  -- ====== 建立 / 更新確認記錄 ======
  v_confirmation_date := CURRENT_DATE;

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
      v_claim.total_amount,
      1,
      approver_id,
      NOW()
    )
    RETURNING id INTO v_confirmation_id;
  ELSE
    UPDATE payment_confirmations
    SET
      total_amount = total_amount + v_claim.total_amount,
      total_items = total_items + 1
    WHERE id = v_confirmation_id;
  END IF;

  -- 建立確認項目（快照 + 來源標記）
  INSERT INTO payment_confirmation_items (
    payment_confirmation_id,
    expense_claim_id,
    source_type,
    amount_at_confirmation,
    kol_name_at_confirmation,
    project_name_at_confirmation,
    service_at_confirmation,
    created_at
  ) VALUES (
    v_confirmation_id,
    claim_id,
    'personal',
    v_claim.total_amount,
    COALESCE(v_claim.vendor_name, '個人報帳'),
    COALESCE(v_claim.project_name, '無專案'),
    COALESCE(v_claim.expense_type || ' - ' || v_claim.accounting_subject, v_claim.expense_type),
    NOW()
  );

  -- ====== 自動建立進項帳務記錄 ======
  SELECT id INTO v_existing_expense_id
  FROM accounting_expenses
  WHERE expense_claim_id = claim_id
  LIMIT 1;

  IF v_existing_expense_id IS NULL THEN
    INSERT INTO accounting_expenses (
      year,
      expense_month,
      expense_type,
      accounting_subject,
      amount,
      tax_amount,
      total_amount,
      vendor_name,
      project_name,
      invoice_number,
      invoice_date,
      expense_claim_id,
      payment_target_type,
      note,
      created_by
    ) VALUES (
      v_claim.year,
      v_claim.claim_month,
      v_claim.expense_type,
      v_claim.accounting_subject,
      v_claim.amount,
      v_claim.tax_amount,
      v_claim.total_amount,
      v_claim.vendor_name,
      v_claim.project_name,
      v_claim.invoice_number,
      v_claim.invoice_date,
      claim_id,
      v_payment_target,
      '系統自動建立 - 個人報帳核准',
      approver_id
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION approve_expense_claim IS '核准個人報帳並自動建立確認記錄與進項帳務記錄（含付款對象推斷、角色驗證）';

-- =====================================================
-- 6. 更新 accounting_annual_summary VIEW（7 種分支）
-- =====================================================

DROP VIEW IF EXISTS accounting_annual_summary;

CREATE VIEW accounting_annual_summary AS
WITH all_years AS (
  SELECT DISTINCT year FROM accounting_sales
  UNION SELECT DISTINCT year FROM accounting_expenses
  UNION SELECT DISTINCT year FROM accounting_payroll
),
sales_agg AS (
  SELECT year,
    SUM(sales_amount) AS total_sales,
    SUM(tax_amount) AS total_sales_tax,
    SUM(total_amount) AS total_sales_with_tax
  FROM accounting_sales
  GROUP BY year
),
expenses_agg AS (
  SELECT year,
    SUM(amount) AS total_expenses,
    SUM(CASE WHEN expense_type = '勞務報酬' THEN amount ELSE 0 END) AS total_labor_expenses,
    SUM(CASE WHEN expense_type = '外包服務' THEN amount ELSE 0 END) AS total_outsource_expenses,
    SUM(CASE WHEN expense_type = '專案費用' THEN amount ELSE 0 END) AS total_project_expenses,
    SUM(CASE WHEN expense_type = '員工代墊' THEN amount ELSE 0 END) AS total_reimbursement_expenses,
    SUM(CASE WHEN expense_type = '營運費用' THEN amount ELSE 0 END) AS total_operation_expenses,
    SUM(CASE WHEN expense_type = '其他支出' THEN amount ELSE 0 END) AS total_other_expenses,
    SUM(CASE WHEN expense_type = '沖帳免付' THEN amount ELSE 0 END) AS total_writeoff_expenses
  FROM accounting_expenses
  GROUP BY year
),
payroll_agg AS (
  SELECT year,
    SUM(net_salary + company_total) AS total_payroll,
    SUM(net_salary) AS total_net_salary
  FROM accounting_payroll
  GROUP BY year
)
SELECT
  y.year,
  COALESCE(s.total_sales, 0) AS total_sales,
  COALESCE(s.total_sales_tax, 0) AS total_sales_tax,
  COALESCE(s.total_sales_with_tax, 0) AS total_sales_with_tax,
  COALESCE(e.total_labor_expenses, 0) AS total_labor_expenses,
  COALESCE(e.total_outsource_expenses, 0) AS total_outsource_expenses,
  COALESCE(e.total_project_expenses, 0) AS total_project_expenses,
  COALESCE(e.total_reimbursement_expenses, 0) AS total_reimbursement_expenses,
  COALESCE(e.total_operation_expenses, 0) AS total_operation_expenses,
  COALESCE(e.total_other_expenses, 0) AS total_other_expenses,
  COALESCE(e.total_writeoff_expenses, 0) AS total_writeoff_expenses,
  COALESCE(p.total_payroll, 0) AS total_payroll,
  COALESCE(s.total_sales, 0) - COALESCE(e.total_expenses, 0) - COALESCE(p.total_net_salary, 0) AS annual_profit
FROM all_years y
LEFT JOIN sales_agg s ON s.year = y.year
LEFT JOIN expenses_agg e ON e.year = y.year
LEFT JOIN payroll_agg p ON p.year = y.year
ORDER BY y.year DESC;

GRANT SELECT ON accounting_annual_summary TO authenticated;

-- =====================================================
-- 7. 欄位註解
-- =====================================================

COMMENT ON COLUMN accounting_expenses.expense_type IS '支出種類：勞務報酬、外包服務、專案費用、員工代墊、營運費用、其他支出、沖帳免付';
COMMENT ON COLUMN accounting_expenses.payment_target_type IS '付款對象類型：kol（KOL/自由工作者）、vendor（廠商）、employee（員工代墊）、other（其他）';
COMMENT ON COLUMN expense_claims.payment_target_type IS '付款對象類型：kol、vendor、employee、other';
COMMENT ON COLUMN payment_requests.expense_type IS '支出種類（由申請人選擇，預設勞務報酬）';

COMMIT;

NOTIFY pgrst, 'reload config';
