-- =====================================================
-- 修復多項權限問題
-- 1. page_permissions：accounting 加入 Editor
-- 2. insurance_rate_tables：RLS 改用 is_admin()（原 user_roles 已棄用）
-- 3. audit_log：SELECT 政策統一用 'Admin'（修正小寫 'admin'）
-- 4. 帳務表 DELETE：增加 Admin/Editor 全權刪除（原本只有 created_by）
-- =====================================================

-- ============================================================
-- 1. page_permissions：accounting 加入 Editor 角色
-- 根因：20260226000001 只設了 Admin，漏了 Editor
-- ============================================================

UPDATE page_permissions
SET allowed_roles = ARRAY['Admin','Editor']::user_role[]
WHERE page_key = 'accounting';

-- ============================================================
-- 2. insurance_rate_tables：RLS 改用 is_admin()
-- 根因：原 RLS 直接查已棄用的 user_roles 表，永遠返回 false
-- ============================================================

DROP POLICY IF EXISTS "admin can insert insurance_rate_tables" ON insurance_rate_tables;
DROP POLICY IF EXISTS "admin can update insurance_rate_tables" ON insurance_rate_tables;
DROP POLICY IF EXISTS "admin can delete insurance_rate_tables" ON insurance_rate_tables;
DROP POLICY IF EXISTS "insurance_rate_tables_insert_admin_policy" ON insurance_rate_tables;
DROP POLICY IF EXISTS "insurance_rate_tables_update_admin_policy" ON insurance_rate_tables;
DROP POLICY IF EXISTS "insurance_rate_tables_delete_admin_policy" ON insurance_rate_tables;

CREATE POLICY "insurance_rate_tables_insert_admin_policy"
  ON insurance_rate_tables FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT public.is_admin()));

CREATE POLICY "insurance_rate_tables_update_admin_policy"
  ON insurance_rate_tables FOR UPDATE
  TO authenticated
  USING ((SELECT public.is_admin()));

CREATE POLICY "insurance_rate_tables_delete_admin_policy"
  ON insurance_rate_tables FOR DELETE
  TO authenticated
  USING ((SELECT public.is_admin()));

-- ============================================================
-- 3. audit_log：修正 SELECT 政策中的小寫 'admin'
-- 根因：role 已統一為 'Admin'，小寫 'admin' 可能匹配不到
-- ============================================================

DROP POLICY IF EXISTS "audit_log_select_admin_policy" ON audit_log;
DROP POLICY IF EXISTS "audit_log_select_policy" ON audit_log;

CREATE POLICY "audit_log_select_admin_policy"
  ON audit_log FOR SELECT
  TO authenticated
  USING ((SELECT public.is_admin()));

-- ============================================================
-- 4. 帳務表 DELETE：Admin/Editor 可刪除任何記錄
-- 根因：原本只有 created_by = 自己能刪，Admin/Editor 無法刪除他人記錄
-- ============================================================

-- accounting_sales
DROP POLICY IF EXISTS "owner can delete accounting_sales" ON accounting_sales;
DROP POLICY IF EXISTS "accounting_sales_delete_policy" ON accounting_sales;
CREATE POLICY "accounting_sales_delete_policy"
  ON accounting_sales FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_my_role() IN ('Admin','Editor'))
    OR (SELECT auth.uid()) = created_by
  );

-- accounting_expenses
DROP POLICY IF EXISTS "owner can delete accounting_expenses" ON accounting_expenses;
DROP POLICY IF EXISTS "accounting_expenses_delete_policy" ON accounting_expenses;
CREATE POLICY "accounting_expenses_delete_policy"
  ON accounting_expenses FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_my_role() IN ('Admin','Editor'))
    OR (SELECT auth.uid()) = created_by
  );

-- accounting_payroll
DROP POLICY IF EXISTS "owner can delete accounting_payroll" ON accounting_payroll;
DROP POLICY IF EXISTS "accounting_payroll_delete_policy" ON accounting_payroll;
CREATE POLICY "accounting_payroll_delete_policy"
  ON accounting_payroll FOR DELETE
  TO authenticated
  USING (
    (SELECT public.get_my_role() IN ('Admin','Editor'))
    OR (SELECT auth.uid()) = created_by
  );
