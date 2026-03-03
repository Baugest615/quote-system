# CLAUDE.md — quote-system 專案規則

> 通用規則（語言、Git 確認、開發進度同步）見全域 `~/.claude/CLAUDE.md`。

## Skills

| 場景 | Skill |
|------|-------|
| commit | `/commit` |
| PR | `/pr` |
| code review | `/review` |
| migration | `/db-migration` |
| UI 設計 | `/ui-ux-pro-max` |
| Postgres 優化 | `/supabase-postgres-best-practices` |
| 編碼規範 | `/coding-standards` |
| 前端模式 | `/frontend-patterns` |
| 品質驗證 | `/verification-loop` |
| TDD | `/tdd-workflow` |

## 關鍵路徑

```
src/app/dashboard/          # 頁面
src/components/ui/          # Shadcn/ui 元件
src/components/quotes/v2/   # 報價單 DataGrid
src/components/accounting/  # 會計模組元件
src/hooks/                  # React Query hooks
src/lib/supabase/           # Supabase 客戶端
src/lib/permissions.ts      # 權限邏輯（usePermission）
src/types/custom.types.ts   # 自訂型別
src/types/database.types.ts # Supabase 自動生成（勿手動改）
```

## 專案特有規範

### 權限
- 三級：Admin / Editor / Member
- 使用 `get_my_role()` 而非直接查 profiles（避免 RLS 遞迴）

### RLS 政策模板

命名：`{table}_{operation}_{scope}_policy`，search_path 設為 `''`

| 表類型 | SELECT | INSERT/UPDATE | DELETE |
|--------|--------|---------------|--------|
| 核心業務表（kols, quotations, clients） | 全部 | Admin+Editor+Member | Admin |
| 字典表（kol_services, service_types 等） | 全部 | Admin+Editor+Member | Admin |
| 財務表（payment_requests 等） | 全部 | Admin+Editor | Admin+Editor |
| 人事表（employees）| 分級* | Admin | Admin |
| 會計表（accounting_*） | 全部 | 全部 | 全部 |

*employees：Admin 看全部、其他僅看在職

### UI 規範（反直覺的部分）
- 深色模式唯一（`class="dark"`），不支援淺色切換
- PDF/列印元件（`src/components/pdf/`、`src/app/print/`）故意使用淺色，**勿修改**
- KPI 卡片色彩：`chart-1`（綠）、`chart-3`（紅）、`chart-4`（藍）、`chart-5`（紫）

### PDF 生成（Puppeteer）注意事項
- **字型必須使用 Web Font**：Puppeteer headless 模式下系統字體不可靠（macOS 有 PingFang TC 但 Windows 沒有，反之 Microsoft JhengHei 在 headless 下也不保證可用）。目前透過 Google Fonts CDN 載入 Noto Sans TC 作為主要 CJK 字型，**勿移除**
- **字型優先順序**：`Noto Sans TC`（Web Font）→ `Microsoft JhengHei`（Windows）→ `PingFang TC`（macOS）→ 其餘 fallback
- **跨平台測試**：PDF 輸出涉及瀏覽器引擎 + 字型 + 作業系統三層依賴，修改後務必在目標環境實際匯出 PDF 驗證，不能只看網頁預覽
- 相關檔案：`src/app/api/pdf/generate/route.ts`（Puppeteer 渲染）、`src/app/print/quote/[id]/page.tsx`（列印模板）

### 型別注意
- JSONB 欄位（bank_info）使用 camelCase（`bankType`、`bankName`、`branchName`、`accountNumber`）
- Supabase JSONB 查詢結果是 `Json` 型別，需要手動 cast（如 `as KolBankInfo`）
- `attachments` 欄位用 `PaymentAttachment[]` 而非 `unknown[]`

## 業務名詞

| 介面顯示 | 資料庫 | 說明 |
|----------|--------|------|
| KOL/服務 | `kols` 表 | 報價對象（含 KOL 以外的服務） |
| 執行內容 | `service_types` 表 | 具體服務項目 |
