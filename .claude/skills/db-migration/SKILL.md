---
name: db-migration
description: 為 Supabase (PostgreSQL) 建立符合專案規範的 migration 檔案，包含 RLS policies、indexes 與 triggers
argument-hint: <migration description>
---

請依照以下步驟建立 Supabase migration 檔案。

## 步驟一：了解需求

使用者的需求描述：**$ARGUMENTS**

若未提供說明，請先詢問要建立的資料表結構或變更內容。

## 步驟二：確認現有結構

- 查看 `supabase/migrations/` 目錄，了解現有 migration 的命名風格與結構
- 查看 `src/types/` 目錄，確認現有的型別定義
- 確認本專案使用的命名規範（snake_case）

## 步驟三：產生 Migration 檔案

**檔名格式**：`supabase/migrations/YYYYMMDDHHMMSS_<description>.sql`
（時間戳使用當前時間，description 用底線連接，如 `add_accounting_tables`）

**SQL 模板結構**：

```sql
-- Migration: <description>
-- Created: <date>

-- ============================================================
-- 1. 建立資料表
-- ============================================================

CREATE TABLE IF NOT EXISTS <table_name> (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  -- 業務欄位...
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. 建立索引
-- ============================================================

CREATE INDEX IF NOT EXISTS idx_<table>_<column> ON <table_name>(<column>);

-- ============================================================
-- 3. Row Level Security (RLS)
-- ============================================================

ALTER TABLE <table_name> ENABLE ROW LEVEL SECURITY;

-- Admin 完整存取
CREATE POLICY "<table>_admin_all" ON <table_name>
  FOR ALL
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM user_roles
      WHERE user_id = auth.uid() AND role = 'Admin'
    )
  );

-- 一般使用者唯讀（視需求添加）
CREATE POLICY "<table>_read_authenticated" ON <table_name>
  FOR SELECT
  TO authenticated
  USING (true);

-- ============================================================
-- 4. updated_at 自動更新 trigger
-- ============================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER <table>_updated_at
  BEFORE UPDATE ON <table_name>
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
```

## 步驟四：更新 TypeScript 型別

在 `src/types/custom.types.ts` 中新增對應的 TypeScript interface：

```typescript
export interface <TableName> {
  id: string
  // 業務欄位...
  created_by?: string
  created_at?: string
  updated_at?: string
}
```

## 步驟五：確認套用方式

提醒使用者可用以下方式套用 migration：

```bash
# 方式一：Supabase CLI
npx supabase db push

# 方式二：手動在 Supabase Dashboard SQL Editor 執行
```

## 注意事項

- 所有資料表欄位使用 snake_case
- 必須包含 `id`、`created_at`、`updated_at` 標準欄位
- Admin 限定的資料表務必啟用 RLS
- 避免 `DROP TABLE` 或破壞性操作，優先使用 `ALTER TABLE ADD COLUMN IF NOT EXISTS`
- Foreign key 到 `auth.users` 使用 `UUID REFERENCES auth.users(id)`
