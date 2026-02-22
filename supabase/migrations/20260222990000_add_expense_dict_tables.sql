-- 支出種類 & 會計科目 — 資料字典化
-- 將硬編碼的 EXPENSE_TYPES / ACCOUNTING_SUBJECTS 遷移到 DB 字典表

-- =========================================
-- 1. 會計科目表
-- =========================================
CREATE TABLE IF NOT EXISTS accounting_subjects (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE accounting_subjects ENABLE ROW LEVEL SECURITY;

-- SELECT: 全員可讀
CREATE POLICY "authenticated users can read accounting_subjects"
  ON accounting_subjects FOR SELECT
  TO authenticated USING (true);

-- INSERT: Admin + Editor
CREATE POLICY "admin or editor can insert accounting_subjects"
  ON accounting_subjects FOR INSERT
  TO authenticated WITH CHECK (get_my_role() IN ('Admin', 'Editor'));

-- UPDATE: Admin + Editor
CREATE POLICY "admin or editor can update accounting_subjects"
  ON accounting_subjects FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Editor'))
  WITH CHECK (get_my_role() IN ('Admin', 'Editor'));

-- DELETE: Admin + Editor
CREATE POLICY "admin or editor can delete accounting_subjects"
  ON accounting_subjects FOR DELETE
  TO authenticated USING (get_my_role() IN ('Admin', 'Editor'));

-- 種子資料
INSERT INTO accounting_subjects (name, sort_order) VALUES
  ('勞務成本', 1),
  ('外包費用', 2),
  ('廣告費用', 3),
  ('進貨', 4),
  ('薪資支出', 5),
  ('租金支出', 6),
  ('旅費支出', 7),
  ('運費支出', 8),
  ('文具用品', 9),
  ('餐費', 10),
  ('交通費用', 11),
  ('郵電費用', 12),
  ('修繕費用', 13),
  ('職工福利', 14),
  ('勞健保', 15),
  ('交際費用', 16),
  ('伙食費', 17),
  ('其他費用', 18),
  ('匯費', 19),
  ('軟體訂閱', 20),
  ('水電瓦斯', 21),
  ('保險費用', 22),
  ('稅捐規費', 23),
  ('折舊攤銷', 24),
  ('所得稅', 25),
  ('銀行手續費', 26)
ON CONFLICT (name) DO NOTHING;

-- =========================================
-- 2. 支出種類表（含預設會計科目映射）
-- =========================================
CREATE TABLE IF NOT EXISTS expense_types (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name text NOT NULL UNIQUE,
  default_subject text,        -- 預設會計科目名稱（對應 accounting_subjects.name）
  sort_order int DEFAULT 0,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE expense_types ENABLE ROW LEVEL SECURITY;

-- SELECT: 全員可讀
CREATE POLICY "authenticated users can read expense_types"
  ON expense_types FOR SELECT
  TO authenticated USING (true);

-- INSERT: Admin + Editor
CREATE POLICY "admin or editor can insert expense_types"
  ON expense_types FOR INSERT
  TO authenticated WITH CHECK (get_my_role() IN ('Admin', 'Editor'));

-- UPDATE: Admin + Editor
CREATE POLICY "admin or editor can update expense_types"
  ON expense_types FOR UPDATE
  TO authenticated
  USING (get_my_role() IN ('Admin', 'Editor'))
  WITH CHECK (get_my_role() IN ('Admin', 'Editor'));

-- DELETE: Admin + Editor
CREATE POLICY "admin or editor can delete expense_types"
  ON expense_types FOR DELETE
  TO authenticated USING (get_my_role() IN ('Admin', 'Editor'));

-- 種子資料（含 default_subject 映射）
INSERT INTO expense_types (name, default_subject, sort_order) VALUES
  ('勞務報酬', '勞務成本', 1),
  ('外包服務', '外包費用', 2),
  ('專案費用', '廣告費用', 3),
  ('員工代墊', '其他費用', 4),
  ('營運費用', '租金支出', 5),
  ('其他支出', '其他費用', 6),
  ('沖帳免付', NULL, 7),
  ('代扣代繳', '所得稅', 8)
ON CONFLICT (name) DO NOTHING;
