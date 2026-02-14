-- =====================================================
-- 安全加固：為缺少 RLS 的資料表補上 Policies
-- 涵蓋：kol_types, service_types, quote_categories,
--        kol_services, payment_confirmation_items, page_permissions
-- =====================================================

-- 輔助函數：檢查使用者是否為 Admin 或 Editor
CREATE OR REPLACE FUNCTION is_admin_or_editor()
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles
    WHERE user_id = (SELECT auth.uid())
    AND role IN ('Admin', 'Editor')
  );
$$;

-- =====================================================
-- 1. kol_types — KOL 類型（查閱表）
-- =====================================================
ALTER TABLE kol_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read kol_types"
  ON kol_types FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin or editor can insert kol_types"
  ON kol_types FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_editor());

CREATE POLICY "admin or editor can update kol_types"
  ON kol_types FOR UPDATE
  TO authenticated
  USING (is_admin_or_editor());

CREATE POLICY "admin or editor can delete kol_types"
  ON kol_types FOR DELETE
  TO authenticated
  USING (is_admin_or_editor());

-- =====================================================
-- 2. service_types — 服務類型（查閱表）
-- =====================================================
ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read service_types"
  ON service_types FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin or editor can insert service_types"
  ON service_types FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_editor());

CREATE POLICY "admin or editor can update service_types"
  ON service_types FOR UPDATE
  TO authenticated
  USING (is_admin_or_editor());

CREATE POLICY "admin or editor can delete service_types"
  ON service_types FOR DELETE
  TO authenticated
  USING (is_admin_or_editor());

-- =====================================================
-- 3. quote_categories — 報價單類別（查閱表）
-- =====================================================
ALTER TABLE quote_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read quote_categories"
  ON quote_categories FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin or editor can insert quote_categories"
  ON quote_categories FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_editor());

CREATE POLICY "admin or editor can update quote_categories"
  ON quote_categories FOR UPDATE
  TO authenticated
  USING (is_admin_or_editor());

CREATE POLICY "admin or editor can delete quote_categories"
  ON quote_categories FOR DELETE
  TO authenticated
  USING (is_admin_or_editor());

-- =====================================================
-- 4. kol_services — KOL 服務價格關聯
-- =====================================================
ALTER TABLE kol_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read kol_services"
  ON kol_services FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin or editor can insert kol_services"
  ON kol_services FOR INSERT
  TO authenticated
  WITH CHECK (is_admin_or_editor());

CREATE POLICY "admin or editor can update kol_services"
  ON kol_services FOR UPDATE
  TO authenticated
  USING (is_admin_or_editor());

CREATE POLICY "admin or editor can delete kol_services"
  ON kol_services FOR DELETE
  TO authenticated
  USING (is_admin_or_editor());

-- =====================================================
-- 5. payment_confirmation_items — 請款確認項目
--    SELECT: 所有認證使用者
--    INSERT/UPDATE/DELETE: 僅透過 SECURITY DEFINER RPC 操作
--    （approve_payment_request 已是 SECURITY DEFINER）
-- =====================================================
ALTER TABLE payment_confirmation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read payment_confirmation_items"
  ON payment_confirmation_items FOR SELECT
  TO authenticated
  USING (true);

-- INSERT/UPDATE/DELETE 僅允許 Admin（一般操作透過 SECURITY DEFINER RPC）
CREATE POLICY "admin can insert payment_confirmation_items"
  ON payment_confirmation_items FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "admin can update payment_confirmation_items"
  ON payment_confirmation_items FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "admin can delete payment_confirmation_items"
  ON payment_confirmation_items FOR DELETE
  TO authenticated
  USING (is_admin());

-- =====================================================
-- 6. page_permissions — 頁面權限設定
--    SELECT: 所有認證使用者（需讀取自己的權限）
--    INSERT/UPDATE/DELETE: 僅 Admin
-- =====================================================
ALTER TABLE page_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated users can read page_permissions"
  ON page_permissions FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "admin can insert page_permissions"
  ON page_permissions FOR INSERT
  TO authenticated
  WITH CHECK (is_admin());

CREATE POLICY "admin can update page_permissions"
  ON page_permissions FOR UPDATE
  TO authenticated
  USING (is_admin());

CREATE POLICY "admin can delete page_permissions"
  ON page_permissions FOR DELETE
  TO authenticated
  USING (is_admin());

NOTIFY pgrst, 'reload config';
