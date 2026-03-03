# 開發進度追蹤

> 最後更新：2026-03-04
> 分支：`main`
> 詳細變更歷程請見 Git commit history

## 回滾資訊

合併前已建立備份 tag，如需回滾：
- `backup/pre-kol-inline-create` — 合併前的 main
- `backup/main-before-payment-flow` — 更早的備份點
- 回滾指令：`git reset --hard backup/pre-kol-inline-create && git push --force-with-lease`

## 目前狀態

已合併至 main 的功能：
- ✅ 報價單編號全站整合（合併式選擇器 + 列表 quote_number 前綴）
- ✅ 報價單試算表模式（流水號、攤平檢視、操作欄、欄位管理）
- ✅ 報價單搜尋擴展（KOL 名稱 + 執行內容搜尋 + 欄位篩選）
- ✅ 報價單請款項目駁回功能（RPC + 駁回按鈕 + 原因 Modal）
- ✅ 雇主勞健保設定（保險試算擴充、費率管理、薪資頁面更新）
- ✅ 報價單請款管理、追加模式、進項管理、匯款總覽升級
- ✅ DB migrations：expense_claims 新增 quotation_id FK
- ✅ 請款智慧預設支出種類（依 KOL 銀行帳戶類型）
- ✅ 進項管理付款狀態自動標記
- ✅ 進項/銷項管理表格標題排序與篩選
- ✅ 匯款總覽批次設定匯款日期
- ✅ 儀表板重新設計：專案 Pipeline 導向 + 舊付款頁面封存
- ✅ 待辦事項修正：報價待簽約 / 專案請款待審核 / 個人報帳待審核

開發中（feat/merged-payment-requests）：
- ✅ 合併請款工作台 v1.0（SDD spec: 001-merged-payment-workbench）
  - DB：9 個 RPC（get_workbench_items、create/dissolve merge group、submit/withdraw、approve/reject）已部署
  - UI：PendingSection（勾選合併 + 送出）、ReviewSection（審核/駁回）、RejectedSection（重送/拆分）
  - 整合：QuotationItemsList 移除舊請款按鈕改為狀態顯示 + 合併標記、expense-claims 引導至工作台
- ✅ 合併請款工作台 v1.1 增強
  - 帳戶類型分組（individual / company / unknown），三區塊顯示含 unknown 警告
  - 合併 dialog 兩步驟化（選主項 → 選月份），支援跨月合併
  - 行內編輯（InlineItemEditor）：發票號碼即時存 + AttachmentUploader 附件上傳
  - MergeGroupCard 主項可編輯發票/附件，成員自動繼承
  - 進項管理 merge 指標雙路徑修正（quotation_items 優先、payment_requests fallback）
- ✅ Hotfix：被駁回項目消失 — get_workbench_items WHERE 條件擴展（rejected_at IS NOT NULL 不受報價單狀態限制）
- ✅ v1.2 RPC 一致性修復（6 個 RPC）：
  - submit_single_item：被駁回項目可重新送出（不受報價單狀態限制）
  - submit_merge_group：新增報價單狀態檢查（含相同豁免邏輯）
  - revert_quotation_item：撤回時總是設定 rejected_at（預設「已撤回」），防止項目消失
  - approve/reject_quotation_item：新增 merge_group_id 防護，防止部分核准/駁回死鎖
  - approve_merge_group：傳遞 bypass 參數繞過合併組防護
  - 前端：Tab 計數改用篩選後資料、canDelete 新增 merge_group_id 檢查
- ✅ 撤回修復：withdraw_single_item / withdraw_merge_group 撤回後設定 rejected 狀態，防止項目消失
- ✅ 工作台納入「待簽約」報價單項目（q.status IN 新增 '待簽約'）
- ✅ 已確認請款清單三類分組：勞報(個人戶) / 公司行號 / 員工
- ✅ RLS 修正：service_types / kol_services INSERT 開放 Member（內聯建立功能完整化）
- ✅ cost_amount 自動計算：handleSave 自動填入 cost*quantity + RPC COALESCE fallback + 資料回補
- ✅ 所有工作台 RPC 統一納入「待簽約」（create_merge_group、submit_single_item、submit_merge_group）
- ✅ 資料完整性驗證：verify_data_integrity() RPC — 9 項 invariant checks（DC×4、WB×2、RLS×1、DQ×2），全部 PASS
- ✅ `/db-verify` skill 建立（跨專案通用資料庫驗證框架）
- ✅ cost_amount 修正：移除 quantity 乘數（前端 + RPC + 舊頁面三處修復）
- ✅ 工作台 KOL 名稱顯示修復（PendingSection / ReviewSection / RejectedSection）
- `npx tsc --noEmit` 通過，零型別錯誤

### 全面程式碼審查與優化（2026-03-04，分支：feature/comprehensive-review-optimization）

- ✅ Phase 1：移除死碼 — 刪除 `_archived/` 目錄、3 個死掉的 PDF 生成器、`useDashboardData` v1
- ✅ Phase 1：移除 7 個未使用 npm 依賴（`@react-pdf/renderer`, `jspdf`, `jspdf-autotable`, `pdf-lib`, `html2canvas`, `html2pdf.js`, `lodash`）
- ✅ Phase 2：合併 `ErrorBoundary` 2→1（增加可選 `module` prop）
- ✅ Phase 2：合併 `PaymentStatusBadge` 3→2（統一使用 `StatusBadge variant="payment"`，會計模組重命名為 `AccountingPaymentBadge`）
- ✅ Phase 3：修復 ~20 處 `any` 型別（permissions、EditableCell、seal-stamp-utils、FileModal 等）
- ✅ Phase 4：清理無用 `console.log`，PDF API route 改為 `console.debug`
- ✅ Phase 5：清理 `next.config.js` lodash webpack alias，`tsc --noEmit` + `npm run build` 驗證通過
- 總計：刪除 10 個檔案、修改 24 個檔案、淨減少 ~3,800 LOC

### 安全修復 + 效能優化 + Accessibility 補強（2026-03-04）

- ✅ PDF HTML sanitization：regex blacklist → `sanitize-html` whitelist 模式
- ✅ PDF filename 路徑穿越驗證（移除 `..`、`/`、`\` 等危險字元）
- ✅ FileModal 移除 11 處 `console.log`（暴露檔案路徑與 DB payload）
- ✅ middleware / invite-member / PDF route 統一改用 `get_my_role()` RPC（避免 RLS 遞迴）
- ✅ projects 全量查詢加 `.limit(500)` 防止過大回傳
- ✅ React.memo：`RequestItemRow`、`CompactItemRow`、`PaymentRecordRow`（減少不必要重渲染）
- ✅ 刪除未使用死碼：`RevenueChart.tsx`、`useProjectNames.ts`
- ✅ Accessibility：`<th>` 預設 `scope="col"`、SortableHeader `aria-sort`、LoadingState `aria-live`、6 個元件 icon-only 按鈕加 `aria-label`
- 總計：修改 19 個檔案、淨減少 ~695 LOC

### 基礎設施強化（2026-03-04）

- ✅ CLAUDE.md 擴充：新增 `/db-verify`、`/security-review`、`/rbac-supabase` + Skills 自動觸發規則
- ✅ 新增 2 個專案級 Skill：`agents-orchestration`（協作框架使用指南）、`puppeteer-pdf-cjk`（CJK 字型配置防護）
- ✅ Agent 協作系統擴展：6 → 10 個 Agent
  - 新增 `db-migrator`（Opus, readonly）— Migration 預檢查 + verify_data_integrity()
  - 新增 `security-cleanup`（Sonnet, writable）— 已知安全問題批量修復
  - 新增 `performance-auditor`（Sonnet, readonly）— React Query / bundle / DB 性能審計
  - 新增 `e2e-tester`（Sonnet, readonly）— Playwright E2E 測試
- ✅ 新增 3 個工作流：`migrate`、`performance`、`security-cleanup`
- ✅ 互動式選單擴展為 6 個選項（含新增工作流）
- ✅ npm scripts：`agents:migrate`、`agents:performance`、`agents:security-cleanup`

## 待辦事項

### 優先
- [ ] 手動驗證請款工作台完整流程（合併→送出→審核→核准/駁回→重送）
- [ ] 全面功能回歸測試（各頁面 CRUD + 權限分級 Admin/Editor/Member）
- [ ] 部署至正式環境

### 功能擴充
- [ ] 銷項管理反向同步（修改金額同步回報價單）— 目前為單向流
- [x] ~~清理 useProjectNames hook~~ ✅ 已刪除（2026-03-04）

### 技術債
- [ ] Claude Agent SDK 升級 0.1.77 → 0.2.x（需同步升級 zod 3.x → 4.x，影響 5 個表單驗證元件）
- [ ] `@hookform/resolvers/zod` 需配合 zod 4 升級
- [ ] E2E 測試基礎設施建立（Playwright config + 第一批關鍵業務流程測試）

### 優化後續建議（2026-03-04 審查結果）

**大型元件拆分**（SDD spec: 002-large-component-split）
- [x] ~~`QuotationItemsFlatView.tsx`（1195→375 行）~~ ✅ 拆為 shared/ + flat-view/ 7 個模組（2026-03-04）
- [x] ~~`QuotationItemsList.tsx`（1109→343 行）~~ ✅ 拆為 shared/ + items-list/ 7 個模組（2026-03-04）
- [ ] `WithholdingReport.tsx`（594 行）、`QuotesDataGrid.tsx`（586 行）、`SpreadsheetEditor.tsx`（538 行）

**效能優化**（需 profiling 數據支撐）
- [x] ~~DataGrid 列元件加入 `React.memo`~~ ✅ RequestItemRow、CompactItemRow、PaymentRecordRow（2026-03-04）
- [x] ~~刪除未使用 RevenueChart 死碼~~ ✅（2026-03-04）
- [ ] 會計模組 9 個子頁面已由 Next.js route 自動分割（無需額外處理）
- [ ] Recharts 圖表元件：CaseTrendChart/QuoteStatusChart 已動態載入，KpiCard 為首屏保持靜態
- [ ] 執行 `npm run analyze` 檢查 bundle 大小

**測試覆蓋率**（目前 1.2%，僅 3 個測試檔案）
- [ ] 支付驗證邏輯單元測試（`src/lib/payments/validation.ts` 已有，需擴充）
- [ ] 權限邏輯單元測試（`permissions.tsx`、`server-permissions.ts`）
- [ ] React Hook 整合測試（React Query hooks）
- [ ] E2E 關鍵業務流程測試

**Accessibility**
- [x] ~~Modal 元件~~ ✅ HeadlessUI Dialog 已自動處理 `aria-modal`/`aria-labelledby`
- [x] ~~icon-only 按鈕加入 `aria-label`~~ ✅ 6 個元件已補強（2026-03-04）
- [x] ~~表格加入 `scope="col"`、sorting 加入 `aria-sort`~~ ✅ table.tsx + SortableHeader（2026-03-04）
- [x] ~~Loading 狀態加入 `aria-live="polite"`~~ ✅ LoadingState（2026-03-04）
- [x] ~~剩餘 icon-only 按鈕補強~~ ✅ ReferenceDictCard（4 個）、SpreadsheetEditor、QuotesDataGrid（3 個）、FlatViewRow（5 個）、ItemsListRow（2 個）— 共 15 處補強（2026-03-04）

### 安全稽核發現（2026-03-02）

**Critical**
- [x] ~~PDF HTML sanitization~~ ✅ 改用 `sanitize-html` whitelist 模式（2026-03-04）
- [x] `.env.local` URL 曝露 — 已在 `.gitignore`，無需額外處理

**Warning**
- [x] ~~`projects` 全量查詢缺少 `.limit()`~~ ✅ 加入 `.limit(500)`（2026-03-04）
- [x] ~~Middleware + invite-member API 直接查 `profiles` 取 role~~ ✅ 統一改用 `get_my_role()` RPC（2026-03-04）
- [x] ~~部分 API 路徑被 middleware 跳過~~ ✅ 稽核確認（2026-03-04）：`/api/pdf/generate` 與 `/api/auth/invite-member` 均已自行實作 `auth.getUser()` + `get_my_role()` RPC，模式與 middleware 一致
- [x] ~~PDF filename 未驗證~~ ✅ 加入路徑穿越防護（2026-03-04）
- [x] ~~console.log 洩漏業務資訊~~ ✅ FileModal 11 處已清理、PDF route 已改 `console.debug`、PendingPaymentFileModal 已刪除
