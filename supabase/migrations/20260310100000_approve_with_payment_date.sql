-- ============================================================
-- Spec-008: 匯款日期管理權責重設計
-- 核准時由審核人填入匯款日期，直接寫入 payment_confirmation_items.payment_date
-- expense_month 改為從 payment_date 自然月份派生（移除 10日切點補償）
-- ============================================================

-- ============================================================
-- 1. approve_quotation_item v2.0
--    新增 p_payment_date 參數（末位，向後相容預設 NULL）
--    expense_month 優先使用 p_payment_date 的自然月份
-- ============================================================

-- 先移除舊版（signature 不含 p_payment_date）
DROP FUNCTION IF EXISTS public.approve_quotation_item(uuid, text, text, boolean);

CREATE OR REPLACE FUNCTION public.approve_quotation_item(
  p_item_id uuid,
  p_expense_type text DEFAULT NULL,
  p_accounting_subject text DEFAULT NULL,
  p_from_merge_group boolean DEFAULT false,
  p_payment_date date DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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

  -- 合併組防護 — 直接呼叫時不允許核准合併組中的項目
  IF v_item.merge_group_id IS NOT NULL AND NOT p_from_merge_group THEN
    RAISE EXCEPTION '此項目在合併組中，請使用合併組核准';
  END IF;

  -- ====== 取值 ======
  v_kol_name     := COALESCE(v_item.kol_name, '自訂項目');
  v_project_name := COALESCE(v_item.project_name, '未命名專案');
  v_service      := COALESCE(v_item.service, '未知服務');
  v_amount       := COALESCE(v_item.cost_amount, v_item.cost, 0);
  v_confirmation_date := CURRENT_DATE;

  -- ====== 計算年月（Spec-008：優先使用 p_payment_date 自然月份）======
  IF p_payment_date IS NOT NULL THEN
    -- 審核人填入的匯款日期 → 直接取自然月份，不做切點補償
    v_expense_year  := EXTRACT(YEAR FROM p_payment_date)::integer;
    v_expense_month := TO_CHAR(p_payment_date, 'YYYY') || '年' || EXTRACT(MONTH FROM p_payment_date)::integer || '月';
  ELSIF v_item.expected_payment_month IS NOT NULL THEN
    -- 向後相容：沿用請款人填入的預計月份
    v_expense_month := v_item.expected_payment_month;
    v_expense_year  := EXTRACT(YEAR FROM NOW())::integer;
  ELSE
    -- 最後 fallback：報價單建立日期
    v_quotation_created_at := v_item.quotation_created_at;
    IF v_quotation_created_at IS NOT NULL THEN
      v_expense_year  := EXTRACT(YEAR FROM v_quotation_created_at)::integer;
      v_expense_month := TO_CHAR(v_quotation_created_at, 'YYYY') || '年' || EXTRACT(MONTH FROM v_quotation_created_at)::integer || '月';
    ELSE
      v_expense_year  := EXTRACT(YEAR FROM v_confirmation_date)::integer;
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

  -- ====== 建立 payment_confirmation_items（含 payment_date）======
  INSERT INTO public.payment_confirmation_items (
    payment_confirmation_id, quotation_item_id, source_type,
    amount_at_confirmation, kol_name_at_confirmation,
    project_name_at_confirmation, service_at_confirmation,
    payment_date,
    created_at
  ) VALUES (
    v_confirmation_id, p_item_id, 'quotation',
    v_amount, v_kol_name,
    v_project_name, v_service,
    p_payment_date,
    NOW()
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
      payment_confirmation_id,
      payment_target_type,
      payment_date,
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
      v_confirmation_id,
      'kol',
      p_payment_date,
      '報價單請款核准 (' || v_service || ')',
      v_caller_id
    )
    RETURNING id INTO v_expense_id;
  END IF;

  RETURN v_expense_id;
END;
$$;

ALTER FUNCTION public.approve_quotation_item(uuid, text, text, boolean, date) OWNER TO postgres;
COMMENT ON FUNCTION public.approve_quotation_item(uuid, text, text, boolean, date)
IS '核准請款項目（v2.0: Spec-008 — 匯款日期由審核人填入，expense_month 從 payment_date 自然月份派生）';

GRANT ALL ON FUNCTION public.approve_quotation_item(uuid, text, text, boolean, date) TO anon;
GRANT ALL ON FUNCTION public.approve_quotation_item(uuid, text, text, boolean, date) TO authenticated;
GRANT ALL ON FUNCTION public.approve_quotation_item(uuid, text, text, boolean, date) TO service_role;


-- ============================================================
-- 2. approve_merge_group v2.0
--    新增 p_payment_date 參數，傳入每個 approve_quotation_item
-- ============================================================

DROP FUNCTION IF EXISTS public.approve_merge_group(uuid);

CREATE OR REPLACE FUNCTION public.approve_merge_group(
  p_group_id uuid,
  p_payment_date date DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_item_id uuid;
BEGIN
  v_caller_id := (SELECT auth.uid());

  -- 角色驗證（需 Editor+）
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('Admin', 'Editor') THEN
    RAISE EXCEPTION '權限不足：只有 Admin 或 Editor 可以核准請款';
  END IF;

  -- 確認合併組存在
  IF NOT EXISTS (
    SELECT 1 FROM public.quotation_items
    WHERE merge_group_id = p_group_id
  ) THEN
    RAISE EXCEPTION '找不到合併組: %', p_group_id;
  END IF;

  -- 驗證：全部項目都是 requested 狀態（已送出、未核准、未駁回）
  IF EXISTS (
    SELECT 1 FROM public.quotation_items
    WHERE merge_group_id = p_group_id
      AND (requested_at IS NULL OR approved_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION '合併組中有項目尚未送出或已核准';
  END IF;

  -- 逐筆核准（傳入 payment_date，主項優先）
  FOR v_item_id IN
    SELECT id FROM public.quotation_items
    WHERE merge_group_id = p_group_id
    ORDER BY is_merge_leader DESC, created_at
  LOOP
    PERFORM public.approve_quotation_item(v_item_id, NULL, NULL, true, p_payment_date);
  END LOOP;
END;
$$;

ALTER FUNCTION public.approve_merge_group(uuid, date) OWNER TO postgres;
COMMENT ON FUNCTION public.approve_merge_group(uuid, date)
IS '核准合併組（v2.0: Spec-008 — 傳入 payment_date 給每個項目）';

GRANT ALL ON FUNCTION public.approve_merge_group(uuid, date) TO anon;
GRANT ALL ON FUNCTION public.approve_merge_group(uuid, date) TO authenticated;
GRANT ALL ON FUNCTION public.approve_merge_group(uuid, date) TO service_role;
