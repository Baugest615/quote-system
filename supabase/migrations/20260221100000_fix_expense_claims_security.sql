-- =====================================================
-- Migration: 修復 expense_claims 安全性與完整性
-- Created: 2026-02-21
--
-- 修復項目：
-- 1. RPC 函數加入 SET search_path = '' 防止 search_path 劫持
-- 2. approver_id/rejector_id 改用 auth.uid() 防止偽造
-- 3. approve_expense_claim 加入 FOR UPDATE 鎖定防止並發問題
-- 4. payment_confirmation_items 加入 expense_claim_id 唯一約束和索引
-- 5. RLS 政策命名加上 _policy 後綴（符合專案規範）
-- =====================================================

-- ============================================================
-- 1. 修復 approve_expense_claim RPC
--    - SET search_path = '' 防止 search_path 劫持
--    - 移除 approver_id 參數，改用 auth.uid()
--    - 加入 FOR UPDATE 防止並發核准
-- ============================================================

CREATE OR REPLACE FUNCTION approve_expense_claim(
  claim_id uuid,
  approver_id uuid DEFAULT NULL  -- 保留參數向後相容但不使用
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_claim public.expense_claims%ROWTYPE;
  v_confirmation_id uuid;
  v_confirmation_date date;
  v_existing_expense_id uuid;
  v_caller_role text;
  v_actual_approver_id uuid;
BEGIN
  -- 強制使用 auth.uid() 作為核准人，忽略傳入的 approver_id
  v_actual_approver_id := (SELECT auth.uid());

  -- ====== 角色驗證 ======
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_actual_approver_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('Admin', 'Editor') THEN
    RAISE EXCEPTION '權限不足：只有 Admin 或 Editor 可以核准個人報帳';
  END IF;

  -- 取得報帳記錄（加鎖防止並發核准）
  SELECT * INTO v_claim
  FROM public.expense_claims
  WHERE id = claim_id
  FOR UPDATE;

  IF v_claim.id IS NULL THEN
    RAISE EXCEPTION '找不到個人報帳記錄: %', claim_id;
  END IF;

  IF v_claim.status != 'submitted' THEN
    RAISE EXCEPTION '只能核准「已送出」的報帳記錄，目前狀態: %', v_claim.status;
  END IF;

  -- ====== 更新報帳狀態 ======
  UPDATE public.expense_claims
  SET
    status = 'approved',
    approved_by = v_actual_approver_id,
    approved_at = NOW(),
    updated_at = NOW()
  WHERE id = claim_id;

  -- ====== 建立 / 更新確認記錄 ======
  v_confirmation_date := CURRENT_DATE;

  SELECT id INTO v_confirmation_id
  FROM public.payment_confirmations
  WHERE confirmation_date = v_confirmation_date
  LIMIT 1;

  IF v_confirmation_id IS NULL THEN
    INSERT INTO public.payment_confirmations (
      confirmation_date,
      total_amount,
      total_items,
      created_by,
      created_at
    ) VALUES (
      v_confirmation_date,
      v_claim.total_amount,
      1,
      v_actual_approver_id,
      NOW()
    )
    RETURNING id INTO v_confirmation_id;
  ELSE
    UPDATE public.payment_confirmations
    SET
      total_amount = total_amount + v_claim.total_amount,
      total_items = total_items + 1
    WHERE id = v_confirmation_id;
  END IF;

  -- 建立確認項目
  INSERT INTO public.payment_confirmation_items (
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
  FROM public.accounting_expenses
  WHERE expense_claim_id = claim_id
  LIMIT 1;

  IF v_existing_expense_id IS NULL THEN
    INSERT INTO public.accounting_expenses (
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
      '系統自動建立 - 個人報帳核准',
      v_actual_approver_id
    );
  END IF;
END;
$$;

COMMENT ON FUNCTION approve_expense_claim IS '核准個人報帳並自動建立確認記錄與進項帳務記錄（含角色驗證：僅 Admin/Editor，使用 auth.uid() 防止偽造）';

-- ============================================================
-- 2. 修復 reject_expense_claim RPC
--    - SET search_path = '' 防止 search_path 劫持
--    - 移除 rejector_id 參數，改用 auth.uid()
-- ============================================================

CREATE OR REPLACE FUNCTION reject_expense_claim(
  claim_id uuid,
  rejector_id uuid DEFAULT NULL,  -- 保留參數向後相容但不使用
  reason text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_status text;
  v_caller_role text;
  v_actual_rejector_id uuid;
BEGIN
  v_actual_rejector_id := (SELECT auth.uid());

  -- 角色驗證
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_actual_rejector_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('Admin', 'Editor') THEN
    RAISE EXCEPTION '權限不足：只有 Admin 或 Editor 可以駁回個人報帳';
  END IF;

  -- 確認狀態（加鎖防止並發）
  SELECT status INTO v_status
  FROM public.expense_claims
  WHERE id = claim_id
  FOR UPDATE;

  IF v_status IS NULL THEN
    RAISE EXCEPTION '找不到個人報帳記錄: %', claim_id;
  END IF;

  IF v_status != 'submitted' THEN
    RAISE EXCEPTION '只能駁回「已送出」的報帳記錄，目前狀態: %', v_status;
  END IF;

  -- 更新狀態
  UPDATE public.expense_claims
  SET
    status = 'rejected',
    rejected_by = v_actual_rejector_id,
    rejected_at = NOW(),
    rejection_reason = reason,
    updated_at = NOW()
  WHERE id = claim_id;
END;
$$;

COMMENT ON FUNCTION reject_expense_claim IS '駁回個人報帳（含角色驗證：僅 Admin/Editor，使用 auth.uid() 防止偽造）';

-- ============================================================
-- 3. payment_confirmation_items 加入 expense_claim_id 索引和唯一約束
-- ============================================================

-- 索引：加速 expense_claim_id 查詢
CREATE INDEX IF NOT EXISTS idx_payment_confirmation_items_expense_claim_id
  ON public.payment_confirmation_items(expense_claim_id)
  WHERE expense_claim_id IS NOT NULL;

-- 唯一約束：每筆個人報帳在同一確認清單中只能出現一次
CREATE UNIQUE INDEX IF NOT EXISTS idx_payment_confirmation_items_unique_claim
  ON public.payment_confirmation_items(payment_confirmation_id, expense_claim_id)
  WHERE expense_claim_id IS NOT NULL;

-- ============================================================
-- 4. RLS 政策命名規範化（加上 _policy 後綴）
-- ============================================================

-- 重新命名 RLS 政策以符合 {table}_{operation}_{scope}_policy 規範
-- PostgreSQL 支援 ALTER POLICY ... RENAME TO 語法

DO $$
BEGIN
  -- SELECT
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'expense_claims_select_authenticated' AND tablename = 'expense_claims') THEN
    ALTER POLICY "expense_claims_select_authenticated" ON public.expense_claims RENAME TO "expense_claims_select_authenticated_policy";
  END IF;

  -- INSERT
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'expense_claims_insert_authenticated' AND tablename = 'expense_claims') THEN
    ALTER POLICY "expense_claims_insert_authenticated" ON public.expense_claims RENAME TO "expense_claims_insert_own_policy";
  END IF;

  -- UPDATE
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'expense_claims_update_own_or_reviewer' AND tablename = 'expense_claims') THEN
    ALTER POLICY "expense_claims_update_own_or_reviewer" ON public.expense_claims RENAME TO "expense_claims_update_own_or_reviewer_policy";
  END IF;

  -- DELETE
  IF EXISTS (SELECT 1 FROM pg_policies WHERE policyname = 'expense_claims_delete_own_draft_or_admin' AND tablename = 'expense_claims') THEN
    ALTER POLICY "expense_claims_delete_own_draft_or_admin" ON public.expense_claims RENAME TO "expense_claims_delete_own_draft_or_admin_policy";
  END IF;
END $$;

-- ============================================================
-- 5. 重新整理 PostgREST 快取
-- ============================================================

NOTIFY pgrst, 'reload config';
