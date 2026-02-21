-- ============================================================
-- Migration: 員工表新增 user_id 欄位（使用者 ↔ 員工綁定）
-- 目的：建立可靠的帳號與員工 1:1 綁定，取代脆弱的 email 比對
-- ============================================================

-- 1. 新增 user_id 欄位
ALTER TABLE public.employees
  ADD COLUMN user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.employees.user_id IS '綁定的系統帳號 ID（1:1 對應）';

-- 2. 自動填入現有綁定（透過 email 比對）
UPDATE public.employees e
SET user_id = p.id
FROM public.profiles p
WHERE e.email IS NOT NULL
  AND lower(e.email) = lower(p.email)
  AND e.user_id IS NULL;

-- 3. 部分索引（只索引非 NULL 的 user_id）
CREATE INDEX idx_employees_user_id ON public.employees(user_id) WHERE user_id IS NOT NULL;

-- 4. RLS：使用者可讀取自己綁定的員工記錄（含留停/離職，讓留停員工仍可查薪資）
CREATE POLICY "employees_select_own_by_user_id_policy"
  ON public.employees FOR SELECT TO authenticated
  USING (user_id = (SELECT auth.uid()));
