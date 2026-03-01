-- reject_quotation_item RPC：駁回報價單請款項目
-- 對應 approve_quotation_item 的反向操作

CREATE OR REPLACE FUNCTION "public"."reject_quotation_item"(
  "p_item_id" "uuid",
  "p_reason" "text" DEFAULT ''::"text"
) RETURNS "void"
    LANGUAGE "plpgsql" SECURITY DEFINER
    SET "search_path" TO ''
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

ALTER FUNCTION "public"."reject_quotation_item"("p_item_id" "uuid", "p_reason" "text") OWNER TO "postgres";

COMMENT ON FUNCTION "public"."reject_quotation_item"("p_item_id" "uuid", "p_reason" "text")
IS '駁回報價單請款項目：更新駁回欄位並清空請款/核准狀態（僅 Admin/Editor）';
