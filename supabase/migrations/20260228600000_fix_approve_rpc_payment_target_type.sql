-- =====================================================
-- 修正：approve_payment_request 遺漏 payment_target_type
--
-- 問題：20260227100003 版本的 INSERT INTO accounting_expenses
--       缺少 payment_target_type 欄位，導致 KOL 請款記錄
--       無法正確標記付款對象類型
--
-- 修復：
--   1. 在 INSERT 中加入 payment_target_type = 'kol'
--   2. 回填現有 NULL 記錄
-- =====================================================

-- ============================================================
-- 1. 修正 approve_payment_request RPC
-- ============================================================

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
  v_quotation_created_at timestamptz;
  v_expense_year  integer;
  v_expense_month text;
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

  -- ====== 取得請款記錄（含報價單建立日期）======
  SELECT
    pr.*,
    qi.kol_id,
    qi.service,
    qi.cost,
    qi.quotation_id,
    k.name as kol_name,
    q.project_name,
    q.created_at as quotation_created_at
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
  v_service      := v_request.service;
  v_cost_amount  := COALESCE(v_request.cost_amount, v_request.cost, 0);

  v_kol_name     := COALESCE(v_kol_name, 'Unknown KOL');
  v_project_name := COALESCE(v_project_name, 'Unknown Project');
  v_service      := COALESCE(v_service, 'Unknown Service');
  v_confirmation_date := CURRENT_DATE;

  -- ====== 計算年月：優先使用報價單建立日期 ======
  v_quotation_created_at := v_request.quotation_created_at;
  IF v_quotation_created_at IS NOT NULL THEN
    v_expense_year := EXTRACT(YEAR FROM v_quotation_created_at)::integer;
    v_expense_month := TO_CHAR(v_quotation_created_at, 'YYYY') || '年' || EXTRACT(MONTH FROM v_quotation_created_at)::integer || '月';
  ELSE
    -- fallback：無報價單時用核准日期
    v_expense_year := EXTRACT(YEAR FROM v_confirmation_date)::integer;
    v_expense_month := TO_CHAR(v_confirmation_date, 'YYYY年MM月');
  END IF;

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
      payment_target_type,
      note,
      created_by
    ) VALUES (
      v_expense_year,
      v_expense_month,
      v_expense_type,
      v_accounting_subject,
      v_cost_amount,
      v_cost_amount,
      v_kol_name,
      v_project_name,
      request_id,
      'kol',
      '請款核准 (' || v_service || ')',
      v_actual_verifier_id
    );
  END IF;
END;
$$;

-- ============================================================
-- 2. 回填：將既有 payment_request_id 非空但 payment_target_type
--    為 NULL 的記錄標記為 'kol'
-- ============================================================

UPDATE accounting_expenses
SET payment_target_type = 'kol'
WHERE payment_request_id IS NOT NULL
  AND payment_target_type IS NULL;

-- Notify PostgREST to reload schema cache
NOTIFY pgrst, 'reload schema';
