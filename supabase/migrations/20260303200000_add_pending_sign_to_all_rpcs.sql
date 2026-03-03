-- ============================================================
-- Migration: 所有工作台 RPC 納入「待簽約」報價單狀態
--
-- 問題：get_workbench_items 已納入待簽約，但其他 RPC
--      （create_merge_group、submit_single_item、submit_merge_group）
--       仍只接受已簽約/已歸檔，導致待簽約項目可看不可操作。
--
-- 修復：統一所有 RPC 的報價單狀態檢查。
-- ============================================================


-- 1. create_quotation_merge_group：加入待簽約
CREATE OR REPLACE FUNCTION public.create_quotation_merge_group(
  p_item_ids uuid[],
  p_leader_id uuid,
  p_payment_month text DEFAULT NULL
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

  -- 確認所有 item 存在且來自待簽約/已簽約/已歸檔報價單
  SELECT COUNT(*) INTO v_found_count
  FROM public.quotation_items qi
  JOIN public.quotations q ON qi.quotation_id = q.id
  WHERE qi.id = ANY(p_item_ids)
    AND q.status IN ('待簽約', '已簽約', '已歸檔');

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

  -- 分配顏色
  SELECT COUNT(DISTINCT merge_group_id) INTO v_existing_group_count
  FROM public.quotation_items
  WHERE merge_group_id IS NOT NULL;
  v_merge_color := v_colors[(v_existing_group_count % array_length(v_colors, 1)) + 1];

  -- 建立合併組
  v_group_id := gen_random_uuid();
  UPDATE public.quotation_items SET
    merge_group_id = v_group_id,
    is_merge_leader = (id = p_leader_id),
    merge_color = v_merge_color,
    expected_payment_month = COALESCE(p_payment_month, expected_payment_month)
  WHERE id = ANY(p_item_ids);

  RETURN v_group_id;
END;
$$;

COMMENT ON FUNCTION public.create_quotation_merge_group(uuid[], uuid, text)
IS '建立合併請款組（v1.3: 納入待簽約報價單）';


-- 2. submit_single_item：加入待簽約
CREATE OR REPLACE FUNCTION public.submit_single_item(
  p_item_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_item record;
BEGIN
  SELECT qi.*, q.status AS quotation_status
  INTO v_item
  FROM public.quotation_items qi
  JOIN public.quotations q ON qi.quotation_id = q.id
  WHERE qi.id = p_item_id
  FOR UPDATE OF qi;

  IF v_item IS NULL THEN
    RAISE EXCEPTION '找不到項目: %', p_item_id;
  END IF;

  IF v_item.merge_group_id IS NOT NULL THEN
    RAISE EXCEPTION '此項目在合併組中，請使用合併組送出';
  END IF;

  -- 報價單狀態檢查（被駁回項目可豁免）
  IF v_item.quotation_status NOT IN ('待簽約', '已簽約', '已歸檔')
     AND v_item.rejected_at IS NULL THEN
    RAISE EXCEPTION '報價單未簽約，無法送出請款';
  END IF;

  IF v_item.approved_at IS NOT NULL THEN
    RAISE EXCEPTION '此項目已核准';
  END IF;

  IF v_item.requested_at IS NOT NULL THEN
    RAISE EXCEPTION '此項目已送出，請勿重複送出';
  END IF;

  UPDATE public.quotation_items SET
    requested_at = NOW(),
    requested_by = (SELECT auth.uid()),
    rejected_at = NULL,
    rejected_by = NULL,
    rejection_reason = NULL
  WHERE id = p_item_id;
END;
$$;

COMMENT ON FUNCTION public.submit_single_item(uuid)
IS '送出單筆請款（v1.3: 納入待簽約報價單）';


-- 3. submit_merge_group：加入待簽約
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
BEGIN
  v_caller_id := (SELECT auth.uid());

  -- 確認合併組存在
  SELECT qi.* INTO v_leader
  FROM public.quotation_items qi
  WHERE qi.merge_group_id = p_group_id AND qi.is_merge_leader = true;

  IF v_leader IS NULL THEN
    RAISE EXCEPTION '找不到合併組或主項: %', p_group_id;
  END IF;

  -- 報價單狀態檢查：所有項目的報價單必須已簽約/已歸檔（被駁回項目豁免）
  IF EXISTS (
    SELECT 1 FROM public.quotation_items qi
    JOIN public.quotations q ON qi.quotation_id = q.id
    WHERE qi.merge_group_id = p_group_id
      AND q.status NOT IN ('待簽約', '已簽約', '已歸檔')
      AND qi.rejected_at IS NULL
  ) THEN
    RAISE EXCEPTION '合併組中有報價單未簽約的項目，無法送出';
  END IF;

  -- 驗證：所有項目都尚未送出且未核准
  IF EXISTS (
    SELECT 1 FROM public.quotation_items
    WHERE merge_group_id = p_group_id
      AND (requested_at IS NOT NULL OR approved_at IS NOT NULL)
  ) THEN
    RAISE EXCEPTION '合併組中有項目已送出或已核准';
  END IF;

  -- 繼承主項的發票和附件到成員
  UPDATE public.quotation_items SET
    invoice_number = v_leader.invoice_number,
    attachments = v_leader.attachments
  WHERE merge_group_id = p_group_id
    AND is_merge_leader = false;

  -- 所有項目標記為已送出
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
IS '送出合併組請款（v1.3: 納入待簽約報價單）';
