-- ============================================================
-- Migration: 修復合併組 RPC 對被駁回項目的報價單狀態豁免
--
-- 問題：get_workbench_items 允許被駁回項目（rejected_at IS NOT NULL）
--       不受報價單狀態限制顯示在工作台，但 create_quotation_merge_group
--       仍嚴格檢查 q.status IN ('待簽約', '已簽約', '已歸檔')，
--       導致包含被駁回項目的合併操作回傳 400 錯誤。
--
-- 修復：與 submit_single_item / submit_merge_group 一致，
--       被駁回項目（rejected_at IS NOT NULL）豁免報價單狀態檢查。
-- ============================================================

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

  -- 確認所有 item 存在且來自正確狀態的報價單
  -- 被駁回項目可豁免（它們已進入過請款流程，與 submit_single_item 一致）
  SELECT COUNT(*) INTO v_found_count
  FROM public.quotation_items qi
  JOIN public.quotations q ON qi.quotation_id = q.id
  WHERE qi.id = ANY(p_item_ids)
    AND (
      q.status IN ('待簽約', '已簽約', '已歸檔')
      OR qi.rejected_at IS NOT NULL
    );

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
IS '建立合併組（v1.4: 被駁回項目豁免報價單狀態檢查，與其他工作台 RPC 一致）';
