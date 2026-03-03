-- ============================================================
-- Migration: 修復撤回後項目從工作台消失
--
-- 問題：withdraw_single_item / withdraw_merge_group 撤回時只清除
--       requested_at，但若報價單狀態非「已簽約/已歸檔」，項目
--       不符合 get_workbench_items 的任何 WHERE 條件而消失。
--
-- 修復：撤回時設定 rejected_at + rejection_reason='已撤回'，
--       讓項目透過 rejected_at IS NOT NULL 條件留在工作台。
--       使用者可在「被駁回」分頁看到並重新送出。
-- ============================================================


-- 1. withdraw_single_item — 撤回後設定 rejected 狀態
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

  -- 清除 requested，設定 rejected 以保持在工作台可見
  UPDATE public.quotation_items SET
    requested_at = NULL,
    requested_by = NULL,
    rejected_at = NOW(),
    rejected_by = v_caller_id,
    rejection_reason = '已撤回'
  WHERE id = p_item_id;
END;
$$;

COMMENT ON FUNCTION public.withdraw_single_item(uuid)
IS '撤回單筆請款（v1.2: 設定 rejected 狀態防止項目消失）';


-- 2. withdraw_merge_group — 撤回後設定 rejected 狀態
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

  -- 確認合併組存在
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

  -- 取得送出者
  SELECT requested_by INTO v_submitter
  FROM public.quotation_items
  WHERE merge_group_id = p_group_id
  LIMIT 1;

  -- 撤回限制：僅送出者本人或 Admin
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

  -- 所有項目：清除 requested，設定 rejected 以保持在工作台可見
  UPDATE public.quotation_items SET
    requested_at = NULL,
    requested_by = NULL,
    rejected_at = NOW(),
    rejected_by = v_caller_id,
    rejection_reason = '已撤回'
  WHERE merge_group_id = p_group_id;
END;
$$;

COMMENT ON FUNCTION public.withdraw_merge_group(uuid)
IS '撤回合併組（v1.2: 設定 rejected 狀態防止項目消失）';
