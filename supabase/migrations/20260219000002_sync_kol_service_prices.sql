-- Migration: 報價單自動同步 KOL 服務定價
-- 1. kol_services 新增 last_quote_info 欄位
-- 2. 初始同步 RPC（歷史平均價格）
-- 3. 單筆報價同步 RPC（最新價格）

-- ============================================================
-- 1. Schema 變更：kol_services 新增備註欄位
-- ============================================================
ALTER TABLE kol_services
  ADD COLUMN IF NOT EXISTS last_quote_info text;

COMMENT ON COLUMN kol_services.last_quote_info IS '最後更新價格的報價單資訊（專案名稱 + 日期）';

-- ============================================================
-- 2. RPC: 初始同步（從所有歷史報價單計算平均價格）
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
    INSERT INTO kol_services (kol_id, service_type_id, price, last_quote_info, updated_at)
    VALUES (
      rec.kol_id,
      rec.service_type_id,
      rec.avg_price,
      '初始同步平均 (' || rec.item_count || '筆) - ' || COALESCE(rec.latest_quote_info, ''),
      NOW()
    )
    ON CONFLICT (kol_id, service_type_id)
    DO UPDATE SET
      price = EXCLUDED.price,
      last_quote_info = EXCLUDED.last_quote_info,
      updated_at = NOW();

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN json_build_object(
    'updated', v_updated_count,
    'message', '初始同步完成，已更新 ' || v_updated_count || ' 項服務價格'
  );
END;
$$;

COMMENT ON FUNCTION sync_kol_service_prices_initial IS '一次性初始同步：從所有報價單計算平均價格更新 KOL 服務定價';

-- ============================================================
-- 3. RPC: 單筆報價單同步（已簽約時用最新價格更新）
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

  -- 遍歷報價項目，比對服務類型後 UPSERT
  FOR rec IN
    SELECT
      qi.kol_id,
      st.id AS service_type_id,
      qi.price
    FROM quotation_items qi
    JOIN service_types st ON qi.service = st.name
    WHERE qi.quotation_id = p_quotation_id
      AND qi.kol_id IS NOT NULL
      AND qi.price > 0
  LOOP
    INSERT INTO kol_services (kol_id, service_type_id, price, last_quote_info, updated_at)
    VALUES (
      rec.kol_id,
      rec.service_type_id,
      rec.price,
      v_project_name || ' (' || v_quote_date || ')',
      NOW()
    )
    ON CONFLICT (kol_id, service_type_id)
    DO UPDATE SET
      price = EXCLUDED.price,
      last_quote_info = EXCLUDED.last_quote_info,
      updated_at = NOW();

    v_updated_count := v_updated_count + 1;
  END LOOP;

  RETURN json_build_object(
    'updated', v_updated_count,
    'project_name', v_project_name,
    'message', v_project_name || ' 同步 ' || v_updated_count || ' 項服務價格'
  );
END;
$$;

COMMENT ON FUNCTION sync_kol_service_prices_from_quotation IS '報價單簽約時自動同步 KOL 服務定價（使用最新價格）';

-- ============================================================
-- 4. 通知 PostgREST 重新載入 schema
-- ============================================================
NOTIFY pgrst, 'reload config';
