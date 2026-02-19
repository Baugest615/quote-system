# CLAUDE.md — AI 助手開發規則

> 本文件專供 Claude Code 使用。專案介紹、技術架構、環境設定請參閱 [README.md](README.md)。

## AI 行為規則

- **語言**：一律使用繁體中文回覆
- **Git commit**：執行前必須先詢問使用者確認
- **Git push**：執行前必須先詢問使用者確認
- **Commit 格式**：`<type>: <description>`（feat / fix / refactor / chore / docs）

## Skills 使用指引

收到開發任務時，AI 助手應 **主動評估並優先使用** 對應的 Skill，不需使用者提示：

| 場景 | Skill |
|------|-------|
| 建立 commit | `/commit` |
| 建立 PR | `/pr` |
| Code review | `/review` |
| 建立 migration | `/db-migration` |
| 設計 UI 元件 | `/frontend-design` 或 `/ui-ux-pro-max` |
| 優化 Postgres 查詢 | `/supabase-postgres-best-practices` |

## 開發工作流程

### 開發進度同步

進度記錄在 `DEV_PROGRESS.md`，隨 git 同步：
- 使用者說「**載入開發進度**」→ 讀取 `DEV_PROGRESS.md` 後繼續工作
- 使用者說「**更新開發進度**」→ 將工作狀態寫入 `DEV_PROGRESS.md`

### 任務完成後

主動詢問使用者：「是否需要更新開發進度並推送到 Git？」

若使用者確認，依序執行：
1. 更新 `DEV_PROGRESS.md`
2. 使用 `/commit` 建立 commit（需確認）
3. 執行 `git push`（需確認）

## 關鍵路徑速查

```
src/
├── app/dashboard/          # 頁面（clients, kols, quotes, accounting 等）
├── components/ui/          # Shadcn/ui 基礎元件
├── components/quotes/v2/   # 報價單 DataGrid（QuotesDataGrid, QuotationItemsList）
├── components/accounting/  # 會計模組元件（SpreadsheetEditor, AccountingModal）
├── hooks/                  # React Query hooks
├── lib/supabase/           # Supabase 客戶端
├── lib/permissions.ts      # 權限邏輯（usePermission hook）
├── types/custom.types.ts   # 頁面定義、角色、權限設定
└── types/database.types.ts # Supabase 自動生成型別
```

## 編碼規範

- TypeScript 嚴格模式，避免 `any`
- 元件 PascalCase、hooks camelCase、變數函式英文命名
- 遵循 ESLint + Prettier
- 權限三級：Admin（完整存取）/ Editor（可編輯）/ Member（唯讀）

## 資料庫規範

- Migration：`supabase/migrations/YYYYMMDD[HHMMSS]_description.sql`
- 資料表 snake_case，標準欄位：`id`（UUID）、`created_at`、`updated_at`
- 權限函式：`get_my_role()`

### RLS 政策模板（建立新表時必須遵循）

命名：`{table}_{operation}_{scope}_policy`

| 表類型 | SELECT | INSERT/UPDATE | DELETE |
|--------|--------|---------------|--------|
| 核心業務表（kols, quotations, clients） | 全部 | Admin+Editor+Member | Admin |
| 字典表（kol_services, service_types 等） | 全部 | Admin+Editor | Admin |
| 財務表（payment_requests 等） | 全部 | Admin+Editor | Admin+Editor |
| 人事表（employees）| 分級* | Admin | Admin |
| 會計表（accounting_*） | 全部 | 全部 | 全部 |
| 敏感資料（insurance_rate_tables） | 全部 | Admin | Admin |

*employees 特殊：Admin 看全部、其他僅看在職（2 個 SELECT 政策）

## UI/UX 規範

- 深色模式唯一（`class="dark"`），不支援淺色切換
- 使用 CSS 變數主題色（`bg-card`、`text-foreground`、`text-muted-foreground`）
- 語義色彩：`primary`、`destructive`、`warning`、`success`、`info`
- KPI 卡片色彩：`chart-1`（綠）、`chart-3`（紅）、`chart-4`（藍）、`chart-5`（紫）
- PDF/列印元件（`src/components/pdf/`、`src/app/print/`）故意使用淺色，**不修改**
- 載入狀態使用 `Skeleton` 元件，空狀態使用 `EmptyState` 元件

## 業務名詞對照

| 介面顯示 | 資料庫欄位/表名 | 說明 |
|----------|----------------|------|
| KOL/服務 | `kols` 表 | 報價對象（含 KOL 以外的服務） |
| 執行內容 | `service_types` 表 | 具體服務項目 |
| KOL/服務管理 | `/dashboard/kols` | 側邊欄選單名稱 |
