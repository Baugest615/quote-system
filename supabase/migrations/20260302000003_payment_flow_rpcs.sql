-- =============================================================================
-- Migration: 新增 approve_quotation_item 和 revert_quotation_item RPC
-- 目的: 支援從報價單直接審核請款，以及從已確認請款駁回
-- =============================================================================

-- =============================================================================
-- RPC 1: approve_quotation_item
-- 從報價單審核通過項目，自動建立 payment_confirmation + accounting_expense
-- =============================================================================
CREATE OR REPLACE FUNCTION approve_quotation_item(
  p_item_id uuid,
  p_expense_type text DEFAULT NULL,
  p_accounting_subject text DEFAULT NULL
)
RETURNS uuid  -- 回傳 accounting_expenses.id
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item          RECORD;
  v_kol_name      text;
  v_project_name  text;
  v_service       text;
  v_amount        numeric;
  v_confirmation_id uuid;
  v_confirmation_date date;
  v_expense_id    uuid;
  v_caller_id     uuid;
  v_caller_role   text;
  v_expense_type  text;
  v_accounting_subject text;
  v_expense_year  integer;
  v_expense_month text;
  v_quotation_created_at timestamptz;
BEGIN
  -- ====== 取得呼叫者 ======
  v_caller_id := (SELECT auth.uid());

  -- ====== 角色驗證（需 Editor+）======
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('Admin', 'Editor') THEN
    RAISE EXCEPTION '權限不足：只有 Admin 或 Editor 可以審核請款';
  END IF;

  -- ====== 取得報價項目（含報價單 + KOL 資訊）======
  SELECT
    qi.*,
    k.name AS kol_name,
    q.project_name,
    q.created_at AS quotation_created_at
  INTO v_item
  FROM public.quotation_items qi
  LEFT JOIN public.kols k ON k.id = qi.kol_id
  LEFT JOIN public.quotations q ON q.id = qi.quotation_id
  WHERE qi.id = p_item_id
  FOR UPDATE OF qi;

  IF v_item IS NULL THEN
    RAISE EXCEPTION '找不到報價項目: %', p_item_id;
  END IF;

  IF v_item.approved_at IS NOT NULL THEN
    RAISE EXCEPTION '此項目已審核通過';
  END IF;

  IF v_item.requested_at IS NULL THEN
    RAISE EXCEPTION '此項目尚未送出請款';
  END IF;

  -- ====== 取值 ======
  v_kol_name     := COALESCE(v_item.kol_name, '自訂項目');
  v_project_name := COALESCE(v_item.project_name, '未命名專案');
  v_service      := COALESCE(v_item.service, '未知服務');
  v_amount       := COALESCE(v_item.cost_amount, v_item.cost, 0);
  v_confirmation_date := CURRENT_DATE;

  -- ====== 計算年月：優先使用 expected_payment_month，其次報價單日期 ======
  IF v_item.expected_payment_month IS NOT NULL THEN
    v_expense_month := v_item.expected_payment_month;
    v_expense_year := EXTRACT(YEAR FROM NOW())::integer;
  ELSE
    v_quotation_created_at := v_item.quotation_created_at;
    IF v_quotation_created_at IS NOT NULL THEN
      v_expense_year := EXTRACT(YEAR FROM v_quotation_created_at)::integer;
      v_expense_month := TO_CHAR(v_quotation_created_at, 'YYYY') || '年' || EXTRACT(MONTH FROM v_quotation_created_at)::integer || '月';
    ELSE
      v_expense_year := EXTRACT(YEAR FROM v_confirmation_date)::integer;
      v_expense_month := TO_CHAR(v_confirmation_date, 'YYYY年MM月');
    END IF;
  END IF;

  -- ====== 決定最終 expense_type / accounting_subject ======
  v_expense_type := COALESCE(p_expense_type, v_item.expense_type, '勞務報酬');
  v_accounting_subject := COALESCE(
    p_accounting_subject,
    v_item.accounting_subject,
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

  -- ====== 更新 quotation_items ======
  UPDATE public.quotation_items SET
    approved_at        = NOW(),
    approved_by        = v_caller_id,
    expense_type       = v_expense_type,
    accounting_subject = v_accounting_subject,
    expected_payment_month = v_expense_month,
    rejection_reason   = NULL,
    rejected_at        = NULL,
    rejected_by        = NULL
  WHERE id = p_item_id;

  -- ====== 建立或更新 payment_confirmations（按日期）======
  SELECT id INTO v_confirmation_id
  FROM public.payment_confirmations
  WHERE confirmation_date = v_confirmation_date
  LIMIT 1;

  IF v_confirmation_id IS NULL THEN
    INSERT INTO public.payment_confirmations (
      confirmation_date, total_amount, total_items, created_by, created_at
    ) VALUES (
      v_confirmation_date, v_amount, 1, v_caller_id, NOW()
    )
    RETURNING id INTO v_confirmation_id;
  ELSE
    UPDATE public.payment_confirmations
    SET total_amount = total_amount + v_amount,
        total_items  = total_items + 1
    WHERE id = v_confirmation_id;
  END IF;

  -- ====== 建立 payment_confirmation_items ======
  INSERT INTO public.payment_confirmation_items (
    payment_confirmation_id, quotation_item_id, source_type,
    amount_at_confirmation, kol_name_at_confirmation,
    project_name_at_confirmation, service_at_confirmation, created_at
  ) VALUES (
    v_confirmation_id, p_item_id, 'quotation',
    v_amount, v_kol_name,
    v_project_name, v_service, NOW()
  );

  -- ====== 建立 accounting_expenses（沖帳免付不建立）======
  IF v_expense_type != '沖帳免付' THEN
    INSERT INTO public.accounting_expenses (
      year,
      expense_month,
      expense_type,
      accounting_subject,
      amount,
      total_amount,
      vendor_name,
      project_name,
      invoice_number,
      quotation_item_id,
      payment_target_type,
      note,
      created_by
    ) VALUES (
      v_expense_year,
      v_expense_month,
      v_expense_type,
      v_accounting_subject,
      v_amount,
      v_amount,
      v_kol_name,
      v_project_name,
      v_item.invoice_number,
      p_item_id,
      'kol',
      '報價單請款核准 (' || v_service || ')',
      v_caller_id
    )
    RETURNING id INTO v_expense_id;
  END IF;

  RETURN v_expense_id;
END;
$$;

COMMENT ON FUNCTION approve_quotation_item(uuid, text, text)
  IS '從報價單審核通過項目：更新狀態 + 建立確認記錄 + 建立進項記錄';

-- =============================================================================
-- RPC 2: revert_quotation_item
-- 從已確認請款駁回項目，刪除關聯的進項和確認記錄
-- =============================================================================
CREATE OR REPLACE FUNCTION revert_quotation_item(
  p_item_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
  v_item          RECORD;
  v_pci_record    RECORD;
  v_caller_id     uuid;
  v_caller_role   text;
BEGIN
  -- ====== 取得呼叫者 ======
  v_caller_id := (SELECT auth.uid());

  -- ====== 角色驗證（需 Editor+）======
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('Admin', 'Editor') THEN
    RAISE EXCEPTION '權限不足：只有 Admin 或 Editor 可以駁回請款';
  END IF;

  -- ====== 驗證項目存在且已審核 ======
  SELECT * INTO v_item
  FROM public.quotation_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF v_item IS NULL THEN
    RAISE EXCEPTION '找不到報價項目: %', p_item_id;
  END IF;

  IF v_item.approved_at IS NULL THEN
    RAISE EXCEPTION '此項目尚未審核通過，無法駁回';
  END IF;

  -- ====== 刪除 accounting_expenses ======
  DELETE FROM public.accounting_expenses
  WHERE quotation_item_id = p_item_id;

  -- ====== 刪除 payment_confirmation_items 並更新 confirmation 合計 ======
  FOR v_pci_record IN
    SELECT id, payment_confirmation_id, amount_at_confirmation
    FROM public.payment_confirmation_items
    WHERE quotation_item_id = p_item_id
  LOOP
    DELETE FROM public.payment_confirmation_items
    WHERE id = v_pci_record.id;

    -- 檢查 confirmation 是否還有其他 items
    IF NOT EXISTS (
      SELECT 1 FROM public.payment_confirmation_items
      WHERE payment_confirmation_id = v_pci_record.payment_confirmation_id
    ) THEN
      -- 沒有其他項目，刪除整個 confirmation
      DELETE FROM public.payment_confirmations
      WHERE id = v_pci_record.payment_confirmation_id;
    ELSE
      -- 還有其他項目，更新合計
      UPDATE public.payment_confirmations
      SET total_amount = total_amount - COALESCE(v_pci_record.amount_at_confirmation, 0),
          total_items  = total_items - 1
      WHERE id = v_pci_record.payment_confirmation_id;
    END IF;
  END LOOP;

  -- ====== 重設 quotation_items 狀態 ======
  UPDATE public.quotation_items SET
    requested_at     = NULL,
    requested_by     = NULL,
    approved_at      = NULL,
    approved_by      = NULL,
    rejection_reason = p_reason,
    rejected_at      = CASE WHEN p_reason IS NOT NULL THEN NOW() ELSE NULL END,
    rejected_by      = CASE WHEN p_reason IS NOT NULL THEN v_caller_id ELSE NULL END
  WHERE id = p_item_id;
END;
$$;

COMMENT ON FUNCTION revert_quotation_item(uuid, text)
  IS '駁回報價單已審核項目：刪除進項+確認記錄、重設項目狀態';
