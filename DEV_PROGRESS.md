# 開發進度追蹤

> 最後更新：2026-02-14
> 分支：`feature/v2.1-accounting-and-ui`

## 已完成

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
- 2 個新 migration 尚未推送到正式 DB（建議先部署前端測試，確認無誤再跑 `supabase db push`）
- 分支已 push 到 remote，可部署測試

## 待辦 / 下一步

- [ ] 部署 `feature/v2.1-accounting-and-ui` 分支到測試環境
- [ ] 確認功能正常後執行 `supabase db push` 套用 RLS migration
- [ ] 將共用元件（FormModal、SearchableSelect、useCRUDTable）逐步套用到現有頁面
- [ ] 將 React Query hooks（useClients、useKols、useQuotations）替換現有頁面的直接 Supabase 呼叫
- [ ] 考慮建立 PR 合併回 main

## 備註

- 回滾 RLS：執行 `supabase/migrations/20260215999999_rollback_security_hardening.sql`
- DB 備份指令：`supabase db dump -f supabase/backups/schema_YYYYMMDD.sql`（結構）/ 加 `--data-only`（資料）
