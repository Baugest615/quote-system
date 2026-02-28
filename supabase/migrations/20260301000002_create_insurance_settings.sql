-- =============================================================
-- Migration: 建立 insurance_settings 表
-- 目的：管理公司級保險參數（預設眷屬口數等）
-- 設計：仿照 withholding_settings 的 effective_date/expiry_date 模式
-- =============================================================

BEGIN;

CREATE TABLE IF NOT EXISTS insurance_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),

  -- 雇主健保預設參數
  default_dependents numeric(4,2) NOT NULL DEFAULT 0.58,

  -- 備註
  note text,

  -- 生效期間（支援歷史版本）
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  expiry_date date,

  -- 系統欄位
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

-- Seed 預設值（2026 年度）
INSERT INTO insurance_settings (
  default_dependents,
  effective_date,
  note
) VALUES (
  0.58,
  '2026-01-01',
  '2026年度預設設定 — 平均眷屬口數依衛福部公告'
);

-- RLS 政策（仿 withholding_settings）
ALTER TABLE insurance_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY insurance_settings_select_policy
  ON insurance_settings FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY insurance_settings_insert_policy
  ON insurance_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    (SELECT get_my_role()) = 'Admin'
  );

CREATE POLICY insurance_settings_update_policy
  ON insurance_settings FOR UPDATE
  TO authenticated
  USING (
    (SELECT get_my_role()) = 'Admin'
  );

CREATE POLICY insurance_settings_delete_policy
  ON insurance_settings FOR DELETE
  TO authenticated
  USING (
    (SELECT get_my_role()) = 'Admin'
  );

-- 索引
CREATE INDEX IF NOT EXISTS idx_insurance_settings_effective_date
  ON insurance_settings (effective_date DESC);

-- 自動更新 updated_at
CREATE TRIGGER insurance_settings_updated_at
  BEFORE UPDATE ON insurance_settings
  FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();

COMMENT ON TABLE insurance_settings
  IS '保險設定 — 管理公司級保險參數（預設眷屬口數等）';
COMMENT ON COLUMN insurance_settings.default_dependents
  IS '預設平均眷屬口數（政府公告值）— 雇主未設定個人眷屬口數時使用此值';

NOTIFY pgrst, 'reload config';
COMMIT;
