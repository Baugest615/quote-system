-- =====================================================
-- Phase 1 安全加固 (C)：統一權限查詢 RPC
-- 目的：提供 SECURITY DEFINER 的角色查詢函數，
--       避免前端/middleware 直接查 profiles 表觸發 RLS 遞迴
-- =====================================================

CREATE OR REPLACE FUNCTION get_my_profile()
RETURNS TABLE (role public.user_role, user_id uuid)
LANGUAGE sql
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.role, p.id
  FROM public.profiles p
  WHERE p.id = (SELECT auth.uid())
$$;

COMMENT ON FUNCTION get_my_profile IS '取得當前使用者的角色和 ID，繞過 profiles RLS 避免遞迴';

NOTIFY pgrst, 'reload schema';
