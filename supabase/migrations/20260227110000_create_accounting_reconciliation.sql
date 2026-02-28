-- Migration: create_accounting_reconciliation
-- Created: 2026-02-27
-- Description: 銀行存款核對表 — 用於月結總覽的銀行餘額與系統進銷差異核對

-- ============================================================
-- 1. 建立資料表
-- ============================================================

CREATE TABLE IF NOT EXISTS accounting_reconciliation (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  year integer NOT NULL,
  month text NOT NULL,                     -- '2026年2月' (與 expense_month / invoice_month 同格式)
  bank_balance numeric(15,2) DEFAULT 0,    -- 使用者輸入的銀行存款餘額
  income_total numeric(15,2) DEFAULT 0,    -- 系統計算的當月收入
  expense_total numeric(15,2) DEFAULT 0,   -- 系統計算的當月支出
  difference numeric(15,2) DEFAULT 0,      -- bank_balance - (income_total - expense_total)
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'reconciled')),
  note text,
  reconciled_by uuid REFERENCES auth.users(id),
  reconciled_at timestamptz,
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz DEFAULT NOW(),
  updated_at timestamptz DEFAULT NOW()
);

-- ============================================================
-- 2. Unique constraint (for upsert)
-- ============================================================

ALTER TABLE accounting_reconciliation
  ADD CONSTRAINT reconciliation_year_month_unique UNIQUE (year, month);

-- ============================================================
-- 3. 索引
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_reconciliation_year_month
  ON accounting_reconciliation (year, month);

-- ============================================================
-- 4. Row Level Security (RLS)
-- ============================================================

ALTER TABLE accounting_reconciliation ENABLE ROW LEVEL SECURITY;

-- authenticated 使用者可讀取
CREATE POLICY "authenticated users can read accounting_reconciliation" ON accounting_reconciliation
  FOR SELECT
  TO authenticated
  USING (true);

-- authenticated 使用者可新增（限 created_by = 自己）
CREATE POLICY "authenticated users can insert accounting_reconciliation" ON accounting_reconciliation
  FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = created_by);

-- authenticated 使用者可更新
CREATE POLICY "authenticated users can update accounting_reconciliation" ON accounting_reconciliation
  FOR UPDATE
  TO authenticated
  USING (true);

-- authenticated 使用者可刪除
CREATE POLICY "authenticated users can delete accounting_reconciliation" ON accounting_reconciliation
  FOR DELETE
  TO authenticated
  USING (true);

-- ============================================================
-- 5. updated_at 自動更新 trigger (複用既有函式)
-- ============================================================

CREATE TRIGGER reconciliation_updated_at
  BEFORE UPDATE ON accounting_reconciliation
  FOR EACH ROW EXECUTE FUNCTION update_accounting_updated_at();
