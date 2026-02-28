-- =====================================================
-- 全域 RLS 政策統一 + user_role enum 大小寫修正
-- =====================================================
-- 問題根源：
--   1. user_role enum 有重複值：'admin'/'member'（小寫）與 'Admin'/'Editor'/'Member'（大寫）
--   2. 部分 RLS 使用 get_user_role() 比較小寫值，部分使用 get_my_role() 比較大寫值
--   3. 部分表的 RLS 被 rollback migration 停用
--   4. employees 表引用了不存在的 user_roles 表
--
-- 修復策略：
--   1. 將 profiles 中所有小寫 role 值轉為大寫
--   2. 修復 get_my_role() / get_user_role() 加入大小寫正規化
--   3. 統一所有表的 RLS 政策，使用一致的 profiles 直接查詢模式
--   4. 重新啟用被停用的 RLS
-- =====================================================

-- =====================================================
-- STEP 1: 修正 profiles 中的小寫 role 值
-- =====================================================
UPDATE profiles SET role = 'Admin' WHERE role = 'admin';
UPDATE profiles SET role = 'Member' WHERE role = 'member';

-- =====================================================
-- STEP 2: 修復輔助函數（加入大小寫正規化）
-- =====================================================
CREATE OR REPLACE FUNCTION get_my_role() RETURNS user_role
LANGUAGE sql SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT
    CASE public.profiles.role
      WHEN 'admin' THEN 'Admin'::public.user_role
      WHEN 'member' THEN 'Member'::public.user_role
      ELSE public.profiles.role
    END
  FROM public.profiles
  WHERE id = (SELECT auth.uid())
$$;

CREATE OR REPLACE FUNCTION get_user_role(user_id uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
DECLARE
    role_val public.user_role;
BEGIN
    SELECT role INTO role_val
    FROM public.profiles
    WHERE id = user_id;

    -- 正規化大小寫
    IF role_val = 'admin' THEN RETURN 'Admin';
    ELSIF role_val = 'member' THEN RETURN 'Member';
    ELSE RETURN role_val::text;
    END IF;
END;
$$;

-- =====================================================
-- STEP 3: 修復 kols 表 RLS
-- 原始問題：get_user_role 比較小寫 'admin'，多個重複政策
-- 目標：所有認證使用者可完整操作（業務需求：全員需操作 KOL 資料）
-- =====================================================
DROP POLICY IF EXISTS "Admins can delete kols" ON kols;
DROP POLICY IF EXISTS "Admins can manage kols" ON kols;
DROP POLICY IF EXISTS "Admins can update kols" ON kols;
DROP POLICY IF EXISTS "All authenticated users can view kols" ON kols;
DROP POLICY IF EXISTS "Allow read access on kols" ON kols;
DROP POLICY IF EXISTS "Allow write access for active users on kols" ON kols;
DROP POLICY IF EXISTS "kols_basic_policy" ON kols;

ALTER TABLE kols ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kols_select" ON kols FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "kols_all" ON kols FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- STEP 4: 修復 kol_services 表 RLS
-- 原始問題：rollback 停用了 RLS，舊政策混用 get_user_role/get_my_role
-- 目標：所有認證使用者可完整操作（報價需要操作 KOL 服務價格）
-- =====================================================
DROP POLICY IF EXISTS "Admins can manage kol_services" ON kol_services;
DROP POLICY IF EXISTS "All authenticated users can view kol_services" ON kol_services;
DROP POLICY IF EXISTS "Allow read access on kol_services" ON kol_services;
DROP POLICY IF EXISTS "Allow write access for active users on kol_services" ON kol_services;
DROP POLICY IF EXISTS "authenticated users can read kol_services" ON kol_services;
DROP POLICY IF EXISTS "admin or editor can insert kol_services" ON kol_services;
DROP POLICY IF EXISTS "admin or editor can update kol_services" ON kol_services;
DROP POLICY IF EXISTS "admin or editor can delete kol_services" ON kol_services;

ALTER TABLE kol_services ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kol_services_select" ON kol_services FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "kol_services_all" ON kol_services FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- STEP 5: 修復 clients 表 RLS
-- 原始問題：get_user_role 比較小寫 'admin'/'member'，多個重複政策
-- 目標：所有認證使用者可完整操作（報價單需要選擇/新增客戶）
-- =====================================================
DROP POLICY IF EXISTS "Admins can manage all clients" ON clients;
DROP POLICY IF EXISTS "Members can view clients for quotations" ON clients;
DROP POLICY IF EXISTS "RLS: Allow authenticated users to read clients" ON clients;
DROP POLICY IF EXISTS "RLS: Allow specific roles to write to clients" ON clients;
DROP POLICY IF EXISTS "Allow read access on clients" ON clients;
DROP POLICY IF EXISTS "clients_basic_policy" ON clients;

ALTER TABLE clients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "clients_select" ON clients FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "clients_all" ON clients FOR ALL
  TO authenticated USING (true) WITH CHECK (true);

-- =====================================================
-- STEP 6: 修復 kol_types 表 RLS
-- 原始問題：rollback 停用了 RLS，舊政策用 get_user_role 比較小寫
-- 目標：全員可讀，Admin/Editor 可寫（查閱表）
-- =====================================================
DROP POLICY IF EXISTS "All authenticated users can view kol_types" ON kol_types;
DROP POLICY IF EXISTS "Allow all users to read kol_types" ON kol_types;
DROP POLICY IF EXISTS "Admins can manage kol_types" ON kol_types;
DROP POLICY IF EXISTS "Allow admins to modify kol_types" ON kol_types;
DROP POLICY IF EXISTS "authenticated users can read kol_types" ON kol_types;
DROP POLICY IF EXISTS "admin or editor can insert kol_types" ON kol_types;
DROP POLICY IF EXISTS "admin or editor can update kol_types" ON kol_types;
DROP POLICY IF EXISTS "admin or editor can delete kol_types" ON kol_types;

ALTER TABLE kol_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "kol_types_select" ON kol_types FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "kol_types_insert" ON kol_types FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "kol_types_update" ON kol_types FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "kol_types_delete" ON kol_types FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

-- =====================================================
-- STEP 7: 修復 service_types 表 RLS
-- 原始問題：同 kol_types
-- =====================================================
DROP POLICY IF EXISTS "All authenticated users can view service_types" ON service_types;
DROP POLICY IF EXISTS "Allow all users to read service_types" ON service_types;
DROP POLICY IF EXISTS "Admins can manage service_types" ON service_types;
DROP POLICY IF EXISTS "Allow admins to modify service_types" ON service_types;
DROP POLICY IF EXISTS "authenticated users can read service_types" ON service_types;
DROP POLICY IF EXISTS "admin or editor can insert service_types" ON service_types;
DROP POLICY IF EXISTS "admin or editor can update service_types" ON service_types;
DROP POLICY IF EXISTS "admin or editor can delete service_types" ON service_types;

ALTER TABLE service_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_types_select" ON service_types FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "service_types_insert" ON service_types FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "service_types_update" ON service_types FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "service_types_delete" ON service_types FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

-- =====================================================
-- STEP 8: 修復 quote_categories 表 RLS
-- 原始問題：同 kol_types
-- =====================================================
DROP POLICY IF EXISTS "All authenticated users can view quote_categories" ON quote_categories;
DROP POLICY IF EXISTS "Allow all users to read quote_categories" ON quote_categories;
DROP POLICY IF EXISTS "Admins can manage quote_categories" ON quote_categories;
DROP POLICY IF EXISTS "Allow admins to modify quote_categories" ON quote_categories;
DROP POLICY IF EXISTS "authenticated users can read quote_categories" ON quote_categories;
DROP POLICY IF EXISTS "admin or editor can insert quote_categories" ON quote_categories;
DROP POLICY IF EXISTS "admin or editor can update quote_categories" ON quote_categories;
DROP POLICY IF EXISTS "admin or editor can delete quote_categories" ON quote_categories;

ALTER TABLE quote_categories ENABLE ROW LEVEL SECURITY;

CREATE POLICY "quote_categories_select" ON quote_categories FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "quote_categories_insert" ON quote_categories FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "quote_categories_update" ON quote_categories FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "quote_categories_delete" ON quote_categories FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

-- =====================================================
-- STEP 9: 修復 payment_requests 表 RLS
-- 原始問題：使用 get_my_role() 大寫比較 + 重複政策
-- 目標：全員可讀，Admin/Editor 可寫（請款管理）
-- =====================================================
DROP POLICY IF EXISTS "Allow access for finance team only on payment_requests" ON payment_requests;
DROP POLICY IF EXISTS "payment_requests_auth_policy" ON payment_requests;
DROP POLICY IF EXISTS "payment_requests_restricted_policy" ON payment_requests;

ALTER TABLE payment_requests ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_requests_select" ON payment_requests FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "payment_requests_insert" ON payment_requests FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "payment_requests_update" ON payment_requests FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "payment_requests_delete" ON payment_requests FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

-- =====================================================
-- STEP 10: 修復 payment_confirmations 表 RLS
-- 原始問題：get_my_role() + 多個重複 permissive 政策
-- 目標：全員可讀，Admin/Editor 可寫
-- =====================================================
DROP POLICY IF EXISTS "Allow access for finance team only on payment_confirmations" ON payment_confirmations;
DROP POLICY IF EXISTS "payment_confirmations_auth_policy" ON payment_confirmations;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON payment_confirmations;
DROP POLICY IF EXISTS "Enable select for authenticated users" ON payment_confirmations;
DROP POLICY IF EXISTS "Enable update for authenticated users" ON payment_confirmations;

ALTER TABLE payment_confirmations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_confirmations_select" ON payment_confirmations FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "payment_confirmations_insert" ON payment_confirmations FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "payment_confirmations_update" ON payment_confirmations FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "payment_confirmations_delete" ON payment_confirmations FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

-- =====================================================
-- STEP 11: 修復 payment_confirmation_items 表 RLS
-- 原始問題：rollback 停用了 RLS，舊政策用 get_my_role()
-- 目標：全員可讀，Admin/Editor 可寫
-- =====================================================
DROP POLICY IF EXISTS "Allow access for finance team only on payment_confirmation_item" ON payment_confirmation_items;
DROP POLICY IF EXISTS "Enable all for authenticated users" ON payment_confirmation_items;
DROP POLICY IF EXISTS "payment_confirmation_items_auth_policy" ON payment_confirmation_items;
DROP POLICY IF EXISTS "authenticated users can read payment_confirmation_items" ON payment_confirmation_items;
DROP POLICY IF EXISTS "admin can insert payment_confirmation_items" ON payment_confirmation_items;
DROP POLICY IF EXISTS "admin can update payment_confirmation_items" ON payment_confirmation_items;
DROP POLICY IF EXISTS "admin can delete payment_confirmation_items" ON payment_confirmation_items;

ALTER TABLE payment_confirmation_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payment_confirmation_items_select" ON payment_confirmation_items FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "payment_confirmation_items_insert" ON payment_confirmation_items FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "payment_confirmation_items_update" ON payment_confirmation_items FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "payment_confirmation_items_delete" ON payment_confirmation_items FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

-- =====================================================
-- STEP 12: 修復 profiles 表 RLS
-- 原始問題：使用 get_my_role() 可能因小寫值失敗
-- 目標：個人可讀自己，Admin 可完整操作
-- =====================================================
DROP POLICY IF EXISTS "Allow admin full access" ON profiles;
DROP POLICY IF EXISTS "Allow individual read access" ON profiles;

ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

CREATE POLICY "profiles_admin_full" ON profiles FOR ALL
  TO authenticated
  USING (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'Admin')
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.role = 'Admin')
  );

-- =====================================================
-- STEP 13: 修復 page_permissions 表 RLS
-- 原始問題：rollback 停用了 RLS
-- 目標：全員可讀（需查詢自己的權限），Admin 可寫
-- =====================================================
DROP POLICY IF EXISTS "page_permissions_admin_only_policy" ON page_permissions;
DROP POLICY IF EXISTS "authenticated users can read page_permissions" ON page_permissions;
DROP POLICY IF EXISTS "admin can insert page_permissions" ON page_permissions;
DROP POLICY IF EXISTS "admin can update page_permissions" ON page_permissions;
DROP POLICY IF EXISTS "admin can delete page_permissions" ON page_permissions;

ALTER TABLE page_permissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "page_permissions_select" ON page_permissions FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "page_permissions_insert" ON page_permissions FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

CREATE POLICY "page_permissions_update" ON page_permissions FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

CREATE POLICY "page_permissions_delete" ON page_permissions FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

-- =====================================================
-- STEP 14: 修復 employees 表 RLS
-- 原始問題：引用不存在的 user_roles 表（完全壞掉！）
-- 目標：全員可讀在職員工，Admin/Editor 可完整操作
-- =====================================================
DROP POLICY IF EXISTS "authenticated users can read active employees" ON employees;
DROP POLICY IF EXISTS "admin can read all employees" ON employees;
DROP POLICY IF EXISTS "admin can insert employees" ON employees;
DROP POLICY IF EXISTS "admin can update employees" ON employees;
DROP POLICY IF EXISTS "admin can delete employees" ON employees;
DROP POLICY IF EXISTS "employees_select_own_by_user_id_policy" ON employees;

ALTER TABLE employees ENABLE ROW LEVEL SECURITY;

CREATE POLICY "employees_select_active" ON employees FOR SELECT
  TO authenticated USING (status = '在職');

CREATE POLICY "employees_select_own" ON employees FOR SELECT
  TO authenticated USING (user_id = auth.uid());

CREATE POLICY "employees_admin_select_all" ON employees FOR SELECT
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "employees_insert" ON employees FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "employees_update" ON employees FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "employees_delete" ON employees FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'Admin')
  );

-- =====================================================
-- STEP 15: 修復 accounting_subjects 表 RLS
-- 原始問題：使用 get_my_role() 遇小寫值失敗
-- =====================================================
DROP POLICY IF EXISTS "authenticated users can read accounting_subjects" ON accounting_subjects;
DROP POLICY IF EXISTS "admin or editor can insert accounting_subjects" ON accounting_subjects;
DROP POLICY IF EXISTS "admin or editor can update accounting_subjects" ON accounting_subjects;
DROP POLICY IF EXISTS "admin or editor can delete accounting_subjects" ON accounting_subjects;

CREATE POLICY "accounting_subjects_select" ON accounting_subjects FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "accounting_subjects_insert" ON accounting_subjects FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "accounting_subjects_update" ON accounting_subjects FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "accounting_subjects_delete" ON accounting_subjects FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

-- =====================================================
-- STEP 16: 修復 expense_types 表 RLS
-- 原始問題：使用 get_my_role() 遇小寫值失敗
-- =====================================================
DROP POLICY IF EXISTS "authenticated users can read expense_types" ON expense_types;
DROP POLICY IF EXISTS "admin or editor can insert expense_types" ON expense_types;
DROP POLICY IF EXISTS "admin or editor can update expense_types" ON expense_types;
DROP POLICY IF EXISTS "admin or editor can delete expense_types" ON expense_types;

CREATE POLICY "expense_types_select" ON expense_types FOR SELECT
  TO authenticated USING (true);

CREATE POLICY "expense_types_insert" ON expense_types FOR INSERT
  TO authenticated WITH CHECK (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "expense_types_update" ON expense_types FOR UPDATE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

CREATE POLICY "expense_types_delete" ON expense_types FOR DELETE
  TO authenticated USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role IN ('Admin', 'Editor'))
  );

-- =====================================================
-- STEP 17: 修復 handle_new_user trigger
-- 確保新使用者一律使用大寫 'Member'
-- =====================================================
CREATE OR REPLACE FUNCTION handle_new_user() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles (id, email, role)
  VALUES (NEW.id, NEW.email, 'Member')
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

-- =====================================================
-- 通知 PostgREST 重載 schema
-- =====================================================
NOTIFY pgrst, 'reload schema';
