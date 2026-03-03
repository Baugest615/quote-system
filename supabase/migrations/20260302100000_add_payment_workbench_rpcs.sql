-- ============================================================
-- Migration: 合併請款工作台 RPC
-- spec-id: 001-merged-payment-workbench
--
-- 新增 RPC：
--   1. get_workbench_items()                — 工作台項目查詢
--   2. create_quotation_merge_group()       — 建立合併組
--   3. dissolve_quotation_merge_group()     — 拆分合併組
--   4. submit_merge_group()                 — 送出合併組（團進）
--   5. submit_single_item()                 — 送出單筆
--   6. withdraw_merge_group()               — 撤回合併組
--   7. withdraw_single_item()               — 撤回單筆
--   8. approve_merge_group()                — 核准合併組（團進）
--   9. reject_merge_group()                 — 駁回合併組（團出）
-- ============================================================

-- ============================================================
-- 1. get_workbench_items()
--    取得所有已簽約報價單中，尚未核准的項目（pending / requested / rejected）
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_workbench_items()
RETURNS TABLE (
  id uuid,
  quotation_id uuid,
  kol_id uuid,
  category text,
  service text,
  quantity integer,
  price numeric,
  cost numeric,
  cost_amount numeric,
  invoice_number text,
  attachments jsonb,
  expense_type text,
  accounting_subject text,
  expected_payment_month text,
  remittance_name text,
  remark text,
  requested_at timestamptz,
  requested_by uuid,
  approved_at timestamptz,
  approved_by uuid,
  rejected_at timestamptz,
  rejected_by uuid,
  rejection_reason text,
  merge_group_id uuid,
  is_merge_leader boolean,
  merge_color text,
  created_at timestamptz,
  -- 關聯資訊
  project_name text,
  client_name text,
  kol_name text,
  kol_bank_info jsonb
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
BEGIN
  RETURN QUERY
  SELECT
    qi.id,
    qi.quotation_id,
    qi.kol_id,
    qi.category,
    qi.service,
    qi.quantity,
    qi.price,
    qi.cost,
    qi.cost_amount,
    qi.invoice_number,
    qi.attachments,
    qi.expense_type,
    qi.accounting_subject,
    qi.expected_payment_month,
    qi.remittance_name,
    qi.remark,
    qi.requested_at,
    qi.requested_by,
    qi.approved_at,
    qi.approved_by,
    qi.rejected_at,
    qi.rejected_by,
    qi.rejection_reason,
    qi.merge_group_id,
    qi.is_merge_leader,
    qi.merge_color,
    qi.created_at,
    q.project_name,
    c.name  AS client_name,
    k.name  AS kol_name,
    k.bank_info AS kol_bank_info
  FROM public.quotation_items qi
  JOIN public.quotations q ON qi.quotation_id = q.id
  LEFT JOIN public.clients c ON q.client_id = c.id
  LEFT JOIN public.kols k ON qi.kol_id = k.id
  WHERE q.status = '已簽約'
    AND qi.approved_at IS NULL
  ORDER BY qi.remittance_name NULLS LAST, q.project_name, qi.created_at;
END;
$$;

ALTER FUNCTION public.get_workbench_items() OWNER TO postgres;
COMMENT ON FUNCTION public.get_workbench_items()
IS '請款工作台：取得所有已簽約報價單中尚未核准的項目（pending / requested / rejected）';


-- ============================================================
-- 2. create_quotation_merge_group()
--    建立合併組：驗證同帳戶、同 pending 狀態、產生 group_id + 色帶
-- ============================================================
CREATE OR REPLACE FUNCTION public.create_quotation_merge_group(
  p_item_ids uuid[],
  p_leader_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_group_id uuid;
  v_leader_bank_info jsonb;
  v_item record;
  v_merge_color text;
  v_existing_group_count integer;
  v_colors text[] := ARRAY[
    '#3b82f6', '#8b5cf6', '#f59e0b',
    '#10b981', '#f43f5e', '#06b6d4'
  ];
  v_found_count integer;
BEGIN
  -- 驗證至少 2 筆
  IF array_length(p_item_ids, 1) IS NULL OR array_length(p_item_ids, 1) < 2 THEN
    RAISE EXCEPTION '合併至少需要 2 筆項目';
  END IF;

  -- 驗證 leader 在 item_ids 中
  IF NOT (p_leader_id = ANY(p_item_ids)) THEN
    RAISE EXCEPTION '主項必須在合併項目中';
  END IF;

  -- 確認所有 item 存在且來自已簽約報價單
  SELECT COUNT(*) INTO v_found_count
  FROM public.quotation_items qi
  JOIN public.quotations q ON qi.quotation_id = q.id
  WHERE qi.id = ANY(p_item_ids)
    AND q.status = '已簽約';

  IF v_found_count != array_length(p_item_ids, 1) THEN
    RAISE EXCEPTION '部分項目不存在或報價單未簽約';
  END IF;

  -- 取得 leader 的銀行資訊
  SELECT k.bank_info
  INTO v_leader_bank_info
  FROM public.quotation_items qi
  LEFT JOIN public.kols k ON k.id = qi.kol_id
  WHERE qi.id = p_leader_id;

  IF v_leader_bank_info IS NULL THEN
    RAISE EXCEPTION '主項的 KOL 未設定銀行資訊，無法合併';
  END IF;

  -- 逐筆驗證（加鎖防並發）
  FOR v_item IN
    SELECT qi.id, qi.requested_at, qi.approved_at, qi.merge_group_id,
           k.bank_info
    FROM public.quotation_items qi
    LEFT JOIN public.kols k ON k.id = qi.kol_id
    WHERE qi.id = ANY(p_item_ids)
    FOR UPDATE OF qi
  LOOP
    IF v_item.requested_at IS NOT NULL THEN
      RAISE EXCEPTION '項目 % 已送出請款，無法合併', v_item.id;
    END IF;
    IF v_item.approved_at IS NOT NULL THEN
      RAISE EXCEPTION '項目 % 已核准，無法合併', v_item.id;
    END IF;
    IF v_item.merge_group_id IS NOT NULL THEN
      RAISE EXCEPTION '項目 % 已在其他合併組中', v_item.id;
    END IF;
    IF v_item.bank_info IS DISTINCT FROM v_leader_bank_info THEN
      RAISE EXCEPTION '項目 % 的銀行帳戶與主項不同，無法合併', v_item.id;
    END IF;
  END LOOP;

  -- 分配顏色（基於現有合併組數量輪替）
  SELECT COUNT(DISTINCT merge_group_id) INTO v_existing_group_count
  FROM public.quotation_items
  WHERE merge_group_id IS NOT NULL;

  v_merge_color := v_colors[(v_existing_group_count % 6) + 1];

  -- 建立合併組
  v_group_id := gen_random_uuid();

  UPDATE public.quotation_items SET
    merge_group_id = v_group_id,
    is_merge_leader = (id = p_leader_id),
    merge_color = v_merge_color
  WHERE id = ANY(p_item_ids);

  RETURN v_group_id;
END;
$$;

ALTER FUNCTION public.create_quotation_merge_group(uuid[], uuid) OWNER TO postgres;
COMMENT ON FUNCTION public.create_quotation_merge_group(uuid[], uuid)
IS '建立合併組：驗證同銀行帳戶 + pending 狀態，分配色帶，設定 merge_group_id';


-- ============================================================
-- 3. dissolve_quotation_merge_group()
--    拆分合併組：清除 merge 欄位，非主項清除繼承的發票/附件
-- ============================================================
CREATE OR REPLACE FUNCTION public.dissolve_quotation_merge_group(
  p_group_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_count integer;
BEGIN
  -- 確認合併組存在
  SELECT COUNT(*) INTO v_count
  FROM public.quotation_items
  WHERE merge_group_id = p_group_id;

  IF v_count = 0 THEN
    RAISE EXCEPTION '找不到合併組: %', p_group_id;
  END IF;

  -- 驗證：全部項目都不在 requested 或 approved 狀態
  IF EXISTS (
    SELECT 1 FROM public.quotation_items
    WHERE merge_group_id = p_group_id
      AND (requested_at IS NOT NULL OR approved_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION '合併組中有項目已送出或已核准，無法拆分';
  END IF;

  -- 非主項清除繼承的發票和附件
  UPDATE public.quotation_items SET
    invoice_number = NULL,
    attachments = '[]'::jsonb
  WHERE merge_group_id = p_group_id
    AND is_merge_leader = false;

  -- 清除所有項目的 merge 欄位
  UPDATE public.quotation_items SET
    merge_group_id = NULL,
    is_merge_leader = false,
    merge_color = NULL
  WHERE merge_group_id = p_group_id;
END;
$$;

ALTER FUNCTION public.dissolve_quotation_merge_group(uuid) OWNER TO postgres;
COMMENT ON FUNCTION public.dissolve_quotation_merge_group(uuid)
IS '拆分合併組：清除 merge 欄位及非主項繼承的發票/附件（僅 pending/rejected 可拆分）';


-- ============================================================
-- 4. submit_merge_group()
--    送出合併組（團進）：設定 requested_at/by，非主項複製主項發票/附件
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

  -- 驗證：全部項目都是 pending（requested_at IS NULL, approved_at IS NULL）
  IF EXISTS (
    SELECT 1 FROM public.quotation_items
    WHERE merge_group_id = p_group_id
      AND (requested_at IS NOT NULL OR approved_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION '合併組中有項目已送出或已核准，無法重複送出';
  END IF;

  -- 驗證：全部項目的 cost_amount 都已填寫
  IF EXISTS (
    SELECT 1 FROM public.quotation_items
    WHERE merge_group_id = p_group_id
      AND (cost_amount IS NULL OR cost_amount <= 0)
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

ALTER FUNCTION public.submit_merge_group(uuid) OWNER TO postgres;
COMMENT ON FUNCTION public.submit_merge_group(uuid)
IS '送出合併組（團進）：非主項繼承主項發票/附件，全部設為 requested';


-- ============================================================
-- 5. submit_single_item()
--    送出單筆項目（非合併組）
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

  IF v_item.quotation_status != '已簽約' THEN
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

  IF v_item.cost_amount IS NULL OR v_item.cost_amount <= 0 THEN
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

ALTER FUNCTION public.submit_single_item(uuid) OWNER TO postgres;
COMMENT ON FUNCTION public.submit_single_item(uuid)
IS '送出單筆請款項目（非合併組），驗證已簽約 + 有金額 + 有發票/附件';


-- ============================================================
-- 6. withdraw_merge_group()
--    撤回合併組：清除 requested 狀態，非主項清除繼承的發票/附件
-- ============================================================
CREATE OR REPLACE FUNCTION public.withdraw_merge_group(
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
  v_submitter uuid;
BEGIN
  v_caller_id := (SELECT auth.uid());

  -- 確認合併組存在且全部是 requested 狀態
  IF NOT EXISTS (
    SELECT 1 FROM public.quotation_items
    WHERE merge_group_id = p_group_id
  ) THEN
    RAISE EXCEPTION '找不到合併組: %', p_group_id;
  END IF;

  -- 驗證：全部項目都是 requested（已送出但未核准/駁回）
  IF EXISTS (
    SELECT 1 FROM public.quotation_items
    WHERE merge_group_id = p_group_id
      AND (requested_at IS NULL OR approved_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION '合併組中有項目尚未送出或已核准，無法撤回';
  END IF;

  -- 取得送出者（從任一項目，團進保證同一人）
  SELECT requested_by INTO v_submitter
  FROM public.quotation_items
  WHERE merge_group_id = p_group_id
  LIMIT 1;

  -- 撤回限制：僅送出者本人或 Admin 可撤回
  IF v_caller_id != v_submitter THEN
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role IS NULL OR v_caller_role != 'Admin' THEN
      RAISE EXCEPTION '只有送出者本人或 Admin 可以撤回';
    END IF;
  END IF;

  -- 非主項清除繼承的發票和附件
  UPDATE public.quotation_items SET
    invoice_number = NULL,
    attachments = '[]'::jsonb
  WHERE merge_group_id = p_group_id
    AND is_merge_leader = false;

  -- 所有項目清除 requested 狀態
  UPDATE public.quotation_items SET
    requested_at = NULL,
    requested_by = NULL
  WHERE merge_group_id = p_group_id;
END;
$$;

ALTER FUNCTION public.withdraw_merge_group(uuid) OWNER TO postgres;
COMMENT ON FUNCTION public.withdraw_merge_group(uuid)
IS '撤回合併組：清除 requested 狀態及非主項繼承的發票/附件（僅送出者或 Admin）';


-- ============================================================
-- 7. withdraw_single_item()
--    撤回單筆項目
-- ============================================================
CREATE OR REPLACE FUNCTION public.withdraw_single_item(
  p_item_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_item record;
BEGIN
  v_caller_id := (SELECT auth.uid());

  SELECT * INTO v_item
  FROM public.quotation_items
  WHERE id = p_item_id
  FOR UPDATE;

  IF v_item IS NULL THEN
    RAISE EXCEPTION '找不到項目: %', p_item_id;
  END IF;

  IF v_item.merge_group_id IS NOT NULL THEN
    RAISE EXCEPTION '此項目在合併組中，請使用合併組撤回';
  END IF;

  IF v_item.requested_at IS NULL THEN
    RAISE EXCEPTION '此項目尚未送出，無需撤回';
  END IF;

  IF v_item.approved_at IS NOT NULL THEN
    RAISE EXCEPTION '此項目已核准，無法撤回';
  END IF;

  -- 撤回限制：僅送出者本人或 Admin
  IF v_caller_id != v_item.requested_by THEN
    SELECT role INTO v_caller_role
    FROM public.profiles
    WHERE id = v_caller_id;

    IF v_caller_role IS NULL OR v_caller_role != 'Admin' THEN
      RAISE EXCEPTION '只有送出者本人或 Admin 可以撤回';
    END IF;
  END IF;

  UPDATE public.quotation_items SET
    requested_at = NULL,
    requested_by = NULL
  WHERE id = p_item_id;
END;
$$;

ALTER FUNCTION public.withdraw_single_item(uuid) OWNER TO postgres;
COMMENT ON FUNCTION public.withdraw_single_item(uuid)
IS '撤回單筆請款項目（非合併組），僅送出者或 Admin 可撤回';


-- ============================================================
-- 8. approve_merge_group()
--    核准合併組（團進）：逐筆呼叫 approve_quotation_item，transaction 包裹
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

  -- 逐筆核准（approve_quotation_item 會建立 accounting_expenses 等記錄）
  FOR v_item_id IN
    SELECT id FROM public.quotation_items
    WHERE merge_group_id = p_group_id
    ORDER BY is_merge_leader DESC, created_at  -- 主項優先
  LOOP
    PERFORM public.approve_quotation_item(v_item_id);
  END LOOP;
END;
$$;

ALTER FUNCTION public.approve_merge_group(uuid) OWNER TO postgres;
COMMENT ON FUNCTION public.approve_merge_group(uuid)
IS '核准合併組（團進）：逐筆呼叫 approve_quotation_item 建立帳務記錄，transaction 保證全成功或全失敗';


-- ============================================================
-- 9. reject_merge_group()
--    駁回合併組（團出）：全部設為 rejected，清除 requested 狀態
-- ============================================================
CREATE OR REPLACE FUNCTION public.reject_merge_group(
  p_group_id uuid,
  p_reason text DEFAULT ''::text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_role text;
  v_reason text;
BEGIN
  v_caller_id := (SELECT auth.uid());

  -- 角色驗證（需 Editor+）
  SELECT role INTO v_caller_role
  FROM public.profiles
  WHERE id = v_caller_id;

  IF v_caller_role IS NULL OR v_caller_role NOT IN ('Admin', 'Editor') THEN
    RAISE EXCEPTION '權限不足：只有 Admin 或 Editor 可以駁回請款';
  END IF;

  -- 確認合併組存在
  IF NOT EXISTS (
    SELECT 1 FROM public.quotation_items
    WHERE merge_group_id = p_group_id
  ) THEN
    RAISE EXCEPTION '找不到合併組: %', p_group_id;
  END IF;

  -- 驗證：全部項目都是 requested 狀態
  IF EXISTS (
    SELECT 1 FROM public.quotation_items
    WHERE merge_group_id = p_group_id
      AND (requested_at IS NULL OR approved_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION '合併組中有項目尚未送出或已核准，無法駁回';
  END IF;

  v_reason := COALESCE(NULLIF(p_reason, ''), '未提供原因');

  -- 團出：全部設為 rejected
  UPDATE public.quotation_items SET
    rejected_at = NOW(),
    rejected_by = v_caller_id,
    rejection_reason = v_reason,
    requested_at = NULL,
    requested_by = NULL,
    approved_at = NULL,
    approved_by = NULL
  WHERE merge_group_id = p_group_id;
END;
$$;

ALTER FUNCTION public.reject_merge_group(uuid, text) OWNER TO postgres;
COMMENT ON FUNCTION public.reject_merge_group(uuid, text)
IS '駁回合併組（團出）：全部項目設為 rejected 並清除 requested 狀態（僅 Admin/Editor）';
