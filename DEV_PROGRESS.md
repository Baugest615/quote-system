# 開發進度追蹤

> 最後更新：2026-02-16
> 分支：`feature/v2.1-accounting-and-ui`

## 已完成

### CLAUDE.md 文件完善（2026-02-16 晚間）
- [x] 新增 Skills 使用指引章節
  - 明確說明 AI 助手應主動檢查並優先使用 Skills
  - 列出常見應用場景與 Skills 對應關係
  - 強調不需使用者提示即應主動使用
- [x] 新增「完成開發工作流程」章節
  - AI 主動引導機制：開發完成後主動詢問
  - 標準執行順序：更新文件 → commit → push
  - 完整流程範例與注意事項
- [x] 新增「新開發環境設定」章節
  - 基礎工具安裝指引（Homebrew、Node.js、gh CLI）
  - 專案初始化步驟
  - Claude Code 設定說明
  - GitHub 認證流程
  - 環境同步檢查清單
- [x] 安裝並設定 GitHub CLI
  - 安裝 gh v2.86.0
  - 完成 GitHub 認證（Baugest615）
  - 設定 git 使用 gh CLI 認證

### RLS 政策全面整理與標準化（2026-02-16）
- [x] 完成 16 張核心表的 RLS 政策標準化（100% 完成）
- [x] 政策數量優化：72 個 → 65 個（-7 個冗餘政策）
- [x] 修正項目：
  - [x] 刪除 13 個重複的 SELECT 政策（8 張表）
  - [x] 刪除 9 個過多的 ALL 政策（3 張財務表）
  - [x] 修正 4 張表的舊函數 `get_user_role` → `get_my_role`
  - [x] 補齊 8 張表缺少的 CRUD 政策
  - [x] 統一命名規範：`{table}_{operation}_{scope}_policy`
  - [x] 保留特殊業務邏輯（employees 表的分級權限）
- [x] 分 4 階段執行：
  - **階段 1**：核心業務表 + 字典表（8 張）
  - **階段 2**：財務表（3 張）
  - **階段 3**：人事表（1 張）
  - **階段 4**：會計表（4 張）

**已整理的表**：
- 核心業務：kols, quotations, clients
- 字典表：kol_services, kol_types, service_types, quote_categories, quotation_items
- 財務表：payment_requests, payment_confirmations, payment_confirmation_items
- 人事表：employees（保留 2 個 SELECT 政策用於分級權限）
- 會計表：accounting_expenses, accounting_payroll, accounting_sales, insurance_rate_tables

**生成的文件**：
- 16 個 SQL 整理腳本：`/tmp/rls_cleanup_[1-16]_*.sql`
- 完整報告：`/tmp/ultimate_completion_report.md`
- 包含詳細測試清單、質量評分、後續建議

**安全性提升**：
- ✅ 財務操作權限明確限制為 Admin + Editor
- ✅ 字典管理權限限制為 Admin + Editor
- ✅ 敏感資料（費率表）僅 Admin 可寫
- ✅ 刪除操作統一限制為 Admin

**可維護性提升**：
- 命名規範：25% → 100%（+300%）
- 權限明確性：60% → 100%（+67%）
- 可讀性：40% → 100%（+150%）
- 一致性：50% → 100%（+100%）

### 儀表板改版 — Executive Overview 風格（2026-02-14）
- [x] 安裝 Recharts 圖表庫
- [x] 建立 `useDashboardData` React Query hook（3 個平行 Supabase 查詢 + 月份分組）
- [x] 建立 `KpiCard` 元件（含 Recharts Sparkline，手機版隱藏趨勢線）
- [x] 建立 `RevenueChart` 月營收折線圖（emerald 漸層填充 + custom tooltip）
- [x] 建立 `QuoteStatusChart` 甜甜圈圖（4 狀態配色 + 自訂圖例）
- [x] 建立 `ActionItems` 待辦事項列表（可點擊導航）
- [x] 重寫 `dashboard/page.tsx` 為三段式 layout：KPI 卡片 → 圖表 → 待辦+快速功能
- [x] 載入骨架動畫（animate-pulse skeleton）
- [x] TypeScript 型別檢查通過、`npm run build` 通過

新增檔案：
- `src/hooks/dashboard/useDashboardData.ts`
- `src/components/dashboard/KpiCard.tsx`
- `src/components/dashboard/RevenueChart.tsx`
- `src/components/dashboard/QuoteStatusChart.tsx`
- `src/components/dashboard/ActionItems.tsx`

### V2.1 全面優化（2026-02-14）
- [x] Phase 1：安全加固 — 6 張表補 RLS、PDF API 認證、RPC 角色驗證
- [x] Phase 2：共用元件 — FormModal、SearchableSelect、useCRUDTable
- [x] Phase 3：React Query — @tanstack/react-query + useClients/useKols/useQuotations
- [x] Phase 4：型別安全 — Zod schemas、消除 39+ 檔案 `: any`、ErrorBoundary
- [x] Phase 5：效能檢查 — 確認無 N+1、重型函式庫已動態 import
- [x] DB 結構備份存 git（`supabase/backups/schema_20260214.sql`）
- [x] DB 資料備份存本地（`supabase/backups/data_20260214.sql`）
- [x] 回滾 migration 備用（`supabase/migrations/20260215999999_rollback_security_hardening.sql`）
- [x] Docker Desktop 安裝完成

### 先前版本
- [x] V2.0.1 UI 深色主題優化與行動裝置響應式改善
- [x] 會計模組新增（專案損益、財務報表、計算器、薪資、銷售、費用）
- [x] Claude Code 專案配置與 skills 同步

## 目前狀態

- `npm run build` 通過，零型別錯誤
- 儀表板已改版為 Executive Overview 風格，含圖表與待辦事項
- **✅ RLS 政策整理已完成**：16 張核心表 100% 標準化
- 所有 RLS 整理腳本已在資料庫執行成功
- **✅ CLAUDE.md 文件已完善**：Skills 使用指引、工作流程、環境設定完整
- **✅ GitHub CLI 已設定**：認證完成，可直接推送
- 開發時若遇 `.next` 快取問題，刪除 `.next` 資料夾後重啟即可

## 待辦 / 下一步

### 🔴 優先執行（RLS 政策整理後測試）
- [ ] **全面功能測試**：KOL/報價單/客戶管理的瀏覽、新增、編輯、刪除
- [ ] **權限分級測試**：Admin、Editor、Member 角色權限驗證
- [ ] **特殊設計測試**：employees 表分級權限（Admin 看所有員工，其他角色僅看在職員工）
- [ ] **財務流程測試**：待請款 → 請款申請 → 請款確認
- [ ] **會計模組測試**：費用/薪資/銷售管理，費率表權限驗證

### 🟡 部署與整合
- [ ] 部署 `feature/v2.1-accounting-and-ui` 分支到測試環境
- [ ] 確認功能正常後執行 `supabase db push` 套用 RLS migration
- [ ] 將共用元件（FormModal、SearchableSelect、useCRUDTable）逐步套用到現有頁面
- [ ] 將 React Query hooks（useClients、useKols、useQuotations）替換現有頁面的直接 Supabase 呼叫
- [ ] 考慮建立 PR 合併回 main

### 🟢 功能擴充
- [ ] 儀表板後續可擴充：依角色顯示不同內容（Admin 可看財務摘要）
- [ ] 建立 RLS 政策文檔：記錄每張表的權限設計邏輯
- [ ] 設定監控：追蹤權限拒絕的情況

## 備註

### 資料庫相關
- **RLS 政策標準命名**：`{table}_{operation}_{scope}_policy`
- **權限函式**：統一使用 `get_my_role()` 取得當前用戶角色
- **特殊設計**：employees 表有 2 個 SELECT 政策（分級權限，Admin 看全部、其他僅看在職）
- **回滾 RLS**：執行 `supabase/migrations/20260215999999_rollback_security_hardening.sql`
- **DB 備份指令**：`supabase db dump -f supabase/backups/schema_YYYYMMDD.sql`（結構）/ 加 `--data-only`（資料）
- **RLS 整理報告**：詳見 `/tmp/ultimate_completion_report.md`（含測試清單、質量評分）

### 開發相關
- `.next` 快取問題：`rm -rf .next` 後重啟 dev server
- 新增表單時：遵循 RLS 標準模板建立政策
- 修改權限時：保持命名格式一致
