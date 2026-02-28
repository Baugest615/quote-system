-- =====================================================
-- Phase 1 安全加固 (B)：重寫核心表 RLS
-- 規則：
--   SELECT: 全部可讀
--   INSERT: 全部可新增（created_by 由 trigger 自動填入）
--   UPDATE: Admin/Editor 全部可改，Member 只能改自己建的
--   DELETE: Admin/Editor 全部可刪，Member 只能刪自己建的
--   歷史記錄（created_by IS NULL）：只有 Admin/Editor 能修改/刪除
-- =====================================================

-- ============ kols ============

DROP POLICY IF EXISTS "kols_select" ON kols;
DROP POLICY IF EXISTS "kols_all" ON kols;

CREATE POLICY "kols_select_all_policy" ON kols
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "kols_insert_authenticated_policy" ON kols
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "kols_update_role_policy" ON kols
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
    OR created_by = (SELECT auth.uid())
  );

CREATE POLICY "kols_delete_role_policy" ON kols
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
    OR (created_by IS NOT NULL AND created_by = (SELECT auth.uid()))
  );

-- ============ clients ============

DROP POLICY IF EXISTS "clients_select" ON clients;
DROP POLICY IF EXISTS "clients_all" ON clients;

CREATE POLICY "clients_select_all_policy" ON clients
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "clients_insert_authenticated_policy" ON clients
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "clients_update_role_policy" ON clients
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
    OR created_by = (SELECT auth.uid())
  );

CREATE POLICY "clients_delete_role_policy" ON clients
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
    OR (created_by IS NOT NULL AND created_by = (SELECT auth.uid()))
  );

-- ============ quotations ============

DROP POLICY IF EXISTS "quotations_select" ON quotations;
DROP POLICY IF EXISTS "quotations_all" ON quotations;

CREATE POLICY "quotations_select_all_policy" ON quotations
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "quotations_insert_authenticated_policy" ON quotations
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "quotations_update_role_policy" ON quotations
  FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
    OR created_by = (SELECT auth.uid())
  );

CREATE POLICY "quotations_delete_role_policy" ON quotations
  FOR DELETE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
    OR (created_by IS NOT NULL AND created_by = (SELECT auth.uid()))
  );

-- ============ quotation_items ============
-- 子記錄：UPDATE/DELETE 額外檢查父表 quotations.created_by

DROP POLICY IF EXISTS "quotation_items_select" ON quotation_items;
DROP POLICY IF EXISTS "quotation_items_all" ON quotation_items;

CREATE POLICY "quotation_items_select_all_policy" ON quotation_items
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "quotation_items_insert_authenticated_policy" ON quotation_items
  FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "quotation_items_update_role_policy" ON quotation_items
  FOR UPDATE TO authenticated
  USING (
    -- Admin/Editor 可修改任何項目
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
    -- Member: 自己建的項目
    OR created_by = (SELECT auth.uid())
    -- Member: 父報價單是自己建的
    OR EXISTS (
      SELECT 1 FROM quotations
      WHERE quotations.id = quotation_items.quotation_id
      AND quotations.created_by = (SELECT auth.uid())
    )
  );

CREATE POLICY "quotation_items_delete_role_policy" ON quotation_items
  FOR DELETE TO authenticated
  USING (
    -- Admin/Editor 可刪除任何項目
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role IN ('Admin', 'Editor')
    )
    -- Member: 自己建的項目（排除歷史記錄）
    OR (created_by IS NOT NULL AND created_by = (SELECT auth.uid()))
    -- Member: 父報價單是自己建的（排除歷史報價單）
    OR EXISTS (
      SELECT 1 FROM quotations
      WHERE quotations.id = quotation_items.quotation_id
      AND quotations.created_by IS NOT NULL
      AND quotations.created_by = (SELECT auth.uid())
    )
  );

NOTIFY pgrst, 'reload schema';
