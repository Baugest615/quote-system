# 開發進度追蹤

> 最後更新：2026-03-05
> 分支：`main`
> 詳細變更歷程請見 Git commit history（`git log --oneline`）

## 目前狀態

已合併至 main 的功能模組：

- ✅ **報價單系統** — 編號整合、試算表模式、搜尋擴展、駁回功能
- ✅ **請款管理** — 請款流程、追加模式、智慧預設支出種類
- ✅ **合併請款工作台**（v1.0 ~ v1.2）— 跨報價單合併請款、帳戶分組、行內編輯、RPC 一致性修復、撤回修復、KOL 名稱/附件顯示
- ✅ **被駁回分頁移除** — 獨立 RejectedSection 整合至 PendingSection 待處理區塊
- ✅ **進項/銷項管理** — 付款狀態自動標記、排序篩選、merge 指標修正
- ✅ **匯款總覽** — 批次設定匯款日期
- ✅ **儀表板** — 專案 Pipeline 導向重新設計 + 舊付款頁面封存
- ✅ **雇主勞健保** — 保險試算擴充、費率管理、薪資頁面更新
- ✅ **權限/RLS** — Member 內聯建立權限、cost_amount 自動計算、待簽約狀態納入工作台
- ✅ **資料完整性** — verify_data_integrity() RPC（9 項 invariant checks）
- ✅ **基礎設施** — Agent 協作系統（10 個 Agent）、3 個工作流、2 個專案級 Skill

### 全面程式碼審查與優化（2026-03-04～03-05）

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

### 核心商業邏輯單元測試（2026-03-04）

- ✅ 測試覆蓋率從 90 → 238 test cases（+148 cases，+164%）
- ✅ 7 個純函數模組全覆蓋：
  - `payments/aggregation.ts`（21 cases）：月彙總、分組分類、代扣判斷
  - `payments/grouping.ts`（40 cases）：專案/帳戶/匯款戶名/KOL/客戶/狀態/日期分組、合併工具
  - `payments/withholding-export.ts`（18 cases）：所得稅/健保/綜合明細 CSV 匯出
  - `payments/billingPeriod.ts`（9 cases）：10 日切點規則、YYYY-MM key
  - `accounting/insurance-calculator.ts`（15 cases）：薪資計算、公司負擔、Supabase mock
  - `spreadsheet-utils.ts`（13 cases）：TSV 解析、欄位型別轉換、標題偵測
  - `types/schemas.ts`（30 cases）：6 個 Zod schema 驗證、safe parse、完整性檢查
- 驗證：`tsc --noEmit` 零錯誤 + `npm test` 238 tests 全通過

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

### 請款工作台含稅計算修復（2026-03-05）
- ✅ 新增 `calcItemTaxInfo()` 工具函式：公司行號自動加 5% 營業稅，個人戶不加
- ✅ 合併組 `total_amount` 改為含稅加總，新增 `total_cost`/`total_tax` 欄位
- ✅ MergeGroupCard 明細表拆為「成本」「稅金」「含稅金額」三欄
- ✅ PendingSection / ReviewSection 單筆項目顯示含稅金額 + 成本/稅拆解
- ✅ 區塊小計、戶名小計均改為含稅金額

## 待辦事項

### 優先
- [ ] 手動驗證請款工作台完整流程（合併→送出→審核→核准/駁回→重送）
- [ ] 全面功能回歸測試（各頁面 CRUD + 權限分級 Admin/Editor/Member）
- [ ] 部署至正式環境

### FlatView 請款功能精簡 + pending-payments 移除（2026-03-05）
- ✅ FlatView 移除 4 欄（狀態、檢核、請款、審核）— 請款流程統一由工作台處理
- ✅ QuotationItemsList 移除狀態欄 + 檢核欄 + 檢核 Modal
- ✅ `useQuotationItemsFlat` 移除 3 個 payment mutation hooks
- ✅ 刪除 `src/components/pending-payments/`（9 檔）、`src/hooks/pending-payments/`（4 檔）、`src/lib/pending-payments/`（1 檔）
- ✅ 保留發票號碼欄（BatchInvoicePopover 批次填入）和附件欄
- ✅ `tsc --noEmit` 零錯誤、310 tests 全通過

### 營業稅計算改革（2026-03-05，SDD spec: 003-tax-reform）
- ✅ 成本統一存放未稅金額，公司行號請款自動加 5% 營業稅
- ✅ 資料遷移：ej@ 帳號 17 筆公司行號成本反算為未稅
- ✅ UI 標示：報價單成本欄「（未稅）」、請款金額欄「（含稅）」
- ✅ 新增 `src/lib/tax-utils.ts` 稅率計算工具函數

### Zod 3→4 升級（2026-03-05，SDD spec: 004-zod-upgrade）
- ✅ zod 3.22.4 → 4.3.6，零 breaking change
- ✅ tsc 零錯誤、238 tests 全通過

### 功能擴充
- [x] ~~銷項管理反向同步~~ — 決定不做，銷項保持獨立金額（2026-03-05 討論結案）
- [x] ~~清理 useProjectNames hook~~ ✅ 已刪除（2026-03-04）

### 技術債
- [x] ~~Zod 3.x → 4.x 升級~~ ✅（2026-03-05）
- [ ] Claude Agent SDK 升級 0.1.77 → 0.2.x（Zod 已升級，可以進行）
- [ ] E2E 測試基礎設施建立（Playwright config + 第一批關鍵業務流程測試）

### 優化後續建議（2026-03-04 審查結果）

**大型元件拆分**（SDD spec: 002-large-component-split）
- [x] ~~`QuotationItemsFlatView.tsx`（1195→375 行）~~ ✅ 拆為 shared/ + flat-view/ 7 個模組（2026-03-04）
- [x] ~~`QuotationItemsList.tsx`（1109→343 行）~~ ✅ 拆為 shared/ + items-list/ 7 個模組（2026-03-04）
- [x] ~~`WithholdingReport.tsx`（595→286 行）~~ ✅ 拆為 withholding/ 5 個模組（2026-03-05）
- [x] ~~`QuotesDataGrid.tsx`（590→226 行）~~ ✅ 拆為 data-grid/ 2 個模組（2026-03-05）
- [x] ~~`SpreadsheetEditor.tsx`（540→235 行）~~ ✅ 拆為 spreadsheet/ 3 個模組（2026-03-05）

**效能優化**（需 profiling 數據支撐）
- [x] ~~DataGrid 列元件加入 `React.memo`~~ ✅ RequestItemRow、CompactItemRow、PaymentRecordRow（2026-03-04）
- [x] ~~刪除未使用 RevenueChart 死碼~~ ✅（2026-03-04）
- [ ] 會計模組 9 個子頁面已由 Next.js route 自動分割（無需額外處理）
- [ ] Recharts 圖表元件：CaseTrendChart/QuoteStatusChart 已動態載入，KpiCard 為首屏保持靜態
- [ ] 執行 `npm run analyze` 檢查 bundle 大小

**測試覆蓋率**（90 → 310 cases，13 個測試檔案）
- [x] ~~支付驗證邏輯~~ ✅ validation.ts（50 cases，原有）
- [x] ~~核心商業邏輯~~ ✅ 7 個模組 148 cases（2026-03-04）
- [x] ~~權限邏輯單元測試~~ ✅ `permissions.tsx` 42 cases（hasRole/checkPageAccess/checkFunctionAccess/getAllowedPages/getRoleDisplayName）（2026-03-05）
- [x] ~~React Hook 整合測試~~ ✅ `usePaymentFilters` 21 cases + `usePaymentGrouping` 9 cases（2026-03-05）
- [x] ~~E2E 測試基礎建設~~ ✅ Playwright config + `e2e/smoke.spec.ts`（登入頁/重導向 smoke tests）+ `e2e/auth.setup.ts`（有帳號時 auth setup 模板）（2026-03-05）

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
