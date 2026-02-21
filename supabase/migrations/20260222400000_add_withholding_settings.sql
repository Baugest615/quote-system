-- =====================================================
-- Migration: 代扣代繳系統設定 + KOL 免扣標記
-- Created: 2026-02-22
--
-- 1. 建立 withholding_settings 費率設定表
-- 2. Seed 預設費率
-- 3. kols 表新增免扣欄位
-- 4. RLS 政策
-- =====================================================

BEGIN;

-- ============================================================
-- 1. 建立 withholding_settings 表
-- ============================================================

CREATE TABLE IF NOT EXISTS withholding_settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  income_tax_rate numeric(6,4) NOT NULL DEFAULT 0.10,
  nhi_supplement_rate numeric(6,4) NOT NULL DEFAULT 0.0211,
  income_tax_threshold integer NOT NULL DEFAULT 20010,
  nhi_threshold integer NOT NULL DEFAULT 20000,
  remittance_fee_default integer NOT NULL DEFAULT 30,
  effective_date date NOT NULL DEFAULT CURRENT_DATE,
  expiry_date date,
  updated_at timestamptz DEFAULT now(),
  updated_by uuid REFERENCES auth.users(id)
);

COMMENT ON TABLE withholding_settings IS '代扣代繳費率設定（所得稅、二代健保補充保費）';
COMMENT ON COLUMN withholding_settings.income_tax_rate IS '所得稅扣繳率（如 0.10 = 10%）';
COMMENT ON COLUMN withholding_settings.nhi_supplement_rate IS '二代健保補充保費率（如 0.0211 = 2.11%）';
COMMENT ON COLUMN withholding_settings.income_tax_threshold IS '所得稅起扣門檻（單次給付金額）';
COMMENT ON COLUMN withholding_settings.nhi_threshold IS '二代健保起扣門檻（單次給付金額）';
COMMENT ON COLUMN withholding_settings.remittance_fee_default IS '匯費預設金額';

-- ============================================================
-- 2. Seed 預設費率
-- ============================================================

INSERT INTO withholding_settings (
  income_tax_rate, nhi_supplement_rate,
  income_tax_threshold, nhi_threshold,
  remittance_fee_default, effective_date
) VALUES (
  0.10, 0.0211,
  20010, 20000,
  30, '2025-01-01'
);

-- ============================================================
-- 3. kols 表新增免扣欄位
-- ============================================================

ALTER TABLE kols
  ADD COLUMN IF NOT EXISTS withholding_exempt boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS withholding_exempt_reason text;

COMMENT ON COLUMN kols.withholding_exempt IS '是否免扣代繳（如已加入職業公會）';
COMMENT ON COLUMN kols.withholding_exempt_reason IS '免扣原因說明';

-- ============================================================
-- 4. RLS 政策
-- ============================================================

ALTER TABLE withholding_settings ENABLE ROW LEVEL SECURITY;

-- SELECT：所有認證使用者可讀（費率計算用）
CREATE POLICY withholding_settings_select_authenticated_policy
  ON withholding_settings FOR SELECT
  TO authenticated
  USING (true);

-- INSERT：僅 Admin
CREATE POLICY withholding_settings_insert_admin_policy
  ON withholding_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'Admin'
    )
  );

-- UPDATE：僅 Admin
CREATE POLICY withholding_settings_update_admin_policy
  ON withholding_settings FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'Admin'
    )
  );

-- DELETE：僅 Admin
CREATE POLICY withholding_settings_delete_admin_policy
  ON withholding_settings FOR DELETE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE id = auth.uid() AND role = 'Admin'
    )
  );

-- ============================================================
-- 5. 索引
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_withholding_settings_effective_date
  ON withholding_settings (effective_date DESC);

COMMIT;
