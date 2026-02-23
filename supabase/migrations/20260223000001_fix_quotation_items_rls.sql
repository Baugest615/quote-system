-- =====================================================
-- 修復 quotation_items RLS 政策
-- 問題：非 Admin 使用者無法 DELETE，導致報價項目重複
-- 原因：user_role enum 大小寫不一致 + 舊的 manage 政策可能已被移除
-- =====================================================

-- 1. 移除所有舊的 quotation_items 政策（避免衝突）
DROP POLICY IF EXISTS "All authenticated users can manage quotation_items" ON quotation_items;
DROP POLICY IF EXISTS "All authenticated users can view quotation_items" ON quotation_items;
DROP POLICY IF EXISTS "Allow read access on quotation_items" ON quotation_items;
DROP POLICY IF EXISTS "Allow write access for active users on quotation_items" ON quotation_items;

-- 2. 建立乾淨的政策
-- 所有已登入使用者可以讀取
CREATE POLICY "quotation_items_select"
  ON quotation_items FOR SELECT
  TO authenticated
  USING (true);

-- 所有已登入使用者可以新增/修改/刪除（業務權限由前端控制）
CREATE POLICY "quotation_items_all"
  ON quotation_items FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 3. 確保 RLS 已啟用
ALTER TABLE quotation_items ENABLE ROW LEVEL SECURITY;

-- 4. 同步修復 quotations 表（同樣的大小寫問題）
DROP POLICY IF EXISTS "Allow write access for active users on quotations" ON quotations;
DROP POLICY IF EXISTS "Allow read access on quotations" ON quotations;
DROP POLICY IF EXISTS "All authenticated users can view quotations" ON quotations;

CREATE POLICY "quotations_select"
  ON quotations FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "quotations_all"
  ON quotations FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- 通知 PostgREST 重載 schema
NOTIFY pgrst, 'reload schema';
