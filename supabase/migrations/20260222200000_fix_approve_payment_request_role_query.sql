-- =====================================================
-- Migration: 修復 approve_payment_request 角色查詢
-- Created: 2026-02-22
--
-- Bug: 引用了不存在的 public.user_roles 表
-- Fix: 改為 public.profiles（與 approve_expense_claim 一致）
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
  -- ====== 角色驗證（修正：使用 profiles 表）======
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = (SELECT auth.uid());

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

  -- 自動建立進項帳務記錄
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
