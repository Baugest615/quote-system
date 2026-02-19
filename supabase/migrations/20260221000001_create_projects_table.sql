-- =====================================================
-- 專案進度管理表 (Projects)
-- 追蹤專案從洽談到結案的完整生命週期
-- 四個進度階段：洽談中 → 執行中 → 結案中 → 關案
-- =====================================================

-- ============================================================
-- 1. 建立資料表
-- ============================================================
CREATE TABLE IF NOT EXISTS projects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,

  -- ===== 業務欄位 =====
  client_id uuid REFERENCES clients(id) ON DELETE SET NULL,  -- 客戶 FK（可選，用於搜尋選取現有客戶）
  client_name text NOT NULL,                                  -- 廠商名稱（文字快照）
  project_name text NOT NULL,                                 -- 專案名稱
  project_type text NOT NULL DEFAULT '專案'                   -- 案件類型
    CHECK (project_type IN ('專案', '經紀')),
  budget_with_tax numeric(15,2) DEFAULT 0,                    -- 專案預算（含稅）
  notes text,                                                 -- 備註
  status text NOT NULL DEFAULT '洽談中'                       -- 專案進度
    CHECK (status IN ('洽談中', '執行中', '結案中', '關案')),
  quotation_id uuid REFERENCES quotations(id) ON DELETE SET NULL,  -- 關聯報價單（洽談中為 NULL）

  -- ===== 系統欄位 =====
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- ============================================================
-- 2. 建立索引
-- ============================================================
CREATE INDEX idx_projects_status ON projects(status);
CREATE INDEX idx_projects_quotation_id ON projects(quotation_id);
CREATE INDEX idx_projects_created_at ON projects(created_at DESC);
CREATE INDEX idx_projects_client_id ON projects(client_id);

-- ============================================================
-- 3. Row Level Security (RLS) — 核心業務表模式
-- ============================================================
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;

-- SELECT：所有認證使用者可讀取
CREATE POLICY "projects_select_all_policy"
  ON projects FOR SELECT
  TO authenticated
  USING (true);

-- INSERT：所有認證使用者可新增
CREATE POLICY "projects_insert_all_policy"
  ON projects FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- UPDATE：所有認證使用者可更新
CREATE POLICY "projects_update_all_policy"
  ON projects FOR UPDATE
  TO authenticated
  USING (true);

-- DELETE：僅 Admin 可刪除（使用 profiles 表檢查角色）
CREATE POLICY "projects_delete_admin_policy"
  ON projects FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM profiles
      WHERE id = (SELECT auth.uid())
      AND role = 'Admin'
    )
  );

-- ============================================================
-- 4. updated_at 自動更新 trigger
-- ============================================================
CREATE TRIGGER projects_updated_at
  BEFORE UPDATE ON projects
  FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();

-- ============================================================
-- 5. 資料遷移：為現有 quotations 建立 project 記錄
-- ============================================================
INSERT INTO projects (client_id, client_name, project_name, project_type, budget_with_tax, status, quotation_id, created_at)
SELECT
  q.client_id,
  COALESCE(c.name, '未指定客戶'),
  q.project_name,
  '專案',
  COALESCE(q.grand_total_taxed, 0),
  '執行中',
  q.id,
  q.created_at
FROM quotations q
LEFT JOIN clients c ON q.client_id = c.id
WHERE q.project_name IS NOT NULL
ON CONFLICT DO NOTHING;

-- ============================================================
-- 6. auto_close_projects() RPC 函數
--    批次檢查「結案中」的專案，若 accounting_sales 的
--    actual_receipt_date 都已填入，則自動標記為「關案」
-- ============================================================
CREATE OR REPLACE FUNCTION auto_close_projects()
RETURNS void AS $$
  UPDATE projects p
  SET status = '關案', updated_at = NOW()
  WHERE p.status = '結案中'
  AND EXISTS (
    SELECT 1 FROM accounting_sales s
    WHERE s.project_name = p.project_name
  )
  AND NOT EXISTS (
    SELECT 1 FROM accounting_sales s
    WHERE s.project_name = p.project_name
    AND s.actual_receipt_date IS NULL
  );
$$ LANGUAGE sql SECURITY DEFINER;

-- ============================================================
-- 7. 註解說明
-- ============================================================
COMMENT ON TABLE projects IS '專案進度管理 - 追蹤專案從洽談到結案的完整生命週期';
COMMENT ON COLUMN projects.client_id IS '客戶 FK，搜尋選取現有客戶時連結';
COMMENT ON COLUMN projects.client_name IS '廠商名稱（文字快照，保留建立時名稱）';
COMMENT ON COLUMN projects.project_name IS '專案名稱';
COMMENT ON COLUMN projects.project_type IS '案件類型：專案、經紀';
COMMENT ON COLUMN projects.budget_with_tax IS '專案預算（含稅）';
COMMENT ON COLUMN projects.status IS '專案進度：洽談中、執行中、結案中、關案';
COMMENT ON COLUMN projects.quotation_id IS '關聯報價單 ID（洽談中為 NULL，建立報價單後填入）';

NOTIFY pgrst, 'reload config';
