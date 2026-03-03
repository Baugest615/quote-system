-- ============================================================
-- Migration: 修復請款工作台 RPC 一致性問題
--
-- 修復項目：
--   1. submit_single_item()       — 放寬被駁回項目的報價單狀態限制
--   2. submit_merge_group()       — 新增報價單狀態檢查（含相同放寬）
--   3. revert_quotation_item()    — 撤回時總是設定 rejected_at（預設「已撤回」）
--   4. approve_quotation_item()   — 新增 merge_group_id 防護
--   5. reject_quotation_item()    — 新增 merge_group_id 防護
--   6. approve_merge_group()      — 傳遞 bypass 參數給 approve_quotation_item
-- ============================================================


-- ============================================================
-- 1. submit_single_item() — 放寬被駁回項目的報價單狀態限制
--    問題：被駁回項目的報價單狀態可能已不是「已簽約/已歸檔」，
--          導致重新送出時 400 錯誤。
--    修復：已有 rejected_at 的項目，不檢查報價單狀態。
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_single_item(
  p_item_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller_id uuid;
  v_item record;
BEGIN
  v_caller_id := (SELECT auth.uid());

  -- 取得項目（加鎖）
  SELECT qi.*, q.status AS quotation_status
  INTO v_item
  FROM public.quotation_items qi
  JOIN public.quotations q ON qi.quotation_id = q.id
  WHERE qi.id = p_item_id
  FOR UPDATE OF qi;

  IF v_item IS NULL THEN
    RAISE EXCEPTION '找不到項目: %', p_item_id;
  END IF;

  -- 報價單狀態檢查（被駁回項目可豁免，因為它們已進入過請款流程）
  IF v_item.quotation_status NOT IN ('已簽約', '已歸檔')
     AND v_item.rejected_at IS NULL THEN
    RAISE EXCEPTION '報價單未簽約，無法送出請款';
  END IF;

  IF v_item.merge_group_id IS NOT NULL THEN
    RAISE EXCEPTION '此項目已在合併組中，請使用合併組送出';
  END IF;

  IF v_item.requested_at IS NOT NULL THEN
    RAISE EXCEPTION '此項目已送出請款';
  END IF;

  IF v_item.approved_at IS NOT NULL THEN
    RAISE EXCEPTION '此項目已核准';
  END IF;

  -- 放寬驗證 — 只擋 NULL，允許 cost=0
  IF v_item.cost_amount IS NULL THEN
    RAISE EXCEPTION '請先設定請款金額';
  END IF;

  -- 驗證有發票或附件
  IF (v_item.invoice_number IS NULL OR v_item.invoice_number = '')
     AND (v_item.attachments IS NULL OR v_item.attachments = '[]'::jsonb
          OR jsonb_array_length(v_item.attachments) = 0) THEN
    RAISE EXCEPTION '請提供發票號碼或附件';
  END IF;

  -- 設定為已送出，清除駁回歷史
  UPDATE public.quotation_items SET
    requested_at = NOW(),
    requested_by = v_caller_id,
    rejected_at = NULL,
    rejected_by = NULL,
    rejection_reason = NULL
  WHERE id = p_item_id;
END;
$$;

COMMENT ON FUNCTION public.submit_single_item(uuid)
IS '送出單筆請款（v1.2: 被駁回項目可重新送出，不受報價單狀態限制）';


-- ============================================================
-- 2. submit_merge_group() — 新增報價單狀態檢查
--    問題：原本完全不檢查報價單狀態，與 submit_single_item 不一致。
--    修復：新增檢查，但同樣放寬被駁回項目。
-- ============================================================
CREATE OR REPLACE FUNCTION public.submit_merge_group(
  p_group_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller_id uuid;
  v_leader record;
  v_count integer;
BEGIN
  v_caller_id := (SELECT auth.uid());

  -- 確認合併組存在
  SELECT COUNT(*) INTO v_count
  FROM public.quotation_items
  WHERE merge_group_id = p_group_id;

  IF v_count = 0 THEN
    RAISE EXCEPTION '找不到合併組: %', p_group_id;
  END IF;

  -- 報價單狀態檢查（被駁回項目可豁免）
  IF EXISTS (
    SELECT 1 FROM public.quotation_items qi
    JOIN public.quotations q ON qi.quotation_id = q.id
    WHERE qi.merge_group_id = p_group_id
      AND q.status NOT IN ('已簽約', '已歸檔')
      AND qi.rejected_at IS NULL
  ) THEN
    RAISE EXCEPTION '合併組中有項目的報價單未簽約';
  END IF;

  -- 驗證：全部項目都是 pending（requested_at IS NULL, approved_at IS NULL）
  IF EXISTS (
    SELECT 1 FROM public.quotation_items
    WHERE merge_group_id = p_group_id
      AND (requested_at IS NOT NULL OR approved_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION '合併組中有項目已送出或已核准，無法重複送出';
  END IF;

  -- 放寬驗證 — 只擋 NULL（未填寫），允許 cost=0
  IF EXISTS (
    SELECT 1 FROM public.quotation_items
    WHERE merge_group_id = p_group_id
      AND cost_amount IS NULL
  ) THEN
    RAISE EXCEPTION '合併組中有項目尚未設定請款金額';
  END IF;

  -- 取得主項資訊
  SELECT invoice_number, attachments
  INTO v_leader
  FROM public.quotation_items
  WHERE merge_group_id = p_group_id
    AND is_merge_leader = true;

  IF v_leader IS NULL THEN
    RAISE EXCEPTION '找不到合併組的主項';
  END IF;

  -- 驗證主項有發票或附件
  IF (v_leader.invoice_number IS NULL OR v_leader.invoice_number = '')
     AND (v_leader.attachments IS NULL OR v_leader.attachments = '[]'::jsonb
          OR jsonb_array_length(v_leader.attachments) = 0) THEN
    RAISE EXCEPTION '主項必須提供發票號碼或附件';
  END IF;

  -- 非主項複製主項的發票和附件
  UPDATE public.quotation_items SET
    invoice_number = v_leader.invoice_number,
    attachments = v_leader.attachments
  WHERE merge_group_id = p_group_id
    AND is_merge_leader = false;

  -- 所有項目設定為已送出，清除駁回歷史
  UPDATE public.quotation_items SET
    requested_at = NOW(),
    requested_by = v_caller_id,
    rejected_at = NULL,
    rejected_by = NULL,
    rejection_reason = NULL
  WHERE merge_group_id = p_group_id;
END;
$$;

COMMENT ON FUNCTION public.submit_merge_group(uuid)
IS '送出合併組（v1.2: 新增報價單狀態檢查，被駁回項目可豁免）';


-- ============================================================
-- 3. revert_quotation_item() — 撤回時總是設定 rejected_at
--    問題：p_reason=NULL 時，rejected_at/rejected_by 都不設定，
--          導致撤回的項目從工作台消失（不符合任何 WHERE 條件）。
--    修復：總是設定 rejected_at，未提供理由時預設「已撤回」。
-- ============================================================
CREATE OR REPLACE FUNCTION public.revert_quotation_item(
  p_item_id uuid,
  p_reason text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
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
  -- v1.2 修復：總是設定 rejected_at，避免項目從工作台消失
  UPDATE public.quotation_items SET
    requested_at     = NULL,
    requested_by     = NULL,
    approved_at      = NULL,
    approved_by      = NULL,
    rejection_reason = COALESCE(NULLIF(p_reason, ''), '已撤回'),
    rejected_at      = NOW(),
    rejected_by      = v_caller_id
  WHERE id = p_item_id;
END;
$$;

COMMENT ON FUNCTION public.revert_quotation_item(uuid, text)
IS '撤回已核准項目（v1.2: 總是設定 rejected_at，預設理由「已撤回」）';


-- ============================================================
-- 4. approve_quotation_item() — 新增 merge_group_id 防護
--    問題：從報價單管理頁面可以直接核准合併組中的單一項目，
--          造成部分核准死鎖（其他項目永遠無法核准）。
--    修復：新增 p_from_merge_group 參數，預設 false。
--          當直接呼叫且項目在合併組中時，拒絕操作。
-- ============================================================
DROP FUNCTION IF EXISTS public.approve_quotation_item(uuid, text, text);

CREATE OR REPLACE FUNCTION public.approve_quotation_item(
  p_item_id uuid,
  p_expense_type text DEFAULT NULL,
  p_accounting_subject text DEFAULT NULL,
  p_from_merge_group boolean DEFAULT false
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

  -- v1.2: 合併組防護 — 直接呼叫時不允許核准合併組中的項目
  IF v_item.merge_group_id IS NOT NULL AND NOT p_from_merge_group THEN
    RAISE EXCEPTION '此項目在合併組中，請使用合併組核准';
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

ALTER FUNCTION public.approve_quotation_item(uuid, text, text, boolean) OWNER TO postgres;
COMMENT ON FUNCTION public.approve_quotation_item(uuid, text, text, boolean)
IS '核准請款項目（v1.2: 新增合併組防護，從合併組核准時需傳入 p_from_merge_group=true）';

GRANT ALL ON FUNCTION public.approve_quotation_item(uuid, text, text, boolean) TO anon;
GRANT ALL ON FUNCTION public.approve_quotation_item(uuid, text, text, boolean) TO authenticated;
GRANT ALL ON FUNCTION public.approve_quotation_item(uuid, text, text, boolean) TO service_role;


-- ============================================================
-- 5. reject_quotation_item() — 新增 merge_group_id 防護
--    問題：從報價單管理頁面可以直接駁回合併組中的單一項目，
--          造成合併組中部分項目被駁回、部分仍在待審的不一致狀態。
--    修復：當項目在合併組中時，拒絕直接駁回。
-- ============================================================
CREATE OR REPLACE FUNCTION public.reject_quotation_item(
  p_item_id uuid,
  p_reason text DEFAULT ''
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_item RECORD;
  v_caller_id uuid;
  v_caller_role text;
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

  -- ====== 取得報價項目（加鎖防止並發）======
  SELECT *
  INTO v_item
  FROM public.quotation_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF v_item IS NULL THEN
    RAISE EXCEPTION '找不到報價項目: %', p_item_id;
  END IF;

  IF v_item.requested_at IS NULL THEN
    RAISE EXCEPTION '此項目尚未送出請款，無法駁回';
  END IF;

  IF v_item.approved_at IS NOT NULL THEN
    RAISE EXCEPTION '此項目已審核通過，無法駁回';
  END IF;

  -- v1.2: 合併組防護 — 不允許直接駁回合併組中的項目
  IF v_item.merge_group_id IS NOT NULL THEN
    RAISE EXCEPTION '此項目在合併組中，請使用合併組駁回';
  END IF;

  -- ====== 更新 quotation_items ======
  UPDATE public.quotation_items SET
    rejected_at      = NOW(),
    rejected_by      = v_caller_id,
    rejection_reason = COALESCE(NULLIF(p_reason, ''), '未提供原因'),
    -- 清空請款狀態，讓申請者可重新送出
    requested_at     = NULL,
    requested_by     = NULL,
    approved_at      = NULL,
    approved_by      = NULL
  WHERE id = p_item_id;
END;
$$;

COMMENT ON FUNCTION public.reject_quotation_item(uuid, text)
IS '駁回請款項目（v1.2: 新增合併組防護，合併組項目需用 reject_merge_group）';


-- ============================================================
-- 6. approve_merge_group() — 傳遞 p_from_merge_group=true
--    修復：呼叫 approve_quotation_item 時需傳入 bypass 參數，
--          否則新的合併組防護會擋住內部呼叫。
-- ============================================================
CREATE OR REPLACE FUNCTION public.approve_merge_group(
  p_group_id uuid
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

  -- 逐筆核准（v1.2: 傳入 p_from_merge_group=true 繞過合併組防護）
  FOR v_item_id IN
    SELECT id FROM public.quotation_items
    WHERE merge_group_id = p_group_id
    ORDER BY is_merge_leader DESC, created_at  -- 主項優先
  LOOP
    PERFORM public.approve_quotation_item(v_item_id, NULL, NULL, true);
  END LOOP;
END;
$$;

COMMENT ON FUNCTION public.approve_merge_group(uuid)
IS '核准合併組（v1.2: 傳遞 p_from_merge_group=true 繞過單項防護）';
