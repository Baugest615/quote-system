-- =====================================================
-- 緊急修復：profiles 表 RLS 無限遞迴
-- 問題：profiles_admin_full 政策中 EXISTS (SELECT FROM profiles)
--       會再次觸發 RLS 檢查 → 無限遞迴 → 500 錯誤
-- 修復：改用 get_my_role()（SECURITY DEFINER 函數繞過 RLS）
-- =====================================================

DROP POLICY IF EXISTS "profiles_select_own" ON profiles;
DROP POLICY IF EXISTS "profiles_admin_full" ON profiles;

-- 個人可讀自己的 profile
CREATE POLICY "profiles_select_own" ON profiles FOR SELECT
  TO authenticated USING (auth.uid() = id);

-- Admin 可完整操作所有 profiles（使用 SECURITY DEFINER 函數避免遞迴）
CREATE POLICY "profiles_admin_full" ON profiles FOR ALL
  TO authenticated
  USING (get_my_role() = 'Admin')
  WITH CHECK (get_my_role() = 'Admin');

NOTIFY pgrst, 'reload schema';
