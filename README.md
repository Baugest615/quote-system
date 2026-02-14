# 報價管理系統 (Quotation Management System)

[![Next.js](https://img.shields.io/badge/Next.js-14-black)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.3-blue)](https://www.typescriptlang.org/)
[![Supabase](https://img.shields.io/badge/Supabase-2.39-green)](https://supabase.com/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38B2AC)](https://tailwindcss.com/)

現代化的企業級報價管理系統，支援客戶管理、KOL管理、報價單生成、請款流程、會計模組等完整業務功能。使用 Next.js 14 (App Router) 和 Supabase 建構的全端應用程式。

## 主要功能

- **客戶管理** — 完整的客戶資料管理，包含聯絡資訊、發票資料、銀行資訊
- **KOL管理** — KOL資料庫管理，包含社群連結、服務類型、價格設定
- **報價單管理** — 動態報價單建立、編輯、檢視與PDF匯出
- **請款流程管理** — 完整的請款申請、審核、確認流程
- **會計模組** — 專案損益、財務報表、薪資管理、銷售分析、費用管理
- **權限管理** — 基於角色的存取控制（Admin/Editor/Member）
- **報表分析** — 業務統計、營收分析、趨勢圖表
- **PDF匯出** — 含浮水印的高品質PDF生成

## 技術架構

### 前端

| 技術 | 用途 |
|------|------|
| Next.js 14 (App Router) | React 全端框架 |
| TypeScript | 型別安全 |
| Tailwind CSS | 原子化 CSS |
| Shadcn/ui + Radix UI | UI 組件庫 |
| React Hook Form + Zod | 表單管理與驗證 |
| Framer Motion | 動畫效果 |
| Lucide React | 圖標庫 |

### 後端與資料庫

| 技術 | 用途 |
|------|------|
| Supabase | PostgreSQL + Auth + Storage |
| Row Level Security (RLS) | 資料安全保護 |

### PDF與檔案處理

| 技術 | 用途 |
|------|------|
| jsPDF + jsPDF-AutoTable | PDF 生成 |
| pdf-lib | 進階 PDF 操作 |
| html2canvas | HTML 轉圖像（浮水印）|
| Puppeteer (Docker) | 伺服器端 PDF 渲染 |

## 專案結構

```
src/
├── app/                          # Next.js App Router 頁面
│   ├── api/                      # API Routes
│   ├── auth/login/               # 登入
│   ├── print/                    # 列印頁面
│   └── dashboard/                # 主要功能區
│       ├── clients/              # 客戶管理
│       ├── kols/                 # KOL 管理
│       ├── quotes/               # 報價單（列表/新增/編輯/檢視）
│       ├── pending-payments/     # 待請款管理
│       ├── payment-requests/     # 請款申請審核
│       ├── confirmed-payments/   # 已確認請款清單
│       ├── accounting/           # 會計模組
│       │   ├── projects/         #   專案損益
│       │   ├── reports/          #   財務報表
│       │   ├── calculator/       #   計算器
│       │   ├── payroll/          #   薪資管理
│       │   ├── sales/            #   銷售分析
│       │   └── expenses/         #   費用管理
│       ├── reports/              # 報表分析
│       └── settings/             # 系統設定
├── components/                   # React 元件
│   ├── ui/                       # Shadcn/ui 基礎元件
│   ├── dashboard/                # 儀表板元件
│   ├── clients/                  # 客戶相關元件
│   ├── kols/                     # KOL 相關元件
│   ├── quotes/                   # 報價單元件（含 v2 DataGrid）
│   ├── accounting/               # 會計模組元件
│   ├── pending-payments/         # 待請款元件
│   ├── pdf/                      # PDF 元件
│   └── settings/                 # 設定元件
├── hooks/                        # 自訂 Hooks
│   └── accounting/               # 會計模組 Hooks
├── lib/                          # 工具函式庫
│   ├── supabase/client.ts        # Supabase 客戶端
│   ├── pdf/                      # PDF 生成器
│   ├── accounting/               # 會計邏輯
│   ├── spreadsheet-utils.ts      # 試算表工具
│   └── utils.ts                  # 通用工具
└── types/                        # TypeScript 型別
    ├── database.types.ts         # Supabase 自動生成型別
    └── custom.types.ts           # 自訂業務型別
```

## 資料庫架構

### 主要資料表

| 資料表 | 說明 | 關鍵欄位 |
|--------|------|----------|
| `users` | 使用者 | email, role (Admin/Editor/Member) |
| `clients` | 客戶 | name, title, unified_number, bank_info |
| `kols` | KOL | name, real_name, social_links, bank_info |
| `quotations` | 報價單 | client_id, project_name, status, grand_total_taxed |
| `quotation_items` | 報價項目 | quotation_id, kol_id, service, price |
| `payment_requests` | 請款申請 | quotation_item_id, verification_status |
| `payment_confirmations` | 請款確認 | confirmation_date, total_amount |
| `payment_confirmation_items` | 確認項目 | payment_confirmation_id, amount |

### 輔助資料表

- `kol_types` — KOL 類型
- `service_types` — 服務類型
- `quote_categories` — 報價單類別
- `kol_services` — KOL 服務價格關聯

### Migration

- 檔案位於 `supabase/migrations/`
- 命名格式: `YYYYMMDD[HHMMSS]_description.sql`
- 所有資料表使用 snake_case，必須包含 RLS policies

## 開發指南

### 環境需求

- Node.js >= 18.x
- npm >= 8.0.0
- Supabase 帳號與專案

### 安裝與啟動

```bash
# 複製專案
git clone https://github.com/Baugest615/quote-system.git
cd quote-system

# 安裝依賴
npm install

# 設定環境變數
cp .env.example .env.local
# 編輯 .env.local 設定 Supabase 連線資訊

# 啟動開發伺服器
npm run dev
# 開啟瀏覽器 http://localhost:3000
```

### 環境變數

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
```

### 可用指令

```bash
npm run dev            # 開發模式
npm run build          # 建置生產版本
npm run start          # 啟動生產伺服器
npm run lint           # ESLint 檢查
npm run lint:fix       # 自動修復 ESLint 問題
npm run type-check     # TypeScript 型別檢查
npm run test           # 執行測試
npm run test:watch     # 監視模式執行測試
npm run test:coverage  # 測試覆蓋率
npm run format         # Prettier 格式化
npm run analyze        # Bundle 分析
npm run clean          # 清理建置檔案
npm run db:types       # 生成資料庫型別定義
```

## 業務流程

### 基本操作

```
登入 → 儀表板 → 新增客戶/KOL → 建立報價單 → 簽約 → 請款 → 確認付款
```

### 請款流程

1. **待請款準備** — 已簽約項目上傳附件、填入發票號碼、選擇合併方式
2. **申請審核** — 管理員審核，可批次通過/駁回（需填原因）
3. **清單管理** — 按帳戶分組、設定手續費/稅額/二代健保、CSV 匯出

## Claude Code 開發環境

本專案整合了 Claude Code skills，確保跨環境的一致開發體驗。

### 已包含的 Skills

| Skill | 說明 |
|-------|------|
| `/commit` | 智能分析變更，生成規範的 Git commit message |
| `/pr` | 自動建立 Pull Request |
| `/review` | 全面 Code Review（邏輯、效能、安全性） |
| `/db-migration` | 生成 Supabase migration SQL（含 RLS） |
| `/frontend-design` | 建立高品質前端介面 |
| `/supabase-postgres-best-practices` | Postgres 查詢優化與最佳實踐 |
| `/ui-ux-pro-max` | UI/UX 設計系統建議 |
| `/pdf` | PDF 檔案處理 |
| `/docx` | Word 文件處理 |
| `/xlsx` | Excel 試算表處理 |
| `/webapp-testing` | Playwright 網頁測試 |
| `/mcp-builder` | MCP Server 開發指南 |

### 新環境設定

```bash
# 1. Clone 專案（skills 已包含在 .claude/skills/）
git clone https://github.com/Baugest615/quote-system.git
cd quote-system

# 2. 安裝依賴
npm install

# 3. 設定環境變數
cp .env.example .env.local

# 4. 安裝 Claude Code（如尚未安裝）
npm install -g @anthropic-ai/claude-code

# 5. 開始開發 — skills 自動載入
claude
```

> Skills 存放在 `.claude/skills/`，已納入版本控制。
> 個人設定 `.claude/settings.local.json` 不會被追蹤。

## 編碼規範

- TypeScript 嚴格模式，避免使用 `any`
- 變數和函式使用英文命名
- 註解使用繁體中文
- 遵循 ESLint + Prettier 規則
- Commit message 格式: `<type>: <description>`

## 部署

### Docker

```bash
docker build -t quote-system .
docker run -p 3000:3000 quote-system
```

### Vercel

直接連接 GitHub repo，設定環境變數即可部署。

## 貢獻指南

1. Fork 本專案
2. 建立功能分支 (`git checkout -b feature/amazing-feature`)
3. 提交變更 (`git commit -m 'feat: add amazing feature'`)
4. 推送分支 (`git push origin feature/amazing-feature`)
5. 建立 Pull Request

## 授權

MIT License

---

最後更新: 2026 年 2 月
專案版本: v2.0.1
