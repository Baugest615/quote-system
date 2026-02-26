-- =====================================================
-- 修復駁回原因殘留 + 備註欄位可見性
-- 1. approve_expense_claim: 核准時清除駁回欄位
-- 2. approve_payment_request: 核准時清除駁回欄位
-- =====================================================

-- ============================================================
-- 1. approve_expense_claim — 核准時清除 rejection_reason/rejected_by/rejected_at
-- 根因: 駁回後重新核准，舊的駁回原因仍殘留在記錄中
-- ============================================================

-- 只需更新 UPDATE 語句，其餘邏輯不變
-- 使用 CREATE OR REPLACE 重建完整函數

DROP FUNCTION IF EXISTS approve_expense_claim(uuid, uuid);

CREATE OR REPLACE FUNCTION approve_expense_claim(
  claim_id uuid,
  approver_id uuid DEFAULT NULL
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
  v_payment_target text;
  v_settlement_month text;
  v_actual_approver_id uuid;
BEGIN
  -- 強制使用 auth.uid() 防止偽造
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

  -- 推斷付款對象類型
  IF v_claim.expense_type = '員工代墊' THEN
    v_payment_target := 'employee';
  ELSIF v_claim.expense_type = '代扣代繳' THEN
    v_payment_target := 'employee';
  ELSIF v_claim.payment_target_type IS NOT NULL THEN
    v_payment_target := v_claim.payment_target_type;
  ELSIF v_claim.invoice_number IS NOT NULL AND v_claim.invoice_number != '' THEN
    v_payment_target := 'vendor';
  ELSE
    v_payment_target := 'other';
  END IF;

  -- ====== 更新報帳狀態 + 清除駁回資訊 ======
  UPDATE public.expense_claims
  SET
    status = 'approved',
    approved_by = v_actual_approver_id,
    approved_at = NOW(),
    rejection_reason = NULL,
    rejected_by = NULL,
    rejected_at = NULL,
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

  -- 建立確認項目（快照 + 來源標記）
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

  -- ====== 代扣代繳特殊處理 ======
  IF v_claim.expense_type = '代扣代繳' THEN
    v_settlement_month := regexp_replace(v_claim.claim_month, '年.*', '') || '-' ||
      LPAD(regexp_replace(regexp_replace(v_claim.claim_month, '.*年', ''), '月', ''), 2, '0');

    -- 防止重複建立
    IF NOT EXISTS (
      SELECT 1 FROM public.withholding_settlements
      WHERE expense_claim_id = claim_id
    ) THEN
      INSERT INTO public.withholding_settlements (
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
        v_actual_approver_id,
        NOW()
      );
    END IF;

  ELSE
    -- ====== 原有邏輯：自動建立進項帳務記錄 ======
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
        v_actual_approver_id
      );
    END IF;
  END IF;
END;
$$;

-- ============================================================
-- 2. approve_payment_request — 核准時清除駁回欄位
-- 根因: 同上，專案請款駁回後重新核准也會殘留駁回原因
-- 注意: 只更新最終的 UPDATE 語句，不動其他邏輯
-- ============================================================

-- 讀取最新版本的完整函數並更新 UPDATE 語句
-- 最新版本來自 20260222980000_add_accounting_subject_to_payment_requests.sql

DROP FUNCTION IF EXISTS approve_payment_request(uuid, uuid, text, text);

CREATE OR REPLACE FUNCTION approve_payment_request(
  request_id uuid,
  verifier_id uuid,
  p_expense_type text DEFAULT NULL,
  p_accounting_subject text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_request       RECORD;
  v_kol_name      text;
  v_project_name  text;
  v_service       text;
  v_cost_amount   numeric;
  v_confirmation_id uuid;
  v_confirmation_date date;
  v_caller_role   text;
  v_actual_verifier_id uuid;
  v_expense_type  text;
  v_accounting_subject text;
BEGIN
  -- 強制使用 auth.uid()
  v_actual_verifier_id := (SELECT auth.uid());

  -- ====== 角色驗證 ======
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_actual_verifier_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('Admin', 'Editor') THEN
    RAISE EXCEPTION '權限不足：只有 Admin 或 Editor 可以核准請款';
  END IF;

  -- ====== 取得請款記錄 ======
  SELECT
    pr.*,
    qi.kol_id,
    qi.service_item,
    qi.cost,
    qi.quotation_id,
    k.name as kol_name,
    q.project_name
  INTO v_request
  FROM public.payment_requests pr
  JOIN public.quotation_items qi ON qi.id = pr.quotation_item_id
  LEFT JOIN public.kols k ON k.id = qi.kol_id
  LEFT JOIN public.quotations q ON q.id = qi.quotation_id
  WHERE pr.id = request_id
  FOR UPDATE OF pr;

  IF v_request IS NULL THEN
    RAISE EXCEPTION '找不到請款記錄: %', request_id;
  END IF;

  IF v_request.verification_status != 'pending' THEN
    RAISE EXCEPTION '只能核准待審核的請款，目前狀態: %', v_request.verification_status;
  END IF;

  -- ====== 取值 ======
  v_kol_name     := v_request.kol_name;
  v_project_name := v_request.project_name;
  v_service      := v_request.service_item;
  v_cost_amount  := COALESCE(v_request.cost_amount, v_request.cost, 0);

  v_kol_name     := COALESCE(v_kol_name, 'Unknown KOL');
  v_project_name := COALESCE(v_project_name, 'Unknown Project');
  v_service      := COALESCE(v_service, 'Unknown Service');
  v_confirmation_date := CURRENT_DATE;

  -- ====== 核准者覆蓋時，先更新 payment_requests ======
  IF p_expense_type IS NOT NULL OR p_accounting_subject IS NOT NULL THEN
    UPDATE public.payment_requests
    SET
      expense_type       = COALESCE(p_expense_type, expense_type),
      accounting_subject = COALESCE(p_accounting_subject, accounting_subject),
      updated_at         = NOW()
    WHERE id = request_id;
  END IF;

  -- ====== 建立或更新 payment_confirmations ======
  SELECT id INTO v_confirmation_id
  FROM public.payment_confirmations
  WHERE confirmation_date = v_confirmation_date
  LIMIT 1;

  IF v_confirmation_id IS NULL THEN
    INSERT INTO public.payment_confirmations (
      confirmation_date, total_amount, total_items, created_by, created_at
    ) VALUES (
      v_confirmation_date, v_cost_amount, 1, v_actual_verifier_id, NOW()
    )
    RETURNING id INTO v_confirmation_id;
  ELSE
    UPDATE public.payment_confirmations
    SET total_amount = total_amount + v_cost_amount,
        total_items  = total_items + 1
    WHERE id = v_confirmation_id;
  END IF;

  -- ====== 建立 payment_confirmation_items ======
  INSERT INTO public.payment_confirmation_items (
    payment_confirmation_id, payment_request_id,
    amount_at_confirmation, kol_name_at_confirmation,
    project_name_at_confirmation, service_at_confirmation, created_at
  ) VALUES (
    v_confirmation_id, request_id,
    v_cost_amount, v_kol_name,
    v_project_name, v_service, NOW()
  );

  -- ====== 更新請款狀態 + 清除駁回資訊 ======
  UPDATE public.payment_requests
  SET
    verification_status = 'approved',
    approved_by         = v_actual_verifier_id,
    approved_at         = NOW(),
    rejection_reason    = NULL,
    rejected_by         = NULL,
    rejected_at         = NULL,
    updated_at          = NOW()
  WHERE id = request_id;

  -- ====== 自動建立進項帳務記錄（含 accounting_subject）======
  v_expense_type := COALESCE(p_expense_type, v_request.expense_type);
  v_accounting_subject := COALESCE(
    p_accounting_subject,
    v_request.accounting_subject,
    CASE v_expense_type
      WHEN '勞務報酬' THEN '勞務成本'
      WHEN '外包服務' THEN '外包費用'
      WHEN '專案費用' THEN '廣告費用'
      WHEN '員工代墊' THEN '其他費用'
      WHEN '營運費用' THEN '租金支出'
      WHEN '其他支出' THEN '其他費用'
      ELSE '其他費用'
    END
  );

  IF v_expense_type IS NOT NULL AND v_expense_type != '沖帳免付' THEN
    INSERT INTO public.accounting_expenses (
      year,
      expense_month,
      expense_type,
      accounting_subject,
      amount,
      total_amount,
      vendor_name,
      project_name,
      payment_request_id,
      note,
      created_by
    ) VALUES (
      EXTRACT(YEAR FROM v_confirmation_date)::int,
      TO_CHAR(v_confirmation_date, 'YYYY年MM月'),
      v_expense_type,
      v_accounting_subject,
      v_cost_amount,
      v_cost_amount,
      v_kol_name,
      v_project_name,
      request_id,
      '系統自動建立 - 請款核准',
      v_actual_verifier_id
    );
  END IF;
END;
$$;
