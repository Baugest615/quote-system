-- Fix: verify_data_integrity() enum 轉型（quotation_status → text）
-- 直接重新建立函式即可（CREATE OR REPLACE）

CREATE OR REPLACE FUNCTION public.verify_data_integrity()
RETURNS TABLE (
  check_id text,
  category text,
  description text,
  passed boolean,
  detail text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_count integer;
  v_total integer;
  v_detail text;
  v_workbench_count integer;
  v_pending integer;
  v_requested integer;
  v_rejected integer;

  -- 工作台允許的報價單狀態（單一來源，所有 check 共用）
  v_allowed_statuses text[] := ARRAY['待簽約', '已簽約', '已歸檔'];
BEGIN

  -- ============================================================
  -- 類別：資料一致性（data_consistency）
  -- ============================================================

  -- DC-01: 不應存在 cost>0 但 cost_amount=0 的工作台項目
  SELECT COUNT(*) INTO v_count
  FROM public.quotation_items qi
  JOIN public.quotations q ON qi.quotation_id = q.id
  WHERE qi.approved_at IS NULL
    AND qi.cost IS NOT NULL AND qi.cost > 0
    AND (qi.cost_amount IS NULL OR qi.cost_amount = 0)
    AND (
      q.status::text = ANY(v_allowed_statuses)
      OR qi.requested_at IS NOT NULL
      OR (qi.rejected_at IS NOT NULL AND qi.rejection_reason IS NOT NULL)
    );

  check_id := 'DC-01'; category := 'data_consistency';
  description := 'cost>0 的工作台項目必須有 cost_amount';
  passed := (v_count = 0);
  detail := CASE WHEN v_count = 0 THEN 'OK' ELSE v_count || ' items with cost>0 but cost_amount=0' END;
  RETURN NEXT;

  -- DC-02: 不應存在 orphan items（曾送出但三 timestamp 皆 NULL）
  SELECT COUNT(*) INTO v_count
  FROM public.quotation_items qi
  JOIN public.quotations q ON qi.quotation_id = q.id
  WHERE qi.approved_at IS NULL
    AND qi.requested_at IS NULL
    AND qi.rejected_at IS NULL
    AND q.status::text = ANY(v_allowed_statuses)
    AND qi.cost_amount IS NOT NULL AND qi.cost_amount > 0
    AND qi.requested_by IS NOT NULL;

  check_id := 'DC-02'; category := 'data_consistency';
  description := '不應有曾送出但三 timestamp 皆 NULL 的項目（orphan）';
  passed := (v_count = 0);
  detail := CASE WHEN v_count = 0 THEN 'OK' ELSE v_count || ' orphan items detected' END;
  RETURN NEXT;

  -- DC-03: merge_group 內成員狀態必須一致
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT merge_group_id,
      COUNT(DISTINCT CASE
        WHEN approved_at IS NOT NULL THEN 'approved'
        WHEN rejected_at IS NOT NULL THEN 'rejected'
        WHEN requested_at IS NOT NULL THEN 'requested'
        ELSE 'pending'
      END) AS status_count
    FROM public.quotation_items
    WHERE merge_group_id IS NOT NULL
    GROUP BY merge_group_id
    HAVING COUNT(DISTINCT CASE
      WHEN approved_at IS NOT NULL THEN 'approved'
      WHEN rejected_at IS NOT NULL THEN 'rejected'
      WHEN requested_at IS NOT NULL THEN 'requested'
      ELSE 'pending'
    END) > 1
  ) AS inconsistent_groups;

  check_id := 'DC-03'; category := 'data_consistency';
  description := 'merge_group 內成員狀態必須一致';
  passed := (v_count = 0);
  detail := CASE WHEN v_count = 0 THEN 'OK' ELSE v_count || ' groups with inconsistent status' END;
  RETURN NEXT;

  -- DC-04: merge_group 必須恰好有一個 leader
  SELECT COUNT(*) INTO v_count
  FROM (
    SELECT merge_group_id,
      COUNT(*) FILTER (WHERE is_merge_leader = true) AS leader_count
    FROM public.quotation_items
    WHERE merge_group_id IS NOT NULL
    GROUP BY merge_group_id
    HAVING COUNT(*) FILTER (WHERE is_merge_leader = true) != 1
  ) AS bad_groups;

  check_id := 'DC-04'; category := 'data_consistency';
  description := 'merge_group 必須恰好有一個 leader';
  passed := (v_count = 0);
  detail := CASE WHEN v_count = 0 THEN 'OK' ELSE v_count || ' groups without exactly 1 leader' END;
  RETURN NEXT;

  -- ============================================================
  -- 類別：工作台一致性（workbench_consistency）
  -- ============================================================

  -- WB-01: 工作台筆數 = pending + requested + rejected
  SELECT COUNT(*) INTO v_workbench_count
  FROM public.quotation_items qi
  JOIN public.quotations q ON qi.quotation_id = q.id
  WHERE qi.approved_at IS NULL
    AND (
      q.status::text = ANY(v_allowed_statuses)
      OR qi.requested_at IS NOT NULL
      OR (qi.rejected_at IS NOT NULL AND qi.rejection_reason IS NOT NULL)
    );

  SELECT
    COUNT(*) FILTER (WHERE requested_at IS NULL AND rejected_at IS NULL),
    COUNT(*) FILTER (WHERE requested_at IS NOT NULL AND rejected_at IS NULL),
    COUNT(*) FILTER (WHERE rejected_at IS NOT NULL)
  INTO v_pending, v_requested, v_rejected
  FROM public.quotation_items qi
  JOIN public.quotations q ON qi.quotation_id = q.id
  WHERE qi.approved_at IS NULL
    AND (
      q.status::text = ANY(v_allowed_statuses)
      OR qi.requested_at IS NOT NULL
      OR (qi.rejected_at IS NOT NULL AND qi.rejection_reason IS NOT NULL)
    );

  check_id := 'WB-01'; category := 'workbench_consistency';
  description := '工作台筆數 = pending + requested + rejected';
  passed := (v_workbench_count = v_pending + v_requested + v_rejected);
  detail := 'total=' || v_workbench_count || ' pending=' || v_pending || ' requested=' || v_requested || ' rejected=' || v_rejected;
  RETURN NEXT;

  -- WB-02: 工作台允許的報價單狀態登記
  check_id := 'WB-02'; category := 'workbench_consistency';
  description := '工作台允許的報價單狀態登記（需與操作 RPC 同步）';
  passed := true;
  detail := 'allowed_statuses=' || array_to_string(v_allowed_statuses, ',');
  RETURN NEXT;

  -- ============================================================
  -- 類別：RLS 政策一致性（rls_consistency）
  -- ============================================================

  -- RLS-01: kols/service_types/kol_services 的 INSERT 政策必須包含 Member
  SELECT COUNT(*) INTO v_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND tablename IN ('kols', 'service_types', 'kol_services')
    AND cmd = 'INSERT'
    AND (qual::text LIKE '%Member%' OR with_check::text LIKE '%Member%');

  check_id := 'RLS-01'; category := 'rls_consistency';
  description := 'kols/service_types/kol_services INSERT 政策包含 Member';
  passed := (v_count >= 3);
  detail := v_count || '/3 tables have Member in INSERT policy';
  RETURN NEXT;

  -- ============================================================
  -- 類別：資料品質（data_quality）
  -- ============================================================

  -- DQ-01: 已核准項目必須有 cost_amount
  SELECT COUNT(*) INTO v_count
  FROM public.quotation_items
  WHERE approved_at IS NOT NULL
    AND (cost_amount IS NULL OR cost_amount = 0);

  check_id := 'DQ-01'; category := 'data_quality';
  description := '已核准項目必須有 cost_amount';
  passed := (v_count = 0);
  detail := CASE WHEN v_count = 0 THEN 'OK' ELSE v_count || ' approved items without cost_amount' END;
  RETURN NEXT;

  -- DQ-02: rejected 項目必須有 rejection_reason
  SELECT COUNT(*) INTO v_count
  FROM public.quotation_items
  WHERE rejected_at IS NOT NULL
    AND (rejection_reason IS NULL OR rejection_reason = '');

  check_id := 'DQ-02'; category := 'data_quality';
  description := '被駁回項目必須有 rejection_reason';
  passed := (v_count = 0);
  detail := CASE WHEN v_count = 0 THEN 'OK' ELSE v_count || ' rejected items without reason' END;
  RETURN NEXT;

  RETURN;
END;
$$;
