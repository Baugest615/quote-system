-- Migration: kol_services 新增 cost 欄位，並更新同步 RPC 同時同步 cost
-- Created: 2026-02-19

-- ============================================================
-- 1. Schema 變更：kol_services 新增 cost 欄位
-- ============================================================
ALTER TABLE kol_services
  ADD COLUMN IF NOT EXISTS cost numeric NOT NULL DEFAULT 0;

COMMENT ON COLUMN kol_services.cost IS 'KOL 服務成本（來自報價單項目的 cost 欄位）';

-- ============================================================
-- 2. RPC: 初始同步（更新版，包含 cost）
-- ============================================================
CREATE OR REPLACE FUNCTION sync_kol_service_prices_initial()
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count integer := 0;
  rec record;
BEGIN
  FOR rec IN
    SELECT
      qi.kol_id,
      st.id AS service_type_id,
      st.name AS service_name,
      ROUND(AVG(qi.price), 2) AS avg_price,
      ROUND(AVG(COALESCE(qi.cost, 0)), 2) AS avg_cost,
      COUNT(*) AS item_count,
      (
        SELECT q2.project_name || ' (' || TO_CHAR(q2.created_at, 'YYYY-MM-DD') || ')'
        FROM quotation_items qi2
        JOIN quotations q2 ON qi2.quotation_id = q2.id
        WHERE qi2.kol_id = qi.kol_id
          AND qi2.service = st.name
          AND qi2.price > 0
        ORDER BY q2.created_at DESC
        LIMIT 1
      ) AS latest_quote_info
    FROM quotation_items qi
    JOIN service_types st ON qi.service = st.name
    WHERE qi.kol_id IS NOT NULL
      AND qi.price > 0
    GROUP BY qi.kol_id, st.id, st.name
  LOOP
    INSERT INTO kol_services (kol_id, service_type_id, price, cost, last_quote_info, updated_at)
    VALUES (
      rec.kol_id,
      rec.service_type_id,
      rec.avg_price,
      rec.avg_cost,
      '初始同步平均 (' || rec.item_count || '筆) - ' || COALESCE(rec.latest_quote_info, ''),
      NOW()
    )
    ON CONFLICT (kol_id, service_type_id)
    DO UPDATE SET
      price = EXCLUDED.price,
      cost = EXCLUDED.cost,
      last_quote_info = EXCLUDED.last_quote_info,
      updated_at = NOW();

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN json_build_object(
    'updated', v_updated_count,
    'message', '初始同步完成，已更新 ' || v_updated_count || ' 項服務價格與成本'
  );
END;
$$;

-- ============================================================
-- 3. RPC: 單筆報價單同步（更新版，包含 cost）
-- ============================================================
CREATE OR REPLACE FUNCTION sync_kol_service_prices_from_quotation(
  p_quotation_id uuid
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_updated_count integer := 0;
  v_project_name text;
  v_quote_date text;
  rec record;
BEGIN
  -- 取得報價單資訊
  SELECT
    q.project_name,
    TO_CHAR(q.created_at, 'YYYY-MM-DD')
  INTO v_project_name, v_quote_date
  FROM quotations q
  WHERE q.id = p_quotation_id;

  IF v_project_name IS NULL THEN
    RAISE EXCEPTION '找不到報價單: %', p_quotation_id;
  END IF;

  -- 遍歷報價項目，比對服務類型後 UPSERT（含 cost）
  FOR rec IN
    SELECT
      qi.kol_id,
      st.id AS service_type_id,
      qi.price,
      COALESCE(qi.cost, 0) AS cost
    FROM quotation_items qi
    JOIN service_types st ON qi.service = st.name
    WHERE qi.quotation_id = p_quotation_id
      AND qi.kol_id IS NOT NULL
      AND qi.price > 0
  LOOP
    INSERT INTO kol_services (kol_id, service_type_id, price, cost, last_quote_info, updated_at)
    VALUES (
      rec.kol_id,
      rec.service_type_id,
      rec.price,
      rec.cost,
      v_project_name || ' (' || v_quote_date || ')',
      NOW()
    )
    ON CONFLICT (kol_id, service_type_id)
    DO UPDATE SET
      price = EXCLUDED.price,
      cost = EXCLUDED.cost,
      last_quote_info = EXCLUDED.last_quote_info,
      updated_at = NOW();

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN json_build_object(
    'updated', v_updated_count,
    'project_name', v_project_name,
    'message', v_project_name || ' 同步 ' || v_updated_count || ' 項服務價格與成本'
  );
END;
$$;

-- ============================================================
-- 4. 通知 PostgREST 重新載入 schema
-- ============================================================
NOTIFY pgrst, 'reload config';
