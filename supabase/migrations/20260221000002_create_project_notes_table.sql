-- Migration: create project_notes table
-- Created: 2026-02-21

-- ============================================================
-- 1. 建立 project_notes 資料表
-- ============================================================

CREATE TABLE IF NOT EXISTS project_notes (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  project_id uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  content text NOT NULL,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT NOW()
);

-- ============================================================
-- 2. 建立索引
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_project_notes_project_id ON project_notes(project_id);
CREATE INDEX IF NOT EXISTS idx_project_notes_created_at ON project_notes(created_at DESC);

-- ============================================================
-- 3. Row Level Security (RLS)
-- ============================================================

ALTER TABLE project_notes ENABLE ROW LEVEL SECURITY;

-- SELECT: 所有認證使用者
CREATE POLICY "project_notes_select_authenticated_policy" ON project_notes
  FOR SELECT
  TO authenticated
  USING (true);

-- INSERT: 所有認證使用者
CREATE POLICY "project_notes_insert_authenticated_policy" ON project_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- DELETE: Admin 可刪除任何備註，其他人只能刪除自己的
CREATE POLICY "project_notes_delete_own_or_admin_policy" ON project_notes
  FOR DELETE
  TO authenticated
  USING (
    created_by = auth.uid()
    OR EXISTS (
      SELECT 1 FROM profiles
      WHERE id = auth.uid() AND role = 'Admin'
    )
  );

-- ============================================================
-- 4. 遷移現有 projects.notes 資料到 project_notes
-- ============================================================

INSERT INTO project_notes (project_id, content, created_by, created_at)
SELECT
  p.id,
  p.notes,
  p.created_by,
  p.updated_at
FROM projects p
WHERE p.notes IS NOT NULL AND p.notes != '';

-- ============================================================
-- 5. 建立取得備註（含作者 email）的 RPC 函數
-- ============================================================

CREATE OR REPLACE FUNCTION get_project_notes(p_project_id uuid)
RETURNS TABLE (
  id uuid,
  project_id uuid,
  content text,
  created_by uuid,
  author_email text,
  created_at timestamptz
) AS $$
  SELECT
    pn.id,
    pn.project_id,
    pn.content,
    pn.created_by,
    COALESCE(pr.email, '未知使用者') AS author_email,
    pn.created_at
  FROM project_notes pn
  LEFT JOIN profiles pr ON pr.id = pn.created_by
  WHERE pn.project_id = p_project_id
  ORDER BY pn.created_at DESC;
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- 6. 建立取得各專案備註數量的 RPC 函數
-- ============================================================

CREATE OR REPLACE FUNCTION get_project_notes_count()
RETURNS TABLE (
  project_id uuid,
  notes_count bigint
) AS $$
  SELECT
    pn.project_id,
    COUNT(*) AS notes_count
  FROM project_notes pn
  GROUP BY pn.project_id;
$$ LANGUAGE sql SECURITY DEFINER;
