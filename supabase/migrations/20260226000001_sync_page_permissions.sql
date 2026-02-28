-- =====================================================
-- 同步 page_permissions 表：補齊缺失的 4 個頁面
-- =====================================================

-- 1. 確保 page_key 有唯一約束（ON CONFLICT 需要）
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'page_permissions_page_key_key'
  ) THEN
    ALTER TABLE page_permissions
      ADD CONSTRAINT page_permissions_page_key_key UNIQUE (page_key);
  END IF;
END $$;

-- 2. 插入缺失頁面（不覆蓋已存在的）
INSERT INTO page_permissions (page_key, page_name, allowed_roles, allowed_functions)
VALUES
  ('accounting', '帳務管理',
   ARRAY['Admin']::user_role[],
   ARRAY['view','create','update','delete','export']),
  ('projects', '專案進度',
   ARRAY['Admin','Editor','Member']::user_role[],
   ARRAY['create','read','update','delete']),
  ('expense_claims', '個人請款申請',
   ARRAY['Admin','Editor','Member']::user_role[],
   ARRAY['create','read','update','delete','submit']),
  ('my_salary', '我的薪資',
   ARRAY['Admin','Editor','Member']::user_role[],
   ARRAY['view'])
ON CONFLICT (page_key) DO NOTHING;
