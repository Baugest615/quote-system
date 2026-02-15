# Quote System - 報價管理系統

## 專案概述

企業級報價管理系統，支援客戶管理、KOL 管理、報價單生成、請款流程、會計模組等完整業務功能。

## 技術架構

- **前端**: Next.js 14 (App Router) + TypeScript + Tailwind CSS
- **UI**: Shadcn/ui + Radix UI + Lucide React + Framer Motion
- **後端**: Supabase (PostgreSQL + Auth + Storage + RLS)
- **PDF**: jsPDF + pdf-lib + Puppeteer (Docker 環境)
- **表單**: React Hook Form + Zod
- **部署**: Docker (standalone output) / Vercel

## 常用指令

```bash
npm run dev           # 開發模式
npm run build         # 建置生產版本
npm run lint          # ESLint 檢查
npm run type-check    # TypeScript 型別檢查
npm run test          # 執行測試
npx supabase db push  # 推送 migration 到 Supabase
```

## 目錄結構

```
src/
├── app/                    # Next.js App Router 頁面
│   ├── api/                # API Routes
│   ├── auth/login/         # 登入頁
│   ├── dashboard/          # 主要功能區
│   │   ├── clients/        # 客戶管理
│   │   ├── kols/           # KOL 管理
│   │   ├── quotes/         # 報價單（列表/新增/編輯/檢視）
│   │   ├── pending-payments/     # 待請款管理
│   │   ├── payment-requests/     # 請款申請審核
│   │   ├── confirmed-payments/   # 已確認請款清單
│   │   ├── accounting/           # 會計模組
│   │   │   ├── projects/         # 專案損益
│   │   │   ├── reports/          # 財務報表
│   │   │   ├── calculator/       # 計算器
│   │   │   ├── payroll/          # 薪資管理
│   │   │   ├── sales/            # 銷售分析
│   │   │   └── expenses/         # 費用管理
│   │   ├── reports/        # 報表分析
│   │   └── settings/       # 系統設定
│   └── print/              # 列印頁面
├── components/             # React 元件
│   ├── ui/                 # Shadcn/ui 基礎元件
│   ├── dashboard/          # 儀表板元件（Sidebar 等）
│   ├── clients/            # 客戶相關元件
│   ├── kols/               # KOL 相關元件
│   ├── quotes/             # 報價單元件（含 v2 DataGrid）
│   ├── accounting/         # 會計模組元件
│   ├── pdf/                # PDF 相關元件
│   └── settings/           # 設定元件
├── hooks/                  # 自訂 Hooks
│   └── accounting/         # 會計模組 Hooks
├── lib/                    # 工具函式庫
│   ├── supabase/           # Supabase 客戶端
│   ├── pdf/                # PDF 生成器
│   ├── accounting/         # 會計邏輯
│   └── spreadsheet-utils.ts
└── types/                  # TypeScript 型別
    ├── database.types.ts   # Supabase 自動生成型別
    └── custom.types.ts     # 自訂業務型別
```

## 資料庫

- Migration 檔案位於 `supabase/migrations/`
- 命名格式: `YYYYMMDD[HHMMSS]_description.sql`
- 所有資料表使用 snake_case
- 必須包含 RLS policies
- 標準欄位: `id` (UUID), `created_at`, `updated_at`

### RLS 政策標準（已完成標準化 2026-02-16）

**命名規範**：`{table}_{operation}_{scope}_policy`
- 範例：`kols_select_authenticated_policy`、`quotations_update_authorized_policy`

**權限函式**：統一使用 `get_my_role()` 取得當前用戶角色

**標準模板**：
- **核心業務表**（kols, quotations, clients）：SELECT 全部 / INSERT+UPDATE Admin+Editor+Member / DELETE Admin
- **字典表**（kol_services, kol_types, service_types, quote_categories, quotation_items）：SELECT 全部 / INSERT+UPDATE Admin+Editor / DELETE Admin
- **財務表**（payment_requests, payment_confirmations, payment_confirmation_items）：SELECT 全部 / INSERT+UPDATE+DELETE Admin+Editor
- **人事表**（employees）：Admin 可全部操作，其他角色僅讀取在職員工（特殊設計 2 個 SELECT 政策）
- **會計表**（accounting_expenses, accounting_payroll, accounting_sales）：所有登入用戶可 CRUD
- **敏感資料**（insurance_rate_tables）：SELECT 全部 / INSERT+UPDATE+DELETE Admin

**建立新表時**：請參考上述模板建立對應的 4 個政策（SELECT, INSERT, UPDATE, DELETE），特殊需求請說明

### 主要資料表

| 資料表 | 說明 |
|--------|------|
| `users` / `user_roles` | 使用者與角色 (Admin/Editor/Member) |
| `clients` | 客戶資料 |
| `kols` | KOL 資料 |
| `quotations` | 報價單 |
| `quotation_items` | 報價單項目 |
| `payment_requests` | 請款申請 |
| `payment_confirmations` | 請款確認 |

## 編碼規範

- TypeScript 嚴格模式，避免使用 `any`
- 變數和函式使用英文命名
- 元件使用 PascalCase，hooks 使用 camelCase
- 遵循 ESLint + Prettier 規則
- 提交訊息格式: `<type>: <description>`（feat/fix/refactor/chore 等）
- 權限: Admin 完整存取 / Editor 可編輯 / Member 唯讀

## 環境變數

```
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=
```

## AI 助手偏好設定

- **語言**：一律使用繁體中文回覆
- **Git 操作**：執行 `git push` 之前必須先詢問使用者確認
- **Commit**：執行 `git commit` 之前也先詢問使用者確認

## 開發進度追蹤

專案的開發進度記錄在 `DEV_PROGRESS.md`，用於跨開發環境同步。

- 當使用者說「**更新開發進度**」時，將目前的工作狀態、已完成事項、待辦事項寫入 `DEV_PROGRESS.md`
- 當使用者說「**載入開發進度**」時，讀取 `DEV_PROGRESS.md` 了解目前專案狀態後繼續工作
- 進度檔案隨 git 同步，確保任何開發環境都能接續工作

## Claude Code Skills

此專案包含以下 Claude Code skills（位於 `.claude/skills/`）：

| Skill | 說明 | 用法 |
|-------|------|------|
| `/commit` | 智能 Git commit | 分析變更生成規範 commit message |
| `/pr` | 自動建立 Pull Request | 分析分支差異，用 gh CLI 建立 PR |
| `/review` | Code Review | 全面審查邏輯、效能、安全性 |
| `/db-migration` | 資料庫 Migration | 生成 Supabase migration SQL |
| `/frontend-design` | 前端設計 | 建立高品質 UI 元件 |
| `/supabase-postgres-best-practices` | Postgres 最佳實踐 | 查詢優化與 schema 設計 |
| `/ui-ux-pro-max` | UI/UX 設計智庫 | 設計系統、配色、字型建議 |
