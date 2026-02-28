-- 為 expense_claims.submitted_by 添加到 profiles 的 FK
-- 讓 Supabase PostgREST 可以 join profiles 取得提交人姓名
-- (submitted_by 已有 FK 到 auth.users，此處再加一條到 profiles)
ALTER TABLE expense_claims
  ADD CONSTRAINT expense_claims_submitted_by_profiles_fkey
  FOREIGN KEY (submitted_by) REFERENCES profiles(id);
