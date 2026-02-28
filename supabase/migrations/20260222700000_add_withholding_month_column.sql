-- =====================================================
-- 新增 withholding_month 欄位
-- 解決問題：代扣代繳的「報帳月份」與「代扣所屬月份」可以不同
-- 例：2月代扣的稅，員工3月才代繳報帳 → claim_month=3月, withholding_month=2月
-- =====================================================

-- 1. 新增欄位
ALTER TABLE expense_claims
  ADD COLUMN IF NOT EXISTS withholding_month text;

COMMENT ON COLUMN expense_claims.withholding_month IS
  '代扣代繳所屬月份 (格式同 claim_month: YYYY年M月)，僅 expense_type=代扣代繳 時使用';

-- 2. 回填既有資料：已有的代扣代繳報帳，若沒設定 withholding_month 則用 claim_month
UPDATE expense_claims
SET withholding_month = claim_month
WHERE expense_type = '代扣代繳'
  AND withholding_month IS NULL
  AND claim_month IS NOT NULL;

-- 3. 更新 approve_expense_claim RPC：使用 withholding_month 作為 settlement 月份
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
  v_settlement_month text;
  v_month_source text;
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
  IF v_claim.expense_type IN ('員工代墊', '代扣代繳') THEN
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

  -- ====== 代扣代繳特殊處理：不建 accounting_expense，改建 withholding_settlement ======
  IF v_claim.expense_type = '代扣代繳' THEN
    -- 優先使用 withholding_month（代扣所屬月份），fallback 到 claim_month
    v_month_source := COALESCE(NULLIF(v_claim.withholding_month, ''), v_claim.claim_month);

    -- 轉換格式："2026年2月" → "2026-02"
    v_settlement_month := regexp_replace(v_month_source, '年.*', '') || '-' ||
      LPAD(regexp_replace(regexp_replace(v_month_source, '.*年', ''), '月', ''), 2, '0');

    INSERT INTO withholding_settlements (
      month,
      type,
      amount,
      settlement_method,
      expense_claim_id,
      note,
      settled_by,
      settled_at
    ) VALUES (
      v_settlement_month,
      CASE WHEN v_claim.accounting_subject = '二代健保' THEN 'nhi_supplement' ELSE 'income_tax' END,
      v_claim.total_amount,
      'employee_advance',
      claim_id,
      '員工代墊報帳自動建立',
      approver_id,
      NOW()
    );

  ELSE
    -- ====== 原有邏輯：自動建立進項帳務記錄 ======
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
  END IF;
END;
$$;
