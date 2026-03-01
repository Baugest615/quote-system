-- ============================================================
-- Migration: 報價單流水號 (quote_number)
-- 格式: YYYYNNNN (e.g., 20260001)
-- ============================================================

-- 1. 新增欄位
ALTER TABLE public.quotations ADD COLUMN quote_number TEXT UNIQUE;

-- 2. 計數器表（年度別序號，確保原子性）
CREATE TABLE IF NOT EXISTS public.quote_number_counters (
  year INTEGER PRIMARY KEY,
  last_number INTEGER NOT NULL DEFAULT 0
);

-- 3. 自動編號函式
CREATE OR REPLACE FUNCTION public.generate_quote_number()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO ''
AS $$
DECLARE
  v_year INTEGER;
  v_next INTEGER;
BEGIN
  v_year := EXTRACT(YEAR FROM COALESCE(NEW.created_at, NOW()));

  INSERT INTO public.quote_number_counters (year, last_number)
  VALUES (v_year, 1)
  ON CONFLICT (year) DO UPDATE
    SET last_number = public.quote_number_counters.last_number + 1
  RETURNING last_number INTO v_next;

  NEW.quote_number := LPAD(v_year::TEXT, 4, '0') || LPAD(v_next::TEXT, 4, '0');

  RETURN NEW;
END;
$$;

-- 4. INSERT 觸發器（僅在 quote_number 為 NULL 時觸發）
CREATE TRIGGER trg_generate_quote_number
  BEFORE INSERT ON public.quotations
  FOR EACH ROW
  WHEN (NEW.quote_number IS NULL)
  EXECUTE FUNCTION public.generate_quote_number();

-- 5. 回填既有資料（按 created_at 排序編號）
DO $$
DECLARE
  rec RECORD;
  v_year INTEGER;
  v_next INTEGER;
BEGIN
  FOR rec IN
    SELECT id, created_at
    FROM public.quotations
    WHERE quote_number IS NULL
    ORDER BY created_at ASC
  LOOP
    v_year := EXTRACT(YEAR FROM rec.created_at);

    INSERT INTO public.quote_number_counters (year, last_number)
    VALUES (v_year, 1)
    ON CONFLICT (year) DO UPDATE
      SET last_number = public.quote_number_counters.last_number + 1
    RETURNING last_number INTO v_next;

    UPDATE public.quotations
    SET quote_number = LPAD(v_year::TEXT, 4, '0') || LPAD(v_next::TEXT, 4, '0')
    WHERE id = rec.id;
  END LOOP;
END;
$$;

-- 6. RLS：計數器表僅允許讀取（寫入由 trigger 的 SECURITY DEFINER 處理）
ALTER TABLE public.quote_number_counters ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quote_number_counters_select_all_policy"
  ON public.quote_number_counters
  FOR SELECT USING (true);

-- 7. 索引加速搜尋
CREATE INDEX idx_quotations_quote_number ON public.quotations (quote_number);
