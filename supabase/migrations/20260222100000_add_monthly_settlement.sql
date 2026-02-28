-- =====================================================
-- Migration: 月結總覽功能 — payment_status + submitted_by
-- Created: 2026-02-22
--
-- 1. accounting_expenses 新增 payment_status, paid_at, submitted_by
-- 2. accounting_payroll 新增 payment_status, paid_at
-- 3. 索引
-- 4. RLS — Admin UPDATE 政策
-- 5. 回填既有資料
-- 6. 更新 approve_expense_claim RPC 寫入 submitted_by
-- =====================================================

BEGIN;

-- ============================================================
-- 1. accounting_expenses：新增欄位
-- ============================================================

ALTER TABLE accounting_expenses
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid')),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz,
  ADD COLUMN IF NOT EXISTS submitted_by uuid REFERENCES auth.users(id);

-- ============================================================
-- 2. accounting_payroll：新增欄位
-- ============================================================

ALTER TABLE accounting_payroll
  ADD COLUMN IF NOT EXISTS payment_status text DEFAULT 'unpaid'
    CHECK (payment_status IN ('unpaid', 'paid')),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- ============================================================
-- 3. 索引（月結查詢用）
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_accounting_expenses_payment_status
  ON accounting_expenses(payment_status);

CREATE INDEX IF NOT EXISTS idx_accounting_expenses_submitted_by
  ON accounting_expenses(submitted_by) WHERE submitted_by IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_accounting_expenses_expense_month_status
  ON accounting_expenses(expense_month, payment_status);

CREATE INDEX IF NOT EXISTS idx_accounting_payroll_payment_status
  ON accounting_payroll(payment_status);

CREATE INDEX IF NOT EXISTS idx_accounting_payroll_salary_month_status
  ON accounting_payroll(salary_month, payment_status);

-- ============================================================
-- 4. RLS — Admin UPDATE 政策
--    現有政策僅允許 created_by = auth.uid()
--    Admin 需要能更新任何人建立的記錄（標記已付等）
-- ============================================================

CREATE POLICY "admin can update accounting_expenses"
  ON accounting_expenses FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND role = 'Admin'
    )
  );

CREATE POLICY "admin can update accounting_payroll"
  ON accounting_payroll FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = (SELECT auth.uid())
      AND role = 'Admin'
    )
  );

-- ============================================================
-- 5. 回填既有資料
-- ============================================================

-- 有 payment_date 的 expenses 視為已付
UPDATE accounting_expenses
SET payment_status = 'paid', paid_at = payment_date::timestamptz
WHERE payment_date IS NOT NULL AND payment_status = 'unpaid';

-- 有 payment_date 的 payroll 視為已付
UPDATE accounting_payroll
SET payment_status = 'paid', paid_at = payment_date::timestamptz
WHERE payment_date IS NOT NULL AND payment_status = 'unpaid';

-- 從 expense_claims 回填 submitted_by
UPDATE accounting_expenses ae
SET submitted_by = ec.submitted_by
FROM expense_claims ec
WHERE ae.expense_claim_id = ec.id
  AND ae.submitted_by IS NULL
  AND ec.submitted_by IS NOT NULL;

-- ============================================================
-- 6. 更新 approve_expense_claim RPC — 額外寫入 submitted_by
-- ============================================================

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

  -- 取得報帳記錄（加鎖防並發）
  SELECT * INTO v_claim
  FROM expense_claims
  WHERE id = claim_id
  FOR UPDATE;

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
    approved_by = (SELECT auth.uid()),
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
      (SELECT auth.uid()),
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

  -- ====== 自動建立進項帳務記錄（含 submitted_by）======
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
      submitted_by,
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
      v_claim.submitted_by,
      '系統自動建立 - 個人報帳核准',
      (SELECT auth.uid())
    );
  END IF;
END;
$$;

COMMIT;
